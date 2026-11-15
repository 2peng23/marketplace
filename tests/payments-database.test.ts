import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import nextEnvironment from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { getSupabase } from '../src/lib/server/supabase';

test(
  'Postgres enforces seller claims, concurrent reservations and idempotent sale confirmation',
  { skip: process.env.RUN_PAYMENT_DATABASE_TESTS !== 'true' },
  async () => {
    nextEnvironment.loadEnvConfig(process.cwd());
    const database = getSupabase();
    const runId = randomUUID();
    const listingId = randomUUID();
    const userIds: string[] = [];
    const eventIds = [
      `evt_db_${runId}`,
      `evt_db_duplicate_${runId}`,
      `evt_db_expired_${runId}`,
      `evt_db_invalid_${runId}`,
    ];
    try {
      for (const suffix of ['owner', 'other']) {
        const email = `${suffix}-${runId}@example.test`;
        const created = await database.auth.admin.createUser({ email, email_confirm: true });
        assert.equal(created.error, null);
        const identifier = created.data.user!.id;
        userIds.push(identifier);
        const seller = await database.from('sellers').insert({
          id: identifier,
          email,
          stripe_account_id: `acct_database_${identifier}`,
          stripe_payment_status: 'active',
        });
        assert.equal(seller.error, null);
      }
      const inserted = await database.from('listings').insert({
        id: listingId,
        title: 'Disposable payment database test',
        description: 'Temporary test fixture; removed automatically.',
        price: 19.99,
        category: 'other',
        seller_email: `owner-${runId}@example.test`,
        image_path: `${listingId}/photo.webp`,
      });
      assert.equal(inserted.error, null);
      const forbidden = await database.rpc('claim_listing', {
        listing_identifier: listingId,
        seller_identifier: userIds[1],
      });
      assert.equal(forbidden.error?.code, '42501');
      const claimed = await database.rpc('claim_listing', {
        listing_identifier: listingId,
        seller_identifier: userIds[0],
      });
      assert.equal(claimed.error, null);

      const requests = ['a'.repeat(64), 'b'.repeat(64)].map((buyerHash) => ({
        listing_identifier: listingId,
        order_identifier: randomUUID(),
        buyer_hash: buyerHash,
      }));
      const results = await Promise.all(
        requests.map((input) => database.rpc('reserve_order', input)),
      );
      assert.equal(
        results.filter((result) => !result.error).length,
        1,
        'Only one concurrent buyer reserves the item',
      );
      assert.equal(results.filter((result) => result.error).length, 1);
      const winnerIndex = results.findIndex((result) => !result.error);
      const order = results[winnerIndex].data!;
      assert.equal(order.amount_cents, 1999);
      assert.equal(order.platform_fee_cents, 200);
      assert.equal((await database.rpc('reserve_order', requests[winnerIndex])).data?.id, order.id);
      const stolen = await database.rpc('reserve_order', {
        ...requests[winnerIndex],
        buyer_hash: 'c'.repeat(64),
      });
      assert.equal(stolen.error?.code, '42501');

      const sessionId = `cs_test_database_${runId}`;
      assert.equal(
        (
          await database
            .from('orders')
            .update({ stripe_session_id: sessionId, status: 'pending' })
            .eq('id', order.id)
        ).error,
        null,
      );
      const confirmation = {
        order_identifier: order.id,
        session_identifier: sessionId,
        payment_identifier: `pi_database_${runId}`,
        event_identifier: eventIds[0],
        event_name: 'checkout.session.completed',
      };
      const mismatch = await database.rpc('confirm_order', {
        ...confirmation,
        session_identifier: 'cs_wrong',
        event_identifier: eventIds[3],
      });
      assert.ok(mismatch.error);
      assert.equal(
        (await database.from('stripe_webhook_events').select('id').eq('id', eventIds[3])).data
          ?.length,
        0,
        'A failed transaction does not record the event as processed',
      );
      const duplicates = await Promise.all([
        database.rpc('confirm_order', confirmation),
        database.rpc('confirm_order', confirmation),
      ]);
      assert.ok(duplicates.every((result) => !result.error));
      assert.equal(
        (await database.rpc('confirm_order', { ...confirmation, event_identifier: eventIds[1] }))
          .error,
        null,
      );
      assert.equal(
        (
          await database.rpc('release_order', {
            order_identifier: order.id,
            terminal_status: 'expired',
            event_identifier: eventIds[2],
          })
        ).error,
        null,
      );
      const purchase = await database
        .from('orders')
        .select('status,stripe_payment_intent_id')
        .eq('id', order.id)
        .single();
      const item = await database
        .from('listings')
        .select('sale_status,reserved_order_id')
        .eq('id', listingId)
        .single();
      assert.equal(purchase.data?.status, 'paid');
      assert.equal(item.data?.sale_status, 'sold');
      assert.equal(item.data?.reserved_order_id, null);

      const publicKey = process.env.SUPABASE_PUBLISHABLE_KEY;
      assert.ok(publicKey, 'A publishable key is required to check anonymous access');
      const anonymous = createClient(process.env.SUPABASE_URL!, publicKey, {
        auth: { persistSession: false },
      });
      assert.ok(
        (await anonymous.from('orders').select('*')).error,
        'Orders cannot be read anonymously',
      );
      assert.ok(
        (
          await anonymous.rpc('claim_listing', {
            listing_identifier: listingId,
            seller_identifier: userIds[0],
          })
        ).error,
        'Financial mutations cannot be called anonymously',
      );
    } finally {
      await database.from('stripe_webhook_events').delete().in('id', eventIds);
      await database.from('listings').update({ reserved_order_id: null }).eq('id', listingId);
      await database.from('orders').delete().eq('listing_id', listingId);
      await database.from('listings').delete().eq('id', listingId);
      if (userIds.length) await database.from('sellers').delete().in('id', userIds);
      for (const identifier of userIds) await database.auth.admin.deleteUser(identifier);
    }
  },
);

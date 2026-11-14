import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';

const database = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});
const anonymous = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
  auth: { persistSession: false },
});

test('anonymous create → persisted detail → browse/search → private message', async ({
  page,
  browser,
}) => {
  const title = `Verification ${randomUUID().slice(0, 8)}`;
  let identifier = '';
  try {
    await page.goto('/create');
    await page.getByLabel('Product photo').setInputFiles('public/icon-512.png');
    await page.getByLabel('Title', { exact: true }).fill(title);
    await page.getByLabel('Price', { exact: false }).fill('24.50');
    await page.getByLabel('Category', { exact: true }).selectOption('home-garden');
    await page
      .getByLabel('Description', { exact: true })
      .fill('A controlled verification listing, created by the browser test.');
    await page.getByLabel('Your email', { exact: true }).fill('seller@example.test');
    await page.getByRole('button', { name: 'Publish listing' }).click();
    await expect(page).toHaveURL(/\/listings\/[0-9a-f-]+\?created=1/);
    identifier = new URL(page.url()).pathname.split('/').pop()!;
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    const record = await database.from('listings').select('*').eq('id', identifier).single();
    expect(record.error).toBeNull();
    expect(Number(record.data!.price)).toBe(24.5);
    const image = await database.storage.from('listing-images').download(record.data!.image_path);
    expect(image.error).toBeNull();
    expect(image.data!.size).toBeGreaterThan(0);
    const fresh = await browser.newContext();
    const freshPage = await fresh.newPage();
    await freshPage.goto(
      `${process.env.TEST_BASE_URL || 'http://127.0.0.1:3001'}/listings/${identifier}`,
    );
    await expect(freshPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await fresh.close();
    await page.goto('/?category=home-garden&q=' + encodeURIComponent(title));
    await expect(page.locator('.listing-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.listing-card')).toHaveCount(1);
    await page.locator('.listing-card-link').click();
    await page.getByRole('button', { name: 'Message seller' }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.getByLabel('Your email', { exact: true }).fill('buyer@example.test');
    await page
      .getByLabel('Your message', { exact: true })
      .fill('Is this still available? This is a controlled verification message.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('heading', { name: 'Your message is saved.' })).toBeVisible();
    const saved = await database.from('messages').select('*').eq('listing_id', identifier);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    expect(saved.data![0].seller_email).toBe('seller@example.test');
    const hidden = await anonymous.from('messages').select('*');
    expect(hidden.error).not.toBeNull();
    await page.getByRole('button', { name: 'Back to the listing' }).click();
    await expect(page.getByRole('dialog')).not.toBeVisible();
    await expect(page.getByRole('button', { name: 'Message seller' })).toBeFocused();
  } finally {
    if (identifier) {
      await database.from('listings').delete().eq('id', identifier);
      await database.storage.from('listing-images').remove([`${identifier}/photo.webp`]);
    }
  }
});

test('API enforces image validation, recipient integrity and idempotent persistence', async ({
  request,
}) => {
  const identifier = randomUUID();
  const png = await readFile('public/icon-512.png');
  const nearLimit = Buffer.concat([png, Buffer.alloc(3_950_000 - png.length)]);
  const fields = {
    requestId: identifier,
    title: 'Boundary verification listing',
    description: 'Controlled test listing.',
    price: '0',
    category: 'other',
    sellerEmail: 'owner@example.test',
  };
  try {
    const invalid = await request.post('/api/listings', {
      multipart: {
        ...fields,
        photo: { name: 'fake.png', mimeType: 'image/png', buffer: Buffer.from('not an image') },
      },
    });
    expect(invalid.status()).toBe(400);
    const created = await request.post('/api/listings', {
      multipart: {
        ...fields,
        photo: { name: 'large-valid.png', mimeType: 'image/png', buffer: nearLimit },
      },
    });
    expect(created.status()).toBe(201);
    const retry = await request.post('/api/listings', {
      multipart: {
        ...fields,
        photo: { name: 'large-valid.png', mimeType: 'image/png', buffer: nearLimit },
      },
    });
    expect(retry.status()).toBe(200);
    expect((await database.from('listings').select('id').eq('id', identifier)).data).toHaveLength(
      1,
    );
    const requestId = randomUUID();
    const message = {
      requestId,
      listingId: identifier,
      buyerEmail: 'buyer@example.test',
      message: 'A private inquiry.',
    };
    const tampered = await request.post('/api/messages', {
      data: { ...message, sellerEmail: 'attacker@example.test' },
    });
    expect(tampered.status()).toBe(400);
    expect((await request.post('/api/messages', { data: message })).status()).toBe(201);
    expect((await request.post('/api/messages', { data: message })).status()).toBe(200);
    const rows = await database.from('messages').select('*').eq('listing_id', identifier);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0].seller_email).toBe('owner@example.test');
    expect(
      (await anonymous.from('listings').update({ title: 'Unauthorized' }).eq('id', identifier))
        .error,
    ).not.toBeNull();
    expect((await anonymous.from('messages').select('*')).error).not.toBeNull();
  } finally {
    await database.from('listings').delete().eq('id', identifier);
    await database.storage.from('listing-images').remove([`${identifier}/photo.webp`]);
  }
});

test('not-found, no-results, responsive layouts and keyboard dismissal', async ({ page }) => {
  await page.goto('/listings/not-a-uuid');
  await expect(page.getByRole('heading', { name: 'This find has wandered off.' })).toBeVisible();
  await page.goto('/?q=unfindable-' + randomUUID());
  await expect(page.getByRole('heading', { name: 'No finds this time.' })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?category=electronics');
  await page.locator('.listing-card-link').first().click();
  await page.getByRole('button', { name: 'Message seller' }).click();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Message seller' })).toBeFocused();
});

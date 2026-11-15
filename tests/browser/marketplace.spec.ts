import { test, expect } from '@playwright/test';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { SMTPServer } from 'smtp-server';

const capturedEmails: { recipient: string; body: string }[] = [];
let rejectEmail = false;
const mailServer = new SMTPServer({
  secure: false,
  disabledCommands: ['STARTTLS'],
  onAuth(_authentication, _session, callback) {
    callback(null, { user: 'test' });
  },
  onRcptTo(address, _session, callback) {
    if (rejectEmail) {
      callback(new Error('Controlled SMTP failure'));
      return;
    }
    if (!address.address.endsWith('.test')) {
      callback(new Error('Only test recipients are allowed'));
      return;
    }
    callback();
  },
  onData(stream, session, callback) {
    const chunks: Buffer[] = [];
    stream.on('data', (chunk: Buffer) => chunks.push(chunk));
    stream.on('end', () => {
      capturedEmails.push({
        recipient: session.envelope.rcptTo[0].address,
        body: Buffer.concat(chunks).toString('utf8'),
      });
      callback();
    });
  },
});
test.beforeAll(async () => {
  await new Promise<void>((resolve) => mailServer.listen(3025, '127.0.0.1', resolve));
});
test.afterAll(async () => {
  await new Promise<void>((resolve) => mailServer.close(resolve));
});

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
    await page.goto('/');
    await page.locator('.sidebar-create').click();
    await expect(page.getByRole('dialog', { name: 'Create listing' })).toBeVisible();
    await page.getByLabel('Product photo').setInputFiles('tests/fixtures/listing.png');
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
    await freshPage.goto(`${test.info().project.use.baseURL}/listings/${identifier}`);
    await expect(freshPage.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await fresh.close();
    await page.goto('/?category=home-garden&q=' + encodeURIComponent(title));
    await expect(page.locator('.listing-card')).toHaveCount(1);
    await page.reload();
    await expect(page.locator('.listing-card')).toHaveCount(1);
    await page.locator('.listing-card-link').click();
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toBeVisible();
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await page.getByLabel('Your email', { exact: true }).fill('buyer@example.test');
    await page
      .getByLabel('Your message', { exact: true })
      .fill('Is this still available? This is a controlled verification message.');
    await page.getByRole('button', { name: 'Send message', exact: true }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Message sent.' })).toBeVisible();
    expect(
      capturedEmails.some(
        (email) =>
          email.recipient === 'seller@example.test' &&
          email.body.includes('Reply-To: buyer@example.test'),
      ),
    ).toBe(true);
    const saved = await database.from('messages').select('*').eq('listing_id', identifier);
    expect(saved.error).toBeNull();
    expect(saved.data).toHaveLength(1);
    expect(saved.data![0].seller_email).toBe('seller@example.test');
    const hidden = await anonymous.from('messages').select('*');
    expect(hidden.error).not.toBeNull();
    await expect(page.getByRole('button', { name: 'Send message', exact: true })).toHaveCount(0);
    await page.goto('/my-listings');
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: title, exact: true })).toBeVisible();
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
  const png = await readFile('tests/fixtures/listing.png');
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
    const changedRequest = await request.post('/api/listings', {
      multipart: {
        ...fields,
        title: 'Different item with the same request ID',
        photo: { name: 'photo.png', mimeType: 'image/png', buffer: png },
      },
    });
    expect(changedRequest.status()).toBe(409);
    const preserved = await database
      .from('listings')
      .select('title,image_path')
      .eq('id', identifier)
      .single();
    expect(preserved.data!.title).toBe(fields.title);
    expect(
      (await database.storage.from('listing-images').download(preserved.data!.image_path)).error,
    ).toBeNull();

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
    const previousEmailCount = capturedEmails.length;
    rejectEmail = true;
    const failedDelivery = await request.post('/api/messages', { data: message });
    expect(failedDelivery.status()).toBe(201);
    expect((await failedDelivery.json()).emailSent).toBe(false);
    expect(capturedEmails).toHaveLength(previousEmailCount);
    rejectEmail = false;
    const retryDelivery = await request.post('/api/messages', { data: message });
    expect(retryDelivery.status()).toBe(200);
    expect((await retryDelivery.json()).emailSent).toBe(true);
    const [duplicateOne, duplicateTwo] = await Promise.all([
      request.post('/api/messages', { data: message }),
      request.post('/api/messages', { data: message }),
    ]);
    expect((await duplicateOne.json()).emailSent).toBe(true);
    expect((await duplicateTwo.json()).emailSent).toBe(true);
    expect(capturedEmails).toHaveLength(previousEmailCount + 1);
    const rows = await database.from('messages').select('*').eq('listing_id', identifier);
    expect(rows.data).toHaveLength(1);
    expect(rows.data![0].seller_email).toBe('owner@example.test');
    expect(
      (await anonymous.from('listings').update({ title: 'Unauthorized' }).eq('id', identifier))
        .error,
    ).not.toBeNull();
    expect((await anonymous.from('messages').select('*')).error).not.toBeNull();
  } finally {
    rejectEmail = false;
    await database.from('listings').delete().eq('id', identifier);
    await database.storage.from('listing-images').remove([`${identifier}/photo.webp`]);
  }
});

test('not-found, filters, responsive layouts and listing modal keyboard dismissal', async ({
  page,
}) => {
  await page.goto('/listings/not-a-uuid');
  await expect(page.getByRole('heading', { name: 'Listing not found' })).toBeVisible();
  await page.goto('/?q=unfindable-' + randomUUID());
  await expect(page.getByRole('heading', { name: 'No items found' })).toBeVisible();
  for (const width of [360, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    await page.goto('/');
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto('/?category=electronics');
  const sidebar = await page
    .getByRole('complementary', { name: 'Marketplace filters' })
    .boundingBox();
  const results = await page.locator('.marketplace-results').boundingBox();
  expect(sidebar!.x + sidebar!.width).toBeLessThan(results!.x);
  await expect(page.getByRole('link', { name: 'Electronics', exact: true })).toHaveAttribute(
    'aria-current',
    'page',
  );
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 360, height: 740 },
  ]) {
    await page.setViewportSize(viewport);
    await page.locator('.sidebar-create').click();
    const dialog = page.getByRole('dialog', { name: 'Create listing' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'Publish listing' }).click();
    await expect(dialog.locator('#category-error')).toHaveText('Choose a category.');
    // No page or modal scrolling is needed to reach any field or the submit action.
    await expect
      .poll(async () =>
        dialog.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return (
            bounds.top >= 0 &&
            bounds.bottom <= window.innerHeight &&
            element.scrollHeight <= element.clientHeight + 1 &&
            element.scrollWidth <= element.clientWidth + 1
          );
        }),
      )
      .toBe(true);
    await expect(dialog.getByRole('button', { name: 'Publish listing' })).toBeInViewport();
    await page.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible();
    await expect(page.locator('.sidebar-create')).toBeFocused();
  }
  await page.goto('/create');
  await expect(page.getByRole('dialog', { name: 'Create listing' })).toBeVisible();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page).toHaveURL(/\/$/);
});

test('infinite feed loads twelve per batch, retries failure, and resets filters', async ({
  page,
  request,
}) => {
  await page.goto('/');
  await expect(page.locator('.listing-card')).toHaveCount(12);
  await expect(page.locator('.site-header button')).toHaveCount(0);
  await expect(page.getByRole('navigation', { name: 'Listing pages' })).toHaveCount(0);
  const initialFeed = await (await request.get('/api/listings?page=1')).json();
  const firstItems = initialFeed.items;
  let failedOnce = false;
  const requestedPages: number[] = [];
  await page.route('**/api/listings?**', async (route) => {
    const pageNumber = Number(new URL(route.request().url()).searchParams.get('page'));
    requestedPages.push(pageNumber);
    if (!failedOnce) {
      failedOnce = true;
      await route.fulfill({ status: 503, json: { error: 'Controlled fetch failure' } });
      return;
    }
    const items = firstItems.map((item: Record<string, unknown>, index: number) => ({
      ...item,
      id: `00000000-0000-4000-8000-${String(pageNumber * 100 + index).padStart(12, '0')}`,
    }));
    await route.fulfill({
      json: { items, count: 36, nextPage: pageNumber < 3 ? pageNumber + 1 : null },
    });
  });
  await page.locator('.feed-status').scrollIntoViewIfNeeded();
  await page.getByRole('button', { name: 'Try again', exact: true }).click();
  await expect(page.locator('.listing-card')).toHaveCount(24);
  await expect
    .poll(async () =>
      page
        .locator('.browse-toolbar')
        .evaluate((element) => Math.round(element.getBoundingClientRect().top)),
    )
    .toBe(64);
  await page.locator('.feed-status').scrollIntoViewIfNeeded();
  await expect(page.locator('.listing-card')).toHaveCount(36);
  expect(requestedPages).toEqual([2, 2, 3]);
  const destinations = await page
    .locator('.listing-card-link')
    .evaluateAll((links) => links.map((link) => link.getAttribute('href')));
  expect(new Set(destinations).size).toBe(36);
  await page.unroute('**/api/listings?**');
  await page.getByRole('link', { name: 'Electronics', exact: true }).click();
  const electronics = await (await request.get('/api/listings?category=electronics')).json();
  await expect(page.locator('.listing-card')).toHaveCount(electronics.items.length);
  await page.getByRole('searchbox', { name: 'Search listings' }).fill('unfindable-' + randomUUID());
  await page.getByRole('button', { name: 'Search', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'No items found' })).toBeVisible();
});

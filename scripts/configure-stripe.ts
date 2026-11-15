import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';

if (process.env.VERCEL) throw new Error('Stripe setup runs locally only.');
const port = 3005;
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
const environmentPath = new URL('../.env.local', import.meta.url);
const page = (await readFile(new URL('./stripe-setup.html', import.meta.url), 'utf8')).replaceAll(
  '__SETUP_TOKEN__',
  token,
);

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'`,
  );
  if (request.headers.host !== `127.0.0.1:${port}`) return void response.writeHead(403).end();
  if (request.method === 'GET' && request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    return void response.end(page);
  }
  response.setHeader('Content-Type', 'application/json');
  if (
    request.method !== 'POST' ||
    request.url !== '/configure' ||
    request.headers.origin !== origin ||
    request.headers['x-setup-token'] !== token
  )
    return void response
      .writeHead(403)
      .end(JSON.stringify({ error: 'This request could not be accepted.' }));
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 2000)
        return void response.writeHead(413).end(JSON.stringify({ error: 'The key is too long.' }));
      chunks.push(chunk);
    }
    const input: unknown = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    const key =
      input && typeof input === 'object' && 'key' in input && typeof input.key === 'string'
        ? input.key.trim()
        : '';
    if (!/^(?:sk|rk)_test_[A-Za-z0-9]+$/.test(key))
      return void response.writeHead(400).end(
        JSON.stringify({
          error: 'Enter the supplied sandbox secret key beginning sk_test_ or rk_test_.',
        }),
      );
    const check = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${key}` },
      signal: AbortSignal.timeout(15000),
    });
    const balance = await check.json();
    if (!check.ok || balance.livemode !== false)
      return void response.writeHead(400).end(
        JSON.stringify({
          error: 'Stripe could not verify this sandbox key. Check the key and its permissions.',
        }),
      );
    const existing = await readFile(environmentPath, 'utf8').catch(() => '');
    const retained = existing
      .split('\n')
      .filter((line) => !/^\s*(?:export\s+)?STRIPE_SECRET_KEY\s*=/.test(line))
      .join('\n')
      .trimEnd();
    const temporaryPath = new URL('../.env.local.stripe-setup', import.meta.url);
    await writeFile(temporaryPath, `${retained}\nSTRIPE_SECRET_KEY=${key}\n`, { mode: 0o600 });
    await rename(temporaryPath, environmentPath);
    response.end(JSON.stringify({ saved: true }));
    console.log('Sandbox key verified and saved. No key values were logged.');
    server.close();
  } catch {
    response
      .writeHead(400)
      .end(JSON.stringify({ error: 'The key could not be saved. Please try again.' }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Private Stripe setup: ${origin}`));

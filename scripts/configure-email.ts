import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename, unlink } from 'node:fs/promises';
import nodemailer from 'nodemailer';
import { z } from 'zod';

if (process.env.VERCEL) throw new Error('Email setup runs locally only.');
const port = 3004;
const origin = `http://127.0.0.1:${port}`;
const token = randomBytes(32).toString('hex');
const inputSchema = z.object({
  email: z.email(),
  password: z
    .string()
    .transform((password) => password.replace(/\s/g, ''))
    .pipe(z.string().regex(/^[a-zA-Z0-9]{16}$/)),
});
const page = (await readFile(new URL('./email-setup.html', import.meta.url), 'utf8')).replaceAll(
  '__SETUP_TOKEN__',
  token,
);
const environmentPath = new URL('../.env', import.meta.url);

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader(
    'Content-Security-Policy',
    `default-src 'self'; script-src 'nonce-${token}'; style-src 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'`,
  );
  if (request.headers.host !== `127.0.0.1:${port}`) {
    response.writeHead(403).end();
    return;
  }
  if (request.method === 'GET' && request.url === '/') {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(page);
    return;
  }
  response.setHeader('Content-Type', 'application/json');
  if (
    request.method !== 'POST' ||
    request.url !== '/configure' ||
    request.headers.origin !== origin ||
    request.headers['x-setup-token'] !== token
  ) {
    response.writeHead(403).end(JSON.stringify({ error: 'This request could not be accepted.' }));
    return;
  }
  try {
    const chunks: Buffer[] = [];
    let length = 0;
    for await (const chunk of request) {
      length += chunk.length;
      if (length > 8000) {
        response.writeHead(413).end(JSON.stringify({ error: 'Form is too large.' }));
        return;
      }
      chunks.push(chunk);
    }
    const input: unknown = (() => {
      try {
        return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
      } catch {
        return null;
      }
    })();
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) {
      response
        .writeHead(400)
        .end(
          JSON.stringify({ error: 'Enter a valid email and a 16-character Google app password.' }),
        );
      return;
    }
    const { email, password } = parsed.data;
    const transport = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: email, pass: password },
      connectionTimeout: 12000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
    try {
      await transport.verify();
    } catch {
      response.writeHead(400).end(
        JSON.stringify({
          error: 'Gmail could not sign in. Check the address and app password, then try again.',
        }),
      );
      return;
    } finally {
      transport.close();
    }
    const settings: Record<string, string> = {
      SMTP_HOST: 'smtp.gmail.com',
      SMTP_PORT: '465',
      SMTP_SECURE: 'true',
      SMTP_USER: email,
      SMTP_PASSWORD: password,
      SMTP_FROM: email,
    };
    let content = await readFile(environmentPath, 'utf8').catch(() => '');
    for (const [key, value] of Object.entries(settings)) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      content = pattern.test(content)
        ? content.replace(pattern, () => line)
        : `${content.trimEnd()}\n${line}\n`;
    }
    const temporaryPath = new URL(
      `../.env.smtp-${randomBytes(8).toString('hex')}`,
      import.meta.url,
    );
    try {
      await writeFile(temporaryPath, content, { mode: 0o600, flag: 'wx' });
      await rename(temporaryPath, environmentPath);
    } finally {
      await unlink(temporaryPath).catch(() => {});
    }
    response.end(JSON.stringify({ configured: true }));
    console.log('Gmail connection verified and saved locally.');
  } catch {
    response
      .writeHead(500)
      .end(JSON.stringify({ error: 'Settings could not be saved. Try again.' }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local Gmail setup: ${origin}`));

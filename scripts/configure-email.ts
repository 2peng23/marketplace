import { createServer } from 'node:http';
import { randomBytes } from 'node:crypto';
import { readFile, writeFile, rename } from 'node:fs/promises';
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
const page = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Connect Gmail · Marketplace</title><style>
*{box-sizing:border-box}body{margin:0;background:#f3f4f6;color:#1c2533;font:15px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",Arial,sans-serif;min-height:100vh;display:grid;place-items:center;padding:24px}main{width:min(100%,440px);background:white;border:1px solid #dce0e5;border-radius:12px;padding:30px}h1{font-size:23px;letter-spacing:-.03em;margin:0 0 8px}p{color:#606770;margin:0 0 24px}label{display:block;font-size:14px;font-weight:500;margin-bottom:7px}input{width:100%;height:44px;border:1px solid #ccd2dc;border-radius:6px;padding:10px 12px;font:inherit;margin-bottom:20px}input:focus{outline:2px solid #1865d8;outline-offset:2px}button{width:100%;border:0;border-radius:6px;background:#1865d8;color:white;padding:12px;font:inherit;font-weight:500;cursor:pointer}button:disabled{opacity:.6;cursor:wait}small{display:block;margin-top:16px;color:#606770;font-size:12px}a{color:#1865d8}#status{margin-top:18px;color:#b42318}#status.success{color:#25623d}
</style></head><body><main><h1>Connect Gmail</h1><p>Use your Gmail address and Google app password.</p><form id="setup"><label for="email">Gmail address</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@gmail.com"><label for="password">App password</label><input id="password" name="password" type="password" autocomplete="new-password" required spellcheck="false" placeholder="16-character app password"><button type="submit">Save email settings</button><small>Saved only to this project’s local .env file. <a href="https://myaccount.google.com/apppasswords" target="_blank" rel="noreferrer">Create a Google app password</a></small></form><div id="status" role="status" aria-live="polite"></div></main><script nonce="${token}">
const form=document.getElementById('setup'),status=document.getElementById('status');form.addEventListener('submit',async(event)=>{event.preventDefault();const button=form.querySelector('button');button.disabled=true;status.textContent='Checking Gmail connection…';try{const response=await fetch('/configure',{method:'POST',headers:{'Content-Type':'application/json','X-Setup-Token':'${token}'},body:JSON.stringify({email:form.email.value.trim(),password:form.password.value})});const result=await response.json();if(!response.ok)throw new Error(result.error);form.reset();form.hidden=true;status.className='success';status.textContent='Gmail connected. Settings saved locally. You can close this page.';}catch(error){status.textContent=error.message;button.disabled=false;}});
</script></body></html>`;

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
    const parsed = inputSchema.safeParse(JSON.parse(Buffer.concat(chunks).toString('utf8')));
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
      response
        .writeHead(400)
        .end(
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
    let content = await readFile('.env', 'utf8').catch(() => '');
    for (const [key, value] of Object.entries(settings)) {
      const line = `${key}=${JSON.stringify(value)}`;
      const pattern = new RegExp(`^${key}=.*$`, 'm');
      content = pattern.test(content)
        ? content.replace(pattern, line)
        : `${content.trimEnd()}\n${line}\n`;
    }
    await writeFile('.env.smtp-pending', content, { mode: 0o600 });
    await rename('.env.smtp-pending', '.env');
    response.end(JSON.stringify({ configured: true }));
    console.log('Gmail connection verified and saved locally.');
  } catch {
    response
      .writeHead(500)
      .end(JSON.stringify({ error: 'Settings could not be saved. Try again.' }));
  }
});
server.listen(port, '127.0.0.1', () => console.log(`Local Gmail setup: ${origin}`));

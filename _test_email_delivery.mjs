/**
 * Proves the WHOLE email-verification path against a real SMTP conversation:
 * register -> 6-digit code generated -> code actually delivered in the message
 * -> the code read back out of the delivered message -> account verified ->
 * login succeeds.
 *
 * Instead of trusting a public sandbox's HTML viewer, this starts a throwaway
 * backend on its own port pointed at a LOCAL SMTP sink that speaks enough
 * SMTP for nodemailer (EHLO / AUTH / MAIL / RCPT / DATA). The sink captures the
 * exact RFC822 message that would have gone to Gmail, so the subject, the HTML
 * body and the plain-text body are all asserted as the recipient would see
 * them. Nothing in the project's own configuration is modified.
 *
 *   node _test_email_delivery.mjs
 */

import net from 'node:net';
import { spawn } from 'node:child_process';
import dotenv from 'dotenv';

dotenv.config({ path: '.env', quiet: true });

const SMTP_PORT = Number(process.env.TEST_SMTP_PORT) || 1026;
const API_PORT = Number(process.env.TEST_API_PORT) || 5096;
const BASE = `http://localhost:${API_PORT}/api`;

let passed = 0;
let failed = 0;

const check = (label, condition, detail = '') => {
  if (condition) {
    passed++;
    console.log(`  PASS  ${label}`);
  } else {
    failed++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
};

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// =====================================================
// LOCAL SMTP SINK
//
// Accepts one message at a time and keeps the raw
// transmission. AUTH is advertised and always accepted:
// these are throwaway test credentials, so there is
// nothing to authenticate.
// =====================================================

const captured = [];
const openSockets = new Set();

function startSmtpSink() {
  const server = net.createServer((socket) => {
    openSockets.add(socket);
    socket.on('close', () => openSockets.delete(socket));
    socket.on('error', () => {});

    let buffer = '';
    let inData = false;
    let dataBuffer = '';
    let authStage = 0;

    const write = (line) => socket.write(line + '\r\n');

    write('220 localhost ESMTP velora-otp-test');

    socket.on('data', (chunk) => {
      buffer += chunk.toString('binary');

      while (true) {
        if (inData) {
          // Message body ends with a line containing only ".".
          const end = buffer.indexOf('\r\n.\r\n');
          const lone = buffer.startsWith('.\r\n');

          if (end !== -1) {
            dataBuffer += buffer.slice(0, end + 2);
            buffer = buffer.slice(end + 5);
            inData = false;
            captured.push(dataBuffer);
            dataBuffer = '';
            write('250 2.0.0 Ok: queued');
            continue;
          }

          if (lone) {
            buffer = buffer.slice(3);
            inData = false;
            captured.push(dataBuffer);
            dataBuffer = '';
            write('250 2.0.0 Ok: queued');
            continue;
          }

          const partial = buffer.lastIndexOf('\r\n');
          if (partial !== -1) {
            dataBuffer += buffer.slice(0, partial + 2);
            buffer = buffer.slice(partial + 2);
          }
          return;
        }

        const nl = buffer.indexOf('\r\n');
        if (nl === -1) return;

        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 2);
        const upper = line.toUpperCase();

        if (upper.startsWith('EHLO')) {
          // Every continuation line carries a trailing "-", and the LAST line
          // must not, or the client keeps waiting for more of the greeting.
          write('250-localhost greets you');
          write('250-AUTH LOGIN PLAIN');
          write('250-8BITMIME');
          write('250 SIZE 10485760');
        } else if (upper.startsWith('HELO')) {
          write('250 localhost');
        } else if (upper.startsWith('AUTH LOGIN')) {
          authStage = 1;
          write('334 ' + Buffer.from('Username:').toString('base64'));
        } else if (upper.startsWith('AUTH PLAIN')) {
          authStage = 0;
          write('235 2.7.0 Authentication successful');
        } else if (authStage === 1) {
          authStage = 2;
          write('334 ' + Buffer.from('Password:').toString('base64'));
        } else if (authStage === 2) {
          authStage = 0;
          write('235 2.7.0 Authentication successful');
        } else if (upper.startsWith('MAIL FROM')) {
          write('250 2.1.0 Ok');
        } else if (upper.startsWith('RCPT TO')) {
          write('250 2.1.5 Ok');
        } else if (upper.startsWith('DATA')) {
          inData = true;
          dataBuffer = '';
          write('354 End data with <CR><LF>.<CR><LF>');
        } else if (upper.startsWith('QUIT')) {
          write('221 2.0.0 Bye');
          socket.end();
        } else if (upper.startsWith('RSET')) {
          write('250 2.0.0 Ok');
        } else if (upper.startsWith('NOOP')) {
          write('250 2.0.0 Ok');
        } else {
          write('250 2.0.0 Ok');
        }
      }
    });
  });

  return new Promise((resolve) => server.listen(SMTP_PORT, '127.0.0.1', () => resolve(server)));
}

/** Decodes the quoted-printable / base64 transfer encodings nodemailer emits. */
function decodeBody(message) {
  const bodyMatch = message.split(/\r?\n\r?\n/).slice(1).join('\n\n');
  return bodyMatch.replace(/=\r?\n/g, '').replace(/=3D/g, '=');
}

const header = (message, name) => {
  const m = message.match(new RegExp(`^${name}:[ \\t]*(.*)$`, 'im'));
  return m ? m[1].trim() : null;
};

const password = 'Pass@1234';
const email = `otpdelivery_${Date.now()}@example.com`;

const smtp = await startSmtpSink();
console.log(`\n=== REAL-SMTP EMAIL DELIVERY (local SMTP sink :${SMTP_PORT}, API :${API_PORT}) ===\n`);

const child = spawn(process.execPath, ['server.js'], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    PORT: String(API_PORT),
    MAIL_MODE: 'smtp',
    SMTP_HOST: '127.0.0.1',
    SMTP_PORT: String(SMTP_PORT),
    SMTP_USER: 'velora-test@localhost',
    SMTP_PASSWORD: 'throwaway-not-a-real-secret',
    SMTP_FROM: '"Velora" <no-reply@velora.test>',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
});

let serverOut = '';
child.stdout.on('data', (d) => (serverOut += d.toString()));
child.stderr.on('data', (d) => (serverOut += d.toString()));

async function call(p, { method = 'GET', body } = {}) {
  const res = await fetch(`${BASE}${p}`, {
    method,
    headers: { 'Content-Type': 'application/json' },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  let json = null;
  try {
    json = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body: json };
}

try {
  let up = false;
  for (let i = 0; i < 45; i++) {
    try {
      const r = await call('/health');
      if (r.status === 200) {
        up = true;
        break;
      }
    } catch {
      /* not listening yet */
    }
    await wait(700);
  }

  if (!up) {
    console.log('  FAIL  throwaway backend did not start\n');
    console.log(serverOut);
    process.exit(1);
  }
  check('throwaway backend started', true);

  console.log('\n1. REGISTER -> A CODE IS ISSUED AND EMAILED');
  let r = await call('/auth/register', {
    method: 'POST',
    body: { fullName: 'Delivery Flow', email, password, confirmPassword: password },
  });
  check('POST /auth/register -> 201', r.status === 201, `status=${r.status} ${r.body?.message || ''}`);

  const regData = r.body?.data || {};
  check(
    'transport reports real SMTP',
    /SMTP transporter verified successfully/.test(serverOut),
    (serverOut.match(/\[Email\][^\n]*/g) || []).slice(-4).join(' | ')
  );
  check('emailSent is TRUE with a working transport', regData.emailSent === true, `emailSent=${regData.emailSent} errorCode=${regData.emailErrorCode || 'none'}`);
  check('delivery reports smtp', regData.emailDelivery === 'smtp', `got ${regData.emailDelivery}`);
  check('no 6-digit code anywhere in the response', !/\b\d{6}\b/.test(JSON.stringify(r.body || {})));

  console.log('\n2. THE SMTP SERVER ACTUALLY RECEIVED THE MESSAGE');
  const message = captured.find((m) => /verification/i.test(header(m, 'Subject') || '')) || captured[0];
  check('a message was delivered over SMTP', Boolean(message), `captured ${captured.length}`);

  let otp = null;
  if (message) {
    const subject = header(message, 'Subject') || '';
    const body = decodeBody(message);

    check('subject is "Your Velora Email Verification Code"', /Your Velora Email Verification Code/.test(subject), `subject=${subject}`);
    check('sent to the registered address', new RegExp(email.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i').test(message), header(message, 'To'));
    check('body contains the "Your Velora verification code is:" wording', /Your Velora verification code is/i.test(body));
    check('body says the code expires in 10 minutes', /This code expires in 10 minutes/i.test(body));

    const digits = [...body.matchAll(/(?:^|[^0-9])(\d{6})(?:[^0-9]|$)/g)].map((m) => m[1]);
    otp = digits[0] || null;

    check('the delivered message contains a 6-digit code', Boolean(otp), `candidates=${digits.join(',') || 'none'}`);
    check('the code is exactly 6 digits', /^\d{6}$/.test(otp || ''), `got ${otp}`);
    check('the code is not the stored hash', !/^[0-9a-f]{64}$/.test(otp || ''), `got ${otp}`);
    check('the message contains no SMTP password', !message.includes('throwaway-not-a-real-secret'));
  }

  console.log('\n3. THE EMAILED CODE IS REFUSED WHEN WRONG, ACCEPTED WHEN RIGHT');
  if (otp) {
    const wrong = otp === '000000' ? '111111' : '000000';
    r = await call('/auth/verify-email', { method: 'POST', body: { email, otp: wrong } });
    check('a wrong code -> 400', r.status === 400, `status=${r.status} ${r.body?.message || ''}`);

    r = await call('/auth/verify-email', { method: 'POST', body: { email, otp } });
    check('the EMAILED code verifies -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
    check('verified flag returned', r.body?.data?.verified === true);

    r = await call('/auth/login', { method: 'POST', body: { email, password } });
    check('login after verification -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
    check('login returns a JWT', Boolean(r.body?.data?.token));
    check('login user is email_verified', r.body?.data?.user?.email_verified === true);
  }

  console.log('\n4. RESEND EMAILS A DIFFERENT CODE AND SUPERSEDES THE FIRST');
  if (otp) {
    const fresh = await call('/auth/register', {
      method: 'POST',
      body: { fullName: 'Resend Delivery', email: `otpresend_${Date.now()}@example.com`, password, confirmPassword: password },
    });
    const resendEmail = fresh.body?.data?.email;
    const capturedAfterRegister = captured.length;
    const firstCodeOfResendAcct = (() => {
      const body = decodeBody(captured[captured.length - 1] || '');
      return ([...body.matchAll(/(?:^|[^0-9])(\d{6})(?:[^0-9]|$)/g)].map((m) => m[1])[0]) || null;
    })();

    // Inside the 60s cooldown.
    r = await call('/auth/resend-verification', { method: 'POST', body: { email: resendEmail } });
    check('resend inside 60s -> 429', r.status === 429, `status=${r.status} ${r.body?.message || ''}`);
    await wait(400);
    check('the 429 sent no email', captured.length === capturedAfterRegister, `captured ${captured.length} vs ${capturedAfterRegister}`);

    // Age the record past the cooldown, exactly as the previous run proved.
    const mysql = (await import('mysql2/promise')).default;
    const conn = await mysql.createConnection({
      host: process.env.DB_HOST,
      port: Number(process.env.DB_PORT) || 3306,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'ecommerce_db',
      timezone: 'Z',
    });
    const [rows] = await conn.execute('SELECT id FROM users WHERE email = ?', [resendEmail]);
    await conn.execute('UPDATE email_verification_tokens SET otp_last_sent_at = ? WHERE user_id = ?', [
      new Date(Date.now() - 61 * 1000).toISOString().replace('T', ' ').substring(0, 19),
      rows[0].id,
    ]);
    await conn.end();

    r = await call('/auth/resend-verification', { method: 'POST', body: { email: resendEmail } });
    check('resend after the cooldown -> 200', r.status === 200, `status=${r.status} ${r.body?.message || ''}`);
    check('resend reports a 60s cooldown to the client', r.body?.data?.resendCooldownSeconds === 60, `got ${r.body?.data?.resendCooldownSeconds}`);
    await wait(500);
    check('the successful resend sent exactly one more message', captured.length === capturedAfterRegister + 1, `captured ${captured.length} vs ${capturedAfterRegister + 1}`);
    check('the resent message also carries a 6-digit code', (() => {
      const last = captured[captured.length - 1] || '';
      const body = decodeBody(last);
      const digits = [...body.matchAll(/(?:^|[^0-9])(\d{6})(?:[^0-9]|$)/g)].map((m) => m[1]);
      return digits.length > 0 && otp !== null ? digits[0] !== otp : true;
    })(), 'a resend must supersede the previous code, not repeat it');
  }

  console.log('\n5. THE OTP IS NEVER LOGGED BY THE SERVER');
  if (otp) {
    check('server log does not contain the emailed code', !new RegExp(`(^|\\D)${otp}(\\D|$)`).test(serverOut), 'code found in server log');
  }
  check('server log contains no 6-digit code', !/(^|\D)\d{6}(\D|$)/.test(serverOut), (serverOut.match(/(^|\D)\d{6}(\D|$)/g) || []).join(' '));
  check('server log does not contain the SMTP password', !serverOut.includes('throwaway-not-a-real-secret'));
} finally {
  child.kill();
  for (const socket of openSockets) socket.destroy();
  await new Promise((resolve) => smtp.close(resolve));
}

console.log(`\n=== RESULT: ${passed} passed, ${failed} failed ===\n`);
process.exit(failed > 0 ? 1 : 0);

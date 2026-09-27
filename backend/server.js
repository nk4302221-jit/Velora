import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// ENVIRONMENT LOADING
//
// Two .env files exist and they used to disagree silently. Only the project-root
// file was ever loaded, so everything in backend/.env (including any SMTP
// credentials added there) was dead configuration that never reached
// process.env — which is exactly how the mail transport ended up unconfigured
// while looking configured on disk.
//
// Both are now loaded. backend/.env is the base layer and the project-root file
// overrides it, so the documented precedence (root is authoritative) is kept.
// One deliberate exception: an EMPTY value in the root file does not erase a
// populated value from backend/.env. Without that rule a placeholder such as
// `SMTP_USER=` would silently wipe working credentials from the other file and
// put the mail transport back into its unconfigured state.
// =====================================================

const rootEnvPath = path.resolve(__dirname, '..', '.env');
const backendEnvPath = path.resolve(__dirname, '.env');

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Env] No env file at ${filePath} - skipping.`);

    return {};
  }

  console.log(`[Env] Loaded environment from: ${filePath}`);

  return dotenv.parse(fs.readFileSync(filePath));
}

const backendEnv = readEnvFile(backendEnvPath);
const rootEnv = readEnvFile(rootEnvPath);

const mergedEnv = { ...backendEnv };

for (const [key, value] of Object.entries(rootEnv)) {
  if (value === '' && backendEnv[key]) {
    console.log(
      `[Env] ${key} is blank in the project-root .env; keeping the value from backend/.env`
    );

    continue;
  }

  mergedEnv[key] = value;
}

for (const [key, value] of Object.entries(mergedEnv)) {
  process.env[key] = value;
}

async function bootstrap() {
  try {
    const { default: app } = await import('./app.js');
    const { initDatabase } = await import('./config/db.js');
    const { startMembershipCronJob } = await import(
      './jobs/cronJob.js'
    );
    const { logEmailDiagnostics } = await import('./services/emailService.js');

    const PORT = Number(process.env.PORT) || 5000;

    console.log('[OAuth] Checking Google OAuth configuration...');

    if (
      !process.env.GOOGLE_CLIENT_ID ||
      !process.env.GOOGLE_CLIENT_SECRET
    ) {
      console.warn(
        '[OAuth] GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET are not set. Google sign-in is disabled.'
      );
    } else {
      console.log(
        '[OAuth] Google OAuth credentials loaded successfully.'
      );
    }

    // Report the resolved mail transport before the first verification email is
    // ever attempted. Logs the mode, host and port only — the password is never
    // read by this code path.
    console.log('[Email] Checking outbound mail configuration...');
    await logEmailDiagnostics();

    console.log('[Server] Initializing relational SQL database...');
    await initDatabase();

    console.log(
      '[Server] Starting membership status background cron job...'
    );
    startMembershipCronJob();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(
        `[Server] Velora E-Commerce Backend running on http://0.0.0.0:${PORT}`
      );
    });
  } catch (error) {
    console.error('[Velora Server Error]:', error);
    process.exit(1);
  }
}

bootstrap();
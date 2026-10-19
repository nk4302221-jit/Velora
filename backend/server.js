import path from 'path';
import { fileURLToPath } from 'url';
import { loadVeloraEnv } from './config/loadEnv.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// =====================================================
// ENVIRONMENT LOADING
//
// Shared with the project-root server.js via config/loadEnv.js so both entry
// points resolve the exact same configuration. See that file for the merge
// rules (backend/.env is the base layer, the project-root file overrides it,
// and a blank root value never erases a populated backend value).
// =====================================================

loadVeloraEnv({
  backendEnvPath: path.resolve(__dirname, '.env'),
  rootEnvPath: path.resolve(__dirname, '..', '.env'),
});

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
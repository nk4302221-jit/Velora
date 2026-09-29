import dotenv from 'dotenv';
import path from 'path';

// The production bundle is CommonJS (dist/server.cjs), where `import.meta.url`
// is not available - it bundles to an empty object and makes esbuild warn. The
// CommonJS equivalent is `__dirname`, which inside the bundle points at dist/,
// one level below the project root. Under `node server.js` (an ES module, used
// by `npm run dev`) there is no `__dirname` at all, and the entry script itself
// sits in the project root, so use that script's directory instead.
const entryDir =
  typeof __dirname === 'string'
    ? __dirname
    : path.dirname(path.resolve(process.argv[1] || 'server.js'));
const projectRoot =
  path.basename(entryDir) === 'dist' ? path.dirname(entryDir) : entryDir;

// Load project-root .env FIRST
const envPath = path.resolve(projectRoot, '.env');

dotenv.config({
  path: envPath,
});

console.log(`[Env] Loaded environment from: ${envPath}`);

async function bootstrap() {
  try {
    // Import modules AFTER .env is loaded
    const { default: app } = await import('./backend/app.js');
    const { initDatabase } = await import('./backend/config/db.js');
    const { startMembershipCronJob } = await import(
      './backend/jobs/cronJob.js'
    );
    const { logEmailDiagnostics } = await import(
      './backend/services/emailService.js'
    );

    const PORT = Number(process.env.PORT) || 5000;

    // Google OAuth configuration
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
    // ever attempted, so an unconfigured SMTP_HOST / SMTP_USER / SMTP_PASSWORD
    // is visible at boot instead of surfacing later as a code that never
    // arrives. Logs the mode, host and port only - the password is never read.
    console.log('[Email] Checking outbound mail configuration...');
    await logEmailDiagnostics();

    // Initialize database
    console.log('[Server] Initializing relational SQL database...');
    await initDatabase();

    // Start membership cron
    console.log(
      '[Server] Starting membership status background cron job...'
    );
    startMembershipCronJob();

    // Start server
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

import dotenv from 'dotenv';
import fs from 'fs';

// =====================================================
// ENVIRONMENT LOADING
//
// Two .env files exist and they used to disagree silently. Each server entry
// used to load a DIFFERENT one: backend/server.js merged both, while the
// project-root server.js (the one `npm run dev` and the Railway/production
// bundle actually run) loaded only the project-root file. Anything configured
// solely in backend/.env - such as RESEND_API_KEY - therefore existed on disk
// but never reached process.env in the runtime that mattered.
//
// Both entries now call loadVeloraEnv() with the same merge rules:
//   - backend/.env is the base layer
//   - the project-root .env overrides it
//   - an EMPTY root value does not erase a populated backend value, so a
//     placeholder like `SMTP_USER=` cannot wipe working credentials
// =====================================================

function readEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    console.warn(`[Env] No env file at ${filePath} - skipping.`);

    return {};
  }

  console.log(`[Env] Loaded environment from: ${filePath}`);

  return dotenv.parse(fs.readFileSync(filePath));
}

export function loadVeloraEnv({ backendEnvPath, rootEnvPath }) {
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

  return mergedEnv;
}

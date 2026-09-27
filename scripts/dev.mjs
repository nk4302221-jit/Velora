// Dev orchestrator for Velora.
//
// Frontend: Vite on 5173 (strictPort, see vite.config.js)
// Backend:  Express on 5000 (fixed; vite.config.js proxies /api -> 127.0.0.1:5000)
//
// Three jobs, in order of importance:
//
//   1. Reclaim 5000 / 5173 from *Velora's own* leftovers. The backend runs as
//      `node --watch server.js`, so the process that owns :5000 is a GRANDchild
//      of this script. If the terminal dies, the watcher dies, and the
//      grandchild keeps the listening socket -> the next `npm run dev` died on
//      "Port 5000 is already in use".
//   2. Never touch a process that cannot be *proven* to be Velora. An unrelated
//      app on :5000 is reported and left running.
//   3. Guarantee the children die with this process (SIGINT / SIGTERM / exit),
//      then sweep the ports once more so no orphan survives holding a socket.
//
// Identification is deliberately conservative. A process is only ever terminated
// when it is a Node.js process that ALSO satisfies one of:
//   (a) we recorded it as our own child in node_modules/.cache/velora-dev,
//   (b) its command line points inside this project, or
//   (c) it runs a bare backend entry (`node server.js`, cwd unknown) and
//       answers as the Velora API on /api/health.
// Anything else produces a clear "another application owns this port" error.

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const IS_WIN = process.platform === 'win32';

const FRONTEND_PORT = 5173;
const BACKEND_PORT = 5000;

// Children get GRACEFUL_MS to wind down on their own, then we escalate, then
// we stop waiting entirely. A fixed short timer was the original bug.
const GRACEFUL_MS = 2000;
const HARD_MS = 3000;

// How long a stale process may take to release its socket before we give up and
// report failure.
const PORT_FREE_MS = 6000;
const PORT_POLL_MS = 150;

// Identity of the two servers, used to tell "ours" from "somebody else's".
const BACKEND_ENTRIES = new Set(['server.js', 'server.cjs', 'server.mjs']);
const FRONTEND_ENTRIES = new Set(['vite.js', 'vite.mjs']);

// Ownership record. We only ever terminate PIDs that this script itself wrote
// here, which is what lets us reap our own orphans without touching whatever
// unrelated program a user happens to be running on 5000/5173.
const stateDir = path.join(root, 'node_modules', '.cache', 'velora-dev');
const stateFile = path.join(stateDir, 'state.json');

const log = (msg) => process.stdout.write(`${msg}\n`);

const prefix = (name) => (data) => {
  const text = data.toString().replace(/\n$/, '');
  for (const line of text.split('\n')) {
    if (line.length > 0) log(`[${name}] ${line}`);
  }
};

const truncate = (value, max = 120) => {
  const text = String(value ?? '').trim().replace(/\s+/g, ' ');
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
};

// Case/separator-insensitive form used for all path comparisons, so a command
// line recorded as "C:\Users\...\Velora\server.js" matches on any shell.
const norm = (value) => String(value ?? '').replace(/\\/g, '/').toLowerCase();
const rootNorm = norm(root);

// ---------------------------------------------------------------- state file

function readState() {
  try {
    // Strip a BOM: some editors/tools write UTF-8 with one, and JSON.parse
    // would throw on it, silently disabling orphan cleanup.
    const raw = fs.readFileSync(stateFile, 'utf8').replace(/^\uFEFF/, '');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

function writeState(state) {
  try {
    fs.mkdirSync(stateDir, { recursive: true });
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
  } catch {
    /* state tracking is best-effort; never block startup on it */
  }
}

function clearState() {
  try {
    fs.rmSync(stateFile, { force: true });
  } catch {
    /* ignore */
  }
}

// PIDs a previous run of THIS script recorded as its children.
function recordedChildPids(state) {
  const pids = new Set();
  for (const child of state?.children ?? []) {
    if (Number.isInteger(child?.pid) && child.pid > 0) pids.add(child.pid);
  }
  return pids;
}

function pidAlive(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  if (pid === process.pid) return true;
  try {
    process.kill(pid, 0);
    return true;
  } catch (err) {
    // EPERM means the process exists but belongs to another user.
    return err.code === 'EPERM';
  }
}

// ------------------------------------------------------- command execution

function capture(command, args, timeout = 10000) {
  try {
    const res = spawnSync(command, args, {
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
      windowsHide: true,
      timeout,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    if (res.error || res.status !== 0) return null;
    return res.stdout ?? '';
  } catch {
    return null;
  }
}

function systemBinary(...segments) {
  const fallback = segments[segments.length - 1];
  try {
    const systemRoot = process.env.SystemRoot || process.env.windir || 'C:\\Windows';
    const full = path.join(systemRoot, ...segments);
    return fs.existsSync(full) ? full : fallback;
  } catch {
    return fallback;
  }
}

const powershell = () => systemBinary('System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
const netstat = () => systemBinary('System32', 'netstat.exe');

// -------------------------------------------------------- process table

// Cached snapshot: pid -> { pid, ppid, name, exe, cmd }. One CIM query is much
// cheaper than one query per ancestor while walking a process tree.
let processTable = null;

function loadProcessTable() {
  processTable = new Map();
  if (IS_WIN) {
    const script =
      'Get-CimInstance -ClassName Win32_Process -ErrorAction Stop | ' +
      'Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ' +
      'ConvertTo-Json -Compress';
    const out = capture(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], 20000);
    if (out) {
      let parsed;
      try {
        parsed = JSON.parse(out);
      } catch {
        parsed = null;
      }
      if (parsed) {
        for (const entry of Array.isArray(parsed) ? parsed : [parsed]) {
          const pid = Number(entry?.ProcessId);
          if (!Number.isInteger(pid) || pid <= 0) continue;
          processTable.set(pid, {
            pid,
            ppid: Number(entry?.ParentProcessId) || 0,
            name: entry?.Name ?? '',
            exe: entry?.ExecutablePath ?? '',
            cmd: entry?.CommandLine ?? '',
          });
        }
      }
    }
    return processTable;
  }

  // POSIX: `pid ppid args` per line.
  const out = capture('ps', ['-eo', 'pid=,ppid=,args=']);
  if (out) {
    for (const line of out.split('\n')) {
      const match = line.match(/^\s*(\d+)\s+(\d+)\s+(.*)$/);
      if (!match) continue;
      const pid = Number(match[1]);
      const cmd = match[3].trim();
      processTable.set(pid, { pid, ppid: Number(match[2]), name: path.basename(cmd), exe: cmd, cmd });
    }
  }
  return processTable;
}

function processInfo(pid) {
  if (!Number.isInteger(pid) || pid <= 0) return null;
  if (processTable?.has(pid)) return processTable.get(pid);

  if (IS_WIN) {
    // Fallback for the (rare) case the bulk query failed: ask about one PID.
    const script =
      `Get-CimInstance -ClassName Win32_Process -Filter "ProcessId=${pid}" -ErrorAction Stop | ` +
      'Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ' +
      'ConvertTo-Json -Compress';
    const out = capture(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], 20000);
    if (!out) return null;
    try {
      const parsed = JSON.parse(out);
      if (!parsed || Array.isArray(parsed)) return null;
      return {
        pid: Number(parsed.ProcessId),
        ppid: Number(parsed.ParentProcessId) || 0,
        name: parsed.Name ?? '',
        exe: parsed.ExecutablePath ?? '',
        cmd: parsed.CommandLine ?? '',
      };
    } catch {
      return null;
    }
  }

  return processTable?.get(pid) ?? null;
}

function describeProcess(info) {
  if (!info) return 'unknown process';
  const cmd = truncate(info.cmd || info.exe || info.name, 140);
  return `pid ${info.pid} (${info.name || '?'}) "${cmd}"`;
}

// ------------------------------------------------------------- port lookup

// port -> Set<pid> for LISTENING sockets. Windows uses
// Get-NetTCPConnection (locale independent) and falls back to netstat -ano;
// POSIX uses lsof. Returns null only if the lookup itself is unavailable.
function portOwners(ports) {
  const wanted = new Set(ports);
  const owners = new Map([...wanted].map((port) => [port, new Set()]));
  let looked = false;

  if (IS_WIN) {
    const list = [...wanted].join(',');
    const script =
      'Get-NetTCPConnection -State Listen -ErrorAction Stop | ' +
      `Where-Object { @(${list}) -contains $_.LocalPort } | ` +
      'ForEach-Object { "$($_.LocalPort) $($_.OwningProcess)" }';
    const out = capture(powershell(), ['-NoProfile', '-NonInteractive', '-Command', script], 20000);
    if (out) {
      looked = true;
      for (const line of out.split(/\r?\n/)) {
        const match = line.trim().match(/^(\d+)\s+(\d+)$/);
        if (!match) continue;
        const bucket = owners.get(Number(match[1]));
        const pid = Number(match[2]);
        if (bucket && Number.isInteger(pid) && pid > 0) bucket.add(pid);
      }
    }

    if (!looked) {
      const out2 = capture(netstat(), ['-ano', '-p', 'TCP']);
      if (out2) {
        looked = true;
        for (const line of out2.split(/\r?\n/)) {
          const match = line.match(/^\s*TCP\s+(\S+):(\d+)\s+(\S+)\s+(\S+)\s+(\d+)\s*$/i);
          if (!match) continue;
          const bucket = owners.get(Number(match[2]));
          const pid = Number(match[5]);
          // netstat's state column is localized, so identify a listening socket
          // by its wildcard peer instead. Rows that still have a peer (a browser
          // talking to :5000, a TIME_WAIT remnant) are deliberately ignored.
          const isListener = /listen/i.test(match[4]) || /^(\*|0\.0\.0\.0|\[::\]):0$/i.test(match[3]);
          if (bucket && isListener && Number.isInteger(pid) && pid > 0) bucket.add(pid);
        }
      }
    }
  } else {
    for (const port of wanted) {
      const out = capture('lsof', ['-nP', `-iTCP:${port}`, '-sTCP:LISTEN', '-t'], 10000);
      if (out === null) continue;
      looked = true;
      for (const line of out.split(/\r?\n/)) {
        const pid = Number(line.trim());
        if (Number.isInteger(pid) && pid > 0) owners.get(port).add(pid);
      }
    }
  }

  return looked ? owners : null;
}

function portInUse(port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const done = (result) => {
      socket.removeAllListeners();
      socket.destroy();
      resolve(result);
    };
    socket.setTimeout(700);
    socket.once('connect', () => done(true));
    socket.once('timeout', () => done(false));
    socket.once('error', () => done(false));
    socket.connect(port, '127.0.0.1');
  });
}

// Polls with the plain TCP probe (milliseconds) rather than the process-table
// query (seconds): all we need to know is whether the socket stopped accepting
// connections.
async function waitForPortFree(port, timeoutMs = PORT_FREE_MS) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!(await portInUse(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, PORT_POLL_MS));
  }
  return !(await portInUse(port));
}

// ------------------------------------------------------------ http identity

// Read-only probes against the servers themselves. They distinguish "Velora is
// already running here" from "something else is squatting on our port" without
// guessing from a command line. No route is added or changed.
async function probeVeloraApi() {
  try {
    const res = await fetch(`http://127.0.0.1:${BACKEND_PORT}/api/health`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return /velora/i.test(body);
  } catch {
    return false;
  }
}

async function probeVeloraFrontend() {
  try {
    const res = await fetch(`http://127.0.0.1:${FRONTEND_PORT}/`, {
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) return false;
    const body = await res.text();
    return /<title>[^<]*velora/i.test(body);
  } catch {
    return false;
  }
}

// ------------------------------------------------------------- identity

function isNodeProcess(info) {
  if (!info) return false;
  if (/^node(\.exe)?$/i.test(info.name || '')) return true;
  return /^node(\.exe)?$/i.test(path.basename(info.exe || ''));
}

// Splits a Node command line into its launcher and script arguments, ignoring
// Node/Vite flags such as `--watch` or `--port=5173`.
function parseNodeCommand(cmd) {
  if (!cmd) return null;
  const tokens = cmd.match(/"[^"]*"|\S+/g);
  if (!tokens || tokens.length === 0) return null;
  const clean = tokens.map((token) => token.replace(/^"|"$/g, ''));
  const launcher = path.basename(clean[0]).toLowerCase().replace(/\.exe$/, '');
  if (!['node', 'nodemon', 'npm', 'npx'].includes(launcher)) return null;
  const args = clean.slice(1).filter((token) => !token.startsWith('-'));
  return { launcher, args };
}

function entryScript(info) {
  return parseNodeCommand(info?.cmd)?.args?.[0] ?? null;
}

// Where does the script argument point? A bare "server.js" has an unknown cwd,
// so it is explicitly NOT treated as "inside this project" - that case is
// resolved by the HTTP probe instead.
function scriptLocation(script) {
  if (!script) return { name: null, inProject: false, bare: false, hasPath: false };
  if (!/[\\/]/.test(script)) {
    return { name: script.toLowerCase(), inProject: false, bare: true, hasPath: false };
  }
  const resolved = path.resolve(root, script);
  const inside = norm(resolved).startsWith(`${rootNorm}/`);
  return {
    name: path.basename(resolved).toLowerCase(),
    inProject: inside,
    bare: false,
    hasPath: true,
  };
}

// Is this process related to a process we already know is Velora? Used only for
// ancestors, once a descendant has been positively identified.
function isRelatedVeloraProcess(info, entries, scriptName) {
  if (!isNodeProcess(info)) return false;
  if (norm(info.cmd).includes(rootNorm)) return true;
  const location = scriptLocation(entryScript(info));
  if (location.inProject) return true;
  // The `node --watch server.js` / nodemon supervisor that spawned it: same
  // bare entry, no path. Anything with an explicit foreign path is rejected.
  if (location.bare && scriptName) return location.name === scriptName && entries.has(location.name);
  return false;
}

function makeClassifier({ kind, entries, recorded, probe }) {
  return async (info) => {
    if (!info) return { velora: false, why: 'the process already exited' };
    if (!isNodeProcess(info)) {
      return { velora: false, why: `it is not a Node.js process (${info.name || 'unknown'})` };
    }
    if (recorded.has(info.pid)) {
      return { velora: true, why: 'it was recorded as a child of an earlier `npm run dev`' };
    }
    if (norm(info.cmd).includes(rootNorm)) {
      return { velora: true, why: 'its command line points inside the Velora project' };
    }
    const script = entryScript(info);
    const location = scriptLocation(script);
    if (location.inProject) {
      return { velora: true, why: `it runs ${truncate(script, 90)} from the Velora project` };
    }
    if (location.bare && entries.has(location.name)) {
      if (await probe()) {
        return {
          velora: true,
          why: `it serves the Velora ${kind === 'backend' ? 'API' : 'frontend'} on this port`,
          script: location.name,
        };
      }
      return {
        velora: false,
        why: `it runs "${script}" but does not answer as Velora, and the path is relative so it cannot be attributed to this project`,
      };
    }
    return { velora: false, why: `its command line is not a Velora ${kind}` };
  };
}

// ------------------------------------------------------------- termination

// Kills a process *and its descendants*. Plain child.kill() is not enough:
// `node --watch server.js` runs the real server as a grandchild, and on Windows
// child.kill() only signals the direct child, orphaning the grandchild (and its
// listening socket) every time.
function killTreeSync(pid, signal = 'SIGKILL') {
  if (!Number.isInteger(pid) || pid <= 0) return;
  try {
    if (IS_WIN) {
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true,
      });
    } else {
      process.kill(pid, signal);
    }
  } catch {
    /* already gone */
  }
}

// On POSIX the children are spawned detached, so they own their own process
// group and the negative pid reaches the whole tree in one call.
function killGroupSync(pid, signal) {
  if (IS_WIN || !Number.isInteger(pid) || pid <= 0) {
    killTreeSync(pid, signal);
    return;
  }
  try {
    process.kill(-pid, signal);
  } catch {
    killTreeSync(pid, signal);
  }
}

// Walks from a confirmed Velora process up towards the root of its tree and
// returns the highest ancestor that is still recognisably Velora. This is what
// catches the `node --watch server.js` supervisor: killing only the grandchild
// that owns :5000 would let the supervisor immediately start a fresh one and
// re-create the stale process we just cleaned up.
function veloraTreeRoot(pid, entries, scriptName) {
  const owner = processInfo(pid);
  let rootPid = pid;
  let rootInfo = owner;
  let current = owner;
  let depth = 0;
  while (current && depth < 8) {
    const parentPid = current.ppid;
    if (!parentPid || parentPid === process.pid) break;
    const parent = processInfo(parentPid);
    if (!parent || !isRelatedVeloraProcess(parent, entries, scriptName)) break;
    rootPid = parent.pid;
    rootInfo = parent;
    current = parent;
    depth += 1;
  }
  return { pid: rootPid, info: rootInfo };
}

function terminateVeloraProcess(pid, entries, scriptName) {
  const tree = veloraTreeRoot(pid, entries, scriptName);
  const extra = tree.pid === pid ? '' : ` (its Velora supervisor, pid ${tree.pid})`;
  log(`[dev]   terminating ${describeProcess(tree.info)} and every process below it${extra}`);
  // Killing the top of the tree is what stops a `node --watch` supervisor from
  // respawning the backend we just removed.
  killTreeSync(tree.pid, 'SIGKILL');
  if (tree.pid !== pid) killTreeSync(pid, 'SIGKILL');
}

// ------------------------------------------------------------- child procs

const children = [];
let shuttingDown = false;
let finished = false;
let requestedCode = 0;
let pending = 0;
let gracefulTimer = null;
let hardTimer = null;
// Only true once we have actually spawned children. Until then this process
// does not own the state file, so the pre-start refusal path must not clean it
// up -- otherwise a rejected duplicate run would delete the *live* run's
// record and strand that run's children.
let ownsChildren = false;

function run(name, args, env) {
  const child = spawn(process.execPath, args, {
    cwd: root,
    env,
    stdio: ['inherit', 'pipe', 'pipe'],
    // Own process group on POSIX so we can signal the entire tree at once.
    // Never on Windows: detached would open a new console window.
    detached: !IS_WIN,
  });

  child.stdout.on('data', prefix(name));
  child.stderr.on('data', prefix(name));

  const entry = { name, child, pid: child.pid, exited: false };
  children.push(entry);
  pending += 1;

  child.on('error', (err) => {
    entry.exited = true;
    log(`[dev] ${name} failed to start: ${err.message}`);
    shutdown(1);
  });

  // 'exit' (not 'close'): the OS has already torn the process down and
  // released its sockets at this point, which is exactly what we need for the
  // port to be free before we let go of the terminal.
  child.on('exit', (code, signal) => {
    entry.exited = true;
    pending -= 1;

    if (shuttingDown) {
      log(`[dev] ${name} stopped (${signal ? `signal ${signal}` : `code ${code}`})`);
      if (pending <= 0) finish();
      return;
    }

    // A child dying on its own must bring the whole stack down, otherwise the
    // surviving Vite keeps holding :5173. `code` is null when the child was
    // killed by a signal, which we surface as a failure.
    log(
      `[dev] ${name} exited unexpectedly (${signal ? `signal ${signal}` : `code ${code}`}), stopping the rest`,
    );
    shutdown(code ?? 1);
  });

  return entry;
}

// ---------------------------------------------------------------- shutdown

function exitNow(code) {
  if (finished) return;
  finished = true;
  clearTimeout(gracefulTimer);
  clearTimeout(hardTimer);
  clearState();
  process.exit(code);
}

// Sync-only evidence, for the `process.on('exit')` net where nothing can be
// awaited. Uses the PIDs we recorded plus the command lines already cached.
function emergencyCleanup() {
  if (finished || !ownsChildren) return;
  finished = true;
  for (const entry of children) {
    if (!entry.exited) killTreeSync(entry.pid, 'SIGKILL');
  }
  // A `node --watch` grandchild can briefly outlive its supervisor. Sweep
  // whatever is still on the ports, but only with evidence available
  // synchronously here: "we started it" or "its command line is in this
  // project". Anything else is reported, never killed.
  const owners = portOwners([BACKEND_PORT, FRONTEND_PORT]);
  if (owners) {
    const recorded = new Set(children.map((entry) => entry.pid));
    for (const [port, pids] of owners) {
      for (const pid of pids) {
        if (recorded.has(pid)) continue;
        const info = processInfo(pid);
        if (!info) continue;
        const ours = recorded.has(pid) || norm(info.cmd).includes(rootNorm);
        if (ours && isNodeProcess(info)) {
          log(`[dev] port ${port} still held by ${describeProcess(info)} - terminating it`);
          killTreeSync(pid, 'SIGKILL');
        } else if (info) {
          log(`[dev] port ${port} is held by ${describeProcess(info)}, which is not Velora - left running`);
        }
      }
    }
  }
  clearState();
}

async function finalSweep() {
  // Cheap reachability check first: on a clean Ctrl+C both ports are already
  // closed, and this path never pays for a process-table query.
  const busy = [];
  for (const port of [BACKEND_PORT, FRONTEND_PORT]) {
    if (await portInUse(port)) busy.push(port);
  }
  if (busy.length === 0) {
    log(`[dev] ports ${BACKEND_PORT} and ${FRONTEND_PORT} released, no Velora process left behind`);
    return;
  }

  const owners = portOwners(busy);
  if (!owners) return;

  const apiProbe = probeVeloraApi();
  const webProbe = probeVeloraFrontend();
  const recorded = new Set(children.map((entry) => entry.pid));
  const classifyBackend = makeClassifier({
    kind: 'backend',
    entries: BACKEND_ENTRIES,
    recorded,
    probe: () => apiProbe,
  });
  const classifyFrontend = makeClassifier({
    kind: 'frontend',
    entries: FRONTEND_ENTRIES,
    recorded,
    probe: () => webProbe,
  });

  for (const port of busy) {
    const pids = [...(owners.get(port) ?? [])];
    if (pids.length === 0) continue;
    const classify = port === BACKEND_PORT ? classifyBackend : classifyFrontend;
    const entries = port === BACKEND_PORT ? BACKEND_ENTRIES : FRONTEND_ENTRIES;
    for (const pid of pids) {
      const info = processInfo(pid);
      const verdict = await classify(info);
      if (verdict.velora) {
        log(
          `[dev] port ${port} is still held by a Velora ${port === BACKEND_PORT ? 'backend' : 'frontend'}: ${describeProcess(info)}`,
        );
        terminateVeloraProcess(pid, entries, verdict.script);
      } else {
        log(`[dev] port ${port} is held by ${describeProcess(info)}, which is not Velora - left running`);
      }
    }
  }
}

function finish() {
  if (finished) return;
  // Async sweep first (it can positively identify a lingering Velora grandchild
  // through the HTTP probe), then the sync-only exit path takes over.
  finalSweep()
    .catch(() => {})
    .then(() => {
      if (finished) return;
      exitNow(requestedCode);
    });
}

function shutdown(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  requestedCode = code;
  log('[dev] shutting down, stopping frontend and backend');

  for (const entry of children) {
    if (entry.exited) continue;
    if (IS_WIN) {
      killTreeSync(entry.pid, 'SIGTERM');
    } else {
      killGroupSync(entry.pid, 'SIGTERM');
    }
  }

  if (pending <= 0) {
    finish();
    return;
  }

  gracefulTimer = setTimeout(() => {
    for (const entry of children) {
      if (!entry.exited) killGroupSync(entry.pid, 'SIGKILL');
    }
  }, GRACEFUL_MS);

  // Backstop: never hang the terminal waiting on a wedged child.
  hardTimer = setTimeout(() => {
    for (const entry of children) {
      if (!entry.exited) killTreeSync(entry.pid, 'SIGKILL');
    }
    finish();
  }, GRACEFUL_MS + HARD_MS);
}

process.on('exit', emergencyCleanup);

for (const sig of ['SIGINT', 'SIGTERM', 'SIGHUP', 'SIGBREAK']) {
  process.on(sig, () => {
    // A second Ctrl+C should not have to wait out the timers.
    if (shuttingDown) {
      for (const entry of children) {
        if (!entry.exited) killTreeSync(entry.pid, 'SIGKILL');
      }
      emergencyCleanup();
      exitNow(requestedCode);
      return;
    }
    shutdown(0);
  });
}

process.on('uncaughtException', (err) => {
  log(`[dev] uncaught exception: ${err?.stack || err}`);
  shutdown(1);
});

process.on('unhandledRejection', (err) => {
  log(`[dev] unhandled rejection: ${err?.stack || err}`);
  shutdown(1);
});

// ------------------------------------------------------------------ startup

function reportForeign(port, info, why) {
  log(`[dev] Port ${port} is already in use by another application:`);
  log(`[dev]   ${describeProcess(info)}`);
  log(`[dev]   not terminated because ${why}`);
  log(
    `[dev] Stop that application (or free the port) and run \`npm run dev\` again. ` +
      `Velora needs ${BACKEND_PORT} for its API and ${FRONTEND_PORT} for Vite.`,
  );
}

// Identifies the owner of `port`, terminates it if - and only if - it is a
// Velora process, then waits for the socket to be released. `owners` is a
// shared snapshot so both ports cost a single query.
async function reclaimPort(port, kind, entries, classify, owners) {
  if (!owners) {
    // No tooling to attribute the socket: fall back to a plain reachability
    // probe, which can prove occupancy but never ownership.
    if (await portInUse(port)) {
      log(
        `[dev] Port ${port} is in use, but this system did not let us identify the owning process.\n` +
          `[dev] Refusing to kill it. Free the port and run \`npm run dev\` again.`,
      );
      return false;
    }
    return true;
  }

  const pids = [...(owners.get(port) ?? [])].filter((pid) => pid !== process.pid);
  if (pids.length === 0) return true;

  log(`[dev] Port ${port} is occupied by ${pids.length} process(es) - identifying them`);
  for (const pid of pids) {
    const info = processInfo(pid);
    const verdict = await classify(info);
    if (!verdict.velora) {
      reportForeign(port, info, verdict.why);
      return false;
    }
    log(`[dev]   ${describeProcess(info)} is a Velora ${kind} (${verdict.why})`);
    terminateVeloraProcess(pid, entries, verdict.script);
  }

  if (!(await waitForPortFree(port))) {
    log(
      `[dev] Port ${port} is still occupied after terminating the Velora process(es).\n` +
        `[dev] Something else grabbed the port immediately; stop it and run \`npm run dev\` again.`,
    );
    return false;
  }
  log(`[dev] Port ${port} reclaimed for the Velora ${kind}`);
  return true;
}

async function claimPorts() {
  // One snapshot serves every lookup below: the live-session check, ownership
  // classification and the ancestor walk all read from the same table.
  loadProcessTable();

  const previous = readState();
  const recorded = recordedChildPids(previous);

  if (previous?.pid && previous.pid !== process.pid && pidAlive(previous.pid)) {
    const owner = processInfo(previous.pid);
    // A live dev session we started earlier. Starting a second one is exactly
    // the duplicate-Vite case we are preventing, so refuse instead of silently
    // fighting over the port. If the PID was recycled by something unrelated,
    // the command line check below keeps us from refusing forever.
    if (owner && norm(owner.cmd).includes(norm(path.join(root, 'scripts')))) {
      log(
        `[dev] A Velora dev server is already running (pid ${previous.pid}).\n` +
          `[dev] Stop it first, or run:  taskkill /PID ${previous.pid} /T /F`,
      );
      return false;
    }
  }

  // The parent is gone but its children are not: these are orphans from a
  // crash, a closed terminal, or a `node --watch` restart. We recorded the PIDs
  // ourselves, so they are unambiguously ours.
  const orphans = [...recorded].filter((pid) => pid !== process.pid && pidAlive(pid));
  if (orphans.length > 0) {
    log(`[dev] cleaning up ${orphans.length} orphaned process(es) from a previous run`);
    for (const orphan of orphans) killTreeSync(orphan.pid, 'SIGKILL');
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  clearState();

  const apiProbe = probeVeloraApi();
  const webProbe = probeVeloraFrontend();
  const classifyBackend = makeClassifier({
    kind: 'backend',
    entries: BACKEND_ENTRIES,
    recorded,
    probe: () => apiProbe,
  });
  const classifyFrontend = makeClassifier({
    kind: 'frontend',
    entries: FRONTEND_ENTRIES,
    recorded,
    probe: () => webProbe,
  });

  log(`[dev] checking ports ${BACKEND_PORT} (backend API) and ${FRONTEND_PORT} (Vite)`);

  // One query for both ports; null means "this system cannot tell us who owns
  // them", which each reclaimPort() degrades into a reachability probe.
  const owners = portOwners([BACKEND_PORT, FRONTEND_PORT]);

  if (!(await reclaimPort(BACKEND_PORT, 'backend', BACKEND_ENTRIES, classifyBackend, owners))) {
    return false;
  }
  if (!(await reclaimPort(FRONTEND_PORT, 'frontend', FRONTEND_ENTRIES, classifyFrontend, owners))) {
    return false;
  }

  return true;
}

const claimed = await claimPorts();
if (!claimed) {
  process.exit(1);
}

log(`[dev] Starting Velora frontend (Vite) at http://localhost:${FRONTEND_PORT}`);
log(`[dev] Starting Velora backend (Express) at http://localhost:${BACKEND_PORT}`);

const backend = run(
  'backend',
  ['--watch', 'server.js'],
  // 5000 is a fixed contract: vite.config.js proxies /api here. Pinning it in
  // the child environment keeps a stray PORT= in the shell from moving it.
  { ...process.env, PORT: String(BACKEND_PORT) },
);
const frontend = run('frontend', [path.join('node_modules', 'vite', 'bin', 'vite.js')]);

// Claim ownership only after the children exist, so every earlier exit path
// (including the duplicate-run refusal) is a no-op for cleanup.
ownsChildren = true;

writeState({
  runId: `${process.pid}-${Date.now()}`,
  pid: process.pid,
  startedAt: new Date().toISOString(),
  root,
  ports: { backend: BACKEND_PORT, frontend: FRONTEND_PORT },
  children: [backend, frontend].map(({ name, child }) => ({ name, pid: child.pid })),
});

// Informational only: a slow MySQL connect must not be mistaken for a crash,
// and the children's own output already shows any real error.
for (const [label, port] of [
  ['backend', BACKEND_PORT],
  ['frontend', FRONTEND_PORT],
]) {
  setTimeout(async () => {
    if (shuttingDown || finished) return;
    if (await portInUse(port)) {
      log(`[dev] ${label} is listening on port ${port}`);
    } else {
      log(`[dev] ${label} has not opened port ${port} yet - it may still be starting`);
    }
  }, 15000).unref?.();
}

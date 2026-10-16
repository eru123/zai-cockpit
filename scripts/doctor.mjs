import { spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

loadDotEnv(resolve(".env"));

const requiredFiles = [
  "README.md",
  "package.json",
  "package-lock.json",
  ".env.example",
  "server/index.ts",
  "src/App.tsx",
  "scripts/smoke.mjs",
  "scripts/release-audit.mjs",
  "scripts/zai-agent-runner.mjs"
];
const handoffRoot = resolve(process.env.ZAI_COCKPIT_HANDOFF_DIR ?? "zai-handoff");
const handoffDirs = ["inbox", "outbox", "assets", "status", "logs"];
const runnerDir = dirname(fileURLToPath(import.meta.url));
const agentRunnerScript = resolve(runnerDir, "zai-agent-runner.mjs");
const zaiAutoRun = process.env.ZAI_COCKPIT_RUNNER_AUTORUN !== "0";
const zaiCommand = process.env.ZAI_COCKPIT_RUNNER_COMMAND ?? process.execPath;
const zaiHelpArgs = parseJsonStringArray("ZAI_COCKPIT_RUNNER_HELP_ARGS_JSON", [agentRunnerScript, "--preflight"]);
const runnerTimeoutMs = 15000;

const hardFailures = [];
const warnings = [];
const notes = [];

console.log("Zai Cockpit local doctor");
console.log("");

checkRequiredFiles();
checkNodeVersion();
await checkHandoffDirs();
await checkZaiRunner();

printSummary();

if (hardFailures.length > 0) {
  process.exit(1);
}

function checkRequiredFiles() {
  section("Project files");
  requiredFiles.forEach((file) => {
    if (existsSync(resolve(file))) {
      ok(`${file} exists`);
      return;
    }
    fail(`${file} is missing`);
  });
}

function checkNodeVersion() {
  section("Node runtime");
  const major = Number(process.versions.node.split(".")[0]);
  if (major >= 20) {
    ok(`Node ${process.versions.node}`);
    return;
  }
  fail(`Node ${process.versions.node} is too old. Use Node 20 or newer.`);
}

async function checkHandoffDirs() {
  section("Local handoff folders");
  for (const dir of handoffDirs) {
    const path = join(handoffRoot, dir);
    await mkdir(path, { recursive: true });
    ok(`${path}`);
  }

  const testPath = join(handoffRoot, `.doctor-write-test-${process.pid}`);
  try {
    await writeFile(testPath, "ok", "utf8");
    await rm(testPath, { force: true });
    ok(`${handoffRoot} is writable`);
  } catch (error) {
    fail(`${handoffRoot} is not writable: ${messageOf(error)}`);
  }
}

async function checkZaiRunner() {
  section("Z.ai runner");
  note(`autorun=${zaiAutoRun}`);
  note(`command=${zaiCommand}`);

  if (!existsSync(agentRunnerScript)) {
    fail(`Built-in Z.ai agent runner script is missing: ${agentRunnerScript}`);
    return;
  }
  ok(`agent runner script: ${agentRunnerScript}`);

  checkZaiApiConfig();

  if (!zaiAutoRun) {
    ok("Zai autorun is disabled; manual handoff mode is active.");
    return;
  }

  const result = await tryRun(zaiCommand, zaiHelpArgs, runnerTimeoutMs);
  if (result.ok) {
    ok(`${zaiCommand} ${zaiHelpArgs.join(" ")} completed`);
    return;
  }

  warn(`Runner preflight failed: ${result.message}`);
  if (result.code) warn(`runner error code: ${result.code}`);
  note("Jobs can still be written to zai-handoff/inbox and completed through manual handoff.");
  note("Set ZAI_COCKPIT_RUNNER_AUTORUN=0 to make manual handoff explicit.");
}

function checkZaiApiConfig() {
  const apiKey = process.env.ZAI_API_KEY || process.env.ZAI_COCKPIT_API_KEY || "";
  const endpointMode = normalizeEndpointMode(process.env.ZAI_ENDPOINT_MODE);
  const codingBase = process.env.ZAI_CODING_BASE_URL || "https://api.z.ai/api/coding/paas/v4";
  const apiBase = process.env.ZAI_API_BASE_URL || "https://api.z.ai/api/paas/v4";
  const chatModel = process.env.ZAI_CHAT_MODEL || "glm-4.7";
  const imageModel = process.env.ZAI_IMAGE_MODEL || "cogview-4";

  note(`endpointMode=${endpointMode} (chat: ${endpointMode === "api" ? apiBase : `${codingBase} first`})`);
  note(`chatModel=${chatModel} imageModel=${imageModel}`);

  if (apiKey) {
    ok("ZAI_API_KEY is configured.");
    if (endpointMode === "auto") {
      note("Chat completions use the GLM Coding Plan endpoint first and fall back to the pay-as-you-go endpoint.");
    }
  } else {
    warn("ZAI_API_KEY is not configured; the Z.ai agent runner cannot start.");
    note("Create an API key at https://z.ai/model-api (or from your GLM Coding Plan page) and set ZAI_API_KEY in .env.");
  }
  note("Image generation always uses the pay-as-you-go endpoint because Z.ai serves image models only there.");
}

function normalizeEndpointMode(value) {
  const mode = (value || "auto").toLowerCase();
  return mode === "coding" || mode === "api" ? mode : "auto";
}

function tryRun(command, args, timeoutMs) {
  return new Promise((resolveResult) => {
    let child;
    let settled = false;
    let stderrText = "";

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolveResult(result);
    };

    const timeoutId = setTimeout(() => {
      if (child && !child.killed) child.kill();
      finish({ ok: false, message: `timed out after ${timeoutMs}ms`, code: "TIMEOUT" });
    }, timeoutMs);

    try {
      child = spawn(command, args, {
        cwd: process.cwd(),
        stdio: ["ignore", "ignore", "pipe"],
        windowsHide: true
      });

      child.stderr?.on("data", (chunk) => {
        stderrText = `${stderrText}${chunk.toString("utf8")}`.slice(0, 1200);
      });

      child.on("error", (error) => {
        clearTimeout(timeoutId);
        finish({ ok: false, message: error.message, code: error.code });
      });

      child.on("close", (exitCode) => {
        clearTimeout(timeoutId);
        if (exitCode === 0) {
          finish({ ok: true, message: "ok" });
          return;
        }
        finish({
          ok: false,
          message: stderrText.trim() || `${command} exited with code ${exitCode}`,
          code: exitCode === null ? undefined : String(exitCode)
        });
      });
    } catch (error) {
      clearTimeout(timeoutId);
      finish({
        ok: false,
        message: messageOf(error),
        code: error && typeof error === "object" && "code" in error ? String(error.code) : undefined
      });
    }
  });
}

function section(title) {
  console.log("");
  console.log(title);
}

function ok(message) {
  console.log(`[ok] ${message}`);
}

function warn(message) {
  warnings.push(message);
  console.log(`[warn] ${message}`);
}

function fail(message) {
  hardFailures.push(message);
  console.log(`[fail] ${message}`);
}

function note(message) {
  notes.push(message);
  console.log(`[note] ${message}`);
}

function printSummary() {
  section("Summary");
  if (hardFailures.length === 0) ok("No hard setup failures found.");
  if (warnings.length > 0) console.log(`[warn] ${warnings.length} warning(s).`);
  if (notes.length > 0) console.log(`[note] ${notes.length} note(s).`);
}

function messageOf(error) {
  return error instanceof Error ? error.message : String(error);
}

function loadDotEnv(path) {
  if (!existsSync(path)) return;
  const lines = readFileSync(path, "utf8").split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separatorIndex = trimmed.indexOf("=");
    if (separatorIndex <= 0) continue;
    const key = trimmed.slice(0, separatorIndex).trim();
    const rawValue = trimmed.slice(separatorIndex + 1).trim();
    if (process.env[key] !== undefined) continue;
    process.env[key] = rawValue.replace(/^["']|["']$/g, "");
  }
}

function parseJsonStringArray(envKey, fallback) {
  const rawValue = process.env[envKey];
  if (!rawValue) return fallback;
  try {
    const parsed = JSON.parse(rawValue);
    if (Array.isArray(parsed) && parsed.every((item) => typeof item === "string")) {
      return parsed;
    }
  } catch {
    // Invalid optional wrapper args fall back to the built-in runner defaults.
  }
  return fallback;
}


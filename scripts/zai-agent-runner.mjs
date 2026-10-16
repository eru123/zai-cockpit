#!/usr/bin/env node
// Z.ai agent runner for Zai Cockpit.
//
// Runs the generation agent in-process instead of spawning an external CLI
// agent: this script drives an agentic tool loop directly against the Z.ai
// OpenAI-compatible APIs.
//
// Billing strategy (the important part):
//   - Chat completions (the agent brain, nearly all tokens) go to the GLM
//     Coding Plan endpoint by default: https://api.z.ai/api/coding/paas/v4
//   - ZAI_ENDPOINT_MODE=auto (default) falls back to the pay-as-you-go
//     endpoint https://api.z.ai/api/paas/v4 only when the coding endpoint
//     rejects the request because no coding plan is active.
//   - Image generation only exists on the standard endpoint, so
//     generate_image always posts to ZAI_IMAGE_API_BASE_URL (default
//     https://api.z.ai/api/paas/v4) and is billed per image.
//
// The server spawns this script as:
//   node scripts/zai-agent-runner.mjs            (job mode, prompt on stdin)
//   node scripts/zai-agent-runner.mjs --preflight (config check, exit 0/1)
//
// Job mode receives ZAI_COCKPIT_JOB_ID, ZAI_COCKPIT_JOB_PATH and
// ZAI_COCKPIT_OUTBOX_DIR in its environment, plus the job instructions on
// stdin. It writes a transcript to stdout/stderr that the handoff server
// pipes into the per-job log.

import { readFile, writeFile, readdir, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { basename, dirname, extname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const runnerScript = fileURLToPath(import.meta.url);

const CODING_BASE_URL_DEFAULT = "https://api.z.ai/api/coding/paas/v4";
const API_BASE_URL_DEFAULT = "https://api.z.ai/api/paas/v4";
const CHAT_MODEL_DEFAULT = "glm-4.7";
const IMAGE_MODEL_DEFAULT = "cogview-4";
const MAX_TURNS_DEFAULT = 40;
const REQUEST_TIMEOUT_MS_DEFAULT = 180000;
const IMAGE_GENERATION_ATTEMPTS = 3;

const env = process.env;
const apiKey = env.ZAI_API_KEY || env.ZAI_COCKPIT_API_KEY || env.Z_AI_API_KEY || "";
const codingBase = (env.ZAI_CODING_BASE_URL || CODING_BASE_URL_DEFAULT).replace(/\/+$/, "");
const apiBase = (env.ZAI_API_BASE_URL || API_BASE_URL_DEFAULT).replace(/\/+$/, "");
const imageBase = (env.ZAI_IMAGE_API_BASE_URL || apiBase).replace(/\/+$/, "");
const endpointMode = normalizeEndpointMode(env.ZAI_ENDPOINT_MODE);
const chatModel = env.ZAI_CHAT_MODEL || CHAT_MODEL_DEFAULT;
const imageModel = env.ZAI_IMAGE_MODEL || IMAGE_MODEL_DEFAULT;
const maxTurns = positiveInt(env.ZAI_RUNNER_MAX_TURNS, MAX_TURNS_DEFAULT);
const requestTimeoutMs = positiveInt(env.ZAI_REQUEST_TIMEOUT_MS, REQUEST_TIMEOUT_MS_DEFAULT);

const jobId = env.ZAI_COCKPIT_JOB_ID || "";
const jobPath = env.ZAI_COCKPIT_JOB_PATH || "";
const outboxDir = env.ZAI_COCKPIT_OUTBOX_DIR || "";

function log(line) {
  process.stdout.write(`[${new Date().toISOString()}] ${line}\n`);
}

function fail(message, exitCode = 1) {
  process.stderr.write(`[${new Date().toISOString()}] ${message}\n`);
  process.exitCode = exitCode;
}

function normalizeEndpointMode(value) {
  const mode = (value || "auto").toLowerCase();
  return mode === "coding" || mode === "api" ? mode : "auto";
}

function positiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function runPreflight() {
  const problems = [];
  if (!apiKey) problems.push("ZAI_API_KEY is not configured for the Z.ai agent runner.");
  if (!existsSync(runnerScript)) problems.push(`Runner script not found: ${runnerScript}`);
  if (endpointMode === "coding" && !env.ZAI_CODING_BASE_URL && !apiKey) {
    problems.push("Coding-plan endpoint requires an API key from a GLM Coding Plan subscription.");
  }
  if (problems.length > 0) {
    problems.forEach((problem) => process.stderr.write(`${problem}\n`));
    process.exit(1);
  }
  log(
    `Z.ai agent runner preflight ok: endpointMode=${endpointMode} chatModel=${chatModel} imageModel=${imageModel} ` +
      `chatBase=${endpointMode === "api" ? apiBase : codingBase} imageBase=${imageBase}`
  );
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

// --- Endpoint selection: coding plan first, standard API as fallback ------

let activeChatBase = endpointMode === "api" ? apiBase : codingBase;
let fellBackToApiBase = false;

function shouldFallbackToApiBase(status, bodyText) {
  if (endpointMode !== "auto") return false;
  if (status === 401 || status === 403 || status === 404 || status === 405) return true;
  const text = (bodyText || "").toLowerCase();
  if (
    text.includes("model not found") ||
    text.includes("no permission") ||
    text.includes("not subscribed") ||
    text.includes("subscription") ||
    text.includes("invalid api key") ||
    text.includes("unauthorized")
  ) {
    return true;
  }
  return false;
}

async function zaiFetch(url, body, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify(body),
      signal: controller.signal
    });
    const text = await response.text();
    return { status: response.status, ok: response.ok, text };
  } catch (error) {
    return { status: 0, ok: false, text: "", error };
  } finally {
    clearTimeout(timer);
  }
}

function apiErrorMessage(payload, fallback) {
  if (payload && typeof payload === "object") {
    const message = payload.error?.message || payload.message || payload.msg;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  return fallback;
}

async function chatCompletion(messages, tools) {
  const body = {
    model: chatModel,
    messages,
    temperature: 0.2,
    max_tokens: 4096,
    stream: false
  };
  if (tools && tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }

  let response = await zaiFetch(`${activeChatBase}/chat/completions`, body, requestTimeoutMs);
  if (!response.ok && !fellBackToApiBase && shouldFallbackToApiBase(response.status, response.text)) {
    log(`Coding-plan endpoint ${activeChatBase} rejected the request (HTTP ${response.status}); falling back to ${apiBase}.`);
    activeChatBase = apiBase;
    fellBackToApiBase = true;
    response = await zaiFetch(`${activeChatBase}/chat/completions`, body, requestTimeoutMs);
  }

  if (!response.ok) {
    if (response.status === 429) {
      throw new ZaiApiError("Z.ai usage limit reached: the account hit its rate or quota limit (HTTP 429).", "usage_limit");
    }
    if (response.status === 401 || response.status === 403) {
      throw new ZaiApiError("Z.ai rejected the API key (HTTP " + response.status + ").", "auth");
    }
    let payload = null;
    try {
      payload = JSON.parse(response.text);
    } catch {}
    throw new ZaiApiError(`Z.ai chat request failed (HTTP ${response.status}): ${apiErrorMessage(payload, response.text.slice(0, 300))}`, "request_failed");
  }

  let payload;
  try {
    payload = JSON.parse(response.text);
  } catch {
    throw new ZaiApiError("Z.ai chat response was not valid JSON.", "request_failed");
  }
  const choice = payload.choices?.[0];
  if (!choice) throw new ZaiApiError("Z.ai chat response contained no choices.", "request_failed");
  return choice.message || {};
}

class ZaiApiError extends Error {
  constructor(message, kind) {
    super(message);
    this.kind = kind;
  }
}

// --- Tool implementations ---------------------------------------------------

function sandboxPath(requestedPath, { mustExist = false, forWrite = false } = {}) {
  if (!outboxDir) throw new Error("ZAI_COCKPIT_OUTBOX_DIR is not set; cannot resolve tool paths.");
  const root = resolve(outboxDir);
  const candidate = resolve(root, requestedPath || "");
  if (candidate !== root && !candidate.startsWith(root + sep)) {
    throw new Error(`Path escapes the job outbox and was rejected: ${requestedPath}`);
  }
  if (mustExist && !existsSync(candidate)) throw new Error(`Path not found inside the job outbox: ${requestedPath}`);
  if (forWrite) {
    const parent = dirname(candidate);
    void mkdir(parent, { recursive: true });
  }
  return candidate;
}

async function toolReadFile(args) {
  const target = resolveToolReadTarget(args.path);
  const content = await readFile(target, "utf8");
  const clipped = content.length > 60000 ? `${content.slice(0, 60000)}\n... (truncated)` : content;
  return clipped;
}

function resolveToolReadTarget(requested) {
  if (typeof requested !== "string" || !requested.trim()) throw new Error("read_file requires a path.");
  if (jobPath && resolve(requested) === resolve(jobPath)) return resolve(jobPath);
  return sandboxPath(requested, { mustExist: true });
}

async function toolListDir(args) {
  const target = sandboxPath(args.path || ".", { mustExist: true });
  const entries = await readdir(target, { withFileTypes: true });
  return entries.map((entry) => `${entry.name}${entry.isDirectory() ? "/" : ""}`).join("\n") || "(empty)";
}

async function toolWriteFile(args) {
  if (typeof args.path !== "string" || typeof args.content !== "string") throw new Error("write_file requires path and content strings.");
  const target = sandboxPath(args.path, { forWrite: true });
  await writeFile(target, args.content, "utf8");
  return `Wrote ${Buffer.byteLength(args.content, "utf8")} bytes to ${args.path}`;
}

async function toolImageInfo(args) {
  const target = sandboxPath(args.path, { mustExist: true });
  const info = await inspectImage(target);
  return JSON.stringify(info);
}

async function inspectImage(path) {
  const handle = await readFile(path);
  const name = basename(path);
  if (handle.length >= 24 && handle[0] === 0x89 && handle[1] === 0x50 && handle[2] === 0x4e && handle[3] === 0x47) {
    const width = handle.readUInt32BE(16);
    const height = handle.readUInt32BE(20);
    const bitDepth = handle[25];
    const colorType = handle[26];
    const hasAlpha = colorType === 4 || colorType === 6;
    return { name, format: "png", width, height, bitDepth, colorType, hasAlpha, bytes: handle.length };
  }
  if (handle.length >= 30 && handle.slice(12, 16).toString("ascii") === "VP8X") {
    const width = 1 + handle.readUIntLE(24, 3);
    const height = 1 + handle.readUIntLE(27, 3);
    return { name, format: "webp", width, height, hasAlpha: null, bytes: handle.length };
  }
  if (handle.length >= 30 && handle.slice(12, 16).toString("ascii") === "VP8 ") {
    // lossy VP8: 3-byte frame tag then sync code 0x9d 0x01 0x2a, then 14 bits w/h
    const w = handle.readUInt16LE(26) & 0x3fff;
    const h = handle.readUInt16LE(28) & 0x3fff;
    return { name, format: "webp", width: w, height: h, hasAlpha: false, bytes: handle.length };
  }
  if (handle.length >= 21 && handle.slice(12, 16).toString("ascii") === "VP8L") {
    const bits = handle.readUInt32LE(21);
    const w = (bits & 0x3fff) + 1;
    const h = ((bits >> 14) & 0x3fff) + 1;
    return { name, format: "webp", width: w, height: h, hasAlpha: true, bytes: handle.length };
  }
  return { name, format: extname(name).replace(".", "") || "unknown", bytes: handle.length, width: null, height: null, hasAlpha: null };
}

async function toolGenerateImage(args) {
  if (typeof args.prompt !== "string" || !args.prompt.trim()) throw new Error("generate_image requires a non-empty prompt.");
  if (typeof args.filename !== "string" || !args.filename.trim()) throw new Error("generate_image requires a filename relative to the outbox.");
  const extension = extname(args.filename).toLowerCase();
  if (![".png", ".webp", ".jpg", ".jpeg"].includes(extension)) {
    throw new Error("generate_image filename must end with .png, .webp, .jpg or .jpeg.");
  }
  const size = normalizeImageSize(args.size);
  const target = sandboxPath(args.filename, { forWrite: true });

  let lastError = null;
  for (let attempt = 1; attempt <= IMAGE_GENERATION_ATTEMPTS; attempt += 1) {
    log(`generate_image attempt ${attempt}/${IMAGE_GENERATION_ATTEMPTS} model=${imageModel} size=${size} -> ${args.filename}`);
    const response = await zaiFetch(
      `${imageBase}/images/generations`,
      {
        model: imageModel,
        prompt: args.prompt,
        size,
        n: 1
      },
      requestTimeoutMs
    );
    if (response.ok) {
      let payload = null;
      try {
        payload = JSON.parse(response.text);
      } catch {}
      const item = payload?.data?.[0];
      const bytes = await decodeImagePayload(item);
      if (bytes) {
        await mkdir(dirname(target), { recursive: true });
        await writeFile(target, bytes);
        const info = await inspectImage(target);
        log(`generate_image saved ${args.filename} (${info.format} ${info.width}x${info.height}, ${bytes.length} bytes).`);
        return JSON.stringify({ savedPath: args.filename, ...info });
      }
      lastError = new Error("Z.ai image response contained no usable image data.");
    } else if (response.status === 429) {
      log("generate_image hit a usage limit (HTTP 429).");
      throw new ZaiApiError("Z.ai usage limit reached during image generation (HTTP 429).", "usage_limit");
    } else {
      let payload = null;
      try {
        payload = JSON.parse(response.text);
      } catch {}
      lastError = new Error(`Z.ai image generation failed (HTTP ${response.status}): ${apiErrorMessage(payload, response.text.slice(0, 300))}`);
      log(lastError.message);
    }
    if (attempt < IMAGE_GENERATION_ATTEMPTS) await delay(1500 * attempt);
  }
  throw lastError || new Error("Z.ai image generation failed.");
}

async function decodeImagePayload(item) {
  if (!item) return null;
  if (typeof item.b64_json === "string" && item.b64_json) return Buffer.from(item.b64_json, "base64");
  if (typeof item.url === "string" && item.url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), requestTimeoutMs);
    try {
      const response = await fetch(item.url, { signal: controller.signal });
      if (!response.ok) {
        log(`Downloading generated image failed (HTTP ${response.status}).`);
        return null;
      }
      return Buffer.from(await response.arrayBuffer());
    } catch (error) {
      log(`Downloading generated image failed: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

function normalizeImageSize(size) {
  if (typeof size !== "string") return "1024x1024";
  const match = size.match(/^(\d{2,5})x(\d{2,5})$/);
  if (!match) return "1024x1024";
  return `${match[1]}x${match[2]}`;
}

async function toolReportBlocker(args) {
  const reasonKind = ["policy_or_safety", "imagegen_unavailable", "no_image_returned", "unknown"].includes(args.reasonKind)
    ? args.reasonKind
    : "unknown";
  const sidecar = {
    status: "blocked",
    reasonKind,
    userMessage: String(args.userMessage || "The image could not be generated.").slice(0, 300),
    suggestion: String(args.suggestion || "Retry the job or adjust the prompt.").slice(0, 300)
  };
  if (!jobId) throw new Error("ZAI_COCKPIT_JOB_ID is not set; cannot write a blocker sidecar.");
  const target = sandboxPath(`${jobId}-blocked.json`, { forWrite: true });
  await writeFile(target, JSON.stringify(sidecar, null, 2), "utf8");
  log(`Blocker sidecar written: ${jobId}-blocked.json (${reasonKind}).`);
  return `Blocker sidecar written with reasonKind=${reasonKind}.`;
}

const runnerTools = [
  {
    type: "function",
    function: {
      name: "read_file",
      description: "Read a UTF-8 text file. Allowed targets: the handoff job JSON file, or any file inside the job outbox tree (paths are relative to the outbox root).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Job file absolute path, or a path relative to the outbox root." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "list_dir",
      description: "List entries of a directory inside the job outbox tree. Use '.' for the outbox root.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Directory path relative to the outbox root." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "write_file",
      description: "Write UTF-8 text content to a path inside the job outbox tree (staging files, manifests, Markdown sidecars).",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Destination path relative to the outbox root." },
          content: { type: "string", description: "Full file content to write." }
        },
        required: ["path", "content"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "generate_image",
      description:
        "Generate a real raster image with the configured Z.ai image model and save it inside the job outbox tree. Returns the saved path plus format, dimensions and alpha information. This is the only way to create images.",
      parameters: {
        type: "object",
        properties: {
          prompt: { type: "string", description: "Full image prompt, including style, composition and layout contract." },
          filename: { type: "string", description: "Destination path relative to the outbox root, ending with .png, .webp, .jpg or .jpeg." },
          size: { type: "string", description: "Canvas size like 1024x1024. Defaults to 1024x1024." }
        },
        required: ["prompt", "filename"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "image_info",
      description: "Inspect an image inside the job outbox tree: format, pixel dimensions, byte size and PNG alpha presence.",
      parameters: {
        type: "object",
        properties: {
          path: { type: "string", description: "Image path relative to the outbox root." }
        },
        required: ["path"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "report_blocker",
      description: "Report that this job cannot produce an image (safety/policy block or image generation unavailable) and write the blocker sidecar. Use instead of faking an image.",
      parameters: {
        type: "object",
        properties: {
          reasonKind: { type: "string", enum: ["policy_or_safety", "imagegen_unavailable", "no_image_returned", "unknown"] },
          userMessage: { type: "string" },
          suggestion: { type: "string" }
        },
        required: ["reasonKind", "userMessage"]
      }
    }
  },
  {
    type: "function",
    function: {
      name: "finish",
      description: "Call exactly once when the job is complete (results published to the outbox root, or a blocker reported). Provide a one-line summary.",
      parameters: {
        type: "object",
        properties: {
          summary: { type: "string", description: "One-line summary of what was produced." }
        },
        required: ["summary"]
      }
    }
  }
];

const toolHandlers = new Map([
  ["read_file", toolReadFile],
  ["list_dir", toolListDir],
  ["write_file", toolWriteFile],
  ["generate_image", toolGenerateImage],
  ["image_info", toolImageInfo],
  ["report_blocker", toolReportBlocker]
]);

// --- Agent loop -------------------------------------------------------------

async function runJob() {
  if (!apiKey) {
    fail("ZAI_API_KEY is not configured. Create a key at https://z.ai/model-api (or from your GLM Coding Plan page) and set ZAI_API_KEY.", 2);
    return;
  }
  if (!jobPath || !outboxDir) {
    fail("Zai agent runner requires ZAI_COCKPIT_JOB_PATH and ZAI_COCKPIT_OUTBOX_DIR in the environment.", 2);
    return;
  }
  if (!existsSync(jobPath)) {
    fail(`Job file not found: ${jobPath}`, 2);
    return;
  }

  const instructions = (await readStdin()).trim();
  log(`Z.ai agent runner started for job ${jobId || "(unknown)"}.`);
  log(`Endpoint mode=${endpointMode} chat=${chatModel} via ${activeChatBase}; images=${imageModel} via ${imageBase}.`);

  const systemPrompt = [
    "You are the Zai Cockpit generation agent. You complete local image-generation handoff jobs using only the provided tools.",
    "Follow the user's job instructions exactly: they encode the delivery contract (filenames, staging layout, direction splits, frame grids, manifests).",
    "Always verify generated images with image_info before publishing them to the outbox root.",
    "Never claim success unless every required artifact exists in the outbox. Never fabricate tool results.",
    "Finish by calling the finish tool with a one-line summary."
  ].join("\n");

  const messages = [
    { role: "system", content: systemPrompt },
    { role: "user", content: instructions || `Read the job file at ${jobPath} and complete it.` }
  ];

  let finished = false;
  try {
    for (let turn = 1; turn <= maxTurns; turn += 1) {
      const message = await chatCompletion(messages, runnerTools);
      const toolCalls = Array.isArray(message.tool_calls) ? message.tool_calls : [];
      if (message.content && String(message.content).trim()) {
        log(`assistant: ${String(message.content).trim().slice(0, 400)}`);
      }

      if (toolCalls.length === 0) {
        if (!message.content || !String(message.content).trim()) {
          messages.push({ role: "assistant", content: "(empty response)" });
          messages.push({ role: "user", content: "Continue the job with the provided tools and call finish when done." });
          continue;
        }
        log("Assistant ended without calling finish; treating the run as complete.");
        finished = true;
        break;
      }

      messages.push({ role: "assistant", content: message.content ?? "", tool_calls: toolCalls });

      for (const toolCall of toolCalls) {
        const name = toolCall.function?.name || "";
        let argumentsText = toolCall.function?.arguments ?? "{}";
        let parsedArgs = {};
        try {
          parsedArgs = JSON.parse(argumentsText || "{}");
        } catch {
          argumentsText = "{}";
        }
        log(`tool call: ${name}(${summarizeArgs(name, parsedArgs)})`);
        let resultText;
        try {
          if (name === "finish") {
            log(`finish: ${String(parsedArgs.summary || "").slice(0, 300)}`);
            resultText = "Job finished.";
            finished = true;
          } else {
            const handler = toolHandlers.get(name);
            if (!handler) {
              resultText = `Unknown tool: ${name}`;
            } else {
              resultText = await handler(parsedArgs);
            }
          }
        } catch (error) {
          const messageText = error instanceof Error ? error.message : String(error);
          log(`tool error (${name}): ${messageText}`);
          resultText = `Error: ${messageText}`;
        }
        messages.push({
          role: "tool",
          tool_call_id: toolCall.id ?? `${name}-${Date.now()}`,
          content: String(resultText).slice(0, 20000)
        });
        if (finished) break;
      }
      if (finished) break;
    }

    if (!finished) {
      fail(`Z.ai agent runner reached the turn limit (${maxTurns}) without finishing.`, 1);
      return;
    }
    log("Z.ai agent runner completed.");
  } catch (error) {
    if (error instanceof ZaiApiError) {
      if (error.kind === "usage_limit") {
        fail(error.message, 3);
        return;
      }
      fail(error.message, error.kind === "auth" ? 2 : 1);
      return;
    }
    fail(`Z.ai agent runner failed: ${error instanceof Error ? error.message : String(error)}`, 1);
    return;
  }
}

function summarizeArgs(name, args) {
  if (name === "write_file") return `path=${args.path}, ${String(args.content ?? "").length} chars`;
  if (name === "generate_image") return `filename=${args.filename}, size=${args.size ?? "default"}`;
  if (name === "read_file" || name === "image_info" || name === "list_dir") return String(args.path ?? "");
  if (name === "report_blocker") return String(args.reasonKind ?? "unknown");
  if (name === "finish") return String(args.summary ?? "").slice(0, 120);
  return "";
}

function delay(ms) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, ms));
}

// Dispatch last: runJob reads module-scope bindings (activeChatBase, runnerTools,
// toolHandlers), and a top-level await above their declarations would leave
// them in the temporal dead zone when the job loop starts.
if (process.argv.includes("--preflight")) {
  runPreflight();
} else {
  await runJob();
}

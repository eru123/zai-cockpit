# Changelog

## 0.1.0 - 2026-10-16

Initial release of Zai Cockpit, a fork of
[image-cockpit-for-codex-workflows](https://github.com/dreiachse-cyber/image-cockpit-for-codex-workflows)
(v0.2.1, MIT) with the Codex CLI provider fully replaced by the Z.ai model
ecosystem.

### Changed

- Generation provider is now the built-in Z.ai agent runner
  (`scripts/zai-agent-runner.mjs`) instead of the `codex` CLI subprocess.
- The runner drives GLM chat models through an OpenAI-compatible tool loop
  with `read_file`, `list_dir`, `write_file`, `generate_image`, `image_info`,
  `report_blocker` and `finish` tools.
- Chat completions use the GLM Coding Plan endpoint
  (`https://api.z.ai/api/coding/paas/v4`) by default so subscription traffic
  is billed to the coding plan; `ZAI_ENDPOINT_MODE=auto` falls back to the
  pay-as-you-go endpoint (`https://api.z.ai/api/paas/v4`) when no coding
  plan is active on the key.
- Image generation uses Z.ai image models (default `glm-image`) through the
  configured base, coding plan first, with automatic fallback to the
  pay-as-you-go endpoint when the coding base cannot serve it.
- All Codex CLI discovery, sandbox/approval flags, and WindowsApps launcher
  workarounds were removed together with the `codex` naming across the API,
  UI, scripts, and environment variables (`ZAI_COCKPIT_*`).
- Historical Codex session QA evidence under `docs/` was pruned; product
  docs and prompt examples were kept and updated.

### Migration notes

- Set `ZAI_API_KEY` in `.env` (required for autorun).
- Optional knobs: `ZAI_ENDPOINT_MODE`, `ZAI_CHAT_MODEL`, `ZAI_IMAGE_MODEL`,
  `ZAI_CODING_BASE_URL`, `ZAI_API_BASE_URL`, `ZAI_IMAGE_API_BASE_URL`.
- Old `IMAGE_COCKPIT_CODEX_*` settings no longer exist; use the
  `ZAI_COCKPIT_RUNNER_*` variables documented in the README.

# AGENTS.md

Zai Cockpit is a local Vite + React + TypeScript app with a Node handoff API server. Generation runs through the built-in Z.ai agent runner (`scripts/zai-agent-runner.mjs`), which drives GLM chat models through an OpenAI-compatible tool loop and a `generate_image` tool backed by Z.ai image models.

Working agreements:

- Chat completions must prefer the GLM Coding Plan endpoint (`https://api.z.ai/api/coding/paas/v4`) over the pay-as-you-go endpoint; keep `ZAI_ENDPOINT_MODE=auto` as the default coding-first strategy.
- Image generation follows the coding-plan base first and auto-falls back to the pay-as-you-go endpoint (`/api/paas/v4/images/generations`); keep `glm-image` as the default model code.
- Never commit API keys, `zai-handoff/` state, or generated outputs.
- Keep `npm run verify` green before handing work back (doctor, typecheck, tests, build, API smoke, release audit).
- Mock runners are for automated smoke tests only and stay gated behind `ZAI_COCKPIT_ALLOW_MOCK_RUNNER=1`.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { extname, join } from "node:path";

const root = process.cwd();
const failures = [];
const privacyTextExtensions = new Set(["", ".css", ".html", ".js", ".json", ".md", ".mjs", ".ts", ".tsx", ".txt", ".yaml", ".yml"]);
const expectedPackageVersion = "0.1.0";

function parsePromptExampleTitle(value) {
  const heading = value.trim();
  const localizedTitle = heading.match(/^(.+?)\s+\/\s+(.+)$/);
  if (!localizedTitle) return { en: heading, ja: heading };
  return { en: localizedTitle[1].trim(), ja: localizedTitle[2].trim() };
}

function slugPromptExampleTitle(value) {
  return parsePromptExampleTitle(value).en.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function promptPreviewFilesFromMarkdown(file, prefix) {
  const text = readText(file)?.replace(/\r\n/g, "\n") ?? "";
  return [...text.matchAll(/###\s+\d+\.\s+([^\n]+)\n\n```text\n[\s\S]*?\n```/g)].map(
    (match) => `public/prompt-examples/${prefix}-${slugPromptExampleTitle(match[1].trim())}.png`
  );
}

const requiredFiles = [
  "README.md",
  "CHANGELOG.md",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md",
  "AGENTS.md",
  ".env.example",
  ".gitignore",
  ".github/workflows/ci.yml",
  "scripts/doctor.mjs",
  "scripts/release-audit.mjs",
  "scripts/zai-agent-runner.mjs",
  "scripts/real-zai-runner-smoke.mjs",
  "scripts/real-imagegen-smoke.mjs",
  "scripts/ui-smoke.mjs",
  "scripts/dev-supervisor.mjs",
  "scripts/capture-readme-screenshots.mjs",
  "public/reset-local-state.html",
  "src/App.test.ts",
  "src/lib/animationPack.ts",
  "src/lib/animationPack.test.ts",
  "src/AnimationReviewCockpit.tsx",
  "src/lib/animationReview.ts",
  "src/lib/animationReview.test.ts",
  "src/VfxCompositeStage.tsx",
  "src/lib/vfxComposite.ts",
  "src/lib/vfxComposite.test.ts",
  "src/lib/effectQuality.ts",
  "src/lib/effectQuality.test.ts",
  "src/lib/motionPilot.ts",
  "src/lib/motionPilot.test.ts"
];

const requiredEnvKeys = [
  "ZAI_COCKPIT_API_PORT",
  "ZAI_COCKPIT_HANDOFF_DIR",
  "ZAI_COCKPIT_RUNNER_AUTORUN",
  "ZAI_COCKPIT_RUNNER_COMMAND",
  "ZAI_COCKPIT_RUNNER_HELP_ARGS_JSON",
  "ZAI_COCKPIT_RUNNER_EXEC_ARGS_JSON",
  "ZAI_API_KEY",
  "ZAI_ENDPOINT_MODE",
  "ZAI_CHAT_MODEL",
  "ZAI_IMAGE_MODEL"
];

const requiredWorkflowIds = ["image-generate", "image-edit", "sprite-generate", "sprite-edit", "effect-animation"];
const requiredGitignorePatterns = [
  "node_modules/",
  "dist/",
  "coverage/",
  ".env",
  ".env.",
  "!.env.example",
  "zai-handoff/",
  "tmp/",
  ".dev-logs/",
  ".agents/",
  "docs/qa/**/*.png",
  "docs/qa/**/*.gif",
  "docs/qa/**/*.webp",
  "docs/qa/**/*.zip"
];
const requiredPackageScripts = [
  "doctor",
  "typecheck",
  "test",
  "build",
  "capture:readme",
  "smoke",
  "ui:smoke",
  "zai:smoke",
  "imagegen:smoke",
  "release:audit",
  "verify",
  "review:local"
];
const requiredVerifyCommands = [
  "npm run doctor",
  "npm run typecheck",
  "npm test",
  "npm run build",
  "npm run smoke",
  "npm run release:audit"
];
const requiredReviewLocalCommands = ["npm run verify", "npm run ui:smoke", "npm run zai:smoke"];
const requiredReadmeLinks = [
  "CHANGELOG.md",
  "docs/prompt-examples/README.md",
  ".github/workflows/ci.yml",
  "LICENSE",
  "CONTRIBUTING.md",
  "SECURITY.md",
  "CODE_OF_CONDUCT.md"
];

checkRequiredFiles();
checkPackageJson();
checkEnvExample();
checkGitignore();
checkTrackedFiles();
checkPublicPrivacy();
checkNoDirectOpenAiIntegration();
checkWorkflowIds();
checkPendingJobCoverage();
checkSimpleLocalInboxAction();
checkCoreLocalization();
checkPromptCatalogExamples();
checkPromptPresetAssetQa();
checkCiWorkflow();

if (failures.length > 0) {
  console.error("Release audit failed:");
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}

console.log("Release audit passed.");

function checkRequiredFiles() {
  requiredFiles.forEach((file) => {
    if (!existsSync(join(root, file))) {
      failures.push(`Missing required file: ${file}`);
    }
  });
}

function isIgnoredQaBinaryEvidence(file) {
  return /^docs\/qa\/.+\.(?:png|gif|webp|zip)$/i.test(file.replace(/\\/g, "/"));
}

function checkPackageJson() {
  const packageJson = readJson("package.json");
  if (!packageJson) return;

  if (packageJson.private !== true) {
    failures.push("package.json must keep npm package publishing disabled unless the owner explicitly approves npm distribution.");
  }

  if (packageJson.license !== "MIT") {
    failures.push("package.json license should be MIT.");
  }

  if (packageJson.version !== expectedPackageVersion) {
    failures.push(`package.json version should be ${expectedPackageVersion} for the current release prep.`);
  }

  const appText = readText("src/App.tsx");
  if (!appText.includes(`<small>v${expectedPackageVersion}</small>`)) {
    failures.push(`App version badge should display v${expectedPackageVersion}.`);
  }
  if (!appText.includes(`<strong>v${expectedPackageVersion}</strong>`)) {
    failures.push(`App settings version should display v${expectedPackageVersion}.`);
  }
  if (!appText.includes(`appVersion: "${expectedPackageVersion}"`)) {
    failures.push(`App environment report should include ${expectedPackageVersion}.`);
  }

  const serverText = readText("server/index.ts");
  if (!serverText.includes(`version: "${expectedPackageVersion}"`)) {
    failures.push(`API health version should report ${expectedPackageVersion}.`);
  }

  const readmeCaptureText = readText("scripts/capture-readme-screenshots.mjs");
  ["VITE_ZAI_COCKPIT_SUPERVISOR_PORT", ".cockpit-health-panel.state-ok"].forEach((marker) => {
    if (!readmeCaptureText.includes(marker)) {
      failures.push(`README screenshot capture should include the stable health marker: ${marker}`);
    }
  });

  const packageLock = readJson("package-lock.json");
  if (packageLock) {
    if (packageLock.version !== expectedPackageVersion) {
      failures.push(`package-lock.json version should be ${expectedPackageVersion} for the current release prep.`);
    }
    if (packageLock.packages?.[""]?.version !== expectedPackageVersion) {
      failures.push(`package-lock root package version should be ${expectedPackageVersion} for the current release prep.`);
    }
  }

  requiredPackageScripts.forEach((scriptName) => {
    if (!packageJson.scripts?.[scriptName]) {
      failures.push(`Missing package script: ${scriptName}`);
    }
  });

  const verifyScript = packageJson.scripts?.verify ?? "";
  requiredVerifyCommands.forEach((command) => {
    if (!verifyScript.includes(command)) {
      failures.push(`verify script should include: ${command}`);
    }
  });

  const reviewLocalScript = packageJson.scripts?.["review:local"] ?? "";
  requiredReviewLocalCommands.forEach((command) => {
    if (!reviewLocalScript.includes(command)) {
      failures.push(`review:local script should include: ${command}`);
    }
  });

  const dependencies = {
    ...(packageJson.dependencies ?? {}),
    ...(packageJson.devDependencies ?? {})
  };
  Object.keys(dependencies).forEach((dependency) => {
    if (dependency === "openai" || dependency.startsWith("@openai/")) {
      failures.push(`Direct OpenAI package dependency is not allowed in the app: ${dependency}`);
    }
  });
}

function checkEnvExample() {
  const text = readText(".env.example");
  if (!text) return;

  requiredEnvKeys.forEach((key) => {
    if (!new RegExp(`^${escapeRegExp(key)}=`, "m").test(text)) {
      failures.push(`.env.example is missing ${key}`);
    }
  });

  if (/OPENAI_API_KEY|sk-[A-Za-z0-9_-]{20,}/.test(text)) {
    failures.push(".env.example must not contain API key placeholders that look like secrets.");
  }
}

function checkGitignore() {
  const text = readText(".gitignore");
  if (!text) return;

  requiredGitignorePatterns.forEach((pattern) => {
    if (!text.includes(pattern)) {
      failures.push(`.gitignore should include ${pattern}`);
    }
  });
}

function checkTrackedFiles() {
  const tracked = git(["ls-files"]);
  if (tracked === null) return;

  tracked
    .split(/\r?\n/)
    .filter(Boolean)
    .forEach((file) => {
      const normalized = file.replace(/\\/g, "/");
      if (normalized === ".env.example") return;
      if (normalized === ".gitignore") return;
      if (normalized === ".env" || normalized.startsWith(".env.")) {
        failures.push(`Secret-bearing env file is tracked: ${file}`);
      }
      if (
        normalized.startsWith("zai-handoff/") ||
        normalized.startsWith("node_modules/") ||
        normalized.startsWith("dist/") ||
        normalized.startsWith("coverage/")
      ) {
        failures.push(`Generated or local-only path is tracked: ${file}`);
      }
    });
}

function checkPublicPrivacy() {
  const tracked = git(["ls-files"]);
  if (tracked === null) return;

  const windowsUserPathPattern = new RegExp(["C:", "\\\\", "Users", "\\\\"].join(""), "i");
  const workspaceDrivePathPattern = new RegExp(["D:", "\\\\", "zai", "\\\\"].join(""), "i");
  const blockedLiterals = [
    { label: "personal Windows user name", value: ["na", "kaya"].join("") },
    { label: "observed local Zai runtime id", value: ["38dff", "8711e296435"].join("") }
  ];

  tracked
    .split(/\r?\n/)
    .filter(Boolean)
    .filter((file) => file !== "scripts/release-audit.mjs")
    .filter((file) => isPrivacyAuditedTextFile(file))
    .forEach((file) => {
      const text = readText(file);
      if (!text) return;

      if (windowsUserPathPattern.test(text)) {
        failures.push(`Public privacy guard found a Windows user profile path in ${file}`);
      }
      if (workspaceDrivePathPattern.test(text)) {
        failures.push(`Public privacy guard found a local workspace drive path in ${file}`);
      }

      blockedLiterals.forEach(({ label, value }) => {
        if (text.includes(value)) {
          failures.push(`Public privacy guard found ${label} in ${file}`);
        }
      });
    });
}

function checkNoDirectOpenAiIntegration() {
  const tracked = git(["ls-files", "src", "server", "scripts", "package.json", ".env.example"]);
  if (tracked === null) return;

  tracked
    .split(/\r?\n/)
    .filter((file) => file !== "scripts/release-audit.mjs")
    .filter((file) => file && isAuditedTextFile(file))
    .forEach((file) => {
      const text = readText(file);
      if (!text) return;
      if (/from\s+["']openai["']|require\(["']openai["']\)|api\.openai\.com|OPENAI_API_KEY/.test(text)) {
        failures.push(`Direct OpenAI API integration marker found in ${file}`);
      }
    });
}

function checkWorkflowIds() {
  const appText = readText("src/App.tsx");
  const stylesText = readText("src/styles.css");
  const smokeText = readText("scripts/smoke.mjs");
  const uiSmokeText = readText("scripts/ui-smoke.mjs");
  const exportersText = readText("src/lib/exporters.ts");
  const animationPackText = readText("src/lib/animationPack.ts");
  const motionRecipesText = readText("src/lib/motionRecipes.ts");
  const appTestText = readText("src/App.test.ts");
  const extendedFrameQaText = readOptionalText("docs/qa/experimental-16-20-frame-animation.md");
  const selectableSingleDirectionQaText = readOptionalText("docs/qa/selectable-single-animation-direction.md");
  const animationTournamentText = readText("src/lib/animationTournament.ts");
  const animationReviewText = readText("src/lib/animationReview.ts");
  const animationReviewUiText = readText("src/AnimationReviewCockpit.tsx");
  const serverText = readText("server/index.ts");
  const animationReviewQaText = readOptionalText("docs/qa/animation-review-cockpit-uiux.md");
  const vfxCompositeText = readText("src/lib/vfxComposite.ts");
  const vfxCompositeUiText = readText("src/VfxCompositeStage.tsx");
  const effectQualityText = readText("src/lib/effectQuality.ts");
  const vfxCompositeQaText = readOptionalText("docs/qa/vfx-composite-stage.md");
  const motionPilotText = readText("src/lib/motionPilot.ts");
  const finalBenchmarkText = readOptionalText("docs/qa/animation-uplift-final-benchmark.md");
  const finalReviewIndexText = readOptionalText("docs/qa/animation-uplift-review-index.md");
  const realZaiSmokeText = readText("scripts/real-zai-runner-smoke.mjs");
  const imageEditFullBodyQaText = readOptionalText("docs/qa/image-edit-full-body-fit.md");
  if (!appText || !stylesText || !smokeText || !uiSmokeText || !realZaiSmokeText || !animationTournamentText || !animationReviewText || !animationReviewUiText || !serverText || !vfxCompositeText || !vfxCompositeUiText || !effectQualityText || !motionPilotText || !motionRecipesText || !appTestText) return;

  requiredWorkflowIds.forEach((workflowId) => {
    if (!appText.includes(workflowId)) {
      failures.push(`App is missing workflow id: ${workflowId}`);
    }
  });

  requiredWorkflowIds.forEach((workflowId) => {
    if (!smokeText.includes(workflowId)) {
      failures.push(`Smoke test should cover Zai handoff workflow: ${workflowId}`);
    }
  });

  [
    "Pixel Art Generation",
    "Image Editing",
    "Animation Generation",
    "Effect Animation",
    "Initial screen should open the Pixel Art Generation workspace",
    "Initial screen should not show legacy Guided Start options",
    "selectWorkflowTab",
    "Route: Zai Handoff",
    "chroma-key direction frames",
    "Generate Pixel Art",
    "Generate Animation",
    "Generate Effect",
    "Animation generated",
    "Prompt Examples",
    "prompt-example-trigger",
    "Prompt Examples modal",
    "directly below the prompt field",
    "Start with a short prompt",
    "Simple Prompt layer should show exactly",
    "Simple Prompt should not overwrite the user's Negative Prompt",
    "Simple Prompt should not overwrite the user's Generation Notes",
    "Detailed Prompt Examples should show exactly",
    "Detailed Prompt Examples should hide raw prompt text",
    "prompt-card-preview",
    "prompt-category-tabs",
    "quick-prompt-card",
    "View concrete examples",
    "View all concrete examples",
    "Copy Prompt",
    "Use Prompt",
    "Clockwork Mushroom Courier",
    "Basic Character",
    "Profession Character",
    "Animals",
    "Chibi Boys",
    "Chibi Girls",
    "Beastfolk",
    "Monster",
    "basicCharacterPromptExampleChecks",
    "expandedPromptExampleChecks",
    "expectedSimplePromptPresetCount",
    "expectedDetailedPromptExampleCount",
    "simplePromptPresetChecks",
    "should show exact English title",
    "should show exact Japanese title",
    "should show exactly ${check.relatedCount} related examples",
    "related layer should not expose the full-catalog category tabs",
    "Boy Adventurer",
    "Girl Adventurer",
    "Young Male Hero",
    "Young Female Hero",
    "Middle-Aged Male Mercenary",
    "Middle-Aged Female Ranger",
    "Elder Male Sage",
    "Elder Female Herbalist",
    "Androgynous Traveler",
    "Small Village Child",
    "Large Veteran Warrior",
    "Hooded Mysterious Figure",
    "Two-Head Chibi Knight",
    "Two-Head Chibi Mage",
    "Two-Head Chibi Archer",
    "Two-Head Chibi Healer",
    "Two-Head Chibi Ninja",
    "Two-Head Chibi Alchemist",
    "Two-Head Chibi Pirate",
    "Two-Head Chibi Robot",
    "Two-Head Chibi Dragon Tamer",
    "Boy Warrior Apprentice",
    "Middle-Aged Female Captain",
    "Classic Green Slime",
    "Earth Spirit",
    "Loyal Dog",
    "Copper-Haired Scout",
    "Auburn-Pigtail Farmer",
    "Wolf Beastfolk",
    "const expectedSimplePromptPresetCount = 9",
    "const expectedDetailedPromptExampleCount = 137",
    "exactly ${expectedDetailedPromptExampleCount} image previews",
    "generated from prompt example",
    "Prompt example loaded into Pixel Art Generation",
    "Generation can take a few minutes.",
    "assertZaiQueue",
    "Zai Jobs",
    "Active 1/3",
    "Active 2/3",
    "Active 3/3",
    "Queue Zai Job",
    "Queued",
    "Waiting for an open slot",
    "Zai job queued",
    "zaiJobRows",
    "zaiJobShelfInHistory",
    "zaiJobShelfInSource",
    "zaiJobShelfBeforeHistoryList",
    "Zai job shelf should appear above the Results cards in the right column",
    "Zai queue drains after results return",
    "assertImageEditing",
    "assertImageEditingFullBodyFitWithLogs",
    "mock-full-body-source.png",
    "imageRectNormalized",
    "imageRectPixels",
    "workspace should not overlap the Zai log panel",
    "assertAnimationResultNotEditable",
    "Edit Image",
    "Upload Image",
    "Numbered edit regions",
    "Edited from",
    "source-status-button",
    "source chip selects the source preview",
    "downloadModalButtons",
    "resultDownloadActionButtons",
    "resultDownloadGridButtonsInWorkspace",
    "Image Editing PNG download should preserve transparent alpha",
    "expectedZaiLogHistoryLimit = 3",
    "Zai log panel retains the latest 3 completed log cards",
    "Compact Zai log panel should show at most",
    "Compact Zai log should auto-scroll to the latest line",
    "Fullscreen Zai log should open at the latest line",
    "Mobile fullscreen Zai log should stay on the latest line",
    "mock runner tail marker",
    "dragCanvasRegion",
    "annotation-region-row",
    "annotation-comment-field",
    "image-edit-source-status",
    "Image Editing edit source preview",
    "Image Editing should not render the old Before / After compare card",
    "result-download-panel",
    "Image Editing should place the result download card under the preview workspace",
    "Initial workspace should place the result download card under the preview workspace",
    "resultDownloadPanelComplete",
    "Image Editing should hide animated GIF download for non-animation results",
    "Image Editing should hide animated WebP download for non-animation results",
    "PNG",
    "policy_or_safety",
    "Generation failed",
    "生成できませんでした",
    "zai-failure-card",
    "Zai failure should not create a fake history image",
    "Zai failure should release the active job slot",
    "assertHistoryIncrementalRendering",
    "Results list renders the first 100 history items",
    "Results list loads 20 more cards on scroll",
    "historyVisibleCount",
    "Animation output",
    "Animation outputs are final artifacts",
    "Animation results should not expose the rectangle selection toolbar",
    "finalEditNoticeVisible",
    "disabledButtons",
    "Image Editing should hide the old annotation PNG button",
    "hiddenButtons",
    "hiddenText",
    "Sprite Actions",
    "Export Sprite",
    "spriteBenchVisible",
    "should keep the Sprite Actions panel hidden for now",
    "workflowTabsInsidePanel",
    "workflowTabsInTopbar",
    "1. Upload Pixel Art",
    "Animation Library should stay hidden until the feature is ready",
    "Generation Method",
    "5-Direction Sheet",
    "hatch-pet",
    "5-Direction hatch-pet",
    "2. Choose Motion",
    "Animation Library",
    "Official Animations",
    "User Animations",
    "Import Animation",
    "Export Animation Pack",
    "zai-cockpit.animation.v1",
    "mock-run-cycle.zai-cockpit-animation.zip",
    "Animation pack imported",
    "Animation loaded from library",
    "workspaceExportAnimationPackButtons",
    "Idle Breathing",
    "idle-breathing-sheet.png",
    "sample-idle-sheet",
    "Walk Cycle",
    "walk-cycle-sheet.png",
    "sample-walk-sheet",
    "Run Cycle",
    "run-cycle-sheet.png",
    "sample-run-sheet",
    "Basic Attack",
    "basic-attack-sheet.png",
    "sample-attack-sheet",
    "Hurt Reaction",
    "hurt-reaction-sheet.png",
    "sample-hurt-sheet",
    "Death / Downed",
    "death-downed-sheet.png",
    "sample-death-sheet",
    "Spell Cast",
    "spell-cast-sheet.png",
    "sample-cast-sheet",
    "Jump / Hop",
    "jump-hop-sheet.png",
    "sample-jump-sheet",
    "Guard / Block",
    "guard-block-sheet.png",
    "sample-guard-sheet",
    "Victory Cheer",
    "victory-cheer-sheet.png",
    "sample-cheer-sheet",
    "Interact / Pickup",
    "interact-pickup-sheet.png",
    "sample-interact-sheet",
    "Ranged Attack",
    "ranged-attack-sheet.png",
    "sample-ranged-sheet",
    "Skill Release",
    "skill-release-sheet.png",
    "sample-skill-sheet",
    "Knockback",
    "knockback-sheet.png",
    "sample-knockback-sheet",
    "Item Use",
    "item-use-sheet.png",
    "sample-item-sheet",
    "Talk / NPC Reaction",
    "talk-sheet.png",
    "sample-talk-sheet",
    "Hop Bounce",
    "Choose Animation",
    "Selected animation",
    "selected-animation-card",
    "Animation card should not show unselected animation options",
    "Directions",
    "5 directions",
    "3 directions",
    "Fixed cells: 256 x 256 px",
    "Notify when done",
    "Animation Generation should not expose free-form motion prompt textareas",
    "Choose Animation modal",
    "Choose Animation trigger should sit directly below the selected animation card",
    "Pick an animated sample",
    "Select Animation",
    "animation-preset-example-trigger",
    "animation-preset-modal",
    "animation-sample-sprite",
    "Choose Animation should show 16 verified and 6 experimental animated samples",
    "Choose Animation should expose 6 experimental Recipes",
    "Choose Animation should include the Idle Breathing animation card",
    "Choose Animation should include the Walk Cycle animation card",
    "Choose Animation should include the Run Cycle animation card",
    "Choose Animation should include the Basic Attack animation card",
    "Choose Animation should include the Hurt Reaction animation card",
    "Choose Animation should include the Death / Downed animation card",
    "Choose Animation should include the Spell Cast animation card",
    "Choose Animation should include the Jump / Hop animation card",
    "Choose Animation should include the Guard / Block animation card",
    "Choose Animation should include the Victory Cheer animation card",
    "Choose Animation should include the Interact / Pickup animation card",
    "Choose Animation should include the Ranged Attack animation card",
    "Choose Animation should include the Skill Release animation card",
    "Choose Animation should include the Knockback animation card",
    "Choose Animation should include the Item Use animation card",
    "Choose Animation should include the Talk / NPC Reaction animation card",
    "card should use the generated",
    "expectedNormalizedAnimationFrames",
    "assertNormalizedAnimationFrames",
    "should normalize animation frame cutouts around center and footline",
    "Animation selected",
    "preExerciseButtonChecks",
    "3. Generate",
    "4. Download",
    "resultDownloadPanelInWorkspace",
    "resultDownloadPanelInSource",
    "should not show stale animation preview images before a selected animation result exists",
    "Animated GIF",
    "Animated WebP",
    "Sprite Sheet",
    "Directional Previews",
    "GIF Preview",
    "Sprite Sheet Preview",
    "expectedPreviewImages: 6",
    "expectedAnimationPreviewImagesAfterExercise",
    "animation preview image(s)",
    "expectSourceRoundTrip",
    "Source selected for animation generation",
    "animationPreviewImages",
    "canvasPanelVisible",
    "expectedCanvasPreviewModeAfterExercise",
    "canvasPreviewMode",
    "annotationToolbarVisible",
    "Preview toolbar visibility should be",
    "shows the selected result in the main preview",
    "resultPreviewImages",
    "resultPreviewLoaded",
    "resultPreviewFrameHeight",
    "Animation frames ready",
    "Generated from",
    "Slash Arc",
    "Hit Spark",
    "Magic Cast",
    "Projectile",
    "Impact",
    "Effect imported",
    "Sheet preview",
    "Frame timeline",
    "Effect GIF",
    "Sheet PNG",
    "Frames ZIP",
    "Metadata JSON",
    "Effect Pack ZIP",
    "animationSourceStatus",
    "Zai log fullscreen button",
    "Fullscreen Zai log text area should be taller than normal",
    "Mobile fullscreen Zai log panel should fit within the viewport",
    "persisted generated-from source after reload",
    "regenerated animation previews after reload",
    "spriteSheetGridOverlays",
    "256 x 256 px",
    "persisted animation frames after reload",
    "persisted 256 x 256 px frame size after reload"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover workspace workflow review: ${marker}`);
    }
  });

  [
    'useState<AnimationGenerationProfile>("best")',
    'initialCandidates: 3',
    'maximumCandidates: 3',
    'shouldStartBalancedAdditionalCandidate',
    'batchMatrixRunId',
    'batchMatrixCellKey',
    'const ANIMATION_DIRECTION_PRESET_IDS: AnimationDirectionPresetId[] = ["five", "three", "one"];'
  ].forEach((marker) => {
    if (!`${appText}\n${animationTournamentText}`.includes(marker)) {
      failures.push(`App should keep Best on the 3-candidate fallback, support adaptive Balanced, and keep 1/3/5 direction presets: ${marker}`);
    }
  });

  [
    [animationTournamentText, "planAnimationInitialCandidateAdmission"],
    [appText, "animationInitialAdmissionMessage"],
    [appText, "startPersistedTournamentInitialCandidatesFromUi"],
    [appText, "serverActiveZaiRunnerCount"],
    [stylesText, "animation-runner-admission-status"],
    [serverText, "startInitialCandidates"],
    [serverText, "withZaiRunnerAdmissionLock"],
    [serverText, "/api/zai/capacity"],
    [serverText, "tournament_job_endpoint_required"],
    [serverText, "animation_tournament_endpoint_required"],
    [serverText, "adaptive_candidate_initial_wave_required"],
    [serverText, "animation_profile_candidate_count_mismatch"],
    [serverText, "registerAnimationTournamentUnlocked"],
    [serverText, "insufficient_runner_slots"],
    [serverText, "initial_batch_admission_required"],
    [animationTournamentText, "evaluateBestFirstQualifiedCandidate"],
    [animationTournamentText, "BEST_FIRST_QUALIFIED_MIN_IDENTITY_SCORE"],
    [serverText, '"first-qualified"'],
    [smokeText, "First Qualified acceptance should cancel both remaining candidates"],
    [smokeText, "rejected Best admission should not leave a tournament manifest"],
    [smokeText, "all three admitted Best candidates should be running in one response"],
    [smokeText, "concurrent generic and animation admission should have exactly one winner"],
    [smokeText, "standard animation jobs should reject the generic job endpoint"],
    [smokeText, "variant casing should not bypass the standard animation endpoint guard"],
    [smokeText, "queued Balanced candidate C should not start before its initial wave"],
    [smokeText, "Best registration should reject a two-candidate initial wave"],
    [smokeText, "profile validation should allow persisted Direction Repair candidates beyond the fixed initial plan"],
    [smokeText, "capacity-blocked Direction Repair should not consume a retry"],
    [uiSmokeText, "Animation Generation should be disabled while one Zai job is running"],
    [uiSmokeText, "Disabled animation action must not register a tournament or job"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) failures.push(`Animation runner admission contract is missing: ${marker}`);
  });

  [
    "animationReviewDimensionScores",
    "animationReviewQcMatrix",
    "normalizeAnimationHumanReview",
    "buildAnimationCalibrationExport",
    "zai-cockpit.animation-review-calibration.v1"
  ].forEach((marker) => {
    if (!animationReviewText.includes(marker)) failures.push(`Animation Review model is missing: ${marker}`);
  });

  [
    "Candidate A/B/C · Sync Compare",
    "Candidate A/B/C/D · Sync Compare",
    "Direction × Frame QC Matrix",
    "Preview Studio",
    "Adjacent diff",
    "Frame-range Repair",
    "prefers-reduced-motion: reduce"
  ].forEach((marker) => {
    if (!`${animationReviewUiText}\n${stylesText}`.includes(marker)) failures.push(`Animation Review UI is missing: ${marker}`);
  });

  [
    "Review A/B/C",
    "collapsible-animation-step",
    "animation-source-mismatch",
    "/review",
    "Category",
    "Status"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Animation Review integration is missing: ${marker}`);
  });

  [
    "recordAnimationHumanReview",
    "normalizeAnimationHumanReviewForManifest",
    "/review"
  ].forEach((marker) => {
    if (!serverText.includes(marker)) failures.push(`Animation Review persistence is missing: ${marker}`);
  });

  [
    "assertAnimationReviewCockpit",
    "Mobile Animation Review should fit",
    "Human review persistence",
    "Motion Browser samples should pause"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover Animation Review: ${marker}`);
  });

  [
    "Animation Review Cockpit UI/UX QA",
    "171 tests pass",
    "390×844"
  ].forEach((marker) => {
    if (animationReviewQaText && !animationReviewQaText.includes(marker)) failures.push(`Animation Review QA evidence is missing: ${marker}`);
  });

  [
    "zai-cockpit.vfx-composite.v1",
    "VFX_COMPOSITE_SOCKETS",
    "resolveVfxAttachmentPoint",
    "retimeVfxToEvent",
    "createVfxCompositeArtifacts",
    "importVfxCompositePack",
    "buildVfxCompositeEngineExports"
  ].forEach((marker) => {
    if (!vfxCompositeText.includes(marker)) failures.push(`VFX Composite model/export is missing: ${marker}`);
  });

  [
    "VFX Composite Stage",
    "Socket / Event",
    "Basic offset",
    "Advanced adjustments",
    "Combined GIF",
    "Combined APNG",
    "Composite Pack ZIP",
    "Reimport Pack"
  ].forEach((marker) => {
    if (!vfxCompositeUiText.includes(marker)) failures.push(`VFX Composite UI is missing: ${marker}`);
  });

  [
    "zai-cockpit.effect-quality.v2",
    "loop seam energy changes abruptly",
    "energy centroid jumps between frames",
    "peak frame is offset from the requested event"
  ].forEach((marker) => {
    if (!effectQualityText.includes(marker)) failures.push(`VFX Quality v2 shadow metrics are missing: ${marker}`);
  });

  [
    "telegraph-aoe",
    "aura-status",
    "heal-buff",
    "barrier-shield",
    "spawn-portal",
    "movement-trail",
    "buildEffectQualityReportV2",
    "Open Composite Stage"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Effect Animation Phase 2 integration is missing: ${marker}`);
  });

  [
    "assertVfxCompositeStage",
    "VFX Composite Pack reimport",
    "six sockets",
    "five overlay controls"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover VFX Composite Stage: ${marker}`);
  });

  [
    "VFX Composite Stage QA",
    "melee attack × slash / impact",
    "cast × magic / aura / heal",
    "projectile attack × projectile / impact",
    "separate-layer export"
  ].forEach((marker) => {
    if (vfxCompositeQaText && !vfxCompositeQaText.includes(marker)) failures.push(`VFX Composite QA evidence is missing: ${marker}`);
  });

  [
    "theoreticalMotionPilotDirectionOutputs",
    "decideMotionPilotReview",
    "summarizeAnimationBenchmark",
    "motionPilotMeetsAdoptionGate"
  ].forEach((marker) => {
    if (!motionPilotText.includes(marker)) failures.push(`Motion Pilot benchmark model is missing: ${marker}`);
  });

  [
    "Motion Pilot Tournament",
    "Experimental · Best only · default OFF",
    "pilot/expand",
    "Fallback to Balanced",
    "Accept Pilot Expansion",
    "Revalidate Pilot Final",
    "adoptDisabledReason",
    "Pilot expansion will remain in review until a slot is free",
    "artifactDirections"
  ].forEach((marker) => {
    if (!appText.includes(marker)) failures.push(`Motion Pilot UI/client flow is missing: ${marker}`);
  });

  [
    "startMotionPilotExpansion",
    "fallbackMotionPilotTournament",
    "pilotCandidateIds",
    "directionOutputCount",
    "totalCandidateJobs",
    "assertZaiRunnerSlotAvailable"
  ].forEach((marker) => {
    if (!serverText.includes(marker)) failures.push(`Motion Pilot server manifest flow is missing: ${marker}`);
  });

  [
    "Motion Pilot Tournament must remain experimental and default OFF",
    "Best only",
    "Human review gate",
    "remaining 4 directions"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) failures.push(`UI smoke should cover Motion Pilot gating: ${marker}`);
  });

  [
    "Animation Uplift Final Benchmark",
    "standard real browser trials",
    "Motion Pilot A/B",
    "false success 0",
    "stuck 0"
  ].forEach((marker) => {
    if (finalBenchmarkText && !finalBenchmarkText.includes(marker)) failures.push(`Final benchmark evidence is missing: ${marker}`);
  });

  [
    "Phase 1",
    "Phase 2",
    "Phase 3",
    "Phase 4",
    "Phase 5",
    "Phase 6",
    "Phase 7",
    "Phase 8",
    "rollback checkpoint"
  ].forEach((marker) => {
    if (finalReviewIndexText && !finalReviewIndexText.includes(marker)) failures.push(`Animation Uplift review index is missing: ${marker}`);
  });

  const directionPresetLayoutPattern = /\.direction-preset-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*\}/s;
  if (!directionPresetLayoutPattern.test(stylesText)) {
    failures.push("Direction preset control should render as a balanced 3-option segmented control.");
  }

  const singleDirectionLayoutPattern = /\.single-direction-buttons\s*\{[^}]*grid-template-columns:\s*repeat\(3,\s*minmax\(0,\s*1fr\)\);[^}]*\}/s;
  const singleDirectionTargetPattern = /\.segmented-control\.single-direction-buttons button\s*\{[^}]*min-height:\s*48px;[^}]*\}/s;
  if (!singleDirectionLayoutPattern.test(stylesText) || !singleDirectionTargetPattern.test(stylesText)) {
    failures.push("Selectable single-direction control should use a responsive three-column layout with 48px targets.");
  }

  [
    [appText, 'const DEFAULT_SINGLE_ANIMATION_DIRECTION: AnimationDirectionId = "side"'],
    [appText, 'animationDirectionOne: "1 direction"'],
    [appText, 'animationDirectionOne: "1方向"'],
    [appText, "animationDirectionsForPreset"],
    [appText, "animationDirectionSelectionForDirections"],
    [appText, "single-direction-buttons"],
    [appText, "data-animation-direction"],
    [appText, "animationSingleDirectionHint"],
    [appText, "canUseMotionPilot"],
    [appText, "motionPilotAvailabilityText"],
    [appText, "select Best to enable"],
    [appText, "setGrid(animationSheetGridForDirections(nextDirections, animationFrameCount))"],
    [appText, "unavailable for single-direction generation"],
    [appTestText, 'canonicalDirections = ["front", "front three-quarter", "side", "back three-quarter", "back"]'],
    [appTestText, 'animationDirectionsForPreset("one", direction)'],
    [appTestText, 'animationDirectionSelectionForDirections(["back-three-quarter"])'],
    [serverText, "![1, 3, 5].includes(requestedDirections.length)"],
    [serverText, "Motion Pilot requires more than one requested direction."],
    [serverText, "complete requested direction set"],
    [smokeText, 'const canonicalSingleDirections = ["front", "front three-quarter", "side", "back three-quarter", "back"]'],
    [smokeText, "smoke-single-back-three-quarter-tournament"],
    [smokeText, "single-direction registration should accept the canonical ${direction} choice"],
    [smokeText, "server should reject Motion Pilot for any single-direction tournament"],
    [smokeText, "server should reject single-direction values outside the five canonical choices"],
    [uiSmokeText, '"1 direction"'],
    [uiSmokeText, ".single-direction-buttons"],
    [uiSmokeText, "back-three-quarter"],
    [uiSmokeText, "single-direction history restores exact direction and frame grid"],
    [uiSmokeText, "ZAI_COCKPIT_UI_SMOKE_ONLY_SINGLE_DIRECTION"],
    [selectableSingleDirectionQaText, "Side remains the initial single-direction choice"],
    [selectableSingleDirectionQaText, "front three-quarter"],
    [selectableSingleDirectionQaText, "back three-quarter"],
    [selectableSingleDirectionQaText, "4096 x 256 px"],
    [selectableSingleDirectionQaText, "5120 x 256 px"]
  ].forEach(([text, marker]) => {
    if (text && !text.includes(marker)) {
      failures.push("Animation Generation should keep the selectable 1-direction contract: " + marker);
    }
  });
  [
    [appText, "unavailable for side-only generation"],
    [serverText, "Single-direction animation tournaments require the side direction."]
  ].forEach(([text, retiredMarker]) => {
    if (text.includes(retiredMarker)) {
      failures.push("Animation Generation should not retain the retired side-only restriction: " + retiredMarker);
    }
  });
  [
    [motionRecipesText, "export type MotionFrameCount = 4 | 6 | 8 | 12 | 16 | 20"],
    [motionRecipesText, "MOTION_FRAME_COUNTS: readonly MotionFrameCount[] = [4, 6, 8, 12, 16, 20]"],
    [motionRecipesText, "EXPERIMENTAL_MOTION_FRAME_COUNTS = [16, 20]"],
    [motionRecipesText, 'MOTION_RECIPE_COMPILER_VERSION = "1.2.0"'],
    [appText, "data-frame-count={frameCount}"],
    [appText, "16f / 20f are experimental"],
    [appText, "motion-frame-experimental-note"],
    [stylesText, ".app-shell .motion-frame-buttons { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); }"],
    [serverText, "16 frames use 4x4, and 20 frames use 4x5"],
    [animationPackText, "4, 6, 8, 12, 16, or 20"],
    [animationPackText, "animationLibraryHistoryMetadata"],
    [appText, "historyAnimationFrameCount(selected)"],
    [smokeText, "single-direction candidate should keep a 20x1 / 20-frame final sheet contract"],
    [uiSmokeText, "Single-direction 20f final sheet should be 5120x256"],
    [uiSmokeText, "Five-direction 20f final sheet should be 5120x1280"],
    [uiSmokeText, "Japanese frame buttons should keep localized accessible names"],
    [uiSmokeText, "single-direction 20f Animation Pack download"],
    [uiSmokeText, "five-direction 20f Animation Pack download"],
    [uiSmokeText, "Every single-direction browser manifest should preserve a 4x5 raw direction grid"],
    [appTestText, "[20, { columns: 4, rows: 5, gutter: 0 }]"],
    [extendedFrameQaText, "20f side-only"],
    [extendedFrameQaText, "5120x256"],
    [extendedFrameQaText, "5120x1280"]
  ].forEach(([text, marker]) => {
    if (text && !text.includes(marker)) failures.push(`Animation Generation should preserve Experimental 16f/20f coverage: ${marker}`);
  });
  [
    "AnimationUtilityModal",
    "animation-advanced-settings-trigger",
    "animation-activity-trigger",
    "Generation status & history",
    "openDialogs[openDialogs.length - 1] !== modalRef.current"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Animation Generation should keep optional controls in utility modals: ${marker}`);
    }
  });

  [
    "effect-steps-simplified",
    "effect-picker-trigger",
    "effect-advanced-settings-trigger",
    "effect-picker-modal-body",
    "effect-optional-tools",
    "Selected effect",
    "Use This Effect"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Effect Animation should keep optional controls in utility modals: ${marker}`);
    }
  });

  [
    "--ui-readable-font-floor: 16px",
    ".source-panel > .workflow-tabs button.active",
    "grid-auto-rows: minmax(54px, auto)",
    "flex: 0 0 auto",
    ".cockpit.without-sprite-actions .history-panel"
  ].forEach((marker) => {
    if (!stylesText.includes(marker)) {
      failures.push(`Readable workflow navigation treatment is missing: ${marker}`);
    }
  });
  if (!/\.source-panel > \.workflow-tabs\s*\{[^}]*order:\s*0;/s.test(stylesText)) {
    failures.push("Primary workflow navigation should keep source-panel order zero at responsive widths");
  }
  if (!/\.app-shell \.history-item\s*\{[^}]*min-height:\s*100px;[^}]*overflow:\s*hidden;/s.test(stylesText)) {
    failures.push("Readable result cards should contain the 16px text within a 100px card");
  }
  if (!/\.app-shell \.history-item\.effect-result\s*\{[^}]*min-height:\s*66px;/s.test(stylesText)) {
    failures.push("Effect result cards should keep their compact two-line readable height");
  }
  if (!/\.app-shell \.history-item small\s*\{[^}]*text-overflow:\s*ellipsis;[^}]*white-space:\s*nowrap;/s.test(stylesText)) {
    failures.push("Result metadata should stay on stable single lines with ellipsis");
  }
  if (!appText.includes("title={item.name}")) {
    failures.push("Truncated result titles should retain the full filename in a native tooltip");
  }

  const sourcePanelStart = appText.indexOf('<aside className="panel source-panel">');
  const sourcePanelEnd = appText.indexOf("{isAnimationWorkflow ? (", sourcePanelStart);
  const sourcePanelShell = sourcePanelStart >= 0 && sourcePanelEnd > sourcePanelStart
    ? appText.slice(sourcePanelStart, sourcePanelEnd)
    : "";
  const workflowTabsIndex = sourcePanelShell.indexOf("<WorkflowTabs");
  const workflowSummaryIndex = sourcePanelShell.indexOf('className="workflow-summary"');
  const cockpitHealthIndex = sourcePanelShell.indexOf("<CockpitHealthPanel");
  if (!(workflowTabsIndex >= 0 && workflowTabsIndex < workflowSummaryIndex && workflowSummaryIndex < cockpitHealthIndex)) {
    failures.push("Primary workflow navigation should lead the left-column hierarchy before summary and health");
  }

  [
    "Initial workspace should place primary workflow buttons before summary and health",
    "Primary workflow buttons should be visible without scrolling the initial workspace",
    "Result cards should contain enlarged text without vertical overlap",
    "Result metadata should stay on stable single lines",
    "Truncated result titles should keep the full filename in the native tooltip",
    "Workflow buttons should not overlap the following animation controls",
    "Responsive workflow panels should stack instead of covering the primary workflow buttons",
    "Collapsed animation source step should keep Upload Pixel Art available on demand",
    "Animation advanced settings should return focus to its trigger",
    "Animation generation history should return focus to its trigger"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover the simplified animation controls: ${marker}`);
    }
  });

  [
    "Effect Animation should show only choose and generate steps by default",
    "Effect optional controls should stay out of the default left column",
    "Effect picker should return focus to its trigger",
    "Effect advanced settings should return focus to its trigger",
    "VFX Composite Stage should stay collapsed as an optional post-generation tool"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover the simplified effect controls: ${marker}`);
    }
  });

  [
    "BASIC_CHARACTER_CATEGORY",
    "Basic Character",
    "docs/prompt-examples/basic-character-prompts.md",
    "basic-boy-adventurer",
    "basic-girl-adventurer",
    "basic-young-male-hero",
    "basic-young-female-hero",
    "basic-middle-aged-male-mercenary",
    "basic-middle-aged-female-ranger",
    "basic-elder-male-sage",
    "basic-elder-female-herbalist",
    "basic-androgynous-traveler",
    "basic-small-village-child",
    "basic-large-veteran-warrior",
    "basic-hooded-mysterious-figure",
    "basic-two-head-chibi-knight",
    "basic-two-head-chibi-mage",
    "basic-two-head-chibi-archer",
    "basic-two-head-chibi-healer",
    "basic-two-head-chibi-ninja",
    "basic-two-head-chibi-alchemist",
    "basic-two-head-chibi-pirate",
    "basic-two-head-chibi-robot",
    "basic-two-head-chibi-dragon-tamer",
    "PROFESSION_CHARACTER_CATEGORY",
    "ANIMAL_CATEGORY",
    "CHIBI_BOY_CATEGORY",
    "CHIBI_GIRL_CATEGORY",
    "BEASTFOLK_CATEGORY",
    "MONSTER_CATEGORY",
    "MONSTER_GIRL_CATEGORY",
    "parsePromptCatalogTitle",
    "parsePromptCatalogMarkdown",
    "professionCharacterPromptsMarkdown",
    "animalPromptsMarkdown",
    "chibiBoyPromptsMarkdown",
    "chibiGirlPromptsMarkdown",
    "beastfolkPromptsMarkdown",
    "monsterPromptsMarkdown",
    "monsterGirlPromptsMarkdown",
    "professionCharacterPromptExamples",
    "animalPromptExamples",
    "chibiBoyPromptExamples",
    "chibiGirlPromptExamples",
    "beastfolkPromptExamples",
    "monsterPromptExamples",
    "monsterGirlPromptExamples",
    "quickPromptPresets",
    "quick-elder-man",
    "quick-elder-woman",
    "quick-man",
    "quick-woman",
    "quick-girl",
    "quick-boy",
    "quick-cat",
    "quick-dog",
    "quick-monster",
    "promptExampleLayerCopy",
    "relatedPromptExamplesForQuickPreset",
    "data-quick-preset-id",
    "onUseQuick",
    "docs/prompt-examples/profession-character-prompts.md",
    "docs/prompt-examples/animal-prompts.md",
    "docs/prompt-examples/chibi-boy-prompts.md",
    "docs/prompt-examples/chibi-girl-prompts.md",
    "docs/prompt-examples/beastfolk-prompts.md",
    "docs/prompt-examples/monster-prompts.md",
    "docs/prompt-examples/monster-girl-prompts.md"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should include the expanded Prompt Examples catalog: ${marker}`);
    }
  });

  ["SHOW_SPRITE_ACTIONS_PANEL", "SHOW_ANIMATION_LIBRARY = false", "without-sprite-actions"].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should keep Sprite Actions panel behind the temporary visibility flag: ${marker}`);
    }
  });

  [
    "normalizeOpaqueBounds",
    "normalizeFrameOpaqueBounds",
    "selectPrimaryOpaqueComponent",
    "isLikelyFrameGarbageComponent",
    "removeFrameEdgeResiduePixels",
    "despillFrameEdgePixels"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should normalize generated animation frame cutouts: ${marker}`);
    }
  });

  ["sprite-sheet-grid-preview", "sprite-sheet-grid-overlay"].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should overlay a review grid on generated sprite sheets: ${marker}`);
    }
  });

  ["temporary 1-pixel pure cyan #00FFFF guide grid", "removeAnimationGuideGridPixels"].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should request and remove temporary animation guide grids: ${marker}`);
    }
  });

  [
    [appText, "createDirectionPreviewBlobs"],
    [appText, "directionPreviews"],
    [exportersText, "input.directionPreviews"],
    [animationPackText, "readDirectionPreviewFiles"]
  ].forEach(([text, marker]) => {
    if (!text.includes(marker)) {
      failures.push(`Animation packs should include all direction preview GIF/WebP files: ${marker}`);
    }
  });

  if (!smokeText.includes("/api/zai/results")) {
    failures.push("Smoke test should cover Local Inbox outbox result listing/import.");
  }
  [
    "imageRectNormalized",
    "imageRectPixels",
    "source image normalized",
    "Do not zoom in, crop, or reframe"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover Image Editing source coordinate handoff: ${marker}`);
    }
  });
  [
    "QA JSON outbox file should be ignored",
    "work-in-progress outbox image should be ignored",
    "staging outbox image should be ignored",
    "candidate contact temp outbox image should be ignored",
    "tmp transparent derivative outbox image should be ignored",
    "contact sheet outbox image should be ignored",
    "grid QA outbox image should be ignored",
    "debug outbox image should be ignored",
    "preview grid outbox image should be ignored",
    "AB gallery outbox image should be ignored"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover hardened outbox result filtering: ${marker}`);
    }
  });

  [
    "assertTempCandidateContactImportFilter",
    "temp candidate contact filter setup",
    "candidate-contact.tmp",
    "preview-grid history item"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke should cover temp/contact import filtering: ${marker}`);
    }
  });

  [
    "Real Zai runner smoke passed.",
    "ZAI_COCKPIT_REAL_ZAI_SMOKE_KEEP",
    "runner smoke ok",
    "ZAI_COCKPIT_RUNNER_AUTORUN",
    "completed",
    "exitCode"
  ].forEach((marker) => {
    if (!realZaiSmokeText.includes(marker)) {
      failures.push(`Real Zai runner smoke should cover installed runner completion: ${marker}`);
    }
  });

  const realImagegenSmokeText = readText("scripts/real-imagegen-smoke.mjs");
  [
    "Real imagegen smoke passed.",
    "ZAI_COCKPIT_IMAGEGEN_SMOKE_KEEP",
    "ZAI_COCKPIT_IMAGEGEN_SMOKE_TIMEOUT_MS",
    "built-in image generation path",
    "Do not create a placeholder image",
    "Returned PNG should be larger than a placeholder"
  ].forEach((marker) => {
    if (!realImagegenSmokeText?.includes(marker)) {
      failures.push(`Real imagegen smoke should cover prompt-only imagegen completion: ${marker}`);
    }
  });

  [
    "You create images only through the generate_image tool",
    "Never emit procedural, SVG, canvas, diagram, geometric, or placeholder content",
    "workflowMode=image-edit",
    "numbered annotationContext region comments",
    "imageRectNormalized",
    "imageRectPixels",
    "Preserve the original canvas size and aspect ratio",
    "Do not zoom in, crop, or reframe",
    "workflowMode=sprite-generate",
    "workflowMode=effect-animation",
    "spriteContext.chromaKey",
    "spriteContext.directions",
    "zai-cockpit.direction-split-animation.v1",
    "front-three-quarter",
    "Do not return only one combined multi-direction sheet",
    "spriteContext.variant=directional-hatch-pet",
    "direction-01-front",
    "no character pixels crossing cell borders",
    "exactly one full-body character",
    "duplicated heads",
    "If the first result contains unwanted text or numbers, retry once",
    "serverVerified",
    "artifactStableMs",
    "publishVerifiedDirectionSplitArtifact",
    "outbox/.staging/<job-id>/",
    "Do not modify project source files",
    "real alpha transparency",
    "Do not bake checkerboard",
    "effectContext exactly",
    "Do not place *-qa.json, work files",
    "candidate-contact sheets",
    "preview grids",
    "write them as a small Markdown sidecar"
  ].forEach((marker) => {
    if (!serverText?.includes(marker)) {
      failures.push(`Server should preserve imagegen handoff instructions: ${marker}`);
    }
  });

  [
    "exportDirectionalAnimations",
    "directional-hatch-pet",
    "DIRECTIONAL_HATCH_PET_GRID",
    "buildDirectionalHatchPetPreviewActions",
    "DIRECTION_SPLIT_ANIMATION_SCHEMA",
    "selectDirectionSplitAnimationResults",
    "waitingForFinalManifest",
    "waitingForVerifiedArtifacts",
    "Bronze candidate",
    "importDirectionSplitBronzeCandidate",
    "clearZaiFailureNotice",
    "retryZaiFailureImport",
    "shouldIgnoreOutboxResultName",
    "hasTemporaryOutboxResultMarker",
    "composeDirectionSplitAnimationSheet",
    "validateDirectionSplitAnimationCells",
    "selectDirectionalHatchPetResults",
    "animation-source-status",
    "selectSourceFromPreview",
    "source-status-chip",
    "statusSourceSelectedForAnimation",
    "with-downloads",
    "zaiLogsFullscreen",
    "zaiLogFullscreen",
    "zaiLogExitFullscreen",
    "downloadModalOpen",
    "DownloadOptionsModal",
    "openDownloadModal",
    "result-download-action",
    "download-options-modal",
    "importEffectAnimationResult",
    "evaluateEffectAnimationQc",
    "effectQualityRankAllowsDownload",
    "exportSelectedEffectPack",
    "ZAI_LOG_HISTORY_LIMIT = MAX_ACTIVE_ZAI_JOBS",
    "zaiLogAutoScrollRef",
    "pre.scrollTop = pre.scrollHeight",
    "Maximize2",
    "Minimize2",
    ".zai-log-panel.fullscreen",
    "Every cell must contain exactly one complete",
    "Do not let any part cross cell borders",
    "Quality gate before returning",
    "zaiFailurePolicyMessage"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should preserve strict animation result preview/prompt handling: ${marker}`);
    }
  });

  [
    "imageDisplayRectForCanvas",
    "annotationImageCoordinates",
    "imageRectNormalized",
    "imageRectPixels",
    "Preserve the original canvas size and aspect ratio",
    "Do not zoom in, crop, or reframe",
    "grid-template-rows: minmax(340px, 1fr) auto",
    "height: 112px",
    "max-height: 112px",
    "container-type: size"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !stylesText.includes(marker)) {
      failures.push(`App should preserve Image Editing full-body fit handling: ${marker}`);
    }
  });

  [
    "INITIAL_HISTORY_RENDER_COUNT",
    "HISTORY_RENDER_BATCH_SIZE",
    "visibleHistory",
    "data-visible-count",
    "getVisibleHistoryCount",
    "history-load-more-sentinel"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`App should preserve incremental Results list rendering: ${marker}`);
    }
  });

  [
    "Image Editing Full-Body Fit QA",
    "imageRectNormalized",
    "imageRectPixels",
    "Zai log panel",
    "Real imagegen editing was not run"
  ].forEach((marker) => {
    if (imageEditFullBodyQaText && !imageEditFullBodyQaText.includes(marker)) {
      failures.push(`Image Editing full-body fit QA doc should record: ${marker}`);
    }
  });

  [
    "type ZaiFailureKind",
    "type ZaiJobDiagnostic",
    "getJobDiagnostic",
    "reasonKind",
    '"status": "blocked"',
    "Do not include hidden policy text",
    "no_image_returned"
  ].forEach((marker) => {
    if (!serverText?.includes(marker)) {
      failures.push(`Server should preserve Zai imagegen failure diagnostic handling: ${marker}`);
    }
  });

  [
    "sprite generation job should include total sprite frame count",
    "sprite generation job should preserve the selected frame budget",
    "sprite generation job should attach the source image",
    "sprite generation job should include chroma key",
    "sprite generation job should include the standard variant",
    "sprite generation job should include five direction rows",
    "direction split manifest should be listed",
    "direction split manifest import should preserve JSON MIME type",
    "sprite generation job should instruct Zai to use built-in image generation",
    "hatch-pet job should include hatch-pet variant",
    "hatch-pet job should include 72 atlas cells",
    "hatch-pet job should instruct Zai to use the hatch-pet workflow",
    "directional hatch-pet job should include the directional hatch-pet variant",
    "directional hatch-pet job should include 360 atlas cells",
    "directional hatch-pet job should instruct Zai to return five atlas images",
    "job should include numbered edit annotations",
    "job should include numbered edit comments",
    "sprite edit job should include sprite frame count",
    "sprite generation job should not carry edit annotations",
    "sprite edit job should not carry edit annotations",
    "unapproved mock runner should not report ready",
    "unapproved mock runner should not create fake images",
    "ZAI_COCKPIT_ALLOW_MOCK_RUNNER",
    "mock autorun preflight should report ready",
    "mock autorun job should start in running state",
    "mock autorun exact job-id result should not create a diagnostic",
    "mock autorun result image should be listed",
    "waitForJobState"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke test should cover sprite handoff detail: ${marker}`);
    }
  });

  [
    "ZAI_COCKPIT_RUNNER_HELP_ARGS_JSON",
    "ZAI_COCKPIT_RUNNER_EXEC_ARGS_JSON",
    "parseJsonStringArray",
    "selectZaiLaunchCommand",
    "detectZaiRunnerMode",
    "isMockRunnerBlocked",
    "mockRunnerBlockedDiagnostic",
    "zai-agent-runner.mjs",
    "resolveZaiEndpointMode",
    "launchCommand",
    "resolvedCommandPaths"
  ].forEach((marker) => {
    const serverText = readText("server/index.ts");
    if (!serverText.includes(marker)) {
      failures.push(`Server should support runner wrapper args: ${marker}`);
    }
  });

  [
    "zai-agent-runner.mjs",
    "ZAI_API_KEY",
    "ZAI_ENDPOINT_MODE",
    "endpointMode"
  ].forEach((marker) => {
    const doctorText = readText("scripts/doctor.mjs");
    if (!doctorText.includes(marker)) {
      failures.push(`Doctor should report Z.ai runner diagnostics: ${marker}`);
    }
  });

  const agentRunnerText = readText("scripts/zai-agent-runner.mjs");
  if (agentRunnerText) {
    [
      "api.z.ai/api/coding/paas/v4",
      "api.z.ai/api/paas/v4",
      "shouldFallbackToApiBase",
      "images/generations"
    ].forEach((marker) => {
      if (!agentRunnerText.includes(marker)) {
        failures.push(`Z.ai agent runner should keep its endpoint strategy: ${marker}`);
      }
    });
  }
}

function checkPendingJobCoverage() {
  const appText = readText("src/App.tsx");
  const appTestText = readText("src/App.test.ts");
  if (!appText || !appTestText) return;

  [
    'status.state === "running"',
    'status.state === "unknown"',
    "shouldWaitForZaiRunner",
    "shouldReportCompletedZaiImportFailure",
    "recordZaiImportFailure",
    "Direction split import failed"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !appTestText.includes(marker)) {
      failures.push(`Pending job coverage is missing marker: ${marker}`);
    }
  });

  const uiSmokeText = readText("scripts/ui-smoke.mjs");
  const smokeText = readText("scripts/smoke.mjs");
  const serverText = readText("server/index.ts");
  const storageText = readText("src/lib/storage.ts");
  const devSupervisorText = readText("scripts/dev-supervisor.mjs");
  const resetPageText = readText("public/reset-local-state.html");
  const qaText = readOptionalText("docs/qa/completed-zai-job-import-storage-quota.md");
  const localStateQaText = readOptionalText("docs/qa/local-state-oom-safe-mode-retention.md");
  const cockpitHealthQaText = readOptionalText("docs/qa/cockpit-health-repair-supervisor.md");
  const dedupeQaText = readOptionalText("docs/qa/deduplicate-bronze-candidate-import-retry.md");
  const settingsQaText = readOptionalText("docs/qa/settings-recovery-environment-report.md");
  const directionSplitHotfixQaText = readOptionalText("docs/qa/animation-direction-split-completion-hotfix.md");
  [
    "assertCompletedDirectionSplitImportFailure",
    "assertPartialDirectionSplitRecovery",
    "assertManifestFirstDirectionSplitRecovery",
    "mock-partial-direction-split-recovery.flag",
    "Partial direction files without a manifest should not add a failure card",
    "mock-manifest-first-direction-split-recovery.flag",
    "Manifest-first direction files should not add a failure card",
    "mock-direction-split-import-failure.flag",
    "Completed direction split import failure should release the active job slot"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Completed Zai import UI smoke coverage is missing marker: ${marker}`);
    }
  });
  [
    "HISTORY_SUMMARY_KEY",
    "FRAMES_SUMMARY_KEY",
    "saveLargeState",
    "localStorage mirror",
    "STORAGE_WARNING_BYTES",
    "STORAGE_AUTO_SAFE_BYTES",
    "STORAGE_HARD_BLOCK_BYTES",
    "isStorageSafeModeSearch",
    "preflightLocalStateStorage",
    "clearImageCockpitLocalState",
    "HISTORY_RETENTION_LIMIT",
    "FRAME_RETENTION_LIMIT",
    "approxBytes",
    "largestItemBytes",
    "retentionPolicy",
    "PENDING_ZAI_JOB_STORAGE_KEY"
  ].forEach((marker) => {
    if (!storageText.includes(marker)) {
      failures.push(`Large history/frame storage quota guard is missing marker: ${marker}`);
    }
  });

  [
    "outboxImportKey",
    "prependHistoryItemWithDedupe",
    "dedupePersistedLocalInboxHistory",
    "lastOutboxFingerprint",
    "CockpitHealthPanel",
    "Cockpitを修復",
    "結果を再取り込み"
  ].forEach((marker) => {
    if (!appText.includes(marker) && !storageText.includes(marker)) {
      failures.push(`Cockpit health / import dedupe guard is missing marker: ${marker}`);
    }
  });

  [
    "/api/dev/health",
    "/api/dev/repair",
    "127.0.0.1",
    "ZAI_COCKPIT_API_TARGET",
    "hasRunningZaiJobs",
    "restart-vite"
  ].forEach((marker) => {
    if (!devSupervisorText.includes(marker)) {
      failures.push(`Dev supervisor safety marker is missing: ${marker}`);
    }
  });

  [
    "Local state safe mode",
    "Local state recovery",
    "Clear history",
    "Clear frames",
    "Clear animation library",
    "Clear all local Zai Cockpit state",
    "localhostで新規origin",
    "危険を理解して読み込む"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Local state recovery UI marker is missing: ${marker}`);
    }
  });

  [
    "assertSafeModeRecovery",
    "assertStoragePreflightRecovery",
    "assertResetLocalStatePage",
    "mockLargeStorage=1",
    "Local state safe mode",
    "Local state recovery"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Local state OOM UI smoke coverage is missing marker: ${marker}`);
    }
  });

  [
    "Zai Cockpit Local State Reset",
    "zai-handoff/outbox",
    "zai-cockpit.pendingZaiJob",
    "indexedDB.deleteDatabase",
    "/?safe=1"
  ].forEach((marker) => {
    if (!resetPageText.includes(marker)) {
      failures.push(`Static reset page is missing safety marker: ${marker}`);
    }
  });

  [
    "completed + outboxあり + import失敗",
    "Direction split import failed",
    "localStorage容量超過",
    "ui-smoke"
  ].forEach((marker) => {
    if (qaText && !qaText.includes(marker)) {
      failures.push(`Completed Zai import QA doc is missing marker: ${marker}`);
    }
  });

  [
    "?safe=1",
    "?skipStorage=1",
    "reset-local-state.html",
    "navigator.storage.estimate",
    "ui-smoke",
    "zai-handoff/outbox",
    "main merge前"
  ].forEach((marker) => {
    if (localStateQaText && !localStateQaText.includes(marker)) {
      failures.push(`Local state OOM QA doc is missing marker: ${marker}`);
    }
  });

  [
    "/api/health",
    "/api/dev/health",
    "Cockpitを修復",
    "結果を再取り込み",
    "running Zai job",
    "browser"
  ].forEach((marker) => {
    if (cockpitHealthQaText && !cockpitHealthQaText.includes(marker)) {
      failures.push(`Cockpit health QA doc is missing marker: ${marker}`);
    }
  });

  [
    "outboxImportKey",
    "bronze candidate",
    "IndexedDB",
    "exact duplicate",
    "Retry import",
    "ui-smoke"
  ].forEach((marker) => {
    if (dedupeQaText && !dedupeQaText.includes(marker)) {
      failures.push(`Bronze candidate dedupe QA doc is missing marker: ${marker}`);
    }
  });

  [
    "SettingsModal",
    "settings-trigger",
    "buildImageCockpitEnvironmentReport",
    "redactEnvironmentReportText",
    "settingsTabFromSearch",
    "shouldOpenSettingsFromSearch",
    "imagegenSmokeState",
    "Copy Markdown",
    "Copy JSON",
    "Environment Report"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Settings recovery/report app marker is missing: ${marker}`);
    }
  });

  [
    "procedural, SVG, canvas, diagram, geometric, or placeholder image",
    "reasonKind=imagegen_unavailable",
    '"reasonKind": "policy_or_safety" | "imagegen_unavailable" | "unknown"'
  ].forEach((marker) => {
    if (!serverText.includes(marker)) {
      failures.push(`Server imagegen-unavailable guard marker is missing: ${marker}`);
    }
  });

  [
    "imagegen unavailable sidecar",
    "imagegen_unavailable",
    "should not create a fake image",
    "generate_image tool",
    "procedural, SVG, canvas, diagram, geometric, or placeholder"
  ].forEach((marker) => {
    if (!smokeText.includes(marker)) {
      failures.push(`Smoke imagegen-unavailable guard marker is missing: ${marker}`);
    }
  });

  [
    "assertSettingsRecoveryEnvironmentReport",
    "assertImagegenUnavailableSidecar",
    "settings trigger next to language selector",
    "Copy Markdown",
    "Copy JSON",
    "imagegen smoke: not_run",
    "Open Safe Mode",
    "Open Reset Local State",
    "Imagegen unavailable sidecar should not create a fake history image"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`UI smoke settings/recovery/report marker is missing: ${marker}`);
    }
  });

  [
    "Settings / Recovery / Environment Report QA",
    "Settings",
    "Recovery",
    "Environment Report",
    "imagegen_unavailable",
    "not_run",
    "?safe=1",
    "/reset-local-state.html",
    "Copy Markdown",
    "Copy JSON",
    "ui-smoke",
    "browser",
    "main merge前"
  ].forEach((marker) => {
    if (settingsQaText && !settingsQaText.includes(marker)) {
      failures.push(`Settings recovery/report QA doc is missing marker: ${marker}`);
    }
  });

  [
    "findReadyDirectionSplitArtifacts",
    "findLatestReadyDirectionSplitArtifact",
    "directionSplitJobIdFromOutboxResultName",
    "isDirectionSplitComponentOutboxName",
    "isGenericStaticImageResult",
    "isDirectionSplitArtifactAlreadyImported",
    "importReadyDirectionSplitArtifact",
    "directionSplitRecoveryJobFromArtifact",
    "direction-split-animation-sheet.png"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Direction split completion hotfix app marker is missing: ${marker}`);
    }
  });

  [
    "assertDetachedDirectionSplitRecoverResults",
    "writeDetachedDirectionSplitFixture",
    "makeDirectionSplitFixturePng",
    "Detached direction split final sheet should be 2048x1280",
    "Detached direction split recovery should not add raw front direction file as history",
    "Detached direction split recovery should not duplicate the final sheet"
  ].forEach((marker) => {
    if (!uiSmokeText.includes(marker)) {
      failures.push(`Direction split completion hotfix UI smoke marker is missing: ${marker}`);
    }
  });

  [
    "Animation Direction Split Completion Hotfix QA",
    "032 hotfix",
    "zai-cockpit.direction-split-animation.v1",
    "pending job",
    "Recover Results",
    "2048x1280",
    "1024x512",
    "raw direction",
    "ui-smoke",
    "main merge前"
  ].forEach((marker) => {
    if (directionSplitHotfixQaText && !directionSplitHotfixQaText.includes(marker)) {
      failures.push(`Direction split completion hotfix QA doc is missing marker: ${marker}`);
    }
  });
}

function checkSimpleLocalInboxAction() {
  const appText = readText("src/App.tsx");
  if (!appText) return;

  [
    "async function importLatestOutboxResult",
    "statusInboxImported",
    "Import Latest",
    "Import File"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Simplified UI should keep import support available internally: ${marker}`);
    }
  });

  ["{copy.importLatest}", "{copy.importFile}"].forEach((marker) => {
    if (appText.includes(marker)) {
      failures.push(`Simplified UI should hide secondary import buttons for now: ${marker}`);
    }
  });
}

function checkCoreLocalization() {
  const appText = readText("src/App.tsx");
  const appTestText = readText("src/App.test.ts");
  if (!appText || !appTestText) return;

  [
    "resolveInitialLanguage",
    "SUPPORTED_LANGUAGE_IDS",
    "resolveLocaleToLanguage",
    "withUiCopy",
    "copy.workflowPanelTitle",
    "copy.animationStepSourceTitle",
    "copy.animationStepMotionTitle",
    "copy.animationStepGenerateTitle",
    "copy.imageDownloadTitle",
    "copy.canvasAnnotationTitle",
    "copy.canvasEmpty",
    "copy.exportSheetPng",
    "copy.exportMetadataJson",
    "formatImagesImportedStatus",
    "formatFramesAddedStatus",
    "プレビュー",
    "スプライト書き出し",
    "スプライトパッケージ書き出し"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Core localization marker is missing: ${marker}`);
    }
  });

  if (!appTestText.includes("resolveInitialLanguage")) {
    failures.push("App tests should cover initial language resolution.");
  }

  [
    "zh-CN",
    "zh-TW",
    "ko",
    "ru",
    "es",
    "pt-BR",
    "de",
    "fr",
    "id",
    "tr",
    "vi",
    "pl",
    "it",
    "简体中文",
    "繁體中文",
    "한국어",
    "Русский",
    "Español",
    "Português (Brasil)",
    "Deutsch",
    "Français",
    "Bahasa Indonesia",
    "Türkçe",
    "Tiếng Việt",
    "Polski",
    "Italiano",
    "像素艺术生成",
    "像素藝術生成",
    "픽셀 아트 생성",
    "Генерация пиксель-арта",
    "Geração de pixel art",
    "Pixel-Art-Erstellung"
  ].forEach((marker) => {
    if (!appText.includes(marker)) {
      failures.push(`Locale pack marker is missing: ${marker}`);
    }
  });

  if (!appTestText.includes("zh-Hant-TW") || !appTestText.includes("pt-PT") || !appTestText.includes("SUPPORTED_LANGUAGE_IDS")) {
    failures.push("App tests should cover extended locale resolution and stored locale ids.");
  }
}

function checkPromptCatalogExamples() {
  const catalogs = [
    {
      file: "docs/prompt-examples/profession-character-prompts.md",
      prefix: "profession",
      expectedCount: 30,
      sampleTitles: ["Boy Warrior Apprentice", "Middle-Aged Female Captain"]
    },
    {
      file: "docs/prompt-examples/chibi-boy-prompts.md",
      prefix: "chibi-boy",
      expectedCount: 5,
      sampleTitles: ["Copper-Haired Scout", "Blue-Curled Noble"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/chibi-girl-prompts.md",
      prefix: "chibi-girl",
      expectedCount: 5,
      sampleTitles: ["Auburn-Pigtail Farmer", "Violet-Braided Alchemist"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/animal-prompts.md",
      prefix: "animal",
      expectedCount: 10,
      sampleTitles: ["Loyal Dog", "Red Panda"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/beastfolk-prompts.md",
      prefix: "beastfolk",
      expectedCount: 10,
      sampleTitles: ["Wolf Beastfolk", "Red Panda Beastfolk"],
      requireLocalizedTitles: true
    },
    {
      file: "docs/prompt-examples/monster-prompts.md",
      prefix: "monster",
      expectedCount: 30,
      sampleTitles: ["Classic Green Slime", "Earth Spirit"]
    },
    {
      file: "docs/prompt-examples/monster-girl-prompts.md",
      prefix: "monster-girl",
      expectedCount: 20,
      sampleTitles: ["Slime Scout Girl", "Shark Pirate Girl"]
    }
  ];

  catalogs.forEach((catalog) => {
    const text = readText(catalog.file)?.replace(/\r\n/g, "\n");
    if (!text) return;
    const negativePrompt = text.match(/## Common Negative Prompt[\s\S]*?```text\n([\s\S]*?)\n```/)?.[1]?.trim() ?? "";
    if (!negativePrompt) {
      failures.push(`${catalog.file} should include a common negative prompt.`);
    }
    const examples = [...text.matchAll(/###\s+\d+\.\s+([^\n]+)\n\n```text\n([\s\S]*?)\n```/g)].map((match) => ({
      heading: match[1].trim(),
      title: parsePromptExampleTitle(match[1]),
      prompt: match[2].trim()
    }));
    if (examples.length !== catalog.expectedCount) {
      failures.push(`${catalog.file} should include ${catalog.expectedCount} prompt examples, got ${examples.length}.`);
    }
    catalog.sampleTitles.forEach((title) => {
      if (!examples.some((example) => example.title.en === title)) {
        failures.push(`${catalog.file} should include sample prompt: ${title}`);
      }
    });
    examples.forEach((example) => {
      if (catalog.requireLocalizedTitles && example.title.en === example.title.ja) {
        failures.push(`${catalog.file} should use an English Title / 日本語名 heading: ${example.heading}`);
      }
      if (!example.prompt.includes("transparent background preferred")) {
        failures.push(`${catalog.file} prompt should prefer transparent background: ${example.title.en}`);
      }
      const imageFile = `public/prompt-examples/${catalog.prefix}-${slugPromptExampleTitle(example.title.en)}.png`;
      const imagePath = join(root, imageFile);
      if (!existsSync(imagePath)) return;
      const image = readFileSync(imagePath);
      const isPng = image.length > 24 && image[0] === 0x89 && image[1] === 0x50 && image[2] === 0x4e && image[3] === 0x47;
      if (!isPng) {
        failures.push(`Prompt example preview should be PNG: ${imageFile}`);
        return;
      }
      const width = image.readUInt32BE(16);
      const height = image.readUInt32BE(20);
      if (width < 1024 || height < 1024) {
        failures.push(`Prompt example preview should be at least 1024px in both dimensions: ${imageFile} is ${width}x${height}`);
      }
    });
  });
}

function checkPromptPresetAssetQa() {
  const qaFile = "docs/qa/prompt-examples/animal-chibi-beastfolk-presets/asset-qc.json";
  const qaText = readOptionalText(qaFile);
  if (!qaText) return;

  let qa;
  try {
    qa = JSON.parse(qaText);
  } catch {
    failures.push(`${qaFile} should contain valid JSON.`);
    return;
  }

  const expectedFiles = [
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/animal-prompts.md", "animal"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-boy-prompts.md", "chibi-boy"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/chibi-girl-prompts.md", "chibi-girl"),
    ...promptPreviewFilesFromMarkdown("docs/prompt-examples/beastfolk-prompts.md", "beastfolk")
  ].sort();
  const assets = Array.isArray(qa.assets) ? qa.assets : [];

  if (qa.expectedCount !== expectedFiles.length || qa.actualCount !== expectedFiles.length || assets.length !== expectedFiles.length) {
    failures.push(`${qaFile} should describe exactly ${expectedFiles.length} prompt preview assets.`);
  }
  if (qa.allChecksPass !== true) {
    failures.push(`${qaFile} should report allChecksPass=true.`);
  }

  const seenFiles = new Set();
  assets.forEach((asset) => {
    const file = typeof asset.file === "string" ? asset.file.replace(/\\/g, "/") : "";
    if (!file || seenFiles.has(file)) {
      failures.push(`${qaFile} should contain one unique file entry per asset: ${file || "<missing>"}`);
      return;
    }
    seenFiles.add(file);
    if (!expectedFiles.includes(file)) {
      failures.push(`${qaFile} contains an unexpected prompt preview: ${file}`);
      return;
    }

    const checks = asset.checks && typeof asset.checks === "object" ? Object.values(asset.checks) : [];
    const margins = asset.margins && typeof asset.margins === "object" ? Object.values(asset.margins) : [];
    if (
      asset.mode !== "RGBA" ||
      asset.transparentPixels <= 0 ||
      asset.edgeTouch !== false ||
      asset.checks?.centered !== true ||
      !Number.isFinite(asset.centerOffsetX) ||
      !Number.isFinite(asset.centerOffsetY) ||
      Math.abs(asset.centerOffsetX) > 1 ||
      Math.abs(asset.centerOffsetY) > 1 ||
      checks.length === 0 ||
      checks.some((value) => value !== true) ||
      margins.length !== 4 ||
      margins.some((value) => !Number.isFinite(value) || value < 32) ||
      !Array.isArray(asset.cornerAlpha) ||
      asset.cornerAlpha.length !== 4 ||
      asset.cornerAlpha.some((value) => value !== 0)
    ) {
      failures.push(`${qaFile} contains a failed transparency, padding, edge, or debris check: ${file}`);
    }

    const imagePath = join(root, file);
    if (!existsSync(imagePath)) return;
    const image = readFileSync(imagePath);
    const width = image.length > 24 ? image.readUInt32BE(16) : 0;
    const height = image.length > 24 ? image.readUInt32BE(20) : 0;
    const sha256 = createHash("sha256").update(image).digest("hex");
    if (asset.width !== width || asset.height !== height || asset.byteLength !== image.length || asset.sha256 !== sha256) {
      failures.push(`${qaFile} is stale or does not match the current PNG bytes: ${file}`);
    }
  });

  expectedFiles.forEach((file) => {
    if (!seenFiles.has(file)) failures.push(`${qaFile} is missing prompt preview QA: ${file}`);
  });
}

function checkCiWorkflow() {
  const workflow = readText(".github/workflows/ci.yml");
  if (!workflow) return;

  [
    "actions/checkout@v4",
    "actions/setup-node@v4",
    "npm ci",
    "npm run verify"
  ].forEach((line) => {
    if (!workflow.includes(line)) {
      failures.push(`CI workflow is missing expected step: ${line}`);
    }
  });

  if (!/contents:\s+read/.test(workflow)) {
    failures.push("CI workflow should keep contents permission read-only.");
  }
}



function readText(file) {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch {
    failures.push(`Could not read ${file}`);
    return "";
  }
}

function readOptionalText(file) {
  try {
    return readFileSync(join(root, file), "utf8");
  } catch {
    return "";
  }
}

function readJson(file) {
  try {
    return JSON.parse(readText(file));
  } catch (error) {
    failures.push(`Could not parse ${file}: ${error.message}`);
    return null;
  }
}

function git(args) {
  try {
    return execFileSync("git", args, { cwd: root, encoding: "utf8" });
  } catch (error) {
    failures.push(`git ${args.join(" ")} failed: ${error.message}`);
    return null;
  }
}

function isAuditedTextFile(file) {
  if (file === "package.json" || file === ".env.example") return true;
  return [".js", ".mjs", ".ts", ".tsx"].includes(extname(file));
}

function isPrivacyAuditedTextFile(file) {
  return privacyTextExtensions.has(extname(file));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export type ProviderId = "local-file" | "local-generator" | "zai-handoff" | "local-inbox";

export type ToolMode = "select" | "brush" | "rect" | "arrow";

export interface HistoryItem {
  id: string;
  name: string;
  dataUrl: string;
  provider: ProviderId;
  prompt: string;
  seed: string;
  size: string;
  createdAt: string;
  adopted: boolean;
  source: "sample" | "import" | "generate" | "annotated" | "inbox";
  derivedFromId?: string;
  derivedFromName?: string;
  outboxImportKey?: string;
  effectAnimation?: EffectAnimationMetadata;
  animationDirections?: string[];
  animationQuality?: AnimationQualityReportV2;
  motionRecipe?: MotionRecipeMetadata;
  animationPackV2?: AnimationPackV2;
  animationGenerationProfile?: "fast" | "balanced" | "best";
  animationSourceFingerprint?: string;
}

export interface MotionRecipeMetadata {
  id: string;
  version: number;
  compilerVersion: string;
  qualityProfile: AnimationActionQualityProfile;
  bodyTopology?: "biped" | "quadruped" | "serpentine-or-body-contact" | "floating" | "winged-flying" | "multi-leg";
  frameCount?: 4 | 6 | 8 | 12 | 16 | 20;
  modifiers?: {
    intensity: "subtle" | "normal" | "strong";
    tempo: "slow" | "normal" | "fast";
    weight: "light" | "normal" | "heavy";
    exaggeration: "low" | "normal" | "high";
    handedness: "inherit" | "left" | "right" | "ambidextrous";
    weaponClass: "none" | "unarmed" | "sword" | "heavy-weapon" | "polearm" | "bow" | "firearm" | "staff" | "shield";
    travelAmount: "in-place" | "short" | "medium" | "long";
    secondaryMotionLevel: "low" | "normal" | "high";
    vfxAmount: "none" | "low" | "normal" | "high";
  };
  experimental?: boolean;
}

export type AnimationActionQualityProfile =
  | "grounded-strict"
  | "grounded-soft"
  | "airborne-or-exempt"
  | "subtle-loop";

export interface AnimationQualityDirectionMetrics {
  direction: string;
  frameCount: number;
  centerDriftPx: number;
  footlineDriftPx: number;
  widthVariation: number;
  heightVariation: number;
  groundedFrameRatio: number;
  averageMotion: number;
  maxMotion: number;
  loopSeam: number | null;
}

export interface AnimationQualityMetricSet {
  frameCount: number;
  directionCount: number;
  directions: AnimationQualityDirectionMetrics[];
  averageCenterDriftPx: number;
  averageFootlineDriftPx: number;
  averageWidthVariation: number;
  averageHeightVariation: number;
  averageGroundedFrameRatio: number;
  averageMotion: number;
  averageLoopSeam: number | null;
}

export interface AnimationNormalizationCorrection {
  direction: string;
  frameIndex: number;
  scale: number;
  translateX: number;
  translateY: number;
  rawBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
  normalizedBounds: { minX: number; minY: number; maxX: number; maxY: number } | null;
}

export interface AnimationQualityReportV2 {
  metricVersion: "zai-cockpit.animation-quality.v2";
  policyVersion: "shadow-v1";
  recordedAt: string;
  action: string;
  actionProfile: AnimationActionQualityProfile;
  bodyTopology?: MotionRecipeMetadata["bodyTopology"];
  contactQaDimension?: "footline" | "paw-contact" | "body-contact" | "hover-height" | "wing-beat" | "multi-contact";
  footlineApplicable?: boolean;
  expectedPhases: string[];
  loopExpected: boolean;
  rawMetrics: AnimationQualityMetricSet;
  normalizedMetrics: AnimationQualityMetricSet;
  normalizationCorrection: {
    frames: AnimationNormalizationCorrection[];
    adjustedFrameRatio: number;
    averageScaleDelta: number;
    maxScaleDelta: number;
    averageTranslationPx: number;
    maxTranslationPx: number;
  };
  identityScore: number;
  paletteScore: number;
  silhouetteScore: number;
  footlineScore: number;
  loopSeamScore: number | null;
  phaseScore: number;
  motionScore: number;
  dimensionWarnings: string[];
  shadowDecision: {
    mode: "shadow";
    wouldBlock: boolean;
    reasons: string[];
  };
  hardGateUnchanged: true;
}

export type EffectQualityRank = "gold" | "silver" | "bronze" | "failed" | "blocked";
export type EffectLoopMode = "one-shot" | "loop" | "ping-pong-loop";

export interface EffectQualityReportV2 {
  metricVersion: "zai-cockpit.effect-quality.v2";
  policyVersion: "shadow-v1";
  recordedAt: string;
  loopSeamScore: number | null;
  alphaContinuityScore: number;
  energyCentroidScore: number;
  brightnessEnvelopeScore: number;
  clippingOverdrawScore: number;
  paletteConsistencyScore: number;
  peakFrameIndex: number;
  eventPeakDeltaFrames: number | null;
  shadowWarnings: string[];
}

export interface EffectRecipeMetadata {
  id: string;
  version: 1;
  category: string;
  frameCount: number;
  canvasSize: number;
  loopMode: EffectLoopMode;
  anchorMode: string;
  blendMode: "normal" | "additive" | "screen";
  energyEnvelope: "burst" | "sustain" | "pulse" | "travel" | "expand-fade";
  experimental?: boolean;
}

export interface EffectAnimationMetadata {
  kind: "effect-animation";
  name: string;
  category: string;
  type: string;
  style: string;
  colorPalette: string;
  frameCount: number;
  frameSize: {
    width: number;
    height: number;
  };
  layout: {
    id?: string;
    columns: number;
    rows: number;
  };
  loopMode: EffectLoopMode;
  fps: number;
  anchor: {
    x: number;
    y: number;
    mode: string;
  };
  blendMode: "normal" | "additive" | string;
  background: "transparent";
  alphaPremultiplied: boolean;
  qualityRank: EffectQualityRank;
  warnings: string[];
  failureReason?: string;
  sourceJobId?: string;
  recipe?: EffectRecipeMetadata;
  qualityV2?: EffectQualityReportV2;
  artifacts?: {
    sheet?: string;
    previewGif?: string;
    previewApng?: string;
    metadata?: string;
    frames?: string[];
  };
}

export interface SpriteFrame {
  id: string;
  name: string;
  dataUrl: string;
  width: number;
  height: number;
  sourceId?: string;
  index: number;
}

export interface SpriteAction {
  name: string;
  fps: number;
  loop: boolean;
  playbackMode?: "normal" | "ping-pong-reverse";
  frameIds: string[];
  cell: {
    width: number;
    height: number;
  };
  anchor: {
    x: number;
    y: number;
  };
}

export interface ImageRectCoordinates {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ImageSizeCoordinates {
  width: number;
  height: number;
}

export interface Annotation {
  id: string;
  tool: Exclude<ToolMode, "select">;
  color: string;
  width: number;
  number?: number;
  comment?: string;
  points: Array<{ x: number; y: number }>;
  displayedImageRect?: ImageRectCoordinates;
  imageRectNormalized?: ImageRectCoordinates;
  imageRectPixels?: ImageRectCoordinates;
  sourceImageNaturalSize?: ImageSizeCoordinates;
  imageRectClamped?: boolean;
}

export interface GridSettings {
  columns: number;
  rows: number;
  gutter: number;
}

export type AnimationLibraryKind = "official" | "user";

export interface AnimationPackManifest {
  schema: "zai-cockpit.animation.v1";
  title: string;
  kind: AnimationLibraryKind;
  action: string;
  directions: string[];
  grid: GridSettings;
  cell: {
    width: number;
    height: number;
  };
  framesPerDirection: number;
  playback?: "normal" | "ping-pong-reverse";
  createdAt: string;
  createdWith: string;
  license?: string;
  sourceNote?: string;
  promptSummary?: string;
  tags?: string[];
  motionRecipe?: MotionRecipeMetadata;
  files: {
    sheet: string;
    previewGif?: string;
    previewWebp?: string;
    previewApng?: string;
    directionPreviews?: Array<{
      direction: string;
      gif?: string;
      webp?: string;
      apng?: string;
    }>;
    metadata?: string;
  };
}

export type AnimationPackV2LoopMode = "loop" | "one-shot" | "ping-pong";
export type AnimationPackV2Origin = "recipe" | "user";
export type AnimationPackV2EventType = "startup" | "charge" | "active" | "impact" | "recovery" | "loop-point" | "custom";

export interface AnimationPackV2Frame {
  id: string;
  direction: string;
  sourceFrameIndex: number;
  sheetRect: ImageRectCoordinates;
  fileRef?: string;
  transparent?: boolean;
}

export interface AnimationPackV2Event {
  id: string;
  type: AnimationPackV2EventType;
  name: string;
  frameIndex: number;
  origin: AnimationPackV2Origin;
  direction?: string;
}

export interface AnimationPackV2Point {
  id: string;
  name: string;
  frameIndex: number;
  x: number;
  y: number;
  origin: AnimationPackV2Origin;
  direction?: string;
}

export interface AnimationPackV2Rect {
  id: string;
  name: string;
  frameIndex: number;
  x: number;
  y: number;
  width: number;
  height: number;
  origin: AnimationPackV2Origin;
  direction?: string;
}

export interface AnimationPackV2DirectionOverride {
  frameOrder?: number[];
  frameDurations?: number[];
  events?: AnimationPackV2Event[];
}

export interface AnimationPackV2 {
  schema: "zai-cockpit.animation.v2";
  schemaVersion: 2;
  title: string;
  kind: AnimationLibraryKind;
  actionId: string;
  recipeId: string;
  recipeVersion: number;
  compilerVersion: string;
  sourceFingerprint: string;
  directions: string[];
  frames: AnimationPackV2Frame[];
  frameOrder: number[];
  frameDurations: number[];
  defaultFps: number;
  loopMode: AnimationPackV2LoopMode;
  events: AnimationPackV2Event[];
  pivots: AnimationPackV2Point[];
  anchors: AnimationPackV2Point[];
  sockets: AnimationPackV2Point[];
  hitboxes: AnimationPackV2Rect[];
  hurtboxes: AnimationPackV2Rect[];
  trimRects: AnimationPackV2Rect[];
  directionOverrides?: Record<string, AnimationPackV2DirectionOverride>;
  qualitySummary: {
    rank: "gold" | "silver" | "bronze" | "failed" | "unknown";
    warningCount: number;
    loopSeamScore: number | null;
    identityScore: number | null;
  };
  generationProfile: "fast" | "balanced" | "best" | "unknown";
  provenance: {
    createdAt: string;
    createdWith: string;
    sourceName?: string;
    sourceJobId?: string;
    migratedFrom?: "zai-cockpit.animation.v1";
  };
  grid: GridSettings;
  cell: { width: number; height: number };
  files: {
    sheet: string;
    metadata: string;
    engine: {
      generic: string;
      godot: string;
      phaser: string;
      aseprite: string;
      unity: string;
    };
  };
}

export interface AnimationLibraryItem {
  id: string;
  kind: AnimationLibraryKind;
  title: string;
  action: string;
  manifest: AnimationPackManifest;
  packV2?: AnimationPackV2;
  previewDataUrl?: string;
  previewWebpDataUrl?: string;
  previewApngDataUrl?: string;
  sheetDataUrl: string;
  importedAt?: string;
  updatedAt?: string;
}

export interface ProviderStatus {
  id: ProviderId;
  label: string;
  enabled: boolean;
  message?: string;
  path?: string;
}

export interface ZaiJobResponse {
  id: string;
  path: string;
  inboxPath: string;
  outboxPath?: string;
  createdAt: string;
  runner?: ZaiRunnerStatus;
}

export type ZaiRunnerState = "running" | "completed" | "failed" | "unavailable" | "disabled" | "unknown";
export type ZaiRunnerPreflightState = "ready" | "disabled" | "unavailable";
export type ZaiRunnerMode = "zai" | "custom" | "mock";
export type ZaiFailureKind =
  | "policy_or_safety"
  | "usage_limit"
  | "imagegen_unavailable"
  | "runner_failed"
  | "import_failed"
  | "no_image_returned"
  | "unknown";

export interface ZaiJobDiagnostic {
  kind: ZaiFailureKind;
  title: string;
  userMessage: string;
  suggestion?: string;
  sidecarPath?: string;
  logPath?: string;
}

export interface ZaiRunnerStatus {
  jobId: string;
  state: ZaiRunnerState;
  message: string;
  command?: string;
  startedAt?: string;
  finishedAt?: string;
  exitCode?: number | null;
  signal?: string | null;
  logPath?: string;
  statusPath?: string;
  outboxDir?: string;
  diagnostic?: ZaiJobDiagnostic;
}

export interface ZaiRunnerPreflight {
  state: ZaiRunnerPreflightState;
  message: string;
  command: string;
  launchCommand?: string;
  mode?: ZaiRunnerMode;
  mockRunnerAllowed?: boolean;
  checkedAt: string;
  autorun: boolean;
  runnerScript?: string;
  endpointMode?: string;
  resolvedCommandPaths?: string[];
  errorCode?: string;
  setupHint?: string;
}

export interface ZaiRunnerPreflightResponse {
  runner: ZaiRunnerPreflight;
}

export interface ImageCockpitApiHealth {
  app: "zai-cockpit";
  version: string;
  role: "api";
  port: number;
  handoffRoot: string;
  inboxReadable: boolean;
  outboxReadable: boolean;
  statusReadable: boolean;
  logsReadable: boolean;
  runner: Pick<ZaiRunnerPreflight, "state" | "message" | "checkedAt" | "autorun" | "mode" | "mockRunnerAllowed">;
}

export interface ImageCockpitDevSupervisorHealth {
  app: "zai-cockpit";
  role: "supervisor";
  devOnly: true;
  checkedAt: string;
  supervisor: {
    port: number;
    pid: number;
    state: "running";
  };
  vite: {
    port: number;
    pid: number | null;
    state: "running" | "starting" | "stopped" | "exited";
    lastExitCode?: number | null;
    lastSignal?: string | null;
  };
  api: {
    port: number;
    pid: number | null;
    state: "running" | "starting" | "stopped" | "exited";
    lastExitCode?: number | null;
    lastSignal?: string | null;
  };
  apiTarget: string;
  handoffRoot: string;
  mismatches: string[];
}

export type ZaiArtifactQuality = "gold" | "silver" | "bronze" | "blocked" | "waiting";

export type ZaiResultQualityClassification =
  | "usable-final"
  | "quality-failed"
  | "quarantined-candidate"
  | "debug-artifact"
  | "running"
  | "failed";

export interface ZaiResultQualityGate {
  classification: ZaiResultQualityClassification;
  reason: string;
  code?: string;
  historyAllowed: boolean;
  downloadAllowed: boolean;
  retryable: boolean;
  warnings?: string[];
}

export interface ZaiArtifactStatus {
  jobId: string;
  artifactKind: "direction-split" | "effect-animation";
  detected: boolean;
  ready: boolean;
  verified: boolean;
  quality: ZaiArtifactQuality;
  reason: string;
  missingDirections: string[];
  warnings: string[];
  files: string[];
  manifestName?: string;
  stable: boolean;
  candidateCount: number;
  qualityGate?: ZaiResultQualityGate;
  animationQuality?: AnimationQualityReportV2;
  chromaKey?: {
    expected?: string;
    manifest?: string;
    warning?: string;
  };
}

export interface ZaiJobStatusResponse {
  status: ZaiRunnerStatus;
}

export interface ZaiJobLogResponse {
  jobId: string;
  exists: boolean;
  path: string;
  size: number;
  modifiedAt: string;
  readAt: string;
  truncated: boolean;
  text: string;
}

export interface ZaiOutboxResult {
  name: string;
  path: string;
  size: number;
  modifiedAt: string;
  mimeType: string;
  qualityGate?: ZaiResultQualityGate;
  artifact?: ZaiArtifactStatus;
}

export interface ZaiOutboxImportResponse extends ZaiOutboxResult {
  dataUrl: string;
}

export interface LocalGenerationResult extends ZaiOutboxImportResponse {}

export interface LocalGenerationResponse {
  id: string;
  createdAt: string;
  outboxPath: string;
  results: LocalGenerationResult[];
}

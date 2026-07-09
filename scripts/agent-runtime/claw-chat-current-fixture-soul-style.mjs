import {
  SOUL_STYLE_TRANSCRIPT_GOLDENS,
  SOUL_STYLE_TRANSCRIPT_SURFACES,
} from "./claw-chat-current-fixture-soul-style-transcript-golden.mjs";

export const DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID = "cheeky_sassy_executor";

export const SOUL_STYLE_FIXTURE_PROFILES = SOUL_STYLE_TRANSCRIPT_GOLDENS.map(
  ({ profileId, packId, tone }) => ({
    profileId,
    packId,
    tone,
  }),
);

export const SOUL_STYLE_FIXTURE_PROFILE_IDS =
  SOUL_STYLE_FIXTURE_PROFILES.map((profile) => profile.profileId);

const SOUL_STYLE_PROMPT_REQUIRED_MARKER_KEYS = [
  "hasInteractionSoul",
  "hasMemorySoulSchema",
  "hasSavedConfigSource",
  "hasProfileId",
  "hasStylePack",
  "hasResponseContract",
  "hasToolLifecycleSurfaceContracts",
  "hasAllowedStyleMoves",
  "hasForbiddenStyleMoves",
];

export function resolveSoulStyleFixtureProfile(profileId) {
  const normalizedProfileId = String(
    profileId || DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID,
  ).trim();
  const profile = SOUL_STYLE_FIXTURE_PROFILES.find(
    (candidate) => candidate.profileId === normalizedProfileId,
  );
  if (!profile) {
    throw new Error(
      `--soul-style-profile 只能是 ${SOUL_STYLE_FIXTURE_PROFILE_IDS.join("、")}`,
    );
  }
  return profile;
}

export function createSoulStyleFixtureSelection({
  profileId = DEFAULT_SOUL_STYLE_FIXTURE_PROFILE_ID,
} = {}) {
  const profile = resolveSoulStyleFixtureProfile(profileId);
  return {
    ...profile,
    source: "soul-style-transcript-golden",
  };
}

export function createSoulStyleFixtureOverrides(selection) {
  if (!selection) {
    return {};
  }
  return {
    soulStyleProfileId: selection.profileId,
  };
}

export function resolveSoulStyleTranscriptGoldenForPrompt(serialized) {
  const text = typeof serialized === "string" ? serialized : "";
  return SOUL_STYLE_TRANSCRIPT_GOLDENS.find((golden) =>
    text.includes(`Style profile: ${golden.profileId}`),
  );
}

export function buildSoulStyleFixtureAssistantText(serialized, doneText = "") {
  const golden = resolveSoulStyleTranscriptGoldenForPrompt(serialized);
  if (!golden) {
    return null;
  }
  return [
    golden.entries.before_tool,
    golden.entries.tool_running,
    golden.entries.after_tool_success,
    golden.entries.after_tool_partial_failure,
    golden.entries.after_tool_failure,
    golden.entries.body_detail,
    golden.entries.closing_suggestion,
    doneText,
  ]
    .filter(Boolean)
    .join("\n");
}

export function resolveSoulStyleFixtureExpectedTexts(selection) {
  const expected = createSoulStyleFixtureSelection(selection ?? {});
  const golden = SOUL_STYLE_TRANSCRIPT_GOLDENS.find(
    (candidate) => candidate.profileId === expected.profileId,
  );
  if (!golden) {
    throw new Error(`缺少 Soul transcript golden: ${expected.profileId}`);
  }
  return {
    summaryText: golden.entries.before_tool,
    requiredVisibleTexts: [
      golden.entries.after_tool_success,
      golden.entries.body_detail,
      golden.entries.closing_suggestion,
    ],
  };
}

export function summarizeSoulPromptMarkers(serialized, expectedSoulStyle) {
  const text = typeof serialized === "string" ? serialized : "";
  const expected = expectedSoulStyle
    ? createSoulStyleFixtureSelection(expectedSoulStyle)
    : null;
  return {
    expectedProfileId: expected?.profileId ?? null,
    expectedPackId: expected?.packId ?? null,
    hasInteractionSoul: text.includes("## Interaction Soul"),
    hasMemorySoulSchema: text.includes("memory_soul_prompt_context.v2"),
    hasSavedConfigSource: text.includes("saved app config `memory.soul`"),
    hasProfileId: expected
      ? text.includes(`Style profile: ${expected.profileId}`)
      : /Style profile:\s*\S/u.test(text),
    hasStylePack: expected
      ? text.includes(`Style pack: ${expected.packId}`)
      : /Style pack:\s*\S/u.test(text),
    hasResponseContract: text.includes("Response contract"),
    hasToolLifecycleSurfaceContracts: SOUL_STYLE_TRANSCRIPT_SURFACES.every(
      (surface) => text.includes(`${surface}:`),
    ),
    hasAllowedStyleMoves: text.includes("Allowed style moves"),
    hasForbiddenStyleMoves: text.includes("Forbidden style moves"),
  };
}

export function hasAnySoulStylePromptMarker(markers) {
  return SOUL_STYLE_PROMPT_REQUIRED_MARKER_KEYS.some(
    (key) => markers?.[key] === true,
  );
}

export function isSoulStylePromptContextCoveredByRuntime(markers) {
  return SOUL_STYLE_PROMPT_REQUIRED_MARKER_KEYS.every(
    (key) => markers?.[key] === true,
  );
}

export function pickLatestSoulStylePromptMarkers(textProviderRequests) {
  return textProviderRequests
    .map((request) => request.bodySummary?.soulMarkers)
    .filter(hasAnySoulStylePromptMarker)
    .at(-1);
}

export function buildSoulStyleScenarioAssertions({
  summary,
  guiTurnStartReachedBackend,
}) {
  const expected = createSoulStyleFixtureSelection(
    summary.soulStyleExpectation ?? {},
  );
  const expectedTexts = resolveSoulStyleFixtureExpectedTexts(expected);
  const markers = summary.soulStylePromptContextMarkers ?? {};
  const assistantText =
    summary.guiCompleted?.completionScope?.assistantText ??
    summary.guiCompleted?.completionScope?.text ??
    "";
  return {
    soulStyleConfigEnabled:
      summary.soulStyleConfig?.enabled === true &&
      summary.soulStyleConfig?.style_profile_id === expected.profileId,
    soulStylePromptReachedBackend: guiTurnStartReachedBackend === true,
    soulStyleRuntimeProviderReached:
      summary.textProviderFixtureServer?.requestCount >= 1,
    soulStylePromptContextCoveredByRuntime:
      summary.soulStylePromptContextCoveredByRuntime === true &&
      markers.expectedProfileId === expected.profileId &&
      markers.expectedPackId === expected.packId &&
      isSoulStylePromptContextCoveredByRuntime(markers),
    soulStyleReadModelCompleted:
      summary.readModelCompleted?.includesPrompt === true &&
      (summary.readModelCompleted?.includesAssistantDone === true ||
        summary.readModelCompleted?.includesAssistantSummary === true),
    soulStyleGuiCompleted:
      summary.guiCompleted?.hasPrompt === true &&
      (summary.guiCompleted?.hasAssistantSummary === true ||
        summary.guiCompleted?.hasDoneText === true) &&
      summary.guiCompleted?.stopButtonVisible === false,
    soulStyleTranscriptMatchesExpectedProfile:
      assistantText.includes(expectedTexts.summaryText) &&
      expectedTexts.requiredVisibleTexts.every((text) =>
        assistantText.includes(text),
      ),
  };
}

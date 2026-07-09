import {
  ASSISTANT_DONE_TEXT,
  NEWS_PROMPT,
} from "./claw-chat-current-fixture-constants.mjs";
import { waitForBackendLedgerTurnStart } from "./claw-chat-current-fixture-backend-ledger.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import { waitForGuiChatCompleted } from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import { waitForSessionReadCompleted } from "./claw-chat-current-fixture-read-model-waits.mjs";
import {
  decodeJsonRpcLines,
  evaluatePageSnapshot,
  readTraceMessages,
} from "./claw-chat-current-fixture-rpc.mjs";
import {
  sanitizeJson,
  sleep,
} from "./claw-chat-current-fixture-utils.mjs";

const DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG = Object.freeze({
  doneText: ASSISTANT_DONE_TEXT,
  prompt: NEWS_PROMPT,
  summaryText: "今日国际新闻简要整理",
});
const HOME_HOTPATH_MATCHERS = Object.freeze({
  doneText: DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.doneText,
  prompt: DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.prompt,
  summaryText: DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.summaryText,
});
const HOME_HOTPATH_BLOCKED_PRE_TURN_METHODS = Object.freeze([
  "sessionFile/getOrCreate",
  "sessionFile/updateMeta",
  "sessionFile/list",
  "workspaceRightSurface/pending/list",
  "modelPreferences/list",
  "modelSyncState/read",
]);
const HOME_HOTPATH_OBSERVED_PRE_TURN_METHODS = Object.freeze([
  ...HOME_HOTPATH_BLOCKED_PRE_TURN_METHODS,
  "projectGit/status",
]);
const HOME_HOTPATH_SUBMIT_FRAME_SAMPLES_KEY =
  "__LIME_HOME_HOTPATH_SUBMIT_FRAME_SAMPLES__";
const HOME_HOTPATH_SUBMIT_FRAME_DONE_KEY =
  "__LIME_HOME_HOTPATH_SUBMIT_FRAME_DONE__";

function normalizeHomeHotpathScenarioConfig(config = {}) {
  return {
    doneText:
      typeof config.doneText === "string" && config.doneText.trim()
        ? config.doneText
        : DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.doneText,
    prompt:
      typeof config.prompt === "string" && config.prompt.trim()
        ? config.prompt
        : DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.prompt,
    summaryText:
      typeof config.summaryText === "string" && config.summaryText.trim()
        ? config.summaryText
        : DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.summaryText,
  };
}

function readHomeHotpathSnapshot(matchers = {}) {
  const prompt = typeof matchers?.prompt === "string" ? matchers.prompt : "";
  const doneText =
    typeof matchers?.doneText === "string" ? matchers.doneText : "";
  const summaryText =
    typeof matchers?.summaryText === "string" ? matchers.summaryText : "";
  const bodyText = document.body?.innerText || "";
  const mainText = document.querySelector("main")?.innerText || bodyText;
  const textarea = document.querySelector('textarea[name="agent-chat-message"]');
  const textareaRect = textarea?.getBoundingClientRect();
  const textareaStyle = textarea ? window.getComputedStyle(textarea) : null;
  const textareaVisible = Boolean(
    textarea &&
      textareaRect &&
      textareaRect.width > 16 &&
      textareaRect.height > 16 &&
      textareaStyle?.visibility !== "hidden" &&
      textareaStyle?.display !== "none",
  );
  const assistantMessages = Array.from(
    document.querySelectorAll('[data-message-role="assistant"]'),
  ).map((node) => {
    const element = node instanceof HTMLElement ? node : null;
    return {
      id: element?.dataset.messageId || element?.id || null,
      runtimeTurnId: element?.dataset.runtimeTurnId || null,
      text: element?.innerText || element?.textContent || "",
    };
  });
  const userMessages = Array.from(
    document.querySelectorAll('[data-message-role="user"]'),
  );
  const lastAssistant = assistantMessages[assistantMessages.length - 1] ?? null;
  return {
    url: window.location.href,
    hasEmptyStateFirstScreen: Boolean(
      document.querySelector('[data-testid="empty-state-first-screen"]'),
    ),
    hasConnectedComposer: Boolean(
      document.querySelector('[data-testid="inputbar-connected-composer"]'),
    ),
    hasMessageTurnGroup: Boolean(
      document.querySelector('[data-testid="message-turn-group"]'),
    ),
    hasMessageList: Boolean(
      document.querySelector('[data-testid="message-list"]') ||
        document.querySelector('[data-testid="message-list-frame"]'),
    ),
    textareaVisible,
    textareaDisabled:
      textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
    textareaSessionId:
      textarea instanceof HTMLTextAreaElement
        ? textarea.dataset.sessionId || null
        : null,
    textareaValue:
      textarea instanceof HTMLTextAreaElement ? textarea.value : null,
    promptInBody: prompt ? bodyText.includes(prompt) : false,
    promptVisibleInTextarea:
      textarea instanceof HTMLTextAreaElement && prompt
        ? textarea.value === prompt
        : false,
    doneInBody: doneText ? bodyText.includes(doneText) : false,
    summaryInBody: summaryText ? bodyText.includes(summaryText) : false,
    finalTextInBody:
      (doneText ? bodyText.includes(doneText) : false) ||
      (summaryText ? bodyText.includes(summaryText) : false),
    assistantMessageCount: assistantMessages.length,
    userMessageCount: userMessages.length,
    lastAssistantMessageId: lastAssistant?.id ?? null,
    lastAssistantRuntimeTurnId: lastAssistant?.runtimeTurnId ?? null,
    lastAssistantTextLength: lastAssistant?.text.length ?? 0,
    hasEmptyConversationText:
      bodyText.includes("当前对话还没有消息") ||
      bodyText.includes("目前没有消息") ||
      bodyText.includes("No messages yet"),
    hasNoAvailableModelText:
      bodyText.includes("没有可选模型") ||
      bodyText.includes("沒有可選模型") ||
      bodyText.includes("No available model"),
    hasTaskCenterHomeText:
      mainText.includes("青柠一下，灵感即来") ||
      mainText.includes("你可以从这些任务开始") ||
      mainText.includes("向下滑，看看 Lime 可以帮你做什么"),
    bodyText,
    mainText,
  };
}

async function waitForHomeHotpathReady(page, options, matchers) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      readHomeHotpathSnapshot,
      matchers,
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasEmptyStateFirstScreen &&
      snapshot.hasConnectedComposer &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      !snapshot.hasNoAvailableModelText
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `首页首发输入区未就绪: ${JSON.stringify(sanitizeJson(lastSnapshot))}`,
  );
}

async function openNewConversationHome(page, options, matchers) {
  const button = page.locator(
    '[data-testid="app-sidebar-new-conversation-button"]',
  );
  await button.waitFor({
    state: "visible",
    timeout: Math.min(options.timeoutMs, 10_000),
  });
  const before = await evaluatePageSnapshot(
    page,
    readHomeHotpathSnapshot,
    matchers,
  );
  await button.click();
  const after = await waitForHomeHotpathReady(page, options, matchers);
  return sanitizeJson({ before, after });
}

async function sampleHomeHotpathProjection(page, matchers) {
  return sanitizeJson(
    await evaluatePageSnapshot(
      page,
      readHomeHotpathSnapshot,
      matchers,
    ),
  );
}

function summarizeHomeHotpathStabilitySample(snapshot, startedAt, index) {
  return sanitizeJson({
    index,
    elapsedMs: Date.now() - startedAt,
    url: snapshot?.url ?? null,
    textareaVisible: snapshot?.textareaVisible ?? null,
    textareaDisabled: snapshot?.textareaDisabled ?? null,
    textareaSessionId: snapshot?.textareaSessionId ?? null,
    textareaValue: snapshot?.textareaValue ?? null,
    promptVisibleInTextarea: snapshot?.promptVisibleInTextarea === true,
    promptInBody: snapshot?.promptInBody === true,
    doneInBody: snapshot?.doneInBody === true,
    summaryInBody: snapshot?.summaryInBody === true,
    finalTextInBody: snapshot?.finalTextInBody === true,
    assistantMessageCount: snapshot?.assistantMessageCount ?? null,
    userMessageCount: snapshot?.userMessageCount ?? null,
    lastAssistantMessageId: snapshot?.lastAssistantMessageId ?? null,
    lastAssistantRuntimeTurnId: snapshot?.lastAssistantRuntimeTurnId ?? null,
    lastAssistantTextLength: snapshot?.lastAssistantTextLength ?? null,
    hasEmptyStateFirstScreen: snapshot?.hasEmptyStateFirstScreen === true,
    hasConnectedComposer: snapshot?.hasConnectedComposer === true,
    hasMessageTurnGroup: snapshot?.hasMessageTurnGroup === true,
    hasMessageList: snapshot?.hasMessageList === true,
    hasTaskCenterHomeText: snapshot?.hasTaskCenterHomeText === true,
    hasEmptyConversationText: snapshot?.hasEmptyConversationText === true,
    hasNoAvailableModelText: snapshot?.hasNoAvailableModelText === true,
  });
}

function analyzeHomeHotpathStabilitySamples(samples) {
  const unstableSamples = samples.filter(
    (sample) =>
      sample.hasTaskCenterHomeText ||
      sample.hasEmptyConversationText ||
      sample.hasNoAvailableModelText,
  );
  return sanitizeJson({
    stable: samples.length > 0 && unstableSamples.length === 0,
    sampleCount: samples.length,
    unstableCount: unstableSamples.length,
    observedTextareaSessionIds: Array.from(
      new Set(
        samples
          .map((sample) => sample.textareaSessionId)
          .filter((value) => typeof value === "string" && value.trim()),
      ),
    ),
    firstUnstableSamples: unstableSamples.slice(0, 8),
  });
}

function analyzeHomeHotpathAfterFillStabilitySamples(samples) {
  const unstableSamples = samples.filter(
    (sample) =>
      sample.hasEmptyStateFirstScreen !== true ||
      sample.hasConnectedComposer !== true ||
      sample.textareaVisible !== true ||
      sample.textareaDisabled !== false ||
      sample.promptVisibleInTextarea !== true ||
      sample.hasEmptyConversationText ||
      sample.hasNoAvailableModelText,
  );
  return sanitizeJson({
    stable: samples.length > 0 && unstableSamples.length === 0,
    sampleCount: samples.length,
    unstableCount: unstableSamples.length,
    firstUnstableSamples: unstableSamples.slice(0, 8),
  });
}

function analyzeHomeHotpathPostCompletionStabilitySamples(samples) {
  const unstableSamples = samples.filter(
    (sample) =>
      sample.hasTaskCenterHomeText ||
      sample.hasEmptyConversationText ||
      sample.hasNoAvailableModelText ||
      sample.promptInBody !== true ||
      sample.finalTextInBody !== true ||
      sample.hasMessageList !== true ||
      sample.hasMessageTurnGroup !== true,
  );
  return sanitizeJson({
    stable: samples.length > 0 && unstableSamples.length === 0,
    sampleCount: samples.length,
    unstableCount: unstableSamples.length,
    observedTextareaSessionIds: Array.from(
      new Set(
        samples
          .map((sample) => sample.textareaSessionId)
          .filter((value) => typeof value === "string" && value.trim()),
      ),
    ),
    observedAssistantMessageIds: Array.from(
      new Set(
        samples
          .map((sample) => sample.lastAssistantMessageId)
          .filter((value) => typeof value === "string" && value.trim()),
      ),
    ),
    observedAssistantRuntimeTurnIds: Array.from(
      new Set(
        samples
          .map((sample) => sample.lastAssistantRuntimeTurnId)
          .filter((value) => typeof value === "string" && value.trim()),
      ),
    ),
    firstUnstableSamples: unstableSamples.slice(0, 8),
  });
}

async function installHomeHotpathSubmitFrameSampler(
  page,
  matchers,
  durationMs,
) {
  await page.evaluate(
    ({ doneKey, key, matchers: samplerMatchers, sampleDurationMs }) => {
      const readSnapshot = () => {
        const prompt =
          typeof samplerMatchers?.prompt === "string"
            ? samplerMatchers.prompt
            : "";
        const doneText =
          typeof samplerMatchers?.doneText === "string"
            ? samplerMatchers.doneText
            : "";
        const summaryText =
          typeof samplerMatchers?.summaryText === "string"
            ? samplerMatchers.summaryText
            : "";
        const bodyText = document.body?.innerText || "";
        const mainText = document.querySelector("main")?.innerText || bodyText;
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
        );
        const assistantMessages = Array.from(
          document.querySelectorAll('[data-message-role="assistant"]'),
        );
        const userMessages = Array.from(
          document.querySelectorAll('[data-message-role="user"]'),
        );

        return {
          url: window.location.href,
          hasEmptyStateFirstScreen: Boolean(
            document.querySelector('[data-testid="empty-state-first-screen"]'),
          ),
          hasConnectedComposer: Boolean(
            document.querySelector(
              '[data-testid="inputbar-connected-composer"]',
            ),
          ),
          hasMessageTurnGroup: Boolean(
            document.querySelector('[data-testid="message-turn-group"]'),
          ),
          hasMessageList: Boolean(
            document.querySelector('[data-testid="message-list"]') ||
              document.querySelector('[data-testid="message-list-frame"]'),
          ),
          textareaSessionId:
            textarea instanceof HTMLTextAreaElement
              ? textarea.dataset.sessionId || null
              : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          promptInBody: prompt ? bodyText.includes(prompt) : false,
          promptVisibleInTextarea:
            textarea instanceof HTMLTextAreaElement && prompt
              ? textarea.value === prompt
              : false,
          finalTextInBody:
            (doneText ? bodyText.includes(doneText) : false) ||
            (summaryText ? bodyText.includes(summaryText) : false),
          assistantMessageCount: assistantMessages.length,
          userMessageCount: userMessages.length,
          hasEmptyConversationText:
            bodyText.includes("当前对话还没有消息") ||
            bodyText.includes("目前没有消息") ||
            bodyText.includes("No messages yet"),
          hasNoAvailableModelText:
            bodyText.includes("没有可选模型") ||
            bodyText.includes("沒有可選模型") ||
            bodyText.includes("No available model"),
          hasTaskCenterHomeText:
            mainText.includes("青柠一下，灵感即来") ||
            mainText.includes("你可以从这些任务开始") ||
            mainText.includes("向下滑，看看 Lime 可以帮你做什么"),
        };
      };

      const startSampler = () => {
        const startedAt = performance.now();
        window[key] = [];
        window[doneKey] = false;
        const sample = () => {
          const snapshot = readSnapshot();
          window[key].push({
            ...snapshot,
            elapsedMs: Math.round(performance.now() - startedAt),
            index: window[key].length,
          });
          if (performance.now() - startedAt < sampleDurationMs) {
            window.requestAnimationFrame(sample);
            return;
          }
          window[doneKey] = true;
        };
        window.requestAnimationFrame(sample);
      };

      window[key] = [];
      window[doneKey] = false;
      startSampler();
    },
    {
      doneKey: HOME_HOTPATH_SUBMIT_FRAME_DONE_KEY,
      key: HOME_HOTPATH_SUBMIT_FRAME_SAMPLES_KEY,
      matchers,
      sampleDurationMs: durationMs,
    },
  );
}

async function readHomeHotpathSubmitFrameSamples(page, options) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 4_000)) {
    const state = await page.evaluate(
      ({ doneKey, key }) => ({
        done: window[doneKey] === true,
        samples: Array.isArray(window[key]) ? window[key] : [],
      }),
      {
        doneKey: HOME_HOTPATH_SUBMIT_FRAME_DONE_KEY,
        key: HOME_HOTPATH_SUBMIT_FRAME_SAMPLES_KEY,
      },
    );
    if (state.done || state.samples.length >= 90) {
      return sanitizeJson(state.samples);
    }
    await sleep(Math.max(25, Math.min(options.intervalMs, 50)));
  }

  return sanitizeJson(
    await page.evaluate(
      (key) => (Array.isArray(window[key]) ? window[key] : []),
      HOME_HOTPATH_SUBMIT_FRAME_SAMPLES_KEY,
    ),
  );
}

function analyzeHomeHotpathSubmitToConversationSamples(samples) {
  const unstableSamples = samples.filter(
    (sample) =>
      sample.hasTaskCenterHomeText ||
      sample.hasEmptyConversationText ||
      sample.hasNoAvailableModelText ||
      sample.hasEmptyStateFirstScreen ||
      sample.promptInBody !== true ||
      sample.hasMessageList !== true,
  );
  return sanitizeJson({
    stable: samples.length > 0 && unstableSamples.length === 0,
    sampleCount: samples.length,
    unstableCount: unstableSamples.length,
    firstUnstableSamples: unstableSamples.slice(0, 8),
    observedTextareaSessionIds: Array.from(
      new Set(
        samples
          .map((sample) => sample.textareaSessionId)
          .filter((value) => typeof value === "string" && value.trim()),
      ),
    ),
  });
}

async function collectHomeHotpathFixedWindowSamples(
  page,
  options,
  matchers,
  durationMs,
) {
  const startedAt = Date.now();
  const samples = [];
  const intervalMs = Math.max(50, Math.min(options.intervalMs, 100));
  const timeoutMs = Math.max(intervalMs, durationMs);
  while (Date.now() - startedAt < timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      readHomeHotpathSnapshot,
      matchers,
    );
    if (snapshot) {
      samples.push(
        summarizeHomeHotpathStabilitySample(
          snapshot,
          startedAt,
          samples.length,
        ),
      );
    }
    if (samples.length >= 80) {
      break;
    }
    await sleep(intervalMs);
  }
  return samples;
}

async function collectHomeHotpathStabilitySamples(
  page,
  options,
  matchers,
  shouldStop,
) {
  const startedAt = Date.now();
  const samples = [];
  const intervalMs = Math.max(50, Math.min(options.intervalMs, 100));
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      readHomeHotpathSnapshot,
      matchers,
    );
    if (snapshot) {
      samples.push(
        summarizeHomeHotpathStabilitySample(
          snapshot,
          startedAt,
          samples.length,
        ),
      );
    }
    if (shouldStop() && samples.length > 0) {
      break;
    }
    if (samples.length >= 300) {
      break;
    }
    await sleep(intervalMs);
  }
  return analyzeHomeHotpathStabilitySamples(samples);
}

function timestampToMs(timestamp) {
  if (typeof timestamp === "number" && Number.isFinite(timestamp)) {
    return timestamp;
  }
  if (typeof timestamp !== "string" || !timestamp.trim()) {
    return null;
  }
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? parsed : null;
}

function traceEntryStartMs(entry) {
  const endMs = timestampToMs(entry?.timestamp);
  if (endMs === null) {
    return null;
  }
  const durationMs =
    typeof entry?.duration_ms === "number" && Number.isFinite(entry.duration_ms)
      ? Math.max(0, entry.duration_ms)
      : 0;
  return endMs - durationMs;
}

async function collectHomeHotpathPreTurnTrace(page, inputSend, prompt) {
  const traceRaw = await page.evaluate(() =>
    window.localStorage.getItem("lime_invoke_trace_buffer_v1"),
  );
  const traceMessages = readTraceMessages(traceRaw);
  const clickMs = timestampToMs(inputSend?.clicked?.clickedAt);
  const decodedRequests = traceMessages
    .filter((entry) => entry?.command === "app_server_handle_json_lines")
    .flatMap((entry) => {
      const startMs = traceEntryStartMs(entry);
      const endMs = timestampToMs(entry?.timestamp);
      const methods = decodeJsonRpcLines(
        entry?.args_preview?.request?.lines,
      ).map((message) => ({
        method: message?.method ?? null,
        inputText:
          message?.params?.input?.text ??
          message?.params?.input?.content ??
          message?.params?.inputText ??
          null,
      }));
      return methods
        .filter((request) => request.method)
        .map((request) => ({
          ...request,
          timestamp: entry?.timestamp ?? null,
          startMs,
          endMs,
          durationMs: entry?.duration_ms ?? null,
          status: entry?.status ?? null,
          transport: entry?.transport ?? null,
        }));
    });
  const turnStartRequest = decodedRequests.find(
    (request) =>
      request.method === "agentSession/turn/start" &&
      String(request.inputText || "").includes(prompt),
  );
  const turnStartMs = turnStartRequest?.startMs ?? null;
  const preTurnRequests =
    clickMs === null || turnStartMs === null
      ? []
      : decodedRequests.filter(
          (request) =>
            typeof request.startMs === "number" &&
            request.startMs >= clickMs &&
            request.startMs < turnStartMs,
        );
  const observedMethodSet = new Set(HOME_HOTPATH_OBSERVED_PRE_TURN_METHODS);
  const blockedMethodSet = new Set(HOME_HOTPATH_BLOCKED_PRE_TURN_METHODS);
  const observedAuxiliaryRequests = preTurnRequests.filter((request) =>
    observedMethodSet.has(request.method),
  );
  const blockedAuxiliaryRequests = preTurnRequests.filter((request) =>
    blockedMethodSet.has(request.method),
  );

  return sanitizeJson({
    clickAt: inputSend?.clicked?.clickedAt ?? null,
    clickMs,
    turnStartAt: turnStartRequest?.timestamp ?? null,
    turnStartMs,
    traceRequestCount: decodedRequests.length,
    methodsBeforeTurnStart: Array.from(
      new Set(preTurnRequests.map((request) => request.method).filter(Boolean)),
    ),
    observedAuxiliaryMethodsBeforeTurnStart: Array.from(
      new Set(
        observedAuxiliaryRequests
          .map((request) => request.method)
          .filter(Boolean),
      ),
    ),
    blockedAuxiliaryMethodsBeforeTurnStart: Array.from(
      new Set(
        blockedAuxiliaryRequests
          .map((request) => request.method)
          .filter(Boolean),
      ),
    ),
    blockedAuxiliaryRequestsBeforeTurnStart: blockedAuxiliaryRequests.map(
      (request) => ({
        method: request.method,
        timestamp: request.timestamp,
        durationMs: request.durationMs,
        status: request.status,
        transport: request.transport,
      }),
    ),
  });
}

export async function runHomeHotpathScenario({
  page,
  options,
  appServerRequests,
  runtimeEnv,
  scenarioConfig,
}) {
  const config = normalizeHomeHotpathScenarioConfig(scenarioConfig);
  const matchers =
    config.prompt === DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.prompt &&
    config.doneText === DEFAULT_HOME_HOTPATH_SCENARIO_CONFIG.doneText
      ? HOME_HOTPATH_MATCHERS
      : {
          doneText: config.doneText,
          prompt: config.prompt,
          summaryText: config.summaryText,
        };

  await page.evaluate(() => {
    window.__LIME_AGENTUI_PERF__?.clear?.();
    window.localStorage.removeItem("lime_invoke_error_buffer_v1");
    window.localStorage.removeItem("lime_invoke_trace_buffer_v1");
  });

  const homeOpened = await openNewConversationHome(page, options, matchers);
  let submitFrameSamplerInstalled = false;
  const inputSend = sanitizeJson(
    await sendPromptFromGui(page, options, config.prompt, {
      allowTaskCenterHomeInput: true,
      requireTurnStart: true,
      afterClick: async () => {
        submitFrameSamplerInstalled = true;
        await installHomeHotpathSubmitFrameSampler(page, matchers, 1600);
      },
      collectAfterFillStability: async () => {
        const samples = await collectHomeHotpathFixedWindowSamples(
          page,
          options,
          matchers,
          450,
        );
        return analyzeHomeHotpathAfterFillStabilitySamples(samples);
      },
    }),
  );
  const submitToConversationFrameSamples = submitFrameSamplerInstalled
    ? await readHomeHotpathSubmitFrameSamples(page, options)
    : [];
  const submitToConversationStability =
    analyzeHomeHotpathSubmitToConversationSamples(
      submitToConversationFrameSamples,
    );
  const postSubmitProjection = await sampleHomeHotpathProjection(
    page,
    matchers,
  );
  let stabilitySamplingDone = false;
  const stabilitySamplesPromise = collectHomeHotpathStabilitySamples(
    page,
    options,
    matchers,
    () => stabilitySamplingDone,
  );
  const backendTurnStart = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    config.prompt,
    options,
  );
  const sessionId = backendTurnStart.entry.sessionId ?? null;
  let guiCompletedRaw = null;
  try {
    guiCompletedRaw = await waitForGuiChatCompleted(page, options, {
      prompt: config.prompt,
      doneText: config.doneText,
      summaryText: config.summaryText,
    });
  } finally {
    stabilitySamplingDone = true;
  }
  const guiCompleted = sanitizeJson(guiCompletedRaw);
  const readModelCompleted = sessionId
    ? await waitForSessionReadCompleted(page, options, appServerRequests, {
        sessionId,
        prompt: config.prompt,
        doneText: config.doneText,
        summaryText: config.summaryText,
      })
    : null;
  const stability = await stabilitySamplesPromise;
  const completedProjection = await sampleHomeHotpathProjection(page, matchers);
  const postCompletionStability =
    analyzeHomeHotpathPostCompletionStabilitySamples(
      await collectHomeHotpathFixedWindowSamples(
        page,
        options,
        matchers,
        1500,
      ),
    );
  const preTurnTrace = await collectHomeHotpathPreTurnTrace(
    page,
    inputSend,
    config.prompt,
  );

  return sanitizeJson({
    prompt: config.prompt,
    doneText: config.doneText,
    summaryText: config.summaryText,
    homeOpened,
    inputSend,
    submitToConversationStability,
    postSubmitProjection,
    backendTurnStart: {
      sessionId,
      turnId: backendTurnStart.entry.turnId ?? null,
      providerPreference: backendTurnStart.entry.providerPreference ?? null,
      modelPreference: backendTurnStart.entry.modelPreference ?? null,
      ledgerCount: backendTurnStart.ledger.length,
    },
    guiCompleted,
    stability,
    postCompletionStability,
    preTurnTrace,
    readModelCompleted: {
      available: Boolean(readModelCompleted),
      includesPrompt: JSON.stringify(readModelCompleted || {}).includes(
        config.prompt,
      ),
      includesDone:
        JSON.stringify(readModelCompleted || {}).includes(config.doneText) ||
        JSON.stringify(readModelCompleted || {}).includes(config.summaryText),
      latestTurnStatus:
        readModelCompleted?.detail?.thread_read?.runtime_summary
          ?.latestTurnStatus ??
        readModelCompleted?.detail?.thread_read?.status ??
        readModelCompleted?.detail?.status ??
        null,
    },
    completedProjection,
  });
}

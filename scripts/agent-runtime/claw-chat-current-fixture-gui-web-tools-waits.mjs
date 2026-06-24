import {
  PLAN_STEPS,
  WEB_TOOLS_FETCH_MARKDOWN,
  WEB_TOOLS_MID_THINKING_TEXT,
  WEB_TOOLS_RENDERING_DONE_TEXT,
  WEB_TOOLS_RENDERING_PROMPT,
  WEB_TOOLS_SEARCH_SOURCE_LABEL,
  WEB_TOOLS_SEARCH_TITLE,
  WEB_TOOLS_SEARCH_URL,
} from "./claw-chat-current-fixture-constants.mjs";
import { evaluatePageSnapshot } from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

const WEB_PROCESS_COMPLETED_TITLE = "已搜索网页 1 次，读取网页 1 次";
const WEB_PROCESS_RUNNING_TITLE = "正在搜索网页 1 次，读取网页 1 次";
const WEB_TOOLS_INTRO_TEXT = "我先联网核实目标页面来源。";
const WEB_TOOLS_FINAL_SUMMARY = "网页搜索渲染结论";
const WEB_TOOLS_MARKDOWN_HEADING = "五年级选购指南";

function webToolsSnapshotFromDom({
  prompt,
  doneText,
  searchTitle,
  searchUrl,
  searchSourceLabel,
  midThinkingText,
  fetchMarkdown,
  completedTitle,
  runningTitle,
  introText,
  finalSummary,
  markdownHeadingText,
  planSteps,
}) {
  const text = document.body?.innerText || "";
  const textarea = document.querySelector(
    'textarea[name="agent-chat-message"]',
  );
  const rect = textarea?.getBoundingClientRect();
  const style = textarea ? window.getComputedStyle(textarea) : null;
  const textareaVisible = Boolean(
    textarea &&
      rect &&
      rect.width > 16 &&
      rect.height > 16 &&
      style?.visibility !== "hidden" &&
      style?.display !== "none",
  );
  const buttons = Array.from(document.querySelectorAll("button")).map(
    (button) => ({
      title: button.getAttribute("title") || "",
      text: button.textContent || "",
      aria: button.getAttribute("aria-label") || "",
      disabled: button.disabled,
    }),
  );
  const stopButtonVisible = buttons.some((button) => {
    const label = [button.title, button.text, button.aria].join("\n");
    return (
      !button.disabled &&
      (label.includes("停止") ||
        label.includes("终止") ||
        /\bStop\b/i.test(label))
    );
  });
  const processGroups = Array.from(
    document.querySelectorAll('[data-testid="streaming-process-group"]'),
  ).map((group) => {
    const button = group.querySelector("button");
    return {
      text: group.textContent || "",
      buttonText: button?.textContent || "",
      expanded: button?.getAttribute("aria-expanded") || "",
      processKind: group.getAttribute("data-process-kind") || "",
      processRunning: group.getAttribute("data-process-running") || "",
    };
  });
  const webProcessGroup = processGroups.find(
    (group) =>
      group.buttonText.includes(completedTitle) ||
      group.buttonText.includes(runningTitle) ||
      group.text.includes(completedTitle) ||
      group.text.includes(runningTitle),
  );
  const processText = webProcessGroup?.text || "";
  const promptIndex = text.indexOf(prompt);
  const introIndex = text.indexOf(introText);
  const runningProcessIndex = text.indexOf(runningTitle);
  const completedProcessIndex = text.indexOf(completedTitle);
  const processIndex =
    completedProcessIndex >= 0 ? completedProcessIndex : runningProcessIndex;
  const finalIndex = text.indexOf(finalSummary);
  const sourceIndex = text.indexOf(searchTitle);
  const midThinkingIndex = text.indexOf(midThinkingText);
  const fetchPageIndex = text.indexOf(
    searchSourceLabel,
    Math.max(midThinkingIndex, 0),
  );
  const markdownHeading = Array.from(
    document.querySelectorAll("h1,h2,h3,h4,h5,h6"),
  ).find((node) => node.textContent?.includes(markdownHeadingText));
  const markdownStrongTexts = Array.from(
    document.querySelectorAll("strong"),
  ).map((node) => node.textContent || "");
  const markdownTableVisible = Boolean(
    document.querySelector('[data-testid="markdown-table-scroll"] table'),
  );
  const forbiddenTransportFragments = [
    '"bytes"',
    '"codeText"',
    '"result"',
    '"results"',
    '"snippet"',
    '"toolCallId"',
    '"tool_call_id"',
    '"outputPreview"',
    '"metadata"',
    '"success"',
    "bytes:",
    "codeText:",
    "outputPreview:",
    "toolCallId:",
    "tool_call_id:",
    "2048",
    "{ bytes",
    "{bytes",
  ];
  const forbiddenSearchNoiseFragments = [
    "Help",
    "Sign In",
    "Yahoo Scout",
    "https://help.yahoo.com/kb/search-for-desktop",
    "https://login.yahoo.com/",
    "https://scout.yahoo.com/chat",
  ];
  const forbiddenRawMarkdownFragments = [
    "五年级选购指南###",
    "####如果孩子基础",
    "**推荐 型号 **",
    "**理由 **",
    "| 品牌 | 型号 |",
  ];
  const processGroupExcludesFinalMarkdown =
    !processText.includes(finalSummary) &&
    !processText.includes(markdownHeadingText) &&
    !processText.includes("推荐 型号") &&
    !processText.includes("| 品牌 | 型号 |");
  const messageBubbles = Array.from(
    document.querySelectorAll("[data-message-role]"),
  ).map((bubble, index) => ({
    index,
    role: bubble.getAttribute("data-message-role") || "",
    messageContentPartTypes:
      bubble.getAttribute("data-message-content-part-types") || "",
    rendererContentPartTypes:
      bubble.getAttribute("data-renderer-content-part-types") || "",
    timelineItems: bubble.getAttribute("data-timeline-items") || "",
    text: bubble.textContent || "",
  }));
  const latestAssistantBubble = messageBubbles
    .filter((bubble) => bubble.role === "assistant")
    .at(-1);
  const normalizeContentPartTypes = (value) =>
    String(value || "")
      .split(/[\s,|>]+/)
      .map((part) => part.trim())
      .filter(Boolean);
  const latestAssistantRendererPartTypes = normalizeContentPartTypes(
    latestAssistantBubble?.rendererContentPartTypes,
  );
  const isProcessContentPartSignature = (part) =>
    part === "tool_use" ||
    part.startsWith("tool:") ||
    part === "thinking" ||
    part.startsWith("thinking#") ||
    part === "action_required" ||
    part === "file_changes_batch";
  const isTextContentPartSignature = (part) =>
    part === "text" || part.startsWith("text#");
  const latestAssistantTextAfterProcessPart = (() => {
    const firstProcessIndex = latestAssistantRendererPartTypes.findIndex(
      isProcessContentPartSignature,
    );
    if (firstProcessIndex < 0) {
      return false;
    }
    return latestAssistantRendererPartTypes
      .slice(firstProcessIndex + 1)
      .some(isTextContentPartSignature);
  })();
  const taskRailText =
    document
      .querySelector('[data-testid="task-center-run-control-surface"]')
      ?.textContent ||
    document.querySelector('[data-testid="task-center-task-rail"]')
      ?.textContent ||
    "";
  const planDecisionPanel = document.querySelector(
    '[data-testid="plan-composer-decision-panel"][data-layout="composer-drawer"]',
  );
  const planDecisionRect = planDecisionPanel?.getBoundingClientRect();
  const planDecisionStyle = planDecisionPanel
    ? window.getComputedStyle(planDecisionPanel)
    : null;
  const planDecisionVisible = Boolean(
    planDecisionPanel &&
      planDecisionRect &&
      planDecisionRect.width > 320 &&
      planDecisionRect.height > 48 &&
      planDecisionStyle?.visibility !== "hidden" &&
      planDecisionStyle?.display !== "none",
  );

  return {
    url: window.location.href,
    hasPrompt: text.includes(prompt),
    hasIntroText: text.includes(introText),
    hasAssistantSummary: text.includes(finalSummary),
    hasDoneText: text.includes(doneText),
    hasProcessTitle: text.includes(completedTitle) || text.includes(runningTitle),
    hasCompletedProcessTitle: text.includes(completedTitle),
    hasRunningProcessTitle: text.includes(runningTitle),
    hasSearchSourceSection: Boolean(
      webProcessGroup?.text.includes("搜索来源") ||
        webProcessGroup?.text.includes("Search sources"),
    ),
    hasFetchPageSection: Boolean(
      webProcessGroup?.text.includes("读取页面") ||
        webProcessGroup?.text.includes("Read pages"),
    ),
    hasSearchTitle: text.includes(searchTitle),
    hasMidThinkingText: text.includes(midThinkingText),
    hasSearchUrl: text.includes(searchUrl),
    hasSearchSourceLabel: text.includes(searchSourceLabel),
    hasFullSearchUrlVisible: text.includes(searchUrl),
    hasFetchMarkdownHidden: !text.includes(fetchMarkdown),
    hasFetchPageUrl: Boolean(webProcessGroup?.text.includes(searchSourceLabel)),
    hasIntroBeforeProcess: introIndex >= 0 && processIndex > introIndex,
    hasProcessAfterPrompt: promptIndex >= 0 && processIndex > promptIndex,
    hasFinalTextAfterProcess:
      promptIndex >= 0 &&
      processIndex > promptIndex &&
      (sourceIndex < 0 || sourceIndex > processIndex) &&
      finalIndex > processIndex,
    hasTimelineOrderPreserved:
      processIndex >= 0 &&
      sourceIndex > processIndex &&
      midThinkingIndex > sourceIndex &&
      fetchPageIndex > midThinkingIndex &&
      (finalIndex < 0 || finalIndex > fetchPageIndex),
    webProcessGroupExpanded: webProcessGroup?.expanded === "true",
    webProcessGroupRunning: webProcessGroup?.processRunning === "yes",
    webProcessGroupKind: webProcessGroup?.processKind || "",
    webProcessGroupText: processText,
    latestAssistantMessageContentPartTypes:
      latestAssistantBubble?.messageContentPartTypes || "",
    latestAssistantRendererContentPartTypes:
      latestAssistantBubble?.rendererContentPartTypes || "",
    latestAssistantTextAfterProcessPart,
    runningProcessHasLegacyTextAfterProcess:
      Boolean(webProcessGroup?.processRunning === "yes") &&
      latestAssistantTextAfterProcessPart &&
      !text.includes(finalSummary),
    processGroupExcludesFinalMarkdown,
    processGroupCount: processGroups.length,
    rawJsonEnvelopeVisible: forbiddenTransportFragments.some((value) =>
      text.includes(value),
    ),
    forbiddenTransportHits: forbiddenTransportFragments.filter((value) =>
      text.includes(value),
    ),
    searchNoiseVisible: forbiddenSearchNoiseFragments.some((value) =>
      text.includes(value),
    ),
    forbiddenSearchNoiseHits: forbiddenSearchNoiseFragments.filter((value) =>
      text.includes(value),
    ),
    rawMarkdownVisible: forbiddenRawMarkdownFragments.some((value) =>
      text.includes(value),
    ),
    forbiddenRawMarkdownHits: forbiddenRawMarkdownFragments.filter((value) =>
      text.includes(value),
    ),
    markdownHeadingVisible: Boolean(markdownHeading),
    markdownStrongVisible:
      markdownStrongTexts.includes("推荐 型号") &&
      markdownStrongTexts.includes("理由"),
    markdownTableVisible,
    hasPlanSection: taskRailText.includes("计划"),
    hasAllPlanSteps: planSteps.every((step) => taskRailText.includes(step.step)),
    planDecisionVisible,
    textareaVisible,
    textareaDisabled:
      textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
    textareaValue:
      textarea instanceof HTMLTextAreaElement ? textarea.value : null,
    stopButtonVisible,
    hasMessageList: Boolean(
      document.querySelector('[data-testid="message-list"]') ||
        document.querySelector('[data-testid="message-list-frame"]'),
    ),
    bodyText: text,
  };
}

async function evaluateWebToolsSnapshot(page) {
  return await evaluatePageSnapshot(page, webToolsSnapshotFromDom, {
    prompt: WEB_TOOLS_RENDERING_PROMPT,
    doneText: WEB_TOOLS_RENDERING_DONE_TEXT,
    searchTitle: WEB_TOOLS_SEARCH_TITLE,
    searchUrl: WEB_TOOLS_SEARCH_URL,
    searchSourceLabel: WEB_TOOLS_SEARCH_SOURCE_LABEL,
    midThinkingText: WEB_TOOLS_MID_THINKING_TEXT,
    fetchMarkdown: WEB_TOOLS_FETCH_MARKDOWN,
    completedTitle: WEB_PROCESS_COMPLETED_TITLE,
    runningTitle: WEB_PROCESS_RUNNING_TITLE,
    introText: WEB_TOOLS_INTRO_TEXT,
    finalSummary: WEB_TOOLS_FINAL_SUMMARY,
    markdownHeadingText: WEB_TOOLS_MARKDOWN_HEADING,
    planSteps: PLAN_STEPS,
  });
}

export async function waitForGuiWebToolsRenderingInProgress(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 45000)) {
    const snapshot = await evaluateWebToolsSnapshot(page);
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.hasIntroText &&
      snapshot.hasProcessTitle &&
      snapshot.webProcessGroupExpanded === true &&
      snapshot.hasSearchSourceSection === true &&
      snapshot.hasFetchPageSection === true &&
      snapshot.hasSearchTitle === true &&
      snapshot.hasMidThinkingText === true &&
      snapshot.hasSearchSourceLabel === true &&
      snapshot.hasFullSearchUrlVisible === false &&
      snapshot.hasFetchPageUrl === true &&
      snapshot.hasFetchMarkdownHidden === true &&
      snapshot.hasIntroBeforeProcess === true &&
      snapshot.hasTimelineOrderPreserved === true &&
      snapshot.hasAssistantSummary === false &&
      snapshot.hasDoneText === false &&
      snapshot.latestAssistantTextAfterProcessPart === false &&
      snapshot.runningProcessHasLegacyTextAfterProcess === false &&
      snapshot.processGroupExcludesFinalMarkdown === true &&
      snapshot.rawJsonEnvelopeVisible === false &&
      snapshot.searchNoiseVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 网页搜索中间态未保持展开: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function waitForGuiWebToolsRenderingCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluateWebToolsSnapshot(page);
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      (snapshot.hasAssistantSummary || snapshot.hasDoneText) &&
      snapshot.hasProcessTitle &&
      snapshot.webProcessGroupExpanded === false &&
      snapshot.hasSearchSourceSection === false &&
      snapshot.hasFetchPageSection === false &&
      snapshot.hasSearchTitle === false &&
      snapshot.hasMidThinkingText === false &&
      snapshot.hasSearchSourceLabel === false &&
      snapshot.hasFullSearchUrlVisible === false &&
      snapshot.hasFetchPageUrl === false &&
      snapshot.hasFetchMarkdownHidden &&
      snapshot.hasIntroBeforeProcess &&
      snapshot.hasFinalTextAfterProcess &&
      snapshot.hasTimelineOrderPreserved === false &&
      snapshot.processGroupExcludesFinalMarkdown &&
      snapshot.rawJsonEnvelopeVisible === false &&
      snapshot.searchNoiseVisible === false &&
      snapshot.rawMarkdownVisible === false &&
      snapshot.markdownHeadingVisible &&
      snapshot.markdownStrongVisible &&
      snapshot.markdownTableVisible &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      const expandedSnapshot = await expandAndInspectGuiWebToolsProcess(page, {
        ...options,
        defaultSnapshot: snapshot,
      });
      return sanitizeJson({
        ...snapshot,
        expandedDetails: expandedSnapshot,
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成网页搜索渲染验收: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function expandAndInspectGuiWebToolsProcess(page, options) {
  await page.evaluate(() => {
    const groups = Array.from(
      document.querySelectorAll('[data-testid="streaming-process-group"]'),
    );
    const targetGroup = groups.find((group) =>
      (group.textContent || "").includes("已搜索网页 1 次，读取网页 1 次"),
    );
    const button = targetGroup?.querySelector("button");
    if (button instanceof HTMLButtonElement) {
      button.click();
    }
  });

  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < Math.min(options.timeoutMs, 30000)) {
    const snapshot = await evaluateWebToolsSnapshot(page);
    lastSnapshot = snapshot;
    if (
      snapshot?.webProcessGroupExpanded &&
      snapshot.hasSearchSourceSection &&
      snapshot.hasFetchPageSection &&
      snapshot.hasSearchTitle &&
      snapshot.hasMidThinkingText &&
      snapshot.hasSearchSourceLabel &&
      snapshot.hasFullSearchUrlVisible === false &&
      snapshot.hasFetchPageUrl &&
      snapshot.hasTimelineOrderPreserved &&
      snapshot.hasFetchMarkdownHidden &&
      snapshot.processGroupExcludesFinalMarkdown &&
      snapshot.rawJsonEnvelopeVisible === false &&
      snapshot.searchNoiseVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 网页搜索过程展开验收失败: ${JSON.stringify(
      sanitizeJson({ defaultSnapshot: options.defaultSnapshot, lastSnapshot }),
    )}`,
  );
}

export async function inspectGuiWebToolsRenderingDebug(page) {
  return await evaluatePageSnapshot(page, () => {
    const text = document.body?.innerText || "";
    const processGroups = Array.from(
      document.querySelectorAll('[data-testid="streaming-process-group"]'),
    ).map((group, index) => {
      const button = group.querySelector("button");
      return {
        index,
        processKind: group.getAttribute("data-process-kind") || "",
        processRunning: group.getAttribute("data-process-running") || "",
        visualTone: group.getAttribute("data-visual-tone") || "",
        expanded: button?.getAttribute("aria-expanded") || "",
        buttonText: button?.textContent || "",
        text: group.textContent || "",
      };
    });
    const thinkingBlocks = Array.from(
      document.querySelectorAll('[data-testid="thinking-block"]'),
    ).map((block, index) => ({
      index,
      visualStyle: block.getAttribute("data-visual-style") || "",
      text: block.textContent || "",
    }));
    const processRows = Array.from(
      document.querySelectorAll(
        '[data-testid="web-retrieval-process-row"], [data-testid="inline-tool-process-step"]',
      ),
    ).map((row, index) => ({
      index,
      testId: row.getAttribute("data-testid") || "",
      grouped: row.getAttribute("data-grouped") || "",
      toolStatus: row.getAttribute("data-tool-status") || "",
      text: row.textContent || "",
    }));
    const renderers = Array.from(
      document.querySelectorAll('[data-testid="streaming-renderer"]'),
    ).map((renderer, index) => ({
      index,
      renderMode: renderer.getAttribute("data-render-mode") || "",
      contentPartTypes: renderer.getAttribute("data-content-part-types") || "",
      text: renderer.textContent || "",
    }));
    const messageBubbles = Array.from(
      document.querySelectorAll("[data-message-role]"),
    ).map((bubble, index) => ({
      index,
      role: bubble.getAttribute("data-message-role") || "",
      messageContentPartTypes:
        bubble.getAttribute("data-message-content-part-types") || "",
      rendererContentPartTypes:
        bubble.getAttribute("data-renderer-content-part-types") || "",
      timelineItems: bubble.getAttribute("data-timeline-items") || "",
      text: bubble.textContent || "",
    }));
    const messageList = document.querySelector('[data-testid="message-list"]');
    const frame = document.querySelector('[data-testid="message-list-frame"]');
    return {
      url: window.location.href,
      hasMidThinkingInBody: text.includes(
        "搜索结果还需要继续筛掉广告软文，我先读取有效来源。",
      ),
      processGroups,
      thinkingBlocks,
      processRows,
      renderers,
      messageBubbles,
      messageListText: messageList?.textContent || "",
      messageFrameText: frame?.textContent || "",
      bodyText: text,
    };
  });
}

import {
  APP_SERVER_METHOD_SESSION_READ,
  SESSION_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import { waitForGuiChatCompleted } from "./claw-chat-current-fixture-gui-completion-waits.mjs";
import {
  evaluatePageSnapshot,
  invokeAppServerFromPage,
} from "./claw-chat-current-fixture-rpc.mjs";
import { sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

export const MEDIA_REFERENCE_SCENARIO = "media-reference";
export const MEDIA_REFERENCE_PROMPT = "验证媒体引用展示";
export const MEDIA_REFERENCE_DONE_TEXT = "CLAW_MEDIA_REFERENCE_FIXTURE_DONE";
export const MEDIA_REFERENCE_SUMMARY_TEXT = "媒体引用已进入对话";
export const MEDIA_REFERENCE_CAPTION = "结果图";
export const MEDIA_REFERENCE_URI = "sidecar://media/fixture-image-1";
export const MEDIA_REFERENCE_MIME_TYPE = "image/png";
export const MEDIA_REFERENCE_TITLE = "fixture-image-1.png";
export const MEDIA_REFERENCE_SHA256 = "sha256-fixture-image-1";
export const MEDIA_REFERENCE_BYTE_SIZE = 2048;

export const MEDIA_REFERENCE_ASSERTION_KEYS = [
  "mediaReferencePromptReachedBackend",
  "guiMediaReferenceInputSubmitted",
  "guiMediaReferenceCardVisible",
  "guiMediaReferenceDoesNotExposeInlinePayload",
  "guiMediaReferencePreviewOpened",
  "readModelMediaReferenceCompleted",
  "readModelMediaReferenceObserved",
];

function collectMediaContentParts(value, collector = []) {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectMediaContentParts(item, collector);
    }
    return collector;
  }
  if (!value || typeof value !== "object") {
    return collector;
  }

  const type = value.type ?? value.contentType ?? value.content_type;
  const reference = value.reference ?? value.mediaReference ?? value;
  const uri = reference?.uri ?? reference?.url ?? null;
  if (
    (type === "media" || type === "media_reference") &&
    typeof uri === "string" &&
    uri.trim()
  ) {
    collector.push({
      uri,
      kind: value.kind ?? reference.kind ?? null,
      mimeType:
        reference.mime_type ??
        reference.mimeType ??
        value.mime_type ??
        value.mimeType ??
        null,
      title: reference.title ?? value.title ?? null,
      caption: value.caption ?? reference.caption ?? null,
      sourceUri:
        reference.source_uri ??
        reference.sourceUri ??
        value.source_uri ??
        value.sourceUri ??
        null,
      sourcePath:
        reference.source_path ??
        reference.sourcePath ??
        value.source_path ??
        value.sourcePath ??
        null,
      previewUrl:
        reference.preview_url ??
        reference.previewUrl ??
        value.preview_url ??
        value.previewUrl ??
        null,
      sha256: reference.sha256 ?? value.sha256 ?? null,
      byteSize:
        reference.byte_size ??
        reference.byteSize ??
        value.byte_size ??
        value.byteSize ??
        null,
    });
  }

  for (const item of Object.values(value)) {
    collectMediaContentParts(item, collector);
  }
  return collector;
}

export function summarizeReadModelMediaReference(readModel) {
  const serialized = JSON.stringify(readModel || {});
  const mediaParts = collectMediaContentParts(readModel);
  const matchingParts = mediaParts.filter(
    (part) => part.uri === MEDIA_REFERENCE_URI,
  );
  return sanitizeJson({
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    latestTurnStatus:
      readModel?.detail?.thread_read?.runtime_summary?.latestTurnStatus ??
      readModel?.detail?.thread_read?.status ??
      readModel?.detail?.status ??
      null,
    includesPrompt: serialized.includes(MEDIA_REFERENCE_PROMPT),
    includesAssistantDone: serialized.includes(MEDIA_REFERENCE_DONE_TEXT),
    includesAssistantSummary: serialized.includes(
      MEDIA_REFERENCE_SUMMARY_TEXT,
    ),
    contentPartsKeyObserved:
      serialized.includes("contentParts") || serialized.includes("content_parts"),
    mediaPartCount: mediaParts.length,
    matchingMediaPartCount: matchingParts.length,
    hasMediaReference: matchingParts.length > 0,
    hasReferenceUri: serialized.includes(MEDIA_REFERENCE_URI),
    hasMimeType: serialized.includes(MEDIA_REFERENCE_MIME_TYPE),
    hasCaption: serialized.includes(MEDIA_REFERENCE_CAPTION),
    hasSourceOwner: matchingParts.some(
      (part) =>
        typeof part.sourcePath === "string" && part.sourcePath.trim(),
    ),
    noInlinePayload:
      !serialized.includes("data:image") && !serialized.includes("base64,"),
  });
}

export async function waitForSessionReadMediaReferenceCompleted(
  page,
  options,
  requestLog,
) {
  const startedAt = Date.now();
  let lastSummary = null;
  let lastRead = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const read = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_SESSION_READ,
      {
        sessionId: SESSION_ID,
        historyLimit: 100,
      },
      requestLog,
    );
    lastRead = read.result;
    lastSummary = summarizeReadModelMediaReference(lastRead);
    if (
      lastSummary.includesPrompt === true &&
      (lastSummary.includesAssistantDone === true ||
      lastSummary.includesAssistantSummary === true) &&
      lastSummary.hasMediaReference === true &&
      lastSummary.hasSourceOwner === true &&
      lastSummary.noInlinePayload === true
    ) {
      return {
        readModel: lastRead,
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server media reference read model 未完成闭环: ${JSON.stringify(
      sanitizeJson({
        summary: lastSummary,
        readModel: lastRead,
      }),
    )}`,
  );
}

export async function summarizeGuiMediaReferenceSnapshot(page) {
  return await evaluatePageSnapshot(
    page,
    ({ caption, uri, mimeType }) => {
      const text = document.body?.innerText || "";
      const cards = Array.from(
        document.querySelectorAll(
          '[data-testid="streaming-media-reference-card"]',
        ),
      );
      const matchingCard =
        cards.find((card) => card.getAttribute("data-reference-uri") === uri) ??
        cards[0] ??
        null;
      const cardText = matchingCard?.textContent || "";
      const shell = document.querySelector(
        [
          '[data-testid="artifact-workbench-shell"]',
          '[data-testid="canvas-workbench-shell"]',
          '[data-testid="canvas-workbench-preview-mode-panel"]',
          '[data-testid="canvas-workbench-markdown-preview"]',
        ].join(", "),
      );
      const shellRect = shell?.getBoundingClientRect();
      const shellStyle = shell ? window.getComputedStyle(shell) : null;
      const shellVisible = Boolean(
        shell &&
          shellRect &&
          shellRect.width > 32 &&
          shellRect.height > 32 &&
          shellStyle?.visibility !== "hidden" &&
          shellStyle?.display !== "none",
      );
      const mainArea = document.querySelector(
        '[data-testid="workspace-main-area"]',
      );
      const layoutMode =
        mainArea instanceof HTMLElement
          ? mainArea.dataset.layoutMode || null
          : null;
      const previewTextIncludesSidecarSource = text.includes(
        "media sidecar source",
      );
      const previewTextIncludesReference = text.includes(uri);
      const previewImage = document.querySelector(
        '[data-testid="preview-artifact-image"]',
      );
      const previewImageRect = previewImage?.getBoundingClientRect();
      const previewImageStyle = previewImage
        ? window.getComputedStyle(previewImage)
        : null;
      const previewImageVisible = Boolean(
        previewImage &&
          previewImageRect &&
          previewImageRect.width > 8 &&
          previewImageRect.height > 8 &&
          previewImageStyle?.visibility !== "hidden" &&
          previewImageStyle?.display !== "none",
      );
      const canvasWorkbenchVisible =
        shellVisible || layoutMode === "chat-canvas";
      const workbenchPreviewVisible =
        canvasWorkbenchVisible &&
        (previewImageVisible ||
          (previewTextIncludesSidecarSource && previewTextIncludesReference));
      return {
        url: window.location.href,
        cardCount: cards.length,
        hasCard: Boolean(matchingCard),
        hasCaption: cardText.includes(caption),
        hasUri: cardText.includes(uri),
        hasMimeType: cardText.includes(mimeType),
        cardText,
        bodyTextIncludesInlinePayload:
          text.includes("data:image") || text.includes("base64,"),
        workbenchShellVisible: shellVisible,
        canvasWorkbenchVisible,
        workbenchPreviewVisible,
        previewImageVisible,
        previewImageSrc:
          previewImage instanceof HTMLImageElement
            ? previewImage.getAttribute("src")
            : null,
        layoutMode,
        previewTextIncludesSidecarSource,
        previewTextIncludesReference,
        bodyText: text,
      };
    },
    {
      caption: MEDIA_REFERENCE_CAPTION,
      uri: MEDIA_REFERENCE_URI,
      mimeType: MEDIA_REFERENCE_MIME_TYPE,
    },
  );
}

export async function openGuiMediaReferencePreview(page, options) {
  const clickSnapshot = await evaluatePageSnapshot(
    page,
    ({ uri }) => {
      const cards = Array.from(
        document.querySelectorAll(
          '[data-testid="streaming-media-reference-card"]',
        ),
      );
      const card =
        cards.find((candidate) => candidate.getAttribute("data-reference-uri") === uri) ??
        cards[0] ??
        null;
      if (card instanceof HTMLElement) {
        card.click();
        return {
          clicked: true,
          cardText: card.textContent || "",
          referenceUri: card.getAttribute("data-reference-uri"),
        };
      }
      return {
        clicked: false,
        cardText: "",
        referenceUri: null,
      };
    },
    { uri: MEDIA_REFERENCE_URI },
  );

  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await summarizeGuiMediaReferenceSnapshot(page);
    lastSnapshot = snapshot;
    if (
      snapshot?.workbenchPreviewVisible === true &&
      snapshot.previewImageVisible === true &&
      snapshot.previewTextIncludesSidecarSource === false
    ) {
      return sanitizeJson({
        click: clickSnapshot,
        preview: snapshot,
      });
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `media reference Workbench 预览未打开: ${JSON.stringify(
      sanitizeJson({
        click: clickSnapshot,
        preview: lastSnapshot,
      }),
    )}`,
  );
}

export async function runMediaReferenceScenario({
  page,
  options,
  appServerRequests,
}) {
  const result = {};

  result.mediaReferenceInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, MEDIA_REFERENCE_PROMPT),
  );

  result.guiMediaReferenceCompleted = sanitizeJson(
    await waitForGuiChatCompleted(page, options, {
      prompt: MEDIA_REFERENCE_PROMPT,
      doneText: MEDIA_REFERENCE_DONE_TEXT,
      summaryText: MEDIA_REFERENCE_SUMMARY_TEXT,
      requiredVisibleTexts: [
        MEDIA_REFERENCE_CAPTION,
        MEDIA_REFERENCE_URI,
        MEDIA_REFERENCE_MIME_TYPE,
      ],
      disallowedVisibleTexts: ["data:image", "base64,"],
    }),
  );
  result.guiMediaReferenceSnapshot = sanitizeJson(
    await summarizeGuiMediaReferenceSnapshot(page),
  );

  const readModel = await waitForSessionReadMediaReferenceCompleted(
    page,
    options,
    appServerRequests,
  );
  result.readModelMediaReferenceCompleted = readModel.summary;

  result.guiMediaReferencePreview = sanitizeJson(
    await openGuiMediaReferencePreview(page, options),
  );

  return result;
}

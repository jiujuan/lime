import fs from "node:fs";
import {
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID,
  IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
  IMAGE_COMMAND_DONE_TEXT,
  IMAGE_COMMAND_IMAGE_PROMPT,
  IMAGE_COMMAND_PROMPT,
  IMAGE_COMMAND_SKILL_NAME,
  IMAGE_COMMAND_SKILL_TOOL_CALL_ID,
  SESSION_ID,
  THREAD_ID,
} from "./claw-chat-current-fixture-constants.mjs";
import { collectAgentUiPerformanceTraceEvidence } from "./claw-chat-current-fixture-agent-ui-trace.mjs";
import { waitForBackendLedgerTurnStart } from "./claw-chat-current-fixture-backend-ledger.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  collectReadModelToolCalls,
  findReadModelToolCall,
  readModelLatestTurnStatus,
} from "./claw-chat-current-fixture-read-model-core.mjs";
import {
  evaluatePageSnapshot,
  invokeAppServerFromPage,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { openFixtureSessionFromSidebar } from "./claw-chat-current-fixture-session.mjs";
import {
  sanitizeJson,
  sleep,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

const IMAGE_COMMAND_TERMINAL_STATUS = "succeeded";
const IMAGE_COMMAND_RESULT_IMAGE_URL =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=";

function traceEvidenceHasProviderAndClient(evidence) {
  return (
    evidence?.hasProviderWaitMs === true &&
    evidence?.hasClientLocalOutputMs === true
  );
}

function taskOutputCandidate(taskArtifact) {
  return (
    taskArtifact?.result ?? taskArtifact?.taskArtifact ?? taskArtifact ?? {}
  );
}

function imageTaskId(taskArtifact) {
  const task = taskOutputCandidate(taskArtifact);
  return task.task_id ?? task.taskId ?? task.record?.task_id ?? null;
}

function imageTaskPath(taskArtifact) {
  const task = taskOutputCandidate(taskArtifact);
  return (
    task.absolute_path ??
    task.absolutePath ??
    task.absolute_artifact_path ??
    task.absoluteArtifactPath ??
    task.path ??
    task.artifact_path ??
    null
  );
}

function serializeReadModelSummary(readModel) {
  const serialized = JSON.stringify(readModel || {});
  const skillToolCall = findReadModelToolCall(
    readModel,
    IMAGE_COMMAND_SKILL_TOOL_CALL_ID,
    "Skill",
  );
  const createTaskToolCall = findReadModelToolCall(
    readModel,
    IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID,
    IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
  );
  const createTaskOutput = String(
    createTaskToolCall?.output ??
      createTaskToolCall?.output_preview ??
      createTaskToolCall?.outputPreview ??
      "",
  );

  return sanitizeJson({
    detailItemCount: Array.isArray(readModel?.detail?.items)
      ? readModel.detail.items.length
      : null,
    toolCallCount: collectReadModelToolCalls(readModel).length,
    latestTurnStatus: readModelLatestTurnStatus(readModel),
    includesPrompt: serialized.includes(IMAGE_COMMAND_PROMPT),
    includesAssistantDone: serialized.includes(IMAGE_COMMAND_DONE_TEXT),
    includesSkillTool: Boolean(skillToolCall),
    includesImageSkillName: serialized.includes(IMAGE_COMMAND_SKILL_NAME),
    includesCreateTaskTool: Boolean(createTaskToolCall),
    includesTaskArtifactPath:
      serialized.includes(".lime/tasks/image_generate") ||
      serialized.includes("image_generate"),
    includesTaskIdPlaceholder: serialized.includes("{task_id}"),
    includesDraftTask: serialized.includes("draft-image-"),
    createTaskToolStatus: createTaskToolCall?.status ?? null,
    createTaskOutputContainsTaskId: createTaskOutput.includes("task_id"),
    createTaskOutputContainsTaskFile:
      createTaskOutput.includes(".lime/tasks/image_generate") ||
      createTaskOutput.includes("image_generate"),
  });
}

export async function waitForGuiImageCommandCompleted(page, options) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText, skillName, createTaskToolName }) => {
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
        ).map((group) => ({
          text: group.textContent || "",
          expanded:
            group.querySelector("button")?.getAttribute("aria-expanded") || "",
        }));
        const inlineToolSteps = Array.from(
          document.querySelectorAll('[data-testid="inline-tool-process-step"]'),
        ).map((step) => ({
          text: step.textContent || "",
          grouped: step.getAttribute("data-grouped") || "",
        }));
        const combinedProcessText = [...processGroups, ...inlineToolSteps]
          .map((entry) => entry.text)
          .join("\n");
        const bodyLower = text.toLowerCase();
        const imageTaskCardVisible =
          text.includes(".lime/tasks/image_generate") ||
          text.includes("image_generate") ||
          bodyLower.includes("pending_submit") ||
          bodyLower.includes("图片任务");

        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasAssistantSummary: text.includes(
            "图片任务已提交到标准 task artifact",
          ),
          hasDoneText: text.includes(doneText),
          hasSkillName:
            text.includes(skillName) || combinedProcessText.includes(skillName),
          hasCreateTaskTool:
            text.includes(createTaskToolName) ||
            combinedProcessText.includes(createTaskToolName),
          hasTaskArtifactPath: text.includes(".lime/tasks/image_generate"),
          imageTaskCardVisible,
          processGroupCount: processGroups.length,
          inlineToolStepCount: inlineToolSteps.length,
          processText: combinedProcessText,
          templateTaskIdVisible: text.includes("{task_id}"),
          draftImageVisible: text.includes("draft-image-"),
          textareaVisible,
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          textareaValue:
            textarea instanceof HTMLTextAreaElement ? textarea.value : null,
          stopButtonVisible,
          bodyText: text,
        };
      },
      {
        prompt: IMAGE_COMMAND_PROMPT,
        doneText: IMAGE_COMMAND_DONE_TEXT,
        skillName: IMAGE_COMMAND_SKILL_NAME,
        createTaskToolName: IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      (snapshot.hasAssistantSummary || snapshot.hasDoneText) &&
      snapshot.hasSkillName &&
      snapshot.hasCreateTaskTool &&
      snapshot.imageTaskCardVisible &&
      snapshot.templateTaskIdVisible === false &&
      snapshot.draftImageVisible === false &&
      snapshot.textareaVisible &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未完成 @配图 current 主链验收: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function waitForSessionReadImageCommandCompleted(
  page,
  options,
  requestLog,
) {
  const startedAt = Date.now();
  let lastRead = null;
  let lastSummary = null;
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
    lastSummary = serializeReadModelSummary(lastRead);
    if (
      lastSummary.includesPrompt === true &&
      lastSummary.includesAssistantDone === true &&
      lastSummary.includesSkillTool === true &&
      lastSummary.includesImageSkillName === true &&
      lastSummary.includesCreateTaskTool === true &&
      lastSummary.createTaskOutputContainsTaskId === true &&
      lastSummary.includesTaskIdPlaceholder === false &&
      lastSummary.includesDraftTask === false
    ) {
      return {
        readModel: lastRead,
        summary: lastSummary,
      };
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `App Server image-command read model 未完成工具链闭环: ${JSON.stringify(
      sanitizeJson({
        summary: lastSummary,
        readModel: lastRead,
      }),
    )}`,
  );
}

function imageTaskRecord(taskArtifact) {
  const task = taskOutputCandidate(taskArtifact);
  return task.record &&
    typeof task.record === "object" &&
    !Array.isArray(task.record)
    ? task.record
    : null;
}

function readTaskArtifactFile(taskPath) {
  return JSON.parse(fs.readFileSync(taskPath, "utf8"));
}

function resolveCurrentAttemptIndex(record) {
  const attempts = Array.isArray(record.attempts) ? record.attempts : [];
  if (attempts.length === 0) {
    return -1;
  }
  const currentAttemptId =
    typeof record.current_attempt_id === "string"
      ? record.current_attempt_id
      : null;
  if (currentAttemptId) {
    const matchedIndex = attempts.findIndex(
      (attempt) => attempt?.attempt_id === currentAttemptId,
    );
    if (matchedIndex >= 0) {
      return matchedIndex;
    }
  }
  return attempts.length - 1;
}

function buildCompletedImageTaskResult(record) {
  const payload =
    record?.payload &&
    typeof record.payload === "object" &&
    !Array.isArray(record.payload)
      ? record.payload
      : {};
  const prompt =
    typeof payload.prompt === "string" && payload.prompt.trim()
      ? payload.prompt.trim()
      : IMAGE_COMMAND_IMAGE_PROMPT;
  const size =
    typeof payload.size === "string" && payload.size.trim()
      ? payload.size.trim()
      : "1024x1024";
  const providerId =
    typeof payload.provider_id === "string" && payload.provider_id.trim()
      ? payload.provider_id.trim()
      : "fixture-image-provider";
  const model =
    typeof payload.model === "string" && payload.model.trim()
      ? payload.model.trim()
      : "fixture-image-model";
  const image = {
    url: IMAGE_COMMAND_RESULT_IMAGE_URL,
    prompt,
    revised_prompt: "青柠插画 E2E fixture 结果",
    size,
    provider_id: providerId,
    model,
    slot_index: 1,
    slot_id: "slot-1",
    slot_prompt: prompt,
  };
  return {
    prompt,
    provider_id: providerId,
    executor_mode:
      typeof payload.executor_mode === "string"
        ? payload.executor_mode
        : "images_api",
    outer_model:
      typeof payload.outer_model === "string" ? payload.outer_model : null,
    model,
    size,
    count: 1,
    layout_hint:
      typeof payload.layout_hint === "string" ? payload.layout_hint : null,
    requested_count: 1,
    received_count: 1,
    images: [image],
    response: {
      id: "fixture-image-response-1",
      status: IMAGE_COMMAND_TERMINAL_STATUS,
      model,
    },
    responses: [
      {
        id: "fixture-image-response-1",
        status: IMAGE_COMMAND_TERMINAL_STATUS,
        model,
      },
    ],
    failures: [],
    postprocess: null,
    storyboard_slots: [
      {
        slot_index: 1,
        slot_id: "slot-1",
        label: null,
        prompt,
        shot_type: null,
      },
    ],
  };
}

function buildCompleteImageCommandTaskArtifactRequest({
  taskArtifact,
  workspace,
}) {
  const taskId = imageTaskId(taskArtifact);
  const taskPath = imageTaskPath(taskArtifact);
  if (!taskId || !taskPath) {
    throw new Error(
      `image-command task artifact 缺少 taskId/path: ${JSON.stringify(
        sanitizeJson(taskArtifact),
      )}`,
    );
  }
  if (!fs.existsSync(taskPath)) {
    throw new Error(`image-command task file 不存在: ${taskPath}`);
  }

  const record = readTaskArtifactFile(taskPath);
  const result = buildCompletedImageTaskResult(record);
  return {
    taskId,
    taskPath,
    previousStatus: record.normalized_status ?? record.status ?? null,
    request: {
      projectRootPath: workspace.rootPath,
      taskRef: taskId,
      providerId: result.provider_id,
      model: result.model,
      executorMode: result.executor_mode,
      responseId: result.response?.id ?? "fixture-image-response-1",
      status: IMAGE_COMMAND_TERMINAL_STATUS,
      images: result.images.map((image) => ({
        url: image.url,
        prompt: image.prompt,
        revisedPrompt: image.revised_prompt,
        size: image.size,
        providerId: image.provider_id,
        model: image.model,
        slotId: image.slot_id,
        slotIndex: image.slot_index,
        slotPrompt: image.slot_prompt,
      })),
      responses: result.responses,
      failures: result.failures,
    },
  };
}

async function completeImageCommandTaskArtifact({
  page,
  workspace,
  appServerRequests,
  taskArtifact,
}) {
  const completion = buildCompleteImageCommandTaskArtifactRequest({
    taskArtifact,
    workspace,
  });
  const completeResult = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
    completion.request,
    appServerRequests,
  );
  const record = imageTaskRecord(completeResult?.result);
  const attempts = Array.isArray(record?.attempts) ? record.attempts : [];
  const currentAttemptIndex = resolveCurrentAttemptIndex(record || {});
  const resultImageCount = Array.isArray(record?.result?.images)
    ? record.result.images.length
    : 0;
  return sanitizeJson({
    taskId: completion.taskId,
    taskPath: completion.taskPath,
    previousStatus: completion.previousStatus,
    completeMethodUsed: APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_COMPLETE,
    completeReturned: Boolean(completeResult?.result),
    status: record?.status ?? completeResult?.result?.status ?? null,
    normalizedStatus:
      record?.normalized_status ??
      completeResult?.result?.normalized_status ??
      null,
    sameTaskFileUpdated: true,
    resultImageCount,
    attemptCount: attempts.length,
    currentAttemptStatus:
      currentAttemptIndex >= 0
        ? (attempts[currentAttemptIndex]?.status ?? null)
        : null,
    currentAttemptHasResultSnapshot:
      currentAttemptIndex >= 0
        ? Boolean(attempts[currentAttemptIndex]?.result_snapshot)
        : false,
    response: completeResult?.result ?? null,
    request: completion.request,
  });
}

async function createImageCommandTaskArtifact({
  page,
  workspace,
  appServerRequests,
  turnId,
}) {
  const request = {
    projectRootPath: workspace.rootPath,
    prompt: IMAGE_COMMAND_IMAGE_PROMPT,
    title: "青柠插画 E2E",
    rawText: IMAGE_COMMAND_PROMPT,
    mode: "generate",
    size: "1024x1024",
    count: 1,
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    turnId,
    entrySource: "at_image_command",
    modalityContractKey: "image_generation",
    modality: "image",
    routingSlot: "image_generation_model",
    runtimeContract: {
      contract_key: "image_generation",
      execution_profile_key: "image_generation_default",
      executor_adapter_key: "skill_image_generate",
      executor_kind: "skill",
      executor_binding_key: IMAGE_COMMAND_SKILL_NAME,
      binding_key: IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
    },
    requiredCapabilities: ["image_generation"],
  };
  const taskArtifact = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
    request,
    appServerRequests,
  );
  return {
    request,
    response: taskArtifact.result,
  };
}

export async function waitForGuiImageCommandTerminal(page, options, taskId) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ prompt, doneText, taskId }) => {
        const text = document.body?.innerText || "";
        const textarea = document.querySelector(
          'textarea[name="agent-chat-message"]',
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
        const cardSelector = `[data-testid="image-workbench-message-preview-${taskId}"]`;
        const mediaSelector = `[data-testid="image-workbench-message-preview-single-media-${taskId}"], [data-testid="image-workbench-message-preview-grid-${taskId}"]`;
        const cards = Array.from(document.querySelectorAll(cardSelector));
        const mediaNodes = Array.from(document.querySelectorAll(mediaSelector));
        const cardText = cards.map((card) => card.textContent || "").join("\n");
        const hasPreviewImage = cards.some((card) =>
          Boolean(card.querySelector("img")),
        );
        const visiblePendingStatus =
          text.includes("pending_submit") ||
          text.includes("排队中") ||
          cardText.includes("正在生成") ||
          cardText.includes("图片生成中");
        return {
          url: window.location.href,
          hasPrompt: text.includes(prompt),
          hasDoneText: text.includes(doneText),
          templateTaskIdVisible: text.includes("{task_id}"),
          draftImageVisible: text.includes("draft-image-"),
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          stopButtonVisible,
          cardCount: cards.length,
          mediaCount: mediaNodes.length,
          hasPreviewImage,
          cardText,
          taskIdVisible: text.includes(taskId),
          terminalMessageVisible:
            text.includes("图片任务已完成，共生成 1 张") ||
            cardText.includes("已完成") ||
            cardText.includes("生成"),
          visiblePendingStatus,
          bodyText: text,
        };
      },
      {
        prompt: IMAGE_COMMAND_PROMPT,
        doneText: IMAGE_COMMAND_DONE_TEXT,
        taskId,
      },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasPrompt &&
      snapshot.cardCount === 1 &&
      snapshot.mediaCount >= 1 &&
      snapshot.hasPreviewImage === true &&
      snapshot.visiblePendingStatus === false &&
      snapshot.templateTaskIdVisible === false &&
      snapshot.draftImageVisible === false &&
      snapshot.textareaDisabled === false &&
      snapshot.stopButtonVisible === false
    ) {
      return sanitizeJson(snapshot);
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw GUI 未把 @配图 task 轻卡推进终态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function readImageCommandTaskArtifact({
  page,
  appServerRequests,
  taskArtifact,
  workspace,
}) {
  const taskId = imageTaskId(taskArtifact);
  const taskRef = taskId || imageTaskPath(taskArtifact);
  const getResult = taskRef
    ? await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
        {
          projectRootPath: workspace.rootPath,
          taskRef,
        },
        appServerRequests,
      )
    : null;
  const listResult = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
    {
      projectRootPath: workspace.rootPath,
      taskType: "image_generate",
      limit: 20,
    },
    appServerRequests,
  );
  const taskPath = imageTaskPath(taskArtifact);
  let fileStatus = null;
  let fileNormalizedStatus = null;
  let fileResultImageCount = null;
  if (typeof taskPath === "string" && fs.existsSync(taskPath)) {
    try {
      const record = readTaskArtifactFile(taskPath);
      fileStatus = record.status ?? null;
      fileNormalizedStatus = record.normalized_status ?? null;
      fileResultImageCount = Array.isArray(record.result?.images)
        ? record.result.images.length
        : null;
    } catch {
      fileStatus = "unreadable";
    }
  }
  const getRecord = imageTaskRecord(getResult?.result);
  return sanitizeJson({
    taskId,
    taskPath,
    exists: typeof taskPath === "string" ? fs.existsSync(taskPath) : false,
    pathIncludesImageGenerate:
      typeof taskPath === "string" &&
      taskPath.includes(".lime/tasks/image_generate"),
    getReturned: Boolean(getResult?.result),
    getTaskId: imageTaskId(getResult?.result),
    getStatus: getRecord?.status ?? getResult?.result?.status ?? null,
    getNormalizedStatus:
      getRecord?.normalized_status ??
      getResult?.result?.normalized_status ??
      null,
    listReturned: Boolean(listResult?.result),
    listContainsTask:
      JSON.stringify(listResult?.result || {}).includes(String(taskId || "")) &&
      Boolean(taskId),
    listContainsImageGenerate: JSON.stringify(
      listResult?.result || {},
    ).includes("image_generate"),
    fileStatus,
    fileNormalizedStatus,
    fileResultImageCount,
  });
}

async function reloadAndReopenImageCommandSession({
  page,
  options,
  appServerRequests,
}) {
  await page.reload({
    waitUntil: "domcontentloaded",
    timeout: options.timeoutMs,
  });
  const renderer = await waitForRendererReady(page, options);
  const session = await openFixtureSessionFromSidebar(
    page,
    options,
    appServerRequests,
  );
  return sanitizeJson({
    renderer,
    session,
  });
}

async function waitForImageCommandAgentUiPerformanceTrace(page, options) {
  const startedAt = Date.now();
  const timeoutMs = Math.min(options.timeoutMs, 15_000);
  let lastEvidence = null;
  while (Date.now() - startedAt < timeoutMs) {
    const evidence = sanitizeJson(
      await collectAgentUiPerformanceTraceEvidence(page),
    );
    lastEvidence = evidence;
    if (traceEvidenceHasProviderAndClient(evidence)) {
      return evidence;
    }
    await sleep(options.intervalMs);
  }
  return lastEvidence;
}

export async function runImageCommandScenario({
  page,
  options,
  workspace,
  appServerRequests,
  runtimeEnv,
}) {
  const imageCommandInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, IMAGE_COMMAND_PROMPT),
  );
  const backendTurn = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    IMAGE_COMMAND_PROMPT,
    options,
  );
  const turnId = backendTurn.entry.turnId ?? backendTurn.entry.turn_id ?? null;
  const imageTaskArtifact = await createImageCommandTaskArtifact({
    page,
    workspace,
    appServerRequests,
    turnId,
  });
  writeJsonFile(runtimeEnv.imageTaskFixturePath, {
    taskArtifact: imageTaskArtifact.response,
  });
  const imageCommandTaskArtifact = await readImageCommandTaskArtifact({
    page,
    appServerRequests,
    taskArtifact: imageTaskArtifact.response,
    workspace,
  });
  const guiImageCommandCompleted = await waitForGuiImageCommandCompleted(
    page,
    options,
  );
  const readModelImageCommandCompleted =
    await waitForSessionReadImageCommandCompleted(
      page,
      options,
      appServerRequests,
    );
  const imageCommandTaskArtifactTerminalPatch =
    await completeImageCommandTaskArtifact({
      page,
      workspace,
      appServerRequests,
      taskArtifact: imageTaskArtifact.response,
    });
  const imageCommandTaskArtifactTerminal = await readImageCommandTaskArtifact({
    page,
    appServerRequests,
    taskArtifact: imageTaskArtifact.response,
    workspace,
  });
  const guiImageCommandTerminal = await waitForGuiImageCommandTerminal(
    page,
    options,
    imageCommandTaskArtifactTerminalPatch.taskId,
  );
  const agentUiPerformanceTracePreReload =
    await waitForImageCommandAgentUiPerformanceTrace(page, options);
  const guiImageCommandReload = await reloadAndReopenImageCommandSession({
    page,
    options,
    appServerRequests,
  });
  const guiImageCommandRestoredAfterReload =
    await waitForGuiImageCommandTerminal(
      page,
      options,
      imageCommandTaskArtifactTerminalPatch.taskId,
    );
  const imageCommandTaskArtifactAfterReload =
    await readImageCommandTaskArtifact({
      page,
      appServerRequests,
      taskArtifact: imageTaskArtifact.response,
      workspace,
    });

  return sanitizeJson({
    imageCommandInputSend,
    imageCommandBackendTurnStart: {
      sessionId: backendTurn.entry.sessionId ?? null,
      turnId,
      inputText: backendTurn.entry.inputText ?? null,
      hasImageSkillLaunchMetadata: JSON.stringify(
        backendTurn.entry.asterChatRequest || {},
      ).includes("image_skill_launch"),
      hasImageTaskMetadata: JSON.stringify(
        backendTurn.entry.asterChatRequest || {},
      ).includes("image_task"),
      providerPreference: backendTurn.entry.providerPreference ?? null,
      modelPreference: backendTurn.entry.modelPreference ?? null,
    },
    imageCommandTaskCreateRequest: imageTaskArtifact.request,
    imageCommandTaskArtifact,
    imageCommandTaskArtifactTerminalPatch,
    imageCommandTaskArtifactTerminal,
    guiImageCommandCompleted,
    guiImageCommandTerminal,
    agentUiPerformanceTrace: agentUiPerformanceTracePreReload,
    agentUiPerformanceTracePreReload,
    guiImageCommandReload,
    guiImageCommandRestoredAfterReload,
    imageCommandTaskArtifactAfterReload,
    readModelImageCommandCompleted: readModelImageCommandCompleted.summary,
  });
}

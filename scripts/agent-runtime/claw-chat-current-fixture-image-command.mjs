import fs from "node:fs";
import {
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_IMAGE_CREATE,
  APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_LIST,
  APP_SERVER_METHOD_SESSION_READ,
  IMAGE_COMMAND_CREATE_TASK_TOOL_CALL_ID,
  IMAGE_COMMAND_CREATE_TASK_TOOL_NAME,
  IMAGE_COMMAND_DONE_TEXT,
  IMAGE_COMMAND_IMAGE_PROMPT,
  IMAGE_COMMAND_PROMPT,
  PLAIN_IMAGE_INTENT_IMAGE_PROMPT,
  PLAIN_IMAGE_INTENT_PROMPT,
  PLAIN_IMAGE_INTENT_ROUTED_PROMPT,
  PLAIN_IMAGE_INTENT_SCENARIO,
  IMAGE_COMMAND_SKILL_NAME,
  IMAGE_COMMAND_SKILL_TOOL_CALL_ID,
  IMAGE_FIXTURE_MODEL,
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
  reloadRendererDocument,
  waitForRendererReady,
} from "./claw-chat-current-fixture-rpc.mjs";
import { openFixtureSessionFromSidebar } from "./claw-chat-current-fixture-session.mjs";
import {
  sanitizeJson,
  sleep,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

const IMAGE_COMMAND_TERMINAL_STATUS = "succeeded";
const IMAGE_COMMAND_WORKER_ID = "lime-image-api-worker";

export function resolveImageIntentScenario(scenario) {
  if (scenario === PLAIN_IMAGE_INTENT_SCENARIO) {
    return {
      scenario,
      inputPrompt: PLAIN_IMAGE_INTENT_PROMPT,
      routedPrompt: PLAIN_IMAGE_INTENT_ROUTED_PROMPT,
      imagePrompt: PLAIN_IMAGE_INTENT_IMAGE_PROMPT,
      taskTitle: "广州夏天 E2E",
      entrySource: "plain_image_intent",
    };
  }

  return {
    scenario: "image-command",
    inputPrompt: IMAGE_COMMAND_PROMPT,
    routedPrompt: IMAGE_COMMAND_PROMPT,
    imagePrompt: IMAGE_COMMAND_IMAGE_PROMPT,
    taskTitle: "青柠插画 E2E",
    entrySource: "at_image_command",
  };
}

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

function imageTaskArtifactPath(taskArtifact) {
  const task = taskOutputCandidate(taskArtifact);
  return task.artifact_path ?? task.artifactPath ?? task.path ?? null;
}

function serializeReadModelSummary(
  readModel,
  scenarioConfig = resolveImageIntentScenario("image-command"),
) {
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
    includesPrompt: serialized.includes(scenarioConfig.routedPrompt),
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

export async function waitForGuiImageCommandCompleted(
  page,
  options,
  scenarioConfig = resolveImageIntentScenario(options.scenario),
) {
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
        prompt: scenarioConfig.inputPrompt,
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
  scenarioConfig = resolveImageIntentScenario(options.scenario),
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
    lastSummary = serializeReadModelSummary(lastRead, scenarioConfig);
    if (
      JSON.stringify(lastRead || {}).includes(scenarioConfig.routedPrompt) &&
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

function imageCommandTaskRef(taskArtifact) {
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

  return {
    taskId,
    taskPath,
  };
}

async function waitForImageCommandTaskArtifactTerminal({
  page,
  workspace,
  appServerRequests,
  taskArtifact,
  options,
}) {
  const taskRef = imageCommandTaskRef(taskArtifact);
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const getResult = await invokeAppServerFromPage(
      page,
      APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
      {
        projectRootPath: workspace.rootPath,
        taskRef: taskRef.taskId,
      },
      appServerRequests,
    );
    const record = imageTaskRecord(getResult?.result);
    const attempts = Array.isArray(record?.attempts) ? record.attempts : [];
    const currentAttemptIndex = resolveCurrentAttemptIndex(record || {});
    const currentAttempt =
      currentAttemptIndex >= 0 ? attempts[currentAttemptIndex] : null;
    const resultImageCount = Array.isArray(record?.result?.images)
      ? record.result.images.length
      : 0;
    lastSnapshot = sanitizeJson({
      taskId: taskRef.taskId,
      taskPath: taskRef.taskPath,
      completeMethodUsed: "media_runtime_worker",
      completeReturned: Boolean(getResult?.result),
      status: record?.status ?? getResult?.result?.status ?? null,
      normalizedStatus:
        record?.normalized_status ??
        getResult?.result?.normalized_status ??
        null,
      sameTaskFileUpdated: true,
      resultImageCount,
      attemptCount: attempts.length,
      currentAttemptStatus: currentAttempt?.status ?? null,
      currentAttemptWorkerId: currentAttempt?.worker_id ?? null,
      currentAttemptHasResultSnapshot: Boolean(currentAttempt?.result_snapshot),
      response: getResult?.result ?? null,
    });
    if (
      lastSnapshot.normalizedStatus === IMAGE_COMMAND_TERMINAL_STATUS &&
      lastSnapshot.resultImageCount >= 1 &&
      lastSnapshot.currentAttemptWorkerId === IMAGE_COMMAND_WORKER_ID
    ) {
      return lastSnapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `Claw @配图后端 worker 未把 task artifact 推进终态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

async function createImageCommandTaskArtifact({
  page,
  workspace,
  appServerRequests,
  turnId,
  imageFixtureProvider,
  scenarioConfig,
}) {
  const request = {
    projectRootPath: workspace.rootPath,
    prompt: scenarioConfig.imagePrompt,
    title: scenarioConfig.taskTitle,
    rawText: scenarioConfig.routedPrompt,
    mode: "generate",
    size: "1024x1024",
    count: 1,
    providerId: imageFixtureProvider?.providerId ?? null,
    model: imageFixtureProvider?.modelId ?? IMAGE_FIXTURE_MODEL,
    executorMode: "images_api",
    sessionId: SESSION_ID,
    threadId: THREAD_ID,
    turnId,
    entrySource: scenarioConfig.entrySource,
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

export async function waitForGuiImageCommandTerminal(
  page,
  options,
  taskId,
  scenarioConfig = resolveImageIntentScenario(options.scenario),
) {
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
        prompt: scenarioConfig.inputPrompt,
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
  const taskRefs = Array.from(
    new Set(
      [taskId, imageTaskPath(taskArtifact), imageTaskArtifactPath(taskArtifact)]
        .filter((value) => typeof value === "string")
        .map((value) => value.trim())
        .filter(Boolean),
    ),
  );
  let getResult = null;
  const getErrors = [];
  for (const taskRef of taskRefs) {
    try {
      getResult = await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_MEDIA_TASK_ARTIFACT_GET,
        {
          projectRootPath: workspace.rootPath,
          taskRef,
        },
        appServerRequests,
      );
      break;
    } catch (error) {
      getErrors.push({ taskRef, error: String(error?.message || error) });
    }
  }
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
    getErrors,
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
  const reload = await reloadRendererDocument(page, options);
  const renderer = await waitForRendererReady(page, options);
  const session = await openFixtureSessionFromSidebar(
    page,
    options,
    appServerRequests,
  );
  return sanitizeJson({
    reload,
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
  imageFixtureProvider,
  summary,
}) {
  const scenarioConfig = resolveImageIntentScenario(options.scenario);
  const imageCommandInputSend = sanitizeJson(
    await sendPromptFromGui(page, options, scenarioConfig.inputPrompt, {
      expectedSessionId: SESSION_ID,
    }),
  );
  if (summary) {
    summary.imageCommandInputSend = imageCommandInputSend;
  }
  const backendTurn = await waitForBackendLedgerTurnStart(
    runtimeEnv.backendLedgerPath,
    scenarioConfig.routedPrompt,
    options,
  );
  const turnId = backendTurn.entry.turnId ?? backendTurn.entry.turn_id ?? null;
  const imageTaskArtifact = await createImageCommandTaskArtifact({
    page,
    workspace,
    appServerRequests,
    turnId,
    imageFixtureProvider,
    scenarioConfig,
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
    scenarioConfig,
  );
  const readModelImageCommandCompleted =
    await waitForSessionReadImageCommandCompleted(
      page,
      options,
      appServerRequests,
      scenarioConfig,
    );
  const imageCommandTaskArtifactTerminalPatch =
    await waitForImageCommandTaskArtifactTerminal({
      page,
      workspace,
      appServerRequests,
      taskArtifact: imageTaskArtifact.response,
      options,
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
    scenarioConfig,
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
      scenarioConfig,
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
    imageCommandFixtureProvider: imageFixtureProvider ?? null,
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

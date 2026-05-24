#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULT_APP_URL = "http://127.0.0.1:1420/";
const DEFAULT_HEALTH_URL = "http://127.0.0.1:3030/health";
const DEFAULT_INVOKE_URL = "http://127.0.0.1:3030/invoke";
const DEFAULT_TIMEOUT_MS = 120_000;
const DEFAULT_INTERVAL_MS = 500;
const DEFAULT_PREFIX = "at-command-registry-e2e";
const MENTION_USAGE_STORAGE_KEY = "lime:mention-entry-usage:v1";
const ONBOARDING_VERSION = "1.1.0";
const RECENT_REPLAY_TEXT = "E2E 最近搜索输入";
const IMAGE_PROMPT = "E2E 图片命令路由测试，请生成一张青柠插画";
const CHAT_PROVIDER_PREFERENCE = "deepseek";
const CHAT_MODEL_PREFERENCE = "deepseek-v4-flash";
const CONTEXT_CLOSE_TIMEOUT_MS = 5_000;

function parseArgs(argv) {
  const options = {
    appUrl: DEFAULT_APP_URL,
    healthUrl: DEFAULT_HEALTH_URL,
    invokeUrl: DEFAULT_INVOKE_URL,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    intervalMs: DEFAULT_INTERVAL_MS,
    prefix: DEFAULT_PREFIX,
    evidenceDir: path.join(process.cwd(), ".lime", "e2e", DEFAULT_PREFIX),
    headless: true,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const next = () => {
      index += 1;
      return argv[index];
    };

    switch (arg) {
      case "--app-url":
        options.appUrl = next();
        break;
      case "--health-url":
        options.healthUrl = next();
        break;
      case "--invoke-url":
        options.invokeUrl = next();
        break;
      case "--timeout-ms":
        options.timeoutMs = Number(next());
        break;
      case "--interval-ms":
        options.intervalMs = Number(next());
        break;
      case "--prefix":
        options.prefix = next();
        break;
      case "--evidence-dir":
        options.evidenceDir = next();
        break;
      case "--headed":
        options.headless = false;
        break;
      case "--headless":
        options.headless = true;
        break;
      default:
        throw new Error(`未知参数: ${arg}`);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms 必须是正数");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs <= 0) {
    throw new Error("--interval-ms 必须是正数");
  }

  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function timeoutAfter(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function waitForCondition(label, probe, timeoutMs, intervalMs) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < timeoutMs) {
    try {
      const result = await probe();
      if (result) {
        return result;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(intervalMs);
  }

  const suffix = lastError
    ? `，最后错误: ${lastError instanceof Error ? lastError.message : String(lastError)}`
    : "";
  throw new Error(`${label} 超时${suffix}`);
}

async function waitForAnyVisibleText(page, label, texts, timeoutMs, intervalMs) {
  return waitForCondition(
    label,
    async () => {
      for (const text of texts) {
        const locator = page.getByText(text, { exact: false }).first();
        const visible = await locator
          .waitFor({ state: "visible", timeout: Math.max(500, intervalMs) })
          .then(() => true)
          .catch(() => false);
        if (visible) {
          return text;
        }
      }
      return null;
    },
    timeoutMs,
    intervalMs,
  );
}

async function isTextVisible(page, text, timeoutMs) {
  return page
    .getByText(text, { exact: false })
    .first()
    .waitFor({ state: "visible", timeout: timeoutMs })
    .then(() => true)
    .catch(() => false);
}

async function waitForHealth(options) {
  return waitForCondition(
    "等待 DevBridge health",
    async () => {
      const response = await fetch(options.healthUrl).catch(() => null);
      if (!response?.ok) {
        return null;
      }
      const payload = await response.json().catch(() => null);
      return payload?.status === "ok" ? payload : null;
    },
    options.timeoutMs,
    options.intervalMs,
  );
}

async function launchContext(options) {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `${options.prefix}-${process.pid}-`),
  );
  const launchOptions = {
    headless: options.headless,
    viewport: { width: 1440, height: 960 },
  };

  try {
    const context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      channel: "chrome",
    });
    return { context, userDataDir };
  } catch (chromeError) {
    console.warn(
      `[${options.prefix}] Chrome channel 启动失败，尝试 Playwright Chromium: ${
        chromeError instanceof Error ? chromeError.message : String(chromeError)
      }`,
    );
    const context = await chromium.launchPersistentContext(
      userDataDir,
      launchOptions,
    );
    return { context, userDataDir };
  }
}

async function closeContextWithTimeout(context, options) {
  const closeResult = await Promise.race([
    context.close().then(
      () => ({ status: "closed" }),
      (error) => ({ status: "failed", error }),
    ),
    timeoutAfter(CONTEXT_CLOSE_TIMEOUT_MS).then(() => ({ status: "timeout" })),
  ]);

  if (closeResult.status === "failed") {
    console.warn(
      `[${options.prefix}] Playwright context 关闭失败: ${
        closeResult.error instanceof Error
          ? closeResult.error.message
          : String(closeResult.error)
      }`,
    );
  } else if (closeResult.status === "timeout") {
    console.warn(
      `[${options.prefix}] Playwright context 关闭超过 ${CONTEXT_CLOSE_TIMEOUT_MS}ms，继续退出以避免 smoke 清理阶段挂起`,
    );
  }
}

function removeUserDataDir(userDataDir, options) {
  try {
    fs.rmSync(userDataDir, { recursive: true, force: true });
  } catch (error) {
    console.warn(
      `[${options.prefix}] 删除临时浏览器 profile 失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

function logStage(options, stage) {
  console.log(`[${options.prefix}] stage=${stage}`);
}

function commandItemByText(page, text) {
  return page.locator("[cmdk-item]").filter({ hasText: text });
}

function readNestedObject(value, keys) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  for (const key of keys) {
    const candidate = value[key];
    if (
      candidate &&
      typeof candidate === "object" &&
      !Array.isArray(candidate)
    ) {
      return candidate;
    }
  }

  return null;
}

function readImageLaunch(metadata) {
  const harness = readNestedObject(metadata, ["harness"]) || metadata;
  const launch = readNestedObject(harness, [
    "image_skill_launch",
    "imageSkillLaunch",
  ]);
  const requestContext = readNestedObject(launch, [
    "request_context",
    "requestContext",
  ]);
  const imageTask =
    readNestedObject(launch, ["image_task", "imageTask"]) ||
    readNestedObject(requestContext, ["image_task", "imageTask"]);

  return { launch, imageTask };
}

function isImageGenerateSkillExecution(invoke) {
  return (
    invoke?.cmd === "execute_skill" &&
    invoke.args?.skillName === "image_generate"
  );
}

function isLegacyImageRuntimeSubmit(invoke) {
  return invoke?.cmd === "agent_runtime_submit_turn";
}

function parseInvokeRequest(request, invokeUrl) {
  const requestUrl = request.url();
  const normalizedInvokeUrl = invokeUrl.replace(/\/$/, "");
  if (
    request.method() !== "POST" ||
    (requestUrl !== invokeUrl &&
      !requestUrl.startsWith(`${normalizedInvokeUrl}/`) &&
      !requestUrl.endsWith("/invoke"))
  ) {
    return null;
  }

  const postData = request.postData();
  if (!postData) {
    return null;
  }

  try {
    return JSON.parse(postData);
  } catch {
    return null;
  }
}

async function invokeBridgeCommand(options, cmd, args, timeoutMs = 30_000) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(options.invokeUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ cmd, args }),
      signal: controller.signal,
    });
    const text = await response.text();
    const payload = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${text}`);
    }
    return payload;
  } finally {
    clearTimeout(timeout);
  }
}

async function interruptSubmittedTurn(options, request) {
  const sessionId = String(
    request.session_id || request.sessionId || "",
  ).trim();
  const turnId = String(request.turn_id || request.turnId || "").trim();
  if (!sessionId) {
    return { attempted: false, reason: "missing-session-id" };
  }

  const interruptRequest = {
    session_id: sessionId,
    ...(turnId ? { turn_id: turnId } : {}),
  };

  try {
    await invokeBridgeCommand(
      options,
      "agent_runtime_interrupt_turn",
      { request: interruptRequest },
      20_000,
    );
  } catch (error) {
    return {
      attempted: true,
      status: "failed",
      sessionId,
      turnId: turnId || null,
      error: error instanceof Error ? error.message : String(error),
    };
  }

  const drained = await waitForCondition(
    "等待 @配图 smoke 提交任务清理",
    async () => {
      const threadRead = await invokeBridgeCommand(
        options,
        "agent_runtime_get_thread_read",
        { sessionId },
        20_000,
      ).catch(() => null);
      if (!threadRead) {
        return null;
      }
      const status = String(threadRead.status || "").toLowerCase();
      const queuedTurns = Array.isArray(threadRead.queued_turns)
        ? threadRead.queued_turns.length
        : 0;
      const activeTurnId =
        threadRead.active_turn_id || threadRead.activeTurnId || null;
      return !activeTurnId &&
        queuedTurns === 0 &&
        (status === "idle" || status === "completed" || status === "cancelled")
        ? { status: threadRead.status || null, queuedTurns }
        : null;
    },
    30_000,
    options.intervalMs,
  ).catch((error) => ({
    status: "unknown",
    error: error instanceof Error ? error.message : String(error),
  }));

  return {
    attempted: true,
    status: "sent",
    sessionId,
    turnId: turnId || null,
    drained,
  };
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  fs.mkdirSync(options.evidenceDir, { recursive: true });

  logStage(options, "wait-health");
  const health = await waitForHealth(options);

  logStage(options, "launch-browser");
  const { context, userDataDir } = await launchContext(options);
  const summary = {
    scenarioId: options.prefix,
    appUrl: options.appUrl,
    bridge: health,
    chatPreferenceFixture: {
      provider: CHAT_PROVIDER_PREFERENCE,
      model: CHAT_MODEL_PREFERENCE,
    },
    assertions: {},
    consoleErrors: [],
    consoleWarnings: [],
    failedRequests: [],
    invokeCommands: [],
  };

  try {
    await context.addInitScript(
      ({
        usageKey,
        replayText,
        onboardingVersion,
        chatProviderPreference,
        chatModelPreference,
      }) => {
        window.localStorage.setItem("lime_onboarding_complete", "true");
        window.localStorage.setItem(
          "lime_onboarding_version",
          onboardingVersion,
        );
        window.localStorage.setItem("lime_user_profile", "developer");
        window.localStorage.setItem(
          "agent_pref_provider",
          JSON.stringify(chatProviderPreference),
        );
        window.localStorage.setItem(
          "agent_pref_model",
          JSON.stringify(chatModelPreference),
        );
        window.localStorage.setItem(
          "agent_pref_provider_global",
          JSON.stringify(chatProviderPreference),
        );
        window.localStorage.setItem(
          "agent_pref_model_global",
          JSON.stringify(chatModelPreference),
        );
        window.localStorage.setItem(
          usageKey,
          JSON.stringify([
            {
              kind: "builtin_command",
              entryId: "research",
              usedAt: Date.now(),
              replayText,
            },
          ]),
        );
      },
      {
        usageKey: MENTION_USAGE_STORAGE_KEY,
        replayText: RECENT_REPLAY_TEXT,
        onboardingVersion: ONBOARDING_VERSION,
        chatProviderPreference: CHAT_PROVIDER_PREFERENCE,
        chatModelPreference: CHAT_MODEL_PREFERENCE,
      },
    );

    const page = await context.newPage();
    const invokes = [];

    page.on("console", (message) => {
      const entry = {
        type: message.type(),
        text: message.text(),
      };
      if (message.type() === "error") {
        summary.consoleErrors.push(entry);
      } else if (message.type() === "warning") {
        summary.consoleWarnings.push(entry);
      }
    });
    page.on("request", (request) => {
      const parsed = parseInvokeRequest(request, options.invokeUrl);
      if (!parsed) {
        return;
      }
      invokes.push({
        cmd: parsed.cmd,
        args: parsed.args,
      });
      summary.invokeCommands.push(parsed.cmd);
    });
    page.on("requestfailed", (request) => {
      summary.failedRequests.push({
        url: request.url(),
        method: request.method(),
        failure: request.failure()?.errorText || "unknown",
      });
    });

    logStage(options, "open-app");
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded" });
    await page
      .waitForLoadState("networkidle", { timeout: 30_000 })
      .catch(() => undefined);
    await page
      .getByRole("button", { name: "新建任务" })
      .click({ timeout: 20_000 })
      .catch(() => undefined);

    logStage(options, "wait-composer");
    const textarea = page.locator('textarea[name="agent-chat-message"]').last();
    await textarea.waitFor({ state: "visible", timeout: options.timeoutMs });
    await page.waitForFunction(
      () => {
        const inputs = Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        );
        const input = inputs.at(-1);
        return Boolean(input && !input.disabled);
      },
      null,
      { timeout: options.timeoutMs },
    );

    logStage(options, "open-at-panel");
    await textarea.click();
    await textarea.fill("@");
    await page
      .getByText("统一调用注册表", { exact: false })
      .waitFor({ state: "visible", timeout: options.timeoutMs });
    const imageCommandItem = commandItemByText(page, "@配图").first();
    await imageCommandItem.waitFor({
      state: "attached",
      timeout: options.timeoutMs,
    });

    const atPanelText = await page.locator("body").innerText();
    const commandIndex = atPanelText.indexOf("搜索 / 读取");
    const recentIndex = atPanelText.indexOf("最近调用");
    const imageCommandVisible = atPanelText.includes("@配图");
    const searchCommandItems = await commandItemByText(page, "@搜索").count();

    assert(commandIndex >= 0, "@ 面板缺少“搜索 / 读取”命令分组");
    assert(recentIndex >= 0, "@ 面板缺少“最近调用”分组");
    assert(
      commandIndex < recentIndex,
      "@ 面板应先展示命令注册表，再展示最近调用",
    );
    assert(imageCommandVisible, "@ 面板缺少 @配图 命令");
    assert(
      searchCommandItems >= 2,
      "最近调用存在时，@搜索 应同时保留命令入口和续跑入口",
    );
    summary.assertions.registryBeforeRecent = true;
    summary.assertions.imageCommandVisible = true;
    summary.assertions.recentDoesNotHideCommand = true;

    await page.screenshot({
      path: path.join(options.evidenceDir, `${options.prefix}-01-at-panel.png`),
      fullPage: true,
    });

    logStage(options, "select-image-command");
    await imageCommandItem.scrollIntoViewIfNeeded();
    await imageCommandItem.click();
    await textarea.fill(IMAGE_PROMPT);

    logStage(options, "submit-image-command");
    const submitStart = invokes.length;
    await page.getByRole("button", { name: "发送" }).last().click({
      timeout: options.timeoutMs,
    });

    const submitInvoke = await waitForCondition(
      "等待 @配图 提交 image_generate 执行请求",
      () =>
        invokes
          .slice(submitStart)
          .find(
            (item) =>
              isImageGenerateSkillExecution(item) ||
              isLegacyImageRuntimeSubmit(item),
          ) || null,
      options.timeoutMs,
      options.intervalMs,
    );

    if (isImageGenerateSkillExecution(submitInvoke)) {
      const args = submitInvoke.args || {};
      const userInput = String(args.userInput || "");
      assert(
        userInput.includes("@配图"),
        "@配图 execute_skill.userInput 应保留命令标签",
      );
      assert(
        userInput.includes(IMAGE_PROMPT),
        "@配图 execute_skill.userInput 未保留用户输入",
      );
      assert(
        typeof args.executionId === "string" && args.executionId.trim(),
        "@配图 execute_skill 缺少 executionId",
      );
      assert(
        typeof args.sessionId === "string" && args.sessionId.trim(),
        "@配图 execute_skill 缺少 sessionId",
      );

      const executionMarker = await waitForAnyVisibleText(
        page,
        "等待 @配图 技能执行可见状态",
        [
          "先执行技能 image_generate",
          "正在执行 Skill: image_generate",
          "任务类型：image_generate",
          "图片生成",
        ],
        options.timeoutMs,
        options.intervalMs,
      );
      const imagePreviewVisible = await isTextVisible(page, "图片生成", 5_000);

      summary.assertions.imageSkillExecutionSubmitted = true;
      summary.assertions.imageCommandTagPreserved = true;
      summary.assertions.imagePromptPreserved = true;
      summary.assertions.imageGenerateProcessVisible = true;
      summary.assertions.imageGenerateProcessMarker = executionMarker;
      summary.assertions.imagePreviewVisible = imagePreviewVisible;
      summary.submitRequest = {
        routeMode: "skill_execution",
        command: submitInvoke.cmd,
        skillName: args.skillName,
        userInput,
        sessionId: args.sessionId || null,
        executionId: args.executionId || null,
        providerOverride: args.providerOverride ?? null,
        modelOverride: args.modelOverride ?? null,
      };
    } else {
      const request = submitInvoke.args?.request || {};
      const turnConfig = request.turn_config || {};
      const metadata = turnConfig.metadata || {};
      const { launch, imageTask } = readImageLaunch(metadata);
      const runtimeContract = readNestedObject(imageTask, [
        "runtime_contract",
        "runtimeContract",
      ]);
      const contractKey =
        imageTask?.modality_contract_key ||
        imageTask?.modalityContractKey ||
        runtimeContract?.contract_key ||
        runtimeContract?.contractKey;

      assert(launch, "@配图 提交缺少 harness.image_skill_launch");
      assert(imageTask, "@配图 提交缺少 image_task");
      assert(
        String(imageTask.prompt || "").includes(IMAGE_PROMPT),
        "@配图 image_task.prompt 未保留用户输入",
      );
      assert(
        contractKey === "image_generation",
        `@配图 image_task 合同应为 image_generation，实际为 ${String(contractKey)}`,
      );
      assert(
        turnConfig.provider_preference == null,
        "@配图 不应把当前聊天 provider 提交为 request provider_preference",
      );
      assert(
        turnConfig.model_preference == null,
        "@配图 不应把当前聊天 model 提交为 request model_preference",
      );

      summary.assertions.imageSkillLaunchSubmitted = true;
      summary.assertions.imageGenerationContractPreserved = true;
      summary.assertions.chatModelPreferenceSuppressed = true;
      summary.submitRequest = {
        routeMode: "agent_runtime_submit_turn",
        message: request.message,
        sessionId: request.session_id || null,
        turnId: request.turn_id || null,
        providerPreference: turnConfig.provider_preference ?? null,
        modelPreference: turnConfig.model_preference ?? null,
        contractKey,
        imagePrompt: imageTask.prompt,
      };
    }

    await page.screenshot({
      path: path.join(
        options.evidenceDir,
        `${options.prefix}-02-submitted.png`,
      ),
      fullPage: true,
    });

    if (summary.submitRequest?.routeMode === "agent_runtime_submit_turn") {
      summary.cleanup = await interruptSubmittedTurn(
        options,
        submitInvoke.args?.request || {},
      );
    } else {
      summary.cleanup = {
        attempted: false,
        reason: "skill-execution-route",
      };
    }

    const summaryPath = path.join(
      options.evidenceDir,
      `${options.prefix}-summary.json`,
    );
    fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
    console.log(JSON.stringify(summary, null, 2));
    console.log(`[${options.prefix}] summary=${summaryPath}`);
    console.log(`[${options.prefix}] 通过`);
  } finally {
    await closeContextWithTimeout(context, options);
    removeUserDataDir(userDataDir, options);
  }
}

main()
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });

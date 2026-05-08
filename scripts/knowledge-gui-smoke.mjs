#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { chromium } from "playwright";

const DEFAULTS = {
  appUrl: "http://127.0.0.1:1420/",
  healthUrl: "http://127.0.0.1:3030/health",
  invokeUrl: "http://127.0.0.1:3030/invoke",
  timeoutMs: 180_000,
  intervalMs: 1_000,
};

const INVOKE_TIMEOUT_CEILING_MS = 180_000;
const INVOKE_RETRY_COUNT = 10;
const INVOKE_RETRY_DELAY_MS = 1_000;
const DEFAULT_ACTION_TIMEOUT_MS = 45_000;
const POST_HEALTH_SETTLE_MS = 1_000;
const ONBOARDING_VERSION = "1.1.0";

const DEFAULT_PACK = {
  name: "smoke-default",
  title: "Smoke 默认项目资料",
  type: "custom",
  sourceFileName: "default-source.md",
  sourceText: [
    "# Smoke 默认项目资料",
    "",
    "- 事实：该资料用于 GUI smoke 验证默认资料、目录和聊天使用入口。",
    "- 边界：只能用于本地 smoke，不得作为用户真实知识资产。",
    "- 待确认：无。",
  ].join("\n"),
};

const SECONDARY_PACK = {
  name: "smoke-secondary",
  title: "Smoke 备用项目资料",
  type: "custom",
  sourceFileName: "secondary-source.md",
  sourceText: [
    "# Smoke 备用项目资料",
    "",
    "- 事实：该资料用于验证同一项目下存在多份资料时目录仍可读。",
    "- 边界：只能用于本地 smoke，不参与默认生成。",
    "- 待确认：无。",
  ].join("\n"),
};

const BUILDER_ACCEPTANCE_PACK = {
  title: "content-ops-acceptance",
  sourceText: [
    "# 内容运营验收资料",
    "",
    "- 栏目：每周二发布选题复盘，每周五发布案例拆解。",
    "- SOP：选题必须包含目标人群、表达角度、引用素材和风险边界。",
    "- 边界：没有来源的增长数据必须标记待确认，不能编造成事实。",
  ].join("\n"),
};

const PERSONA_PACK = {
  name: "smoke-persona",
  title: "Smoke 人设资料",
  type: "personal-ip",
  sourceFileName: "persona-source.md",
  sourceText: [
    "# Smoke 人设资料",
    "",
    "- 语气：清晰、克制、只说已确认事实。",
    "- 边界：不得把 smoke 数据当作真实用户资料。",
    "- 适用：验证项目资料选择弹层的写作口吻和参考资料协同。",
  ].join("\n"),
};

const AGENT_RESULT_MESSAGE = {
  id: "smoke-agent-result-knowledge",
  title: "对话结果资料",
  content: [
    "# 对话结果资料",
    "",
    "- 事实：该结果来自当前 Agent 对话，用于验证生成结果可以保存到项目资料。",
    "- 适用场景：用户拿到一段可复用结论后，可以一键保存，随后在项目资料管理页检查确认。",
    "- 风险提示：保存后仍需确认，避免把临时分析当成长期事实。",
  ].join("\n"),
};

const FILE_MANAGER_SOURCE_TITLE = "default-source";
const USER_FACING_FORBIDDEN_TEXT = [
  ".lime/knowledge",
  "KNOWLEDGE.md",
  "knowledge_builder",
  "compiled/brief.md",
  "sources/source.md",
  "frontmatter",
  "<knowledge_pack",
  "working_dir",
  "user-confirmed",
  "runtimeMode",
  "primaryDocument",
  "runtimeBinding",
  "Builder Skill",
  "Knowledge Pack",
  "Resolver",
  "Context Run",
  "runtime",
  "profile",
  "documents",
  "sources",
  "runs",
  "persona",
  "data",
  "wrapper",
  "selected sections",
  "compile",
  "Request failed",
  "Bad request",
];

function printHelp() {
  console.log(`
Lime Knowledge GUI Smoke

用途:
  通过真实 Lime 页面验证项目资料管理页、全部资料列表、
  用于生成视图与补充导入入口。

用法:
  npm run smoke:knowledge-gui

选项:
  --app-url <url>          前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>       DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>       DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>        总超时，默认 180000
  --interval-ms <ms>       轮询间隔，默认 1000
  -h, --help               显示帮助
`);
}

function parseArgs(argv) {
  const options = { ...DEFAULTS };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--app-url" && argv[index + 1]) {
      options.appUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg === "--health-url" && argv[index + 1]) {
      options.healthUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg === "--invoke-url" && argv[index + 1]) {
      options.invokeUrl = String(argv[index + 1]).trim();
      index += 1;
      continue;
    }

    if (arg === "--timeout-ms" && argv[index + 1]) {
      options.timeoutMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--interval-ms" && argv[index + 1]) {
      options.intervalMs = Number(argv[index + 1]);
      index += 1;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs < 30_000) {
    throw new Error("--timeout-ms 必须是 >= 30000 的数字");
  }
  if (!Number.isFinite(options.intervalMs) || options.intervalMs < 100) {
    throw new Error("--interval-ms 必须是 >= 100 的数字");
  }
  if (!options.appUrl || !options.healthUrl || !options.invokeUrl) {
    throw new Error("--app-url、--health-url、--invoke-url 均不能为空");
  }

  return options;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logStage(label) {
  console.log(`[smoke:knowledge-gui] stage=${label}`);
}

function isTransientInvokeError(error) {
  return (
    error?.name === "TimeoutError" ||
    (error instanceof TypeError && error.message === "fetch failed")
  );
}

async function invoke(options, cmd, args) {
  const invokeTimeoutMs = Math.min(
    options.timeoutMs,
    INVOKE_TIMEOUT_CEILING_MS,
  );

  for (let attempt = 1; attempt <= INVOKE_RETRY_COUNT; attempt += 1) {
    try {
      const response = await fetch(options.invokeUrl, {
        method: "POST",
        headers: {
          "content-type": "application/json",
        },
        body: JSON.stringify({ cmd, args }),
        signal: AbortSignal.timeout(invokeTimeoutMs),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const payload = await response.json();
      if (payload?.error) {
        throw new Error(String(payload.error));
      }

      return payload?.result;
    } catch (error) {
      const detail = error instanceof Error ? error.message : String(error);
      if (!isTransientInvokeError(error) || attempt >= INVOKE_RETRY_COUNT) {
        if (error?.name === "TimeoutError") {
          throw new Error(
            `[smoke:knowledge-gui] ${cmd} 超时，${invokeTimeoutMs}ms 内未收到 DevBridge 响应`,
          );
        }
        throw new Error(`[smoke:knowledge-gui] ${cmd} 请求失败: ${detail}`);
      }
      console.warn(
        `[smoke:knowledge-gui] ${cmd} 第 ${attempt} 次请求失败，${INVOKE_RETRY_DELAY_MS}ms 后重试: ${detail}`,
      );
      await sleep(INVOKE_RETRY_DELAY_MS);
    }
  }

  throw new Error(`[smoke:knowledge-gui] ${cmd} 请求失败: unknown error`);
}

async function waitForHealth(options) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const response = await fetch(options.healthUrl, { method: "GET" });
      const payload = await response.json();
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      console.log(
        `[smoke:knowledge-gui] DevBridge 已就绪 (${Date.now() - startedAt}ms)${
          payload?.status ? ` status=${payload.status}` : ""
        }`,
      );
      return;
    } catch (error) {
      lastError = error;
      await sleep(options.intervalMs);
    }
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "unknown error");
  throw new Error(
    `[smoke:knowledge-gui] DevBridge 未就绪，请先启动 npm run tauri:dev:headless。最后错误: ${detail}`,
  );
}

async function waitForPageText(page, label, needles, timeoutMs) {
  try {
    await page.waitForFunction(
      (expectedNeedles) => {
        const text = document.body?.innerText || "";
        const fieldText = Array.from(
          document.querySelectorAll("textarea, input"),
        )
          .map((element) =>
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLInputElement
              ? element.value
              : "",
          )
          .join("\n");
        const searchableText = `${text}\n${fieldText}`;
        return expectedNeedles.every((needle) =>
          searchableText.includes(needle),
        );
      },
      needles,
      { timeout: timeoutMs },
    );
  } catch (error) {
    const pageUrl = page.url();
    const pageTitle = await page.title().catch(() => "");
    const text = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const fieldText = await page
      .locator("textarea, input")
      .evaluateAll((elements) =>
        elements
          .map((element) =>
            element instanceof HTMLTextAreaElement ||
            element instanceof HTMLInputElement
              ? element.value
              : "",
          )
          .filter(Boolean)
          .join("\n"),
      )
      .catch(() => "");
    const searchableText = `${text}\n${fieldText}`;
    const missing = needles.filter(
      (needle) => !searchableText.includes(needle),
    );
    throw new Error(
      `[smoke:knowledge-gui] ${label} 等待失败，缺少 ${JSON.stringify(
        missing,
      )}，url=${pageUrl}，title=${pageTitle}，页面文本预览: ${searchableText.slice(0, 2_000)}`,
      { cause: error },
    );
  }
}

async function assertVisibleText(page, label, needles) {
  const text = await page.locator("body").innerText();
  const missing = needles.filter((needle) => !text.includes(needle));
  if (missing.length > 0) {
    throw new Error(
      `[smoke:knowledge-gui] ${label} 验收失败，缺少 ${JSON.stringify(
        missing,
      )}，页面文本预览: ${text.slice(0, 2_000)}`,
    );
  }
}

async function assertNoUserFacingInternalText(page, label) {
  const pageMain = page.locator("main").nth(1);
  const text =
    (await pageMain.innerText().catch(() => "")) ||
    (await page.locator("body").innerText());
  const leaked = USER_FACING_FORBIDDEN_TEXT.filter((needle) =>
    text.includes(needle),
  );
  if (leaked.length > 0) {
    const firstLeak = leaked[0];
    const index = text.indexOf(firstLeak);
    const preview =
      index >= 0 ? text.slice(Math.max(0, index - 180), index + 260) : "";
    throw new Error(
      `[smoke:knowledge-gui] ${label} 暴露内部实现文本: ${JSON.stringify(
        leaked,
      )}，附近文本: ${preview}`,
    );
  }
}

async function clickPageControl(page, { text, ariaLabel, index = 0 }) {
  const locator = ariaLabel
    ? page.getByRole("button", { name: ariaLabel }).nth(index)
    : page
        .locator("button, [role='button'], a")
        .filter({ hasText: text })
        .nth(index);

  try {
    await locator.click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
  } catch (error) {
    const pageText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const buttons = await page
      .locator("button, [role='button'], a")
      .evaluateAll((items) =>
        items.slice(0, 80).map((item) => ({
          text: (item.textContent || "").trim().replace(/\s+/g, " "),
          aria: item.getAttribute("aria-label"),
          title: item.getAttribute("title"),
          disabled:
            item instanceof HTMLButtonElement ? item.disabled : undefined,
        })),
      )
      .catch(() => []);
    throw new Error(
      `[smoke:knowledge-gui] 点击控件失败 ${JSON.stringify({
        text,
        ariaLabel,
        index,
        buttons,
      })}`,
      { cause: error },
    );
  }
}

async function waitForExactButton(page, label, name, timeoutMs) {
  try {
    await page
      .getByRole("button", { name, exact: true })
      .waitFor({ state: "visible", timeout: timeoutMs });
  } catch (error) {
    const pageText = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const buttons = await page
      .locator("button, [role='button'], a")
      .evaluateAll((items) =>
        items.slice(0, 80).map((item) => ({
          text: (item.textContent || "").trim().replace(/\s+/g, " "),
          aria: item.getAttribute("aria-label"),
          title: item.getAttribute("title"),
          disabled:
            item instanceof HTMLButtonElement ? item.disabled : undefined,
        })),
      )
      .catch(() => []);
    throw new Error(
      `[smoke:knowledge-gui] ${label} 等待按钮失败 ${JSON.stringify({
        name,
        buttons,
      })}，页面文本预览: ${pageText.slice(0, 2_000)}`,
      { cause: error },
    );
  }
}

async function openPackDetail(page, title) {
  await page
    .locator("article")
    .filter({ hasText: title })
    .getByRole("button", { name: "打开" })
    .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
}

async function openPackForCreation(page, title) {
  await page
    .locator("article")
    .filter({ hasText: title })
    .getByRole("button", { name: "用于创作" })
    .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
}

async function clickScopedButton(page, { scope, text, ariaLabel, index = 0 }) {
  const scoped = page.locator(scope);
  const locator = ariaLabel
    ? scoped.getByRole("button", { name: ariaLabel, exact: true }).nth(index)
    : scoped.locator("button, a").filter({ hasText: text }).nth(index);

  try {
    await locator.click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
  } catch (error) {
    const buttons = await scoped
      .locator("button, a")
      .evaluateAll((items) =>
        items.slice(0, 80).map((item) => ({
          text: (item.textContent || "").trim().replace(/\s+/g, " "),
          aria: item.getAttribute("aria-label"),
          title: item.getAttribute("title"),
          disabled:
            item instanceof HTMLButtonElement ? item.disabled : undefined,
        })),
      )
      .catch(() => []);
    throw new Error(
      `[smoke:knowledge-gui] 点击区域控件失败 ${JSON.stringify({
        scope,
        text,
        ariaLabel,
        index,
        buttons,
      })}`,
      { cause: error },
    );
  }
}

async function confirmKnowledgeComposer(
  page,
  options,
  { selectSecondaryData = false, selectPersona = false } = {},
) {
  await waitForPageText(
    page,
    "项目资料选择弹层打开",
    ["选择这次创作用哪些资料", "写作口吻（只能选 1 个）", "要参考的资料（可多选）"],
    options.timeoutMs,
  );

  if (selectPersona) {
    await page
      .locator(`[data-testid="knowledge-composer-persona-${PERSONA_PACK.name}"]`)
      .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
  }

  if (selectSecondaryData) {
    await page
      .locator(`[data-testid="knowledge-composer-data-${SECONDARY_PACK.name}"]`)
      .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
    await waitForPageText(
      page,
      "项目资料选择弹层多选",
      [selectPersona ? "已选 3 份资料" : "已选 2 份资料"],
      options.timeoutMs,
    );
  }

  await clickPageControl(page, { text: "确认使用" });
}

async function verifyReviewPage(page, options, packTitle) {
  await openPackDetail(page, packTitle);
  await waitForPageText(
    page,
    "确认资料页加载",
    [
      packTitle,
      "完整资料文档",
      "打开完整文档",
      "导出",
      "修改内容",
      "需要你确认的内容",
      "确认后会发生什么",
      "不会覆盖原始资料",
    ],
    options.timeoutMs,
  );
  await assertNoUserFacingInternalText(page, "确认资料页");

  await clickPageControl(page, { text: "打开完整文档" });
  await waitForPageText(
    page,
    "完整资料文档展开",
    ["完整资料文档内容"],
    options.timeoutMs,
  );
  await assertNoUserFacingInternalText(page, "完整资料文档展开");
}

async function verifyBuilderImportAndReview(page, options) {
  await clickPageControl(page, { text: "整理新资料" });
  await waitForPageText(
    page,
    "整理新资料页面加载",
    [
      "选择资料用途",
      "添加原始资料",
      "Lime 开始整理",
      "没有确认的资料不会自动用于创作",
    ],
    options.timeoutMs,
  );

  await page
    .getByRole("button", { name: "内容运营", exact: true })
    .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
  await page.getByLabel("资料名称").fill(BUILDER_ACCEPTANCE_PACK.title);
  await page
    .getByLabel("原始资料正文")
    .fill(BUILDER_ACCEPTANCE_PACK.sourceText);
  await waitForPageText(
    page,
    "Builder 表单填充",
    [
      BUILDER_ACCEPTANCE_PACK.title,
      "栏目：每周二发布选题复盘",
      "边界：没有来源的增长数据必须标记待确认",
    ],
    options.timeoutMs,
  );
  await page
    .getByRole("button", { name: "Lime 开始整理", exact: true })
    .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });

  await waitForExactButton(page, "整理结果详情加载", "确认可用", options.timeoutMs);
  await waitForPageText(
    page,
    "整理结果详情加载",
    [
      BUILDER_ACCEPTANCE_PACK.title,
      "完整资料文档",
      "需要你确认的内容",
      "确认可用",
    ],
    options.timeoutMs,
  );
  await assertNoUserFacingInternalText(page, "整理结果详情");

  await page
    .getByRole("button", { name: "确认可用", exact: true })
    .click({ timeout: DEFAULT_ACTION_TIMEOUT_MS });
  await waitForPageText(
    page,
    "整理结果确认可用",
    ["资料已确认可用", BUILDER_ACCEPTANCE_PACK.title],
    options.timeoutMs,
  );
}

async function openKnowledgePageFromMainNav(page) {
  await clickScopedButton(page, {
    scope: '[data-testid="app-sidebar-main-nav"]',
    ariaLabel: "项目资料",
  });
}

async function waitForKnowledgePack(options, label, matcher) {
  const startedAt = Date.now();
  let lastError = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    try {
      const result = await invoke(options, "knowledge_list_packs", {
        request: {
          workingDir: options.workingDir,
          includeArchived: true,
        },
      });
      const packs = Array.isArray(result?.packs) ? result.packs : [];
      const found = packs.find((pack) => {
        const metadata = pack?.metadata || {};
        return matcher({
          name: String(metadata.name || ""),
          description: String(metadata.description || ""),
          status: String(metadata.status || ""),
        });
      });
      if (found) {
        return found;
      }
    } catch (error) {
      lastError = error;
    }
    await sleep(options.intervalMs);
  }

  const detail =
    lastError instanceof Error
      ? lastError.message
      : String(lastError || "未找到匹配资料");
  throw new Error(`[smoke:knowledge-gui] 等待资料失败: ${label}。${detail}`);
}

async function seedAgentResultForKnowledgeCapture(page, options) {
  await page.evaluate(
    ({ projectId, message }) => {
      const now = new Date().toISOString();
      sessionStorage.setItem(
        `aster_messages_${projectId}`,
        JSON.stringify([
          {
            id: message.id,
            role: "assistant",
            content: message.content,
            timestamp: now,
          },
        ]),
      );
      sessionStorage.removeItem(`aster_curr_sessionId_${projectId}`);
      sessionStorage.removeItem(`aster_last_sessionId_${projectId}`);
      sessionStorage.removeItem(`aster_thread_turns_${projectId}`);
      sessionStorage.removeItem(`aster_thread_items_${projectId}`);
      sessionStorage.removeItem(`aster_curr_turnId_${projectId}`);
    },
    {
      projectId: options.projectId,
      message: AGENT_RESULT_MESSAGE,
    },
  );
}

async function createSmokeProject(options) {
  const projectName = `Knowledge GUI Smoke ${process.pid}`;
  const project = await invoke(options, "workspace_create", {
    request: {
      name: projectName,
      rootPath: options.workingDir,
      workspaceType: "temporary",
    },
  });
  const projectId = String(project?.id || "").trim();
  if (!projectId) {
    throw new Error("[smoke:knowledge-gui] workspace_create 未返回项目 ID");
  }
  options.projectId = projectId;
  options.projectName = String(project?.name || projectName);
  const projectRootPath = String(
    project?.rootPath || project?.root_path || "",
  ).trim();
  if (projectRootPath) {
    options.workingDir = projectRootPath;
    fs.mkdirSync(options.workingDir, { recursive: true });
  }
}

async function cleanupSmokeProject(options) {
  if (!options.projectId) {
    return;
  }

  try {
    await invoke(options, "workspace_delete", {
      id: options.projectId,
      deleteDirectory: false,
    });
  } catch (error) {
    console.warn(
      `[smoke:knowledge-gui] 清理临时项目失败: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
  }
}

async function runPlaywrightGuiFlow(options) {
  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `lime-knowledge-gui-playwright-${process.pid}-`),
  );
  const launchOptions = {
    headless: true,
    viewport: { width: 1440, height: 960 },
  };
  let context = null;

  try {
    context = await chromium.launchPersistentContext(userDataDir, {
      ...launchOptions,
      channel: "chrome",
    });
  } catch (chromeError) {
    console.warn(
      `[smoke:knowledge-gui] Chrome channel 启动失败，尝试 Playwright 自带 Chromium: ${
        chromeError instanceof Error ? chromeError.message : String(chromeError)
      }`,
    );
    context = await chromium.launchPersistentContext(
      userDataDir,
      launchOptions,
    );
  }

  const page = context.pages()[0] ?? (await context.newPage());
  const consoleErrors = [];

  page.on("console", (message) => {
    if (message.type() === "error") {
      consoleErrors.push(message.text());
    }
  });
  page.on("pageerror", (error) => {
    consoleErrors.push(error.stack || error.message);
  });

  try {
    logStage("open-playwright-page");
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ workingDir, onboardingVersion, projectId }) => {
        localStorage.setItem("lime_onboarding_complete", "true");
        localStorage.setItem("lime_onboarding_version", onboardingVersion);
        localStorage.setItem("lime_user_profile", "developer");
        localStorage.setItem("lime.knowledge.working-dir", workingDir);
        localStorage.setItem(
          "agent_last_project_id",
          JSON.stringify(projectId),
        );
      },
      {
        workingDir: options.workingDir,
        onboardingVersion: ONBOARDING_VERSION,
        projectId: options.projectId,
      },
    );
    await page.reload({ waitUntil: "domcontentloaded" });

    logStage("wait-home");
    await waitForPageText(
      page,
      "首页加载",
      ["青柠一下，灵感即来"],
      options.timeoutMs,
    );

    logStage("open-home-knowledge-hub");
    await clickPageControl(page, { text: "添加资料" });

    logStage("wait-home-knowledge-hub");
    await waitForPageText(
      page,
      "首页资料入口加载",
      ["添加新资料", "检查资料", "使用这份资料"],
      options.timeoutMs,
    );
    await page.keyboard.press("Escape");

    logStage("open-file-manager");
    await clickPageControl(page, { ariaLabel: "打开左侧文件管理器" });

    logStage("wait-file-manager");
    await waitForPageText(
      page,
      "文件管理器加载",
      ["default-source.md", "加入对话", "设为资料", "本地位置"],
      options.timeoutMs,
    );

    logStage("import-file-manager-source");
    await clickScopedButton(page, {
      scope: '[data-testid="file-manager-sidebar"]',
      ariaLabel: "设为项目资料 default-source.md",
    });

    logStage("wait-file-manager-source-imported");
    await waitForKnowledgePack(
      options,
      "文件管理器资料导入完成",
      (pack) =>
        pack.description === FILE_MANAGER_SOURCE_TITLE ||
        pack.name === FILE_MANAGER_SOURCE_TITLE,
    );

    await clickPageControl(page, { ariaLabel: "关闭文件管理器" });

    logStage("open-knowledge-page");
    await openKnowledgePageFromMainNav(page);

    logStage("wait-knowledge-overview");
    await waitForPageText(
      page,
      "知识库总览加载",
      [
        "让 Lime 记住这个项目",
        "回到创作",
        "整理新资料",
        "项目资料清单",
        "可用于创作",
        "本轮创作会使用",
        PERSONA_PACK.title,
        DEFAULT_PACK.title,
        SECONDARY_PACK.title,
        FILE_MANAGER_SOURCE_TITLE,
      ],
      options.timeoutMs,
    );
    await assertVisibleText(page, "项目资料首页细节", [
      "接下来你可以",
      "确认待审资料",
      "选择创作时使用的资料",
      "资料只有确认后才会用于创作",
    ]);
    await assertNoUserFacingInternalText(page, "项目资料首页");

    logStage("verify-states-page");
    await clickPageControl(page, { text: "查看状态说明" });
    await waitForPageText(
      page,
      "项目资料状态说明页加载",
      ["项目资料状态说明", "没有资料", "已可用", "待确认", "需要补充", "整理失败"],
      options.timeoutMs,
    );
    await assertNoUserFacingInternalText(page, "项目资料状态说明页");
    await clickScopedButton(page, {
      scope: '[data-testid="app-sidebar-main-nav"]',
      ariaLabel: "灵感",
    });
    await waitForPageText(
      page,
      "灵感页加载",
      ["收藏过的想法"],
      options.timeoutMs,
    );
    await openKnowledgePageFromMainNav(page);
    await waitForPageText(
      page,
      "状态说明后返回项目资料首页",
      ["让 Lime 记住这个项目", "项目资料清单", DEFAULT_PACK.title],
      options.timeoutMs,
    );

    logStage("verify-review-page");
    await verifyReviewPage(page, options, DEFAULT_PACK.title);
    await clickPageControl(page, { text: "回到项目资料" });

    logStage("open-agent-with-knowledge");
    await openPackForCreation(page, DEFAULT_PACK.title);
    await confirmKnowledgeComposer(page, options, {
      selectSecondaryData: true,
      selectPersona: true,
    });

    logStage("wait-agent");
    try {
      await waitForPageText(
        page,
        "Agent 页面加载",
        [`资料：${DEFAULT_PACK.title}`, "+2", "请基于当前项目资料创作内容"],
        options.timeoutMs,
      );
    } catch (error) {
      if (consoleErrors.length > 0) {
        throw new Error(
          `${
            error instanceof Error ? error.message : String(error)
          }；console error: ${JSON.stringify(consoleErrors.slice(0, 5))}`,
        );
      }
      throw error;
    }

    logStage("return-knowledge-before-agent-result");
    await openKnowledgePageFromMainNav(page);

    logStage("prepare-agent-result");
    await seedAgentResultForKnowledgeCapture(page, options);
    await openPackForCreation(page, DEFAULT_PACK.title);
    await confirmKnowledgeComposer(page, options);

    logStage("wait-agent-result");
    await waitForPageText(
      page,
      "Agent 结果样本加载",
      [
        `资料：${DEFAULT_PACK.title}`,
        "保存到项目资料",
        "事实：该结果来自当前 Agent 对话",
      ],
      options.timeoutMs,
    );

    logStage("capture-agent-result");
    await clickPageControl(page, { ariaLabel: "保存到项目资料" });

    logStage("wait-agent-result-save-page");
    await waitForPageText(
      page,
      "Agent 结果进入保存页",
      [
        "存到哪里？",
        "补充已有资料",
        "新建一份资料",
        "保存到项目资料",
        "保存后不会立刻用于创作，确认后才会生效",
        "事实：该结果来自当前 Agent 对话",
      ],
      options.timeoutMs,
    );
    await assertNoUserFacingInternalText(page, "Agent 结果保存页");

    await clickPageControl(page, { text: "保存到项目资料" });
    await waitForPageText(
      page,
      "Agent 结果保存完成",
      ["资料已保存，确认后才会用于创作", "新增 2 个内容点", "更新 1 个章节"],
      options.timeoutMs,
    );

    logStage("return-knowledge-overview");
    await clickScopedButton(page, {
      scope: '[data-testid="app-sidebar-main-nav"]',
      ariaLabel: "灵感",
    });
    await waitForPageText(page, "灵感页加载", ["灵感"], options.timeoutMs);
    await openKnowledgePageFromMainNav(page);

    logStage("wait-captured-agent-result");
    await waitForPageText(
      page,
      "保存资料进入管理页",
      [
        "让 Lime 记住这个项目",
        "项目资料清单",
        DEFAULT_PACK.title,
        "待确认",
        "去确认",
      ],
      options.timeoutMs,
    );

    logStage("verify-builder-import-review");
    await verifyBuilderImportAndReview(page, options);

    if (consoleErrors.length > 0) {
      throw new Error(
        `[smoke:knowledge-gui] 页面存在 ${consoleErrors.length} 条 console error: ${JSON.stringify(
          consoleErrors.slice(0, 5),
        )}`,
      );
    }
  } finally {
    await context.close().catch(() => undefined);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }
}

async function seedPack(options, pack) {
  await invoke(options, "knowledge_import_source", {
    request: {
      workingDir: options.workingDir,
      packName: pack.name,
      description: pack.title,
      packType: pack.type,
      sourceFileName: pack.sourceFileName,
      sourceText: pack.sourceText,
    },
  });
  await invoke(options, "knowledge_compile_pack", {
    request: {
      workingDir: options.workingDir,
      name: pack.name,
    },
  });
  await invoke(options, "knowledge_update_pack_status", {
    request: {
      workingDir: options.workingDir,
      name: pack.name,
      status: "ready",
    },
  });
}

async function seedKnowledgePacks(options) {
  fs.mkdirSync(options.workingDir, { recursive: true });
  fs.writeFileSync(
    path.join(options.workingDir, DEFAULT_PACK.sourceFileName),
    DEFAULT_PACK.sourceText,
  );
  await seedPack(options, PERSONA_PACK);
  await seedPack(options, DEFAULT_PACK);
  await seedPack(options, SECONDARY_PACK);
  await invoke(options, "knowledge_set_default_pack", {
    request: {
      workingDir: options.workingDir,
      name: DEFAULT_PACK.name,
    },
  });
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error("当前 Node 运行时不支持 fetch，请使用 Node 18+");
  }

  const options = parseArgs(process.argv.slice(2));
  options.workingDir = fs.mkdtempSync(
    path.join(os.tmpdir(), `lime-knowledge-gui-smoke-${process.pid}-`),
  );

  try {
    logStage("wait-health");
    await waitForHealth(options);
    await sleep(POST_HEALTH_SETTLE_MS);

    logStage("create-smoke-project");
    await createSmokeProject(options);

    logStage("seed-knowledge-packs");
    await seedKnowledgePacks(options);

    await runPlaywrightGuiFlow(options);
    console.log("[smoke:knowledge-gui] 通过");
  } finally {
    await cleanupSmokeProject(options);
    fs.rmSync(options.workingDir, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

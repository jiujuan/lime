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
  timeoutMs: 90_000,
  headless: true,
};

const ONBOARDING_VERSION = "1.1.0";
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

const PACKS = {
  persona: {
    name: "product-e2e-persona",
    title: "Product E2E 写作口吻资料",
    type: "personal-ip",
    sourceFileName: "persona-source.md",
    sourceText: [
      "# Product E2E 写作口吻资料",
      "",
      "- 语气：清晰、直接、普通用户能读懂。",
      "- 边界：不暴露工程术语。",
    ].join("\n"),
    status: "ready",
  },
  ready: {
    name: "product-e2e-ready",
    title: "Product E2E 默认项目资料",
    type: "custom",
    sourceFileName: "default-source.md",
    sourceText: [
      "# Product E2E 默认项目资料",
      "",
      "- 事实：本资料用于验证项目资料可用于创作。",
      "- 规则：确认后才允许进入创作上下文。",
      "- 待确认：无。",
    ].join("\n"),
    status: "ready",
  },
  review: {
    name: "product-e2e-review",
    title: "Product E2E 待确认资料",
    type: "custom",
    sourceFileName: "review-source.md",
    sourceText: [
      "# Product E2E 待确认资料",
      "",
      "- 事实：本资料用于验证待确认资料需要用户确认。",
      "- 风险：没有确认前不能用于创作。",
    ].join("\n"),
    status: "needs-review",
  },
};

const AGENT_RESULT = {
  id: "product-e2e-agent-result-knowledge",
  content: [
    "# Product E2E 对话结果资料",
    "",
    "- 事实：该结果来自当前 Agent 对话，用于验证生成结果可以保存到项目资料。",
    "- 适用场景：用户拿到一段可复用结论后，可以一键保存，随后在项目资料管理页检查确认。",
    "- 风险提示：保存后仍需确认，避免把临时分析当成长期事实。",
  ].join("\n"),
};

function printHelp() {
  console.log(`
Lime Knowledge Product E2E

用途:
  通过真实 Playwright 点击验收项目资料 PRD v3 的产品闭环，覆盖首页、状态说明、确认、选择、保存与整理，并检查假入口 / 假统计 / 工程词泄露回归。

用法:
  npm run knowledge:product-e2e

选项:
  --app-url <url>       前端地址，默认 http://127.0.0.1:1420/
  --health-url <url>    DevBridge 健康检查地址，默认 http://127.0.0.1:3030/health
  --invoke-url <url>    DevBridge invoke 地址，默认 http://127.0.0.1:3030/invoke
  --timeout-ms <ms>     单步等待超时，默认 90000
  --headed              使用有界面 Chrome；默认 headless
  -h, --help            显示帮助
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

    if (arg === "--headed") {
      options.headless = false;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
  }

  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout-ms 必须是正数");
  }

  return options;
}

function log(stage) {
  console.log(`[knowledge:product-e2e] stage=${stage}`);
}

async function waitForHealth(options) {
  const deadline = Date.now() + options.timeoutMs;
  let lastError = null;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(options.healthUrl, {
        signal: AbortSignal.timeout(Math.min(5_000, options.timeoutMs)),
      });
      if (response.ok) {
        const payload = await response.json().catch(() => ({}));
        console.log(
          `[knowledge:product-e2e] DevBridge 已就绪 status=${payload?.status || response.status}`,
        );
        return;
      }
      lastError = new Error(`HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 1_000));
  }

  throw new Error(
    `DevBridge 未就绪: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  );
}

async function invoke(options, cmd, args) {
  const response = await fetch(options.invokeUrl, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ cmd, args }),
    signal: AbortSignal.timeout(options.timeoutMs),
  });
  if (!response.ok) {
    throw new Error(`${cmd} HTTP ${response.status}: ${response.statusText}`);
  }

  const payload = await response.json();
  if (payload?.error) {
    throw new Error(`${cmd}: ${payload.error}`);
  }
  return payload.result;
}

async function seedPack(options, workingDir, pack) {
  await invoke(options, "knowledge_import_source", {
    request: {
      workingDir,
      packName: pack.name,
      description: pack.title,
      packType: pack.type,
      sourceFileName: pack.sourceFileName,
      sourceText: pack.sourceText,
    },
  });
  await invoke(options, "knowledge_compile_pack", {
    request: {
      workingDir,
      name: pack.name,
      builderRuntime: {
        enabled: false,
      },
    },
  });
  await invoke(options, "knowledge_update_pack_status", {
    request: { workingDir, name: pack.name, status: pack.status },
  });
}

async function waitText(page, options, label, needles) {
  try {
    await page.waitForFunction(
      (expected) => {
        const body = document.body?.innerText || "";
        const fields = Array.from(document.querySelectorAll("input, textarea"))
          .map((element) => element.value || "")
          .join("\n");
        const text = `${body}\n${fields}`;
        return expected.every((item) => text.includes(item));
      },
      needles,
      { timeout: options.timeoutMs },
    );
  } catch {
    const body = await page
      .locator("body")
      .innerText()
      .catch(() => "");
    const fields = await page
      .locator("input, textarea")
      .evaluateAll((items) =>
        items.map((element) => element.value || "").join("\n"),
      )
      .catch(() => "");
    const text = `${body}\n${fields}`;
    const missing = needles.filter((needle) => !text.includes(needle));
    throw new Error(
      `${label} 缺少 ${JSON.stringify(missing)}；页面预览：${text.slice(0, 1800)}`,
    );
  }
}

async function assertNoLeak(page, label) {
  const mainText =
    (await page
      .locator("main")
      .last()
      .innerText()
      .catch(() => "")) || (await page.locator("body").innerText());
  const leaked = USER_FACING_FORBIDDEN_TEXT.filter((needle) =>
    mainText.includes(needle),
  );
  if (leaked.length > 0) {
    throw new Error(`${label} 暴露内部词：${JSON.stringify(leaked)}`);
  }
}

async function clickSideNav(page, options, name) {
  await page
    .locator('[data-testid="app-sidebar-main-nav"]')
    .getByRole("button", { name, exact: true })
    .click({ timeout: options.timeoutMs });
}

async function clickVisibleButton(page, options, name) {
  const button = page.getByRole("button", { name, exact: true }).first();
  if (!(await button.isVisible().catch(() => false))) {
    return false;
  }
  await button.click({ timeout: options.timeoutMs });
  return true;
}

async function openKnowledgeOverview(page, options) {
  const text = await page
    .locator("body")
    .innerText()
    .catch(() => "");
  if (text.includes("让 Lime 记住这个项目") && text.includes("项目资料清单")) {
    return;
  }
  if (
    text.includes("项目资料状态说明") ||
    text.includes("存到哪里？") ||
    text.includes("整理新资料")
  ) {
    if (text.includes("项目资料状态说明")) {
      const backButton = page.getByRole("button", {
        name: "回到项目资料",
        exact: true,
      });
      if (await backButton.isVisible().catch(() => false)) {
        await backButton.click({ timeout: options.timeoutMs });
        await waitText(page, options, "状态说明返回项目资料首页", [
          "让 Lime 记住这个项目",
          "项目资料清单",
        ]);
        return;
      }
    }

    if (
      (await clickVisibleButton(page, options, "回到项目资料")) ||
      (await clickVisibleButton(page, options, "稍后处理"))
    ) {
      await waitText(page, options, "返回项目资料首页", [
        "让 Lime 记住这个项目",
        "项目资料清单",
      ]);
      return;
    }
  }

  await clickSideNav(page, options, "项目资料");
  await waitText(page, options, "项目资料首页", [
    "让 Lime 记住这个项目",
    "项目资料清单",
  ]);
}

async function clickArticleButton(page, options, title, buttonName) {
  await page
    .locator("article")
    .filter({ hasText: title })
    .getByRole("button", { name: buttonName, exact: true })
    .click({ timeout: options.timeoutMs });
}

async function prepareProject(options) {
  const workingDir = fs.mkdtempSync(
    path.join(os.tmpdir(), "lime-knowledge-product-e2e-"),
  );
  const project = await invoke(options, "workspace_create", {
    request: {
      name: `Knowledge Product E2E ${Date.now()}`,
      rootPath: workingDir,
      workspaceType: "temporary",
    },
  });
  const projectId = String(project?.id || "").trim();
  if (!projectId) {
    throw new Error("workspace_create 未返回项目 ID");
  }
  const projectRoot =
    String(project?.rootPath || project?.root_path || workingDir).trim() ||
    workingDir;

  fs.mkdirSync(projectRoot, { recursive: true });
  await seedPack(options, projectRoot, PACKS.persona);
  await seedPack(options, projectRoot, PACKS.ready);
  await seedPack(options, projectRoot, PACKS.review);
  await invoke(options, "knowledge_set_default_pack", {
    request: { workingDir: projectRoot, name: PACKS.ready.name },
  });

  return { projectId, projectRoot };
}

async function run() {
  const options = parseArgs(process.argv.slice(2));
  let browser = null;
  let context = null;

  log("wait-health");
  await waitForHealth(options);

  log("prepare-project");
  const { projectId, projectRoot } = await prepareProject(options);

  try {
    log("launch-browser");
    browser = await chromium.launch({
      channel: "chrome",
      headless: options.headless,
    });
    context = await browser.newContext({
      viewport: { width: 1440, height: 960 },
    });
    const page = await context.newPage();
    const consoleErrors = [];
    const mockMessages = [];

    page.on("console", (message) => {
      const text = message.text();
      if (message.type() === "error") {
        consoleErrors.push(text);
      }
      if (text.includes("[Mock] invoke")) {
        mockMessages.push(text);
      }
    });
    page.on("pageerror", (error) => {
      consoleErrors.push(error.stack || error.message);
    });

    log("home-baseline");
    await page.goto(options.appUrl, { waitUntil: "domcontentloaded" });
    await page.evaluate(
      ({ nextProjectId, nextProjectRoot, onboardingVersion }) => {
        localStorage.setItem("lime_onboarding_complete", "true");
        localStorage.setItem("lime_onboarding_version", onboardingVersion);
        localStorage.setItem("lime_user_profile", "developer");
        localStorage.setItem("lime.knowledge.working-dir", nextProjectRoot);
        localStorage.setItem(
          "agent_last_project_id",
          JSON.stringify(nextProjectId),
        );
        localStorage.setItem("lime-resource-project-id", nextProjectId);
      },
      {
        nextProjectId: projectId,
        nextProjectRoot: projectRoot,
        onboardingVersion: ONBOARDING_VERSION,
      },
    );
    await page.reload({ waitUntil: "domcontentloaded" });
    await waitText(page, options, "首页加载", [
      "青柠一下，灵感即来",
      "项目资料",
    ]);

    log("knowledge-overview");
    await openKnowledgeOverview(page, options);
    await waitText(page, options, "项目资料首页内容", [
      "可用于创作",
      "待确认",
      "需要补充",
      "建议本轮使用",
      PACKS.persona.title,
      PACKS.ready.title,
      PACKS.review.title,
      "资料只有确认后才会用于创作",
      "查看状态说明",
    ]);
    await assertNoLeak(page, "项目资料首页");
    if ((await page.locator("body").innerText()).includes("本轮创作会使用")) {
      throw new Error("首页仍宣称资料会自动进入本轮创作");
    }

    log("states-page");
    await page
      .getByRole("button", { name: "查看状态说明", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "状态说明页", [
      "项目资料状态说明",
      "没有资料",
      "已可用",
      "待确认",
      "需要补充",
      "整理失败",
    ]);
    await assertNoLeak(page, "状态说明页");
    await openKnowledgeOverview(page, options);

    log("review-confirm");
    await clickArticleButton(page, options, PACKS.review.title, "去确认");
    await waitText(page, options, "确认资料页", [
      PACKS.review.title,
      "完整资料文档",
      "查看文档内容",
      "需要你确认的内容",
      "确认后会发生什么",
      "确认可用",
    ]);
    await assertNoLeak(page, "确认资料页");
    {
      const text = await page.locator("body").innerText();
      if (text.includes("导出") || text.includes("常用金句")) {
        throw new Error("确认页仍存在不可用导出或臆造确认项");
      }
    }
    await page
      .getByRole("button", { name: "确认可用", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "确认完成", [
      "资料已确认可用",
      PACKS.review.title,
    ]);
    await page
      .getByRole("button", { name: "回到项目资料", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "确认后首页", [
      "项目资料清单",
      PACKS.review.title,
      "已可用",
    ]);

    log("seed-agent-result");
    await page.evaluate(
      ({ nextProjectId, message }) => {
        const now = new Date().toISOString();
        sessionStorage.setItem(
          `aster_messages_${nextProjectId}`,
          JSON.stringify([
            {
              id: message.id,
              role: "assistant",
              content: message.content,
              timestamp: now,
            },
          ]),
        );
        sessionStorage.removeItem(`aster_curr_sessionId_${nextProjectId}`);
        sessionStorage.removeItem(`aster_last_sessionId_${nextProjectId}`);
        sessionStorage.removeItem(`aster_thread_turns_${nextProjectId}`);
        sessionStorage.removeItem(`aster_thread_items_${nextProjectId}`);
        sessionStorage.removeItem(`aster_curr_turnId_${nextProjectId}`);
      },
      { nextProjectId: projectId, message: AGENT_RESULT },
    );

    log("composer-select");
    await clickArticleButton(page, options, PACKS.ready.title, "用于创作");
    await waitText(page, options, "选择创作资料弹层", [
      "选择这次创作用哪些资料",
      "写作口吻（只能选 1 个）",
      "要参考的资料（可多选）",
      "这次会怎么用",
    ]);
    await page
      .locator(
        `[data-testid="knowledge-composer-persona-${PACKS.persona.name}"]`,
      )
      .click({ timeout: options.timeoutMs });
    await page
      .locator(`[data-testid="knowledge-composer-data-${PACKS.review.name}"]`)
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "选择资料数量", ["已选 3 份资料"]);
    await page
      .getByRole("button", { name: "确认使用", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "Agent 创作页", [
      `资料：${PACKS.ready.title}`,
      "+2",
      "保存到项目资料",
      "事实：该结果来自当前 Agent 对话",
    ]);

    log("agent-save-to-knowledge");
    await page
      .getByRole("button", { name: "保存到项目资料" })
      .first()
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "保存到项目资料页", [
      "存到哪里？",
      "补充已有资料",
      "新建一份资料",
      "保存到项目资料",
      "保存后不会立刻用于创作，确认后才会生效",
      "事实：该结果来自当前 Agent 对话",
    ]);
    await assertNoLeak(page, "保存到项目资料页");
    {
      const text = await page.locator("body").innerText();
      if (text.includes("新增 2 个内容点") || text.includes("更新 1 个章节")) {
        throw new Error("保存前仍展示假统计结果");
      }
    }
    await page
      .getByRole("button", { name: "保存到项目资料", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "保存完成", [
      "资料已保存，确认后才会用于创作",
      "内容已进入项目资料",
      "下一步需要确认后才会用于创作",
    ]);

    log("organize-new-material");
    await openKnowledgeOverview(page, options);
    await page
      .getByRole("button", { name: "整理新资料", exact: true })
      .first()
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "整理新资料页", [
      "选择资料用途",
      "添加原始资料",
      "Lime 开始整理",
      "当前先支持粘贴正文",
      "这里不再设置“默认使用”",
      "没有确认的资料不会自动用于创作",
    ]);
    {
      const text = await page.locator("body").innerText();
      if (
        text.includes("创作时是否默认使用") ||
        text.includes("先保存原始资料")
      ) {
        throw new Error("整理页仍存在不能自洽的默认使用/保存入口");
      }
    }
    await page
      .getByRole("button", { name: "内容运营", exact: true })
      .click({ timeout: options.timeoutMs });
    await page.getByLabel("资料名称").fill("Product E2E 内容运营验收资料");
    await page
      .getByLabel("原始资料正文")
      .fill(
        [
          "# Product E2E 内容运营验收资料",
          "",
          "- 栏目：每周二发布选题复盘，每周五发布案例拆解。",
          "- SOP：选题必须包含目标人群、表达角度、引用素材和风险边界。",
          "- 边界：没有来源的增长数据必须标记待确认，不能编造成事实。",
        ].join("\n"),
      );
    await page
      .getByRole("button", { name: "Lime 开始整理", exact: true })
      .click({ timeout: options.timeoutMs });
    await waitText(page, options, "整理结果", [
      "Product E2E 内容运营验收资料",
      "完整资料文档",
      "需要你确认的内容",
      "确认可用",
    ]);
    await assertNoLeak(page, "整理结果页");

    if (consoleErrors.length > 0) {
      throw new Error(
        `console error: ${JSON.stringify(consoleErrors.slice(0, 5))}`,
      );
    }

    console.log(
      JSON.stringify(
        {
          result: "passed",
          projectId,
          projectRoot,
          checked: [
            "home-baseline",
            "knowledge-overview",
            "states-page",
            "review-confirm",
            "composer-select",
            "agent-save-to-knowledge",
            "organize-new-material",
          ],
          consoleErrors: consoleErrors.length,
          mockInvokes: mockMessages.length,
          mockMessages: mockMessages.slice(0, 10),
        },
        null,
        2,
      ),
    );
  } finally {
    await context?.close().catch(() => {});
    await browser?.close().catch(() => {});
  }
}

run().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : error);
  process.exit(1);
});

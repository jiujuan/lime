import {
  APP_SERVER_METHOD_SESSION_READ,
  APP_SERVER_METHOD_SESSION_START,
  APP_SERVER_METHOD_SESSION_TURN_START,
  APP_SERVER_METHOD_SESSION_UPDATE,
  EXPERT_SKILLS_RUNTIME_PROMPT,
  EXPERT_SKILLS_RUNTIME_SESSION_ID,
  EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
  EXPERT_SKILLS_RUNTIME_THREAD_ID,
  EXPERT_SKILLS_RUNTIME_TURN_ID,
  FIXTURE_MODEL,
  FIXTURE_PROVIDER,
  NEWS_PROMPT,
  SESSION_ID,
  SESSION_TITLE,
  THREAD_ID,
  buildExpertSkillsRuntimeCatalog,
  buildExpertSkillsRuntimeMetadata,
} from "./claw-chat-current-fixture-constants.mjs";
import { sendPromptFromGui } from "./claw-chat-current-fixture-gui-actions.mjs";
import {
  collectAgentSessionEvents,
  evaluatePageSnapshot,
  invokeAppServerFromPage,
} from "./claw-chat-current-fixture-rpc.mjs";
import { waitForAgentSessionEventsForTurn } from "./claw-chat-current-fixture-read-model-waits.mjs";
import { assert, sanitizeJson, sleep } from "./claw-chat-current-fixture-utils.mjs";

export async function createFixtureSession(page, workspace, requestLog) {
  const { workspaceId, rootPath } = workspace;
  assert(rootPath, "workspace/default/ensure 未返回可用 rootPath");
  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: SESSION_ID,
      threadId: THREAD_ID,
      appId: "desktop",
      workspaceId,
      workingDir: rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspaceId}:${SESSION_ID}`,
        title: SESSION_TITLE,
        metadata: {
          title: SESSION_TITLE,
          workingDir: rootPath,
          working_dir: rootPath,
          executionStrategy: "react",
          runStartHooks: false,
          harness: {
            hiddenFromUserRecents: false,
            source: "smoke:claw-chat-current-fixture",
          },
        },
      },
    },
    requestLog,
  );

  const update = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_UPDATE,
    {
      sessionId: SESSION_ID,
      title: SESSION_TITLE,
      providerSelector: FIXTURE_PROVIDER,
      providerName: FIXTURE_PROVIDER,
      modelName: FIXTURE_MODEL,
      executionStrategy: "react",
      recentAccessMode: "full-access",
      recentPreferences: {
        searchMode: "allowed",
      },
    },
    requestLog,
  );

  await page.evaluate(
    ({ sessionId, workspaceId }) => {
      window.dispatchEvent(
        new CustomEvent("lime:agent-runtime-sessions-changed", {
          detail: {
            reason: "external",
            sessionId,
            workspaceId,
          },
        }),
      );
    },
    { sessionId: SESSION_ID, workspaceId },
  );

  return {
    session: session.result,
    update: update.result,
  };
}

export async function createExpertSkillsRuntimeSession(page, workspace, requestLog) {
  const { workspaceId, rootPath } = workspace;
  assert(rootPath, "expert skills fixture 缺少 workspace rootPath");
  const expertMetadata = buildExpertSkillsRuntimeMetadata();
  const session = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_START,
    {
      sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      threadId: EXPERT_SKILLS_RUNTIME_THREAD_ID,
      appId: "desktop",
      workspaceId,
      workingDir: rootPath,
      businessObjectRef: {
        kind: "agent.session",
        id: `agent-session:${workspaceId}:${EXPERT_SKILLS_RUNTIME_SESSION_ID}`,
        title: EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
        metadata: {
          title: EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
          workingDir: rootPath,
          working_dir: rootPath,
          executionStrategy: "react",
          runStartHooks: false,
          ...expertMetadata,
        },
      },
    },
    requestLog,
  );
  const update = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_UPDATE,
    {
      sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      title: EXPERT_SKILLS_RUNTIME_SESSION_TITLE,
      providerSelector: FIXTURE_PROVIDER,
      providerName: FIXTURE_PROVIDER,
      modelName: FIXTURE_MODEL,
      executionStrategy: "react",
      recentAccessMode: "full-access",
      recentPreferences: {
        searchMode: "allowed",
      },
    },
    requestLog,
  );

  await page.evaluate(
    ({ sessionId, workspaceId }) => {
      window.dispatchEvent(
        new CustomEvent("lime:agent-runtime-sessions-changed", {
          detail: {
            reason: "external",
            sessionId,
            workspaceId,
          },
        }),
      );
    },
    {
      sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      workspaceId,
    },
  );

  return {
    session: session.result,
    update: update.result,
    expertMetadata,
  };
}

export async function startExpertSkillsRuntimeTurn(page, workspace, requestLog) {
  assert(workspace?.rootPath, "expert skills fixture 缺少 workspace rootPath");
  const eventName = `agentSession/event/${EXPERT_SKILLS_RUNTIME_SESSION_ID}`;
  const expertMetadata = buildExpertSkillsRuntimeMetadata();
  const turnConfig = {
    metadata: expertMetadata,
    working_dir: workspace.rootPath,
    workspace_root: workspace.rootPath,
  };
  const turnStart = await invokeAppServerFromPage(
    page,
    APP_SERVER_METHOD_SESSION_TURN_START,
    {
      sessionId: EXPERT_SKILLS_RUNTIME_SESSION_ID,
      turnId: EXPERT_SKILLS_RUNTIME_TURN_ID,
      input: {
        text: EXPERT_SKILLS_RUNTIME_PROMPT,
      },
      runtimeOptions: {
        stream: true,
        eventName,
        providerPreference: FIXTURE_PROVIDER,
        modelPreference: FIXTURE_MODEL,
        metadata: expertMetadata,
        hostOptions: {
          asterChatRequest: {
            message: EXPERT_SKILLS_RUNTIME_PROMPT,
            session_id: EXPERT_SKILLS_RUNTIME_SESSION_ID,
            event_name: eventName,
            provider_preference: FIXTURE_PROVIDER,
            model_preference: FIXTURE_MODEL,
            turn_id: EXPERT_SKILLS_RUNTIME_TURN_ID,
            turn_config: turnConfig,
          },
        },
      },
      metadata: expertMetadata,
      queueIfBusy: false,
      skipPreSubmitResume: true,
    },
    requestLog,
  );

  const eventObservation = await waitForAgentSessionEventsForTurn(
    page,
    { timeoutMs: 30_000, intervalMs: 250 },
    EXPERT_SKILLS_RUNTIME_TURN_ID,
    turnStart.messages,
  );

  return sanitizeJson({
    eventName,
    turnStartResult: {
      turnId:
        turnStart.result?.turn?.turnId ??
        turnStart.result?.turn?.turn_id ??
        null,
      status: turnStart.result?.turn?.status ?? null,
      messageCount: turnStart.messages.length,
      notificationCount: collectAgentSessionEvents(turnStart.messages).length,
    },
    events: eventObservation.summary,
    expertMetadata,
  });
}

export async function injectExpertSkillsRuntimeCatalog(page, options = {}) {
  const catalog = buildExpertSkillsRuntimeCatalog(options);
  const workspaceSkillCatalog = options.workspaceSkill
    ? buildExpertPanelWorkspaceSkillCatalog(options.workspaceSkill)
    : null;
  return await page.evaluate(
    ({ catalog, workspaceSkillCatalog }) => {
      const expertStorageKey = "lime:expert-catalog-cache:v1";
      const skillCatalogStorageKey = "lime:skill-catalog:v1";
      window.localStorage.setItem(expertStorageKey, JSON.stringify(catalog));
      if (workspaceSkillCatalog) {
        window.localStorage.setItem(
          skillCatalogStorageKey,
          JSON.stringify(workspaceSkillCatalog),
        );
      }
      return {
        storageKey: expertStorageKey,
        expertStorageKey,
        skillCatalogStorageKey: workspaceSkillCatalog
          ? skillCatalogStorageKey
          : null,
        version: catalog.version,
        tenantId: catalog.tenantId,
        itemCount: catalog.items.length,
        expertId: catalog.items[0]?.id ?? null,
        skillRefs: catalog.items[0]?.release?.skillRefs ?? [],
        promptStarter: catalog.items[0]?.promptStarters?.[0] ?? null,
        workspaceSkillCatalog: workspaceSkillCatalog
          ? {
              version: workspaceSkillCatalog.version,
              tenantId: workspaceSkillCatalog.tenantId,
              itemCount: workspaceSkillCatalog.items.length,
              entryCount: workspaceSkillCatalog.entries.length,
              skillId: workspaceSkillCatalog.entries[0]?.skillId ?? null,
              skillFilePath:
                workspaceSkillCatalog.entries[0]?.skillLocator
                  ?.skillFilePath ?? null,
            }
          : null,
      };
    },
    { catalog, workspaceSkillCatalog },
  );
}
export function buildExpertPanelWorkspaceSkillCatalog(workspaceSkill) {
  const skillFilePath = workspaceSkill?.skillFilePath;
  assert(
    skillFilePath,
    "Expert Panel Skills Runtime fixture 缺少 workspace skillFilePath",
  );
  const syncedAt = "2026-06-21T00:00:00.000Z";
  const title = "Capability Report";
  const summary =
    "Fixture skill for ExpertInfoPanel Skills runtime override evidence.";
  return {
    version: "fixture-skill-catalog-2026-06-21",
    tenantId: "fixture-skills-runtime",
    syncedAt,
    groups: [
      {
        key: "engineering",
        title: "工程技能",
        summary: "用于专家面板技能选择 fixture 的工程技能。",
        entryHint: "从专家信息面板加入后，在下一轮请求中继承 skillRefs。",
        themeTarget: "general",
        sort: 30,
        itemCount: 1,
      },
    ],
    items: [
      {
        id: "capability-report",
        skillKey: "project:capability-report",
        skillType: "service",
        title,
        summary,
        entryHint: "用于验证 ExpertInfoPanel 技能选择后的下一轮继承。",
        aliases: ["capability-report", "project:capability-report"],
        category: "engineering",
        outputHint: "输出专家技能继承证据摘要。",
        triggerHints: ["capability-report"],
        source: "local_custom",
        runnerType: "instant",
        defaultExecutorBinding: "native_skill",
        executionLocation: "client_default",
        defaultArtifactKind: "report",
        readinessRequirements: { requiresModel: true, requiresProject: true },
        usageGuidelines: [
          "只用于 ExpertInfoPanel fixture 验证，不代表生产 fallback。",
        ],
        setupRequirements: [],
        examples: ["使用 capability-report 生成专家技能继承证据。"],
        outputDestination: "agent_chat",
        slotSchema: [],
        surfaceScopes: ["mention", "workspace"],
        promptTemplateKey: "generic",
        themeTarget: "general",
        skillBundle: {
          name: "project:capability-report",
          description: summary,
          resourceSummary: {
            hasScripts: false,
            hasReferences: false,
            hasAssets: false,
          },
          standardCompliance: {
            isStandard: true,
            deprecatedFields: [],
          },
        },
        version: "1.0.0",
        groupKey: "engineering",
        execution: { kind: "native_skill" },
      },
    ],
    entries: [
      {
        id: "skill:capability-report",
        kind: "skill",
        title,
        summary,
        skillId: "capability-report",
        groupKey: "engineering",
        aliases: ["capability-report", "project:capability-report"],
        surfaceScopes: ["mention", "workspace"],
        skillLocator: {
          source: "project",
          name: "project:capability-report",
          directory: "capability-report",
          skillFilePath,
        },
        execution: { kind: "native_skill" },
      },
    ],
  };
}

export async function navigateGuiToWorkspaceScopedAgent(page, options, workspaceId) {
  const startedAt = Date.now();
  let lastSnapshot = null;

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ workspaceId }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        return {
          url: window.location.href,
          localStorageWorkspace: window.localStorage.getItem(
            "agent_last_project_id",
          ),
          localStorageMatchesWorkspace:
            window.localStorage.getItem("agent_last_project_id") ===
            JSON.stringify(workspaceId),
          hasConversationList: Boolean(recentShelf),
          recentShelfText: recentShelf?.textContent || "",
          hasWorkspaceShell: Boolean(
            document.querySelector('[data-testid="agent-chat-workspace"]') ||
            document.querySelector('[data-testid="chat-workspace"]') ||
            document.querySelector(
              '[data-testid="theme-workbench-harness-toggle"]',
            ) ||
            document.querySelector('[data-testid="toggle-harness"]'),
          ),
          bodyText: text,
        };
      },
      { workspaceId },
    );

    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;

    if (
      snapshot.hasConversationList &&
      snapshot.localStorageMatchesWorkspace
    ) {
      return snapshot;
    }

    await page.evaluate(() => {
      window.dispatchEvent(new Event("focus"));
    });

    await sleep(options.intervalMs);
  }

  throw new Error(
    `GUI 未进入 workspace-scoped Agent 状态: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function waitForGuiSessionVisible(
  page,
  options,
  title = SESSION_TITLE,
) {
  const startedAt = Date.now();
  let lastRefreshAt = 0;
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      ({ title }) => {
        const text = document.body?.innerText || "";
        const recentShelf = document.querySelector(
          '[data-testid="app-sidebar-recent-conversations"]',
        );
        const buttons = Array.from(document.querySelectorAll("button")).map(
          (button) => ({
            title: button.getAttribute("title") || "",
            text: button.textContent || "",
            aria: button.getAttribute("aria-label") || "",
            testId: button.getAttribute("data-testid") || "",
          }),
        );
        return {
          url: window.location.href,
          hasSessionTitle: text.includes(title),
          hasRecentShelf: Boolean(recentShelf),
          recentShelfText: recentShelf?.textContent || "",
          matchingButtonCount: buttons.filter((button) =>
            [button.title, button.text, button.aria].some((label) =>
              label.includes(title),
            ),
          ).length,
          bodyText: text,
        };
      },
      { title },
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (snapshot.hasSessionTitle || snapshot.matchingButtonCount > 0) {
      return snapshot;
    }
    if (Date.now() - lastRefreshAt > 2_000) {
      lastRefreshAt = Date.now();
      await page.evaluate(() => {
        window.dispatchEvent(new Event("focus"));
      });
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 未显示 Claw fixture 会话: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function openFixtureSessionFromSidebar(page, options, requestLog) {
  return await openSessionFromSidebar(page, options, requestLog, {
    sessionId: SESSION_ID,
    title: SESSION_TITLE,
  });
}

export async function openSessionFromSidebar(
  page,
  options,
  requestLog,
  { sessionId, title },
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  let lastClick = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    if (!lastClick?.clicked) {
      lastClick = await evaluatePageSnapshot(
        page,
        ({ title }) => {
          const candidates = Array.from(
            document.querySelectorAll(
              '[data-testid="app-sidebar-conversation-open"], button',
            ),
          );
          const button = candidates.find((candidate) => {
            const label = [
              candidate.getAttribute("title") || "",
              candidate.getAttribute("aria-label") || "",
              candidate.textContent || "",
            ].join("\n");
            if (!label.includes(title)) {
              return false;
            }
            const actionLabel = [
              candidate.getAttribute("data-testid") || "",
              candidate.getAttribute("aria-label") || "",
              candidate.textContent || "",
            ].join("\n");
            return !/menu|more|action|archive|delete|favorite|rename|菜单|更多|操作|归档|删除|收藏|重命名/i.test(
              actionLabel,
            );
          });
          if (!button) {
            const moreButton = Array.from(
              document.querySelectorAll("button"),
            ).find((candidate) =>
              (candidate.textContent || "").includes("查看更多对话"),
            );
            moreButton?.click();
            return false;
          }
          button.click();
          return {
            clicked: true,
            title: button.getAttribute("title") || "",
            aria: button.getAttribute("aria-label") || "",
            text: button.textContent || "",
            testId: button.getAttribute("data-testid") || "",
          };
        },
        { title },
      );
    }

    if (lastClick?.clicked) {
      const readModel = await invokeAppServerFromPage(
        page,
        APP_SERVER_METHOD_SESSION_READ,
        {
          sessionId,
          historyLimit: 1,
        },
        requestLog,
      ).catch((error) => ({
        error: error instanceof Error ? error.message : String(error),
      }));
      const inputReady = await evaluatePageSnapshot(
        page,
        ({ title }) => {
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
          const menu = document.querySelector(
            '[data-testid="app-sidebar-conversation-menu"]',
          );
          const bodyText = document.body?.innerText || "";
          const mainText = document.querySelector("main")?.textContent || "";
          return {
            url: window.location.href,
            hasTextarea: Boolean(textarea),
            textareaVisible,
            hasConversationMenu: Boolean(menu),
            hasSessionTitleInMain: mainText.includes(title),
            hasRecentConversationsShell: mainText.includes("最近对话"),
            hasMessageList: Boolean(
              document.querySelector('[data-testid="message-list"]') ||
                document.querySelector('[data-testid="message-list-frame"]'),
            ),
            isRestoringSessionShell:
              mainText.includes("正在恢复生成会话") ||
              bodyText.includes("正在恢复生成会话"),
            hasInputbarCore: Boolean(
              document.querySelector('[data-testid="inputbar-core-container"]'),
            ),
            hasWorkspaceShell: Boolean(
              document.querySelector('[data-testid="agent-chat-workspace"]') ||
                document.querySelector('[data-testid="chat-workspace"]') ||
                document.querySelector(
                  '[data-testid="theme-workbench-harness-toggle"]',
                ) ||
                document.querySelector('[data-testid="toggle-harness"]'),
            ),
            textareaDisabled:
              textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
            bodyText,
            mainText,
          };
        },
            { title },
      );
      lastSnapshot = {
        clicked: lastClick,
        inputReady: sanitizeJson(inputReady),
        readModel: sanitizeJson({
          hasDetail: Boolean(readModel?.result?.detail),
          sessionId:
            readModel?.result?.session?.sessionId ??
            readModel?.result?.session?.session_id ??
            readModel?.result?.detail?.session?.sessionId ??
            readModel?.result?.detail?.session?.session_id ??
            null,
          error: readModel?.error ?? null,
        }),
      };
      const readModelSessionId =
        readModel?.result?.session?.sessionId ??
        readModel?.result?.session?.session_id ??
        readModel?.result?.detail?.session?.sessionId ??
        readModel?.result?.detail?.session?.session_id ??
        null;
      if (
        inputReady?.hasTextarea &&
        inputReady?.hasInputbarCore &&
        inputReady?.textareaVisible &&
        inputReady?.textareaDisabled === false &&
        readModelSessionId === sessionId &&
        !inputReady?.hasConversationMenu &&
        !inputReady?.hasRecentConversationsShell &&
        !inputReady?.isRestoringSessionShell &&
        !isTaskCenterHomeText(inputReady?.mainText || "") &&
        !isTaskCenterHomeText(inputReady?.bodyText || "") &&
        (inputReady?.hasSessionTitleInMain || inputReady?.hasMessageList)
      ) {
        return lastSnapshot;
      }
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `侧栏未打开 Claw fixture 会话: ${title}; snapshot=${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export async function sendNewsPromptFromGui(page, options) {
  return await sendPromptFromGui(page, options, NEWS_PROMPT);
}

export function isTaskCenterHomeText(text) {
  return (
    text.includes("青柠一下，灵感即来") ||
    text.includes("你可以从这些任务开始") ||
    text.includes("向下滑，看看 Lime 可以帮你做什么")
  );
}

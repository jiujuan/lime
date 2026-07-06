import fs from "node:fs";
import path from "node:path";
import { evaluatePageSnapshot } from "./claw-chat-current-fixture-rpc.mjs";
import {
  assert,
  sanitizeJson,
  sleep,
  writeJsonFile,
} from "./claw-chat-current-fixture-utils.mjs";

export async function waitForExpertPanelSkillsRuntimeSessionReady(
  page,
  options,
  expectedSessionId,
) {
  const startedAt = Date.now();
  let lastSnapshot = null;
  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(
      page,
      (sessionId) => {
        const text = document.body?.innerText || "";
        const textareas = Array.from(
          document.querySelectorAll('textarea[name="agent-chat-message"]'),
        ).filter((node) => node instanceof HTMLTextAreaElement);
        const textarea = textareas.find(
          (node) => !sessionId || node.dataset.sessionId === sessionId,
        );
        const fallbackTextarea = textareas[0] ?? null;
        const isVisibleTextarea = (node) =>
          node instanceof HTMLElement
            ? node.offsetParent !== null
            : Boolean(node);
        return {
          url: window.location.href,
          expectedSessionId: sessionId,
          hasExpertPrompt: text.includes(
            "请以「代码文学专家」身份，使用绑定技能完成一次最小代码审查。",
          ),
          hasExpertPanel:
            text.includes("专家信息") && text.includes("代码文学专家"),
          hasAddedSkill: text.includes("Capability Report"),
          textareaSessionId:
            textarea instanceof HTMLTextAreaElement
              ? textarea.dataset.sessionId || null
              : null,
          textareaVisible: isVisibleTextarea(textarea),
          textareaDisabled:
            textarea instanceof HTMLTextAreaElement ? textarea.disabled : null,
          fallbackTextareaSessionId:
            fallbackTextarea instanceof HTMLTextAreaElement
              ? fallbackTextarea.dataset.sessionId || null
              : null,
          fallbackTextareaVisible: isVisibleTextarea(fallbackTextarea),
          fallbackTextareaDisabled:
            fallbackTextarea instanceof HTMLTextAreaElement
              ? fallbackTextarea.disabled
              : null,
          textareaCount: textareas.length,
          bodyText: text,
        };
      },
      expectedSessionId,
    );
    if (!snapshot) {
      await sleep(options.intervalMs);
      continue;
    }
    lastSnapshot = snapshot;
    if (
      snapshot.hasExpertPrompt &&
      snapshot.hasExpertPanel &&
      snapshot.hasAddedSkill
    ) {
      return snapshot;
    }
    await sleep(options.intervalMs);
  }
  throw new Error(
    `GUI 未恢复专家面板 Skills runtime 会话: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

export function writeCapabilityReportSkillPackage(skillDirectory) {
  const skillFilePath = path.join(skillDirectory, "SKILL.md");
  fs.mkdirSync(skillDirectory, { recursive: true });
  fs.writeFileSync(
    skillFilePath,
    [
      "---",
      "name: Capability Report",
      "description: Fixture skill for Skills runtime manual enable evidence.",
      "allowed-tools: Read",
      "---",
      "",
      "# Capability Report",
      "",
      "Use this fixture skill only to prove workspace-local manual session enable.",
      "",
    ].join("\n"),
  );
  return { skillFilePath };
}

export function ensureManualEnableWorkspaceSkill(workspaceRoot) {
  const skillDirectory = path.join(
    workspaceRoot,
    ".agents",
    "skills",
    "capability-report",
  );
  const { skillFilePath } = writeCapabilityReportSkillPackage(skillDirectory);
  const registrationDirectory = path.join(skillDirectory, ".lime");
  const registrationFilePath = path.join(
    registrationDirectory,
    "registration.json",
  );
  fs.mkdirSync(registrationDirectory, { recursive: true });
  writeJsonFile(registrationFilePath, {
    registrationId: "capreg-fixture-capability-report",
    registeredAt: "2026-06-21T00:00:00.000Z",
    skillDirectory: "capability-report",
    registeredSkillDirectory: skillDirectory,
    sourceDraftId: "capdraft-fixture-capability-report",
    sourceVerificationReportId: "capver-fixture-capability-report",
    generatedFileCount: 1,
    permissionSummary: ["Level 0 read-only fixture"],
  });
  return {
    skillDirectory,
    skillFilePath,
    registrationFilePath,
  };
}

export function ensureUserVisibleCapabilityReportSkill(runtimeEnv) {
  const home = runtimeEnv?.env?.HOME;
  assert(home, "Expert Panel Skills Runtime fixture 缺少临时 HOME");
  const skillDirectory = path.join(
    home,
    ".agents",
    "skills",
    "capability-report",
  );
  const { skillFilePath } = writeCapabilityReportSkillPackage(skillDirectory);
  return {
    skillDirectory,
    skillFilePath,
  };
}

export async function launchSkillsRuntimeFromWorkspacePanel(
  page,
  options,
  workspace,
) {
  assert(
    workspace?.rootPath,
    "workspace panel fixture 缺少 workspace rootPath",
  );
  const workspaceSkill = ensureManualEnableWorkspaceSkill(workspace.rootPath);
  const startedAt = Date.now();
  let lastSnapshot = null;

  await page.locator('[data-testid="app-sidebar-nav-skills"]').click();

  while (Date.now() - startedAt < options.timeoutMs) {
    const snapshot = await evaluatePageSnapshot(page, () => {
      const text = document.body?.innerText || "";
      const installedView = document.querySelector(
        '[data-testid="skills-installed-view"]',
      );
      const installedTab = Array.from(document.querySelectorAll("button")).find(
        (button) => (button.textContent || "").includes("用户安装"),
      );
      if (!installedView && installedTab instanceof HTMLButtonElement) {
        installedTab.click();
      }
      const panel = document.querySelector(
        '[data-testid="workspace-registered-skills-panel"]',
      );
      const enableButton = document.querySelector(
        '[data-testid="workspace-registered-skill-enable-runtime"]',
      );
      return {
        text,
        skillsPageVisible:
          text.includes("Skills") ||
          text.includes("技能广场") ||
          text.includes("用户安装"),
        installedViewVisible: Boolean(installedView),
        registeredPanelVisible: Boolean(panel),
        registeredSkillVisible: text.includes("Capability Report"),
        enableButtonVisible: Boolean(enableButton),
        enableButtonDisabled:
          enableButton instanceof HTMLButtonElement
            ? enableButton.disabled
            : null,
      };
    });
    lastSnapshot = snapshot;
    if (
      snapshot.registeredPanelVisible &&
      snapshot.registeredSkillVisible &&
      snapshot.enableButtonVisible &&
      snapshot.enableButtonDisabled === false
    ) {
      await page
        .locator('[data-testid="workspace-registered-skill-enable-runtime"]')
        .click();
      return sanitizeJson({
        ...snapshot,
        clicked: true,
        workspaceSkill,
      });
    }
    await sleep(options.intervalMs);
  }

  throw new Error(
    `Skills 工作台未出现可试用的已保存技能: ${JSON.stringify(
      sanitizeJson(lastSnapshot),
    )}`,
  );
}

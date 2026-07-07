import { resolveRequiredAgentChatCopy } from "./agentChatCopy";
import { getToolDisplayInfo, normalizeToolNameKey } from "./toolDisplayInfo";
import type { ToolProcessStatus } from "./toolProcessSummaryTypes";
import {
  buildVisionToolSummary,
  normalizeNarrativeSubject,
  resolveProcessSummaryCopy,
} from "./toolProcessSummaryCopy";
import { readString, shorten } from "./toolProcessSummaryText";

type ToolDisplayFamily = ReturnType<typeof getToolDisplayInfo>["family"];

function buildCommandPreSummary(
  normalizedName: string,
  args: Record<string, unknown>,
): string | null {
  const command = readString(args, ["command", "cmd", "script"]) || "";
  if (normalizedName === "bash" || normalizedName.includes("shell")) {
    if (/^(?:rg|grep|findstr)\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.searchCode",
      );
    }
    if (/^(?:sed|cat|head|tail)\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.viewFileSnippet",
      );
    }
    if (/^git\s+status\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.checkWorkspace",
      );
    }
    if (/^git\s+diff\b/i.test(command)) {
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.command.viewDiff",
      );
    }
  }

  return resolveRequiredAgentChatCopy(
    "toolCall.processSummary.command.checkStatus",
  );
}

export function buildGenericPostSummary(params: {
  toolName: string;
  status: ToolProcessStatus;
  subject: string | null;
  displayFamily?: ToolDisplayFamily | null;
  limeTaskSummary: string | null;
  siteToolSummary: string | null;
}): string | null {
  const { toolName, subject, status, limeTaskSummary, siteToolSummary } =
    params;
  const normalizedName = normalizeToolNameKey(toolName);
  const display = getToolDisplayInfo(
    toolName,
    status === "in_progress" ? "running" : status,
  );
  const displayFamily = params.displayFamily || display.family;
  const normalizedSubject = normalizeNarrativeSubject(subject);

  if (normalizedName === "enterplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.entered",
    );
  }
  if (normalizedName === "exitplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.exited",
    );
  }
  if (normalizedName === "structuredoutput") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.finalAnswer.completed",
    );
  }
  if (normalizedName === "sleep") {
    return "已完成等待";
  }
  if (normalizedName === "skill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.executed",
      normalizedSubject,
    );
  }
  if (normalizedName === "listskills") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.skill.listed");
  }
  if (normalizedName === "loadskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.loaded",
      normalizedSubject,
    );
  }
  if (normalizedName === "listmcpresources") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourcesListed",
      normalizedSubject,
    );
  }
  if (normalizedName === "readmcpresource") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourceRead",
      normalizedSubject,
    );
  }
  if (normalizedName === "tasklist") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.task.listed");
  }
  if (normalizedName === "taskcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.started",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskget") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.detailViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskupdate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.updated",
      normalizedSubject,
    );
  }
  if (normalizedName === "updateplan") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.plan.updated",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskoutput") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.outputViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "taskstop") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.stopped",
      normalizedSubject,
    );
  }
  if (normalizedName === "teamcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.created",
      normalizedSubject,
    );
  }
  if (normalizedName === "teamdelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.deleted",
      normalizedSubject,
    );
  }
  if (normalizedName === "listpeers") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.peersListed",
      normalizedSubject,
    );
  }
  if (normalizedName === "waitagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.progressViewed",
      normalizedSubject,
    );
  }
  if (normalizedName === "resumeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.resumed",
      normalizedSubject,
    );
  }
  if (normalizedName === "closeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.paused",
      normalizedSubject,
    );
  }
  if (limeTaskSummary) {
    return limeTaskSummary;
  }
  if (siteToolSummary) {
    return siteToolSummary;
  }
  if (normalizedName === "limerunserviceskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.serviceSkill.run",
      normalizedSubject,
    );
  }
  if (normalizedName === "mcp") {
    return resolveRequiredAgentChatCopy("toolCall.processSummary.mcp.called");
  }
  if (normalizedName === "mcpauth") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.mcp.authorized",
    );
  }

  return buildPostSummaryByFamily(
    displayFamily,
    normalizedName,
    normalizedSubject,
  );
}

function buildPostSummaryByFamily(
  displayFamily: ToolDisplayFamily,
  normalizedName: string,
  normalizedSubject: string | null,
): string | null {
  switch (displayFamily) {
    case "vision":
      return buildVisionToolSummary("post", normalizedName, normalizedSubject);
    case "read":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.read",
        normalizedSubject,
      );
    case "list":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.located",
        normalizedSubject,
      );
    case "write":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.written",
        normalizedSubject,
      );
    case "edit":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.edited",
        normalizedSubject,
      );
    case "command":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.commandCompleted",
      );
    case "fetch":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.fetched",
        normalizedSubject,
      );
    case "task":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.stepStarted",
      );
    case "subagent":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.subtaskDelegated",
      );
    case "search":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.searched",
        normalizedSubject,
      );
    case "browser":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.browser.operationCompleted",
      );
    case "plan":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.planHandled",
        normalizedSubject,
      );
    default:
      return normalizedSubject
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.handledWithSubject",
            { subject: normalizedSubject },
          )
        : null;
  }
}

export function buildKnownPreSummary(params: {
  normalizedName: string;
  normalizedSubject: string | null;
  subject: string | null;
  limeTaskSummary: string | null;
  siteToolSummary: string | null;
}): string | null {
  const {
    normalizedName,
    normalizedSubject,
    subject,
    limeTaskSummary,
    siteToolSummary,
  } = params;

  if (normalizedName === "agent") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.subtask.splitFirst",
    );
  }

  if (normalizedName === "sendmessage") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.subtask.addNoteFirst",
    );
  }

  if (normalizedName === "waitagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.waitFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "resumeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.resumeFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "closeagent") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.subtask.pauseFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "requestuserinput") {
    return subject
      ? resolveRequiredAgentChatCopy(
          "toolCall.processSummary.userInput.confirmFirstWithSubject",
          { subject: shorten(subject, 40) },
        )
      : resolveRequiredAgentChatCopy(
          "toolCall.processSummary.userInput.confirmFirst",
        );
  }

  if (normalizedName === "sendusermessage" || normalizedName === "brief") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.userMessage.syncFirst",
    );
  }

  if (normalizedName === "enterplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.enterFirst",
    );
  }

  if (normalizedName === "exitplanmode") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.planMode.exitFirst",
    );
  }

  if (normalizedName === "structuredoutput") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.finalAnswer.prepareFirst",
    );
  }
  if (normalizedName === "sleep") {
    return "先等待一段时间再继续";
  }

  if (normalizedName === "skill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.executeFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listskills") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.skill.listFirst",
    );
  }

  if (normalizedName === "loadskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.skill.loadFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listmcpresources") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourcesListFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "readmcpresource") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.mcp.resourceReadFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.startFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "tasklist") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.task.listFirst",
    );
  }

  if (normalizedName === "taskget") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.detailViewFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskupdate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.updateFirst",
      normalizedSubject,
    );
  }
  if (normalizedName === "updateplan") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.plan.updateFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskoutput") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.outputViewFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "taskstop") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.task.stopFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "teamcreate") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.createFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "teamdelete") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.deleteFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "listpeers") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.team.peersListFirst",
      normalizedSubject,
    );
  }

  if (limeTaskSummary) {
    return limeTaskSummary;
  }
  if (siteToolSummary) {
    return siteToolSummary;
  }

  if (normalizedName === "limerunserviceskill") {
    return resolveProcessSummaryCopy(
      "toolCall.processSummary.serviceSkill.runFirst",
      normalizedSubject,
    );
  }

  if (normalizedName === "mcp") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.mcp.callFirst",
    );
  }

  if (normalizedName === "mcpauth") {
    return resolveRequiredAgentChatCopy(
      "toolCall.processSummary.mcp.authorizeFirst",
    );
  }

  return null;
}

export function buildPreSummaryByFamily(params: {
  displayFamily: ToolDisplayFamily;
  normalizedName: string;
  normalizedSubject: string | null;
  query: string | null;
  args: Record<string, unknown>;
  urlLabel: string | null;
}): string | null {
  const {
    displayFamily,
    normalizedName,
    normalizedSubject,
    query,
    args,
    urlLabel,
  } = params;

  switch (displayFamily) {
    case "vision":
      return buildVisionToolSummary("pre", normalizedName, normalizedSubject);
    case "read":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.readFirst",
        normalizedSubject,
      );
    case "list":
      if (normalizedName.includes("grep") || normalizedName.includes("glob")) {
        return resolveProcessSummaryCopy(
          "toolCall.processSummary.generic.locateFirst",
          normalizedSubject,
        );
      }
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.listFirst",
        normalizedSubject,
      );
    case "command":
      return buildCommandPreSummary(normalizedName, args);
    case "fetch":
      if (urlLabel) {
        return resolveRequiredAgentChatCopy(
          "toolCall.processSummary.generic.fetchFirstWithSubject",
          { subject: urlLabel },
        );
      }
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.fetchFirst",
        normalizedSubject,
      );
    case "search":
      return query
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.searchFirstWithSubject",
            { subject: shorten(query, 36) },
          )
        : resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.searchFirst",
          );
    case "write":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.writeFirst",
        normalizedSubject,
      );
    case "edit":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.editFirst",
        normalizedSubject,
      );
    case "task":
      return resolveRequiredAgentChatCopy(
        "toolCall.processSummary.generic.stepStartFirst",
      );
    case "plan":
      return resolveProcessSummaryCopy(
        "toolCall.processSummary.generic.planHandleFirst",
        normalizedSubject,
      );
    default:
      return normalizedSubject
        ? resolveRequiredAgentChatCopy(
            "toolCall.processSummary.generic.handleFirstWithSubject",
            { subject: normalizedSubject },
          )
        : null;
  }
}

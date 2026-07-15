export const AGENT_CONTROL_VISIBLE_DOM_GATE_B_BATCH_ID = "agent-control-tools";
export const AGENT_CONTROL_FINAL_TEXT =
  "AGENT_RUNTIME_AGENT_CONTROL_TOOLS_DONE";
export const AGENT_CONTROL_TOOL_NAMES = [
  "spawn_agent",
  "list_agents",
  "send_message",
  "followup_task",
  "interrupt_agent",
  "wait_agent",
];
export const AGENT_CONTROL_SUBAGENT_ACTIVITY_KINDS = [
  "started",
  "interacted",
  "interrupted",
];

const RETIRED_TEAM_TOOL_NAMES = new Set([
  "Agent",
  "TeamCreate",
  "TeamDelete",
  "SendMessage",
  "ListPeers",
  "SendUserMessage",
]);

function toolIdentity(rows) {
  return rows
    .filter((row) => AGENT_CONTROL_TOOL_NAMES.includes(String(row?.name || "")))
    .map((row) => [
      String(row?.id || ""),
      String(row?.name || ""),
      String(row?.status || ""),
    ])
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function subagentActivityIdentity(rows) {
  return rows
    .map((row) => [
      String(row?.itemId || ""),
      String(row?.activityKind || ""),
      String(row?.threadId || ""),
    ])
    .sort((left, right) =>
      JSON.stringify(left).localeCompare(JSON.stringify(right)),
    );
}

function sameIdentity(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function buildAgentControlVisibleDomAssertions({ evidence, snapshot }) {
  const matrix = Array.isArray(evidence?.runtime?.matrix)
    ? evidence.runtime.matrix
    : [];
  const completedRuntimeTools = new Set(
    matrix
      .filter(
        (entry) => entry?.status === "completed" && entry?.success !== false,
      )
      .map((entry) => String(entry?.tool || "").trim())
      .filter(Boolean),
  );
  const typedToolRows = Array.isArray(snapshot?.typedToolRows)
    ? snapshot.typedToolRows
    : [];
  const agentControlRows = typedToolRows.filter((row) =>
    AGENT_CONTROL_TOOL_NAMES.includes(String(row?.name || "")),
  );
  const rowCountByName = new Map(
    AGENT_CONTROL_TOOL_NAMES.map((toolName) => [
      toolName,
      agentControlRows.filter((row) => row?.name === toolName).length,
    ]),
  );
  const subagentActivityRows = Array.isArray(snapshot?.subagentActivityRows)
    ? snapshot.subagentActivityRows
    : [];
  const visibleActivityKinds = new Set(
    subagentActivityRows
      .filter(
        (row) => row?.visible === true && String(row?.threadId || "").trim(),
      )
      .map((row) =>
        String(row?.activityKind || "")
          .trim()
          .toLowerCase(),
      )
      .filter(Boolean),
  );
  const appServerCalls = Array.isArray(snapshot?.appServerCalls)
    ? snapshot.appServerCalls
    : [];
  const preRestartToolRows = Array.isArray(snapshot?.preRestart?.typedToolRows)
    ? snapshot.preRestart.typedToolRows
    : [];
  const preRestartActivityRows = Array.isArray(
    snapshot?.preRestart?.subagentActivityRows,
  )
    ? snapshot.preRestart.subagentActivityRows
    : [];
  const preRestartChildThreadIds = new Set(
    preRestartActivityRows
      .map((row) => String(row?.threadId || ""))
      .filter(Boolean),
  );
  const restoredChildThreadIds = new Set(
    subagentActivityRows
      .map((row) => String(row?.threadId || ""))
      .filter(Boolean),
  );

  return {
    visibleDomUsesRealElectronHost:
      snapshot?.electron === true &&
      snapshot?.hasInvokeBridge === true &&
      snapshot?.supportsAppServer === true,
    visibleDomRestoredAfterColdRestart:
      snapshot?.coldRestart?.electronProcessReplaced === true,
    visibleDomNavigatedToTargetSession:
      Boolean(snapshot?.sessionId) &&
      snapshot?.activeSessionId === snapshot?.sessionId,
    visibleDomCurrentReadModelObserved: appServerCalls.some(
      (call) =>
        call?.method === "agentSession/read" &&
        call?.transport === "electron-ipc" &&
        call?.status === "success",
    ),
    visibleDomCurrentThreadListObserved: appServerCalls.some(
      (call) =>
        call?.method === "thread/list" &&
        call?.transport === "electron-ipc" &&
        call?.status === "success",
    ),
    visibleDomToolIdentityStableAcrossRestart:
      preRestartToolRows.length > 0 &&
      sameIdentity(
        toolIdentity(preRestartToolRows),
        toolIdentity(typedToolRows),
      ),
    visibleDomSubAgentIdentityStableAcrossRestart:
      preRestartActivityRows.length > 0 &&
      sameIdentity(
        subagentActivityIdentity(preRestartActivityRows),
        subagentActivityIdentity(subagentActivityRows),
      ),
    visibleDomChildThreadStableAcrossRestart:
      preRestartChildThreadIds.size === 1 &&
      restoredChildThreadIds.size === 1 &&
      [...preRestartChildThreadIds][0] === [...restoredChildThreadIds][0],
    visibleDomAllAgentControlToolsCompletedInReadModel:
      AGENT_CONTROL_TOOL_NAMES.every((toolName) =>
        completedRuntimeTools.has(toolName),
      ),
    visibleDomAllAgentControlToolRowsPresentOnce:
      AGENT_CONTROL_TOOL_NAMES.every(
        (toolName) => rowCountByName.get(toolName) === 1,
      ),
    visibleDomAllAgentControlToolRowsCompleted: agentControlRows.every(
      (row) => row?.status === "completed",
    ),
    visibleDomAllAgentControlToolRowsVisible:
      agentControlRows.length === AGENT_CONTROL_TOOL_NAMES.length &&
      agentControlRows.every((row) => row?.visible === true),
    visibleDomCanonicalSubAgentActivitiesVisible:
      AGENT_CONTROL_SUBAGENT_ACTIVITY_KINDS.every((activityKind) =>
        visibleActivityKinds.has(activityKind),
      ),
    visibleDomSubAgentActivitiesUseCanonicalIdentity:
      subagentActivityRows.length >=
        AGENT_CONTROL_SUBAGENT_ACTIVITY_KINDS.length &&
      subagentActivityRows.every(
        (row) =>
          String(row?.itemId || "").trim().length > 0 &&
          String(row?.threadId || "").trim().length > 0,
      ),
    visibleDomRetiredTeamToolsAbsent: !typedToolRows.some((row) =>
      RETIRED_TEAM_TOOL_NAMES.has(String(row?.name || "")),
    ),
    visibleDomFinalAssistantTextVisible:
      snapshot?.finalAssistantTextVisible === true,
    visibleDomInvokeErrorsClear: snapshot?.invokeErrorCount === 0,
    visibleDomConsoleErrorsClear: snapshot?.consoleErrorCount === 0,
  };
}

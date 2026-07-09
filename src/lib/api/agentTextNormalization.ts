const LEGACY_DECISION_PREFIX_RE = /^已决定[:：]\s*/;
const LEGACY_TOOL_SURFACE_ALIASES: Record<string, string> = {
  requestuserinput: "request_user_input",
  requestuserinputtool: "request_user_input",
  "clock.sleep": "sleep",
  clocksleep: "sleep",
  sleep: "sleep",
  spawnagent: "Agent",
  subagenttask: "Agent",
  agenttool: "Agent",
  sendinput: "SendMessage",
  sendmessagetool: "SendMessage",
  bashtool: "Bash",
  shell: "Bash",
  developershell: "Bash",
  mcpsystemshell: "Bash",
  shellcommand: "Bash",
  execcommand: "Bash",
  localshellcall: "Bash",
  updateplan: "update_plan",
  updateplantool: "update_plan",
  filereadtool: "Read",
  readfiletool: "Read",
  readfile: "Read",
  developerread: "Read",
  mcpsystemreadfile: "Read",
  globtool: "Glob",
  mcpsystemglob: "Glob",
  greptool: "Grep",
  mcpsystemgrep: "Grep",
  listmcpresources: "list_mcp_resources",
  listmcpresourcestool: "list_mcp_resources",
  readmcpresource: "read_mcp_resource",
  readmcpresourcetool: "read_mcp_resource",
  powershelltool: "PowerShell",
  skilltool: "Skill",
  syntheticoutputtool: "StructuredOutput",
  taskcreatetool: "TaskCreate",
  taskgettool: "TaskGet",
  tasklisttool: "TaskList",
  taskoutputtool: "TaskOutput",
  agentoutputtool: "TaskOutput",
  bashoutputtool: "TaskOutput",
  taskstoptool: "TaskStop",
  killshell: "TaskStop",
  taskupdatetool: "TaskUpdate",
  teamcreatetool: "TeamCreate",
  teamdeletetool: "TeamDelete",
  listpeerstool: "ListPeers",
  toolsearchtool: "ToolSearch",
  toolsearch: "ToolSearch",
  mcpsystemtoolsearch: "ToolSearch",
  webfetchtool: "WebFetch",
  webfetch: "WebFetch",
  mcpsystemwebfetch: "WebFetch",
  websearchtool: "WebSearch",
  websearch: "WebSearch",
  mcpsystemwebsearch: "WebSearch",
  viewimage: "view_image",
  viewimagetool: "view_image",
};

export function normalizeLegacyRuntimeStatusTitle(title: string): string {
  return title.replace(LEGACY_DECISION_PREFIX_RE, "").trim();
}

function normalizeLegacyTurnSummaryText(text: string): string {
  const normalized = text.trim();
  if (!normalized) {
    return "";
  }

  const [firstLine = "", ...rest] = normalized.split(/\r?\n/);
  const normalizedFirstLine = normalizeLegacyRuntimeStatusTitle(firstLine);

  if (rest.length === 0) {
    return normalizedFirstLine;
  }

  return [normalizedFirstLine, ...rest]
    .filter((line, index) => index > 0 || line)
    .join("\n");
}

export function normalizeLegacyToolSurfaceName(
  value?: string | null,
): string | undefined {
  const normalized = value?.trim();
  if (!normalized) {
    return undefined;
  }

  const key = normalized.replace(/[\s_-]+/g, "").toLowerCase();
  return LEGACY_TOOL_SURFACE_ALIASES[key] || normalized;
}

export function normalizeLegacyThreadItem<
  T extends { type?: unknown; text?: unknown },
>(item: T): T {
  if (item.type !== "turn_summary" || typeof item.text !== "string") {
    return item;
  }

  return {
    ...item,
    text: normalizeLegacyTurnSummaryText(item.text),
  };
}

export function normalizeLegacyThreadItems<
  T extends { type?: unknown; text?: unknown },
>(items: T[]): T[] {
  return items.map((item) => normalizeLegacyThreadItem(item));
}

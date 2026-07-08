import {
  escapeRegExp,
  findFirstValueByKeys,
  isRecord,
  parseJsonObject,
  parseJsonValue,
  readRecordArray,
  readRuntimeEvent,
  readString,
  readUnknown,
  recordValue,
  stringValue,
} from "./agentRuntimeProcessAccess";

export function collectRequiredSkillNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const includeDirectSkillList = !isRuntimeTaskProjection(value);
  return uniqueTextValues([
    ...collectSkillNamesFromList(value.requiredSkills),
    ...(includeDirectSkillList ? collectSkillNamesFromList(value.skills) : []),
    ...collectSkillNamesFromList(value.skillRefs),
    ...collectSkillNamesFromList(
      recordValue(value, "skillContract")?.requiredSkills,
    ),
    ...collectSkillNamesFromList(
      recordValue(recordValue(value, "input"), "agentTaskContract")
        ?.requiredSkills,
    ),
    ...collectSkillNamesFromList(
      recordValue(value, "expectedOutput")?.requiredSkills,
    ),
    ...collectSkillNamesFromList(
      recordValue(recordValue(value, "expectedOutput"), "skillContract")
        ?.requiredSkills,
    ),
    ...collectSkillNamesFromList(
      recordValue(recordValue(value, "metadata"), "contentFactory")?.skillRefs,
    ),
    ...collectSkillNamesFromList(
      recordValue(
        recordValue(recordValue(value, "metadata"), "contentFactory"),
        "skillContract",
      )?.requiredSkills,
    ),
  ]);
}

export function extractToolNameFromEvent(event: unknown): string {
  if (!isRecord(event)) {
    return "";
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  return (
    readString(event, "toolName") ||
    readString(event, "tool_name") ||
    readString(payload, "toolName") ||
    readString(payload, "tool_name") ||
    readString(runtimeEvent, "toolName") ||
    readString(runtimeEvent, "tool_name") ||
    stringValue(
      findFirstValueByKeys(runtimeEvent, ["toolName", "tool_name", "name"]),
    ) ||
    ""
  );
}

export function extractInvokedSkillNameFromEvent(event: unknown): string {
  if (!isRecord(event)) {
    return "";
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  const toolName = extractToolNameFromEvent(event);
  return normalizeSkillNameCandidate(
    extractSkillNameFromToolName(toolName) ||
      stringValue(
        findFirstValueByKeys(event, [
          "skillName",
          "skill_name",
          "command_name",
        ]),
      ) ||
      extractSkillNameFromArguments(readUnknown(runtimeEvent, "arguments")) ||
      extractSkillNameFromArguments(
        readUnknown(runtimeEvent, "accumulated_arguments"),
      ) ||
      extractSkillNameFromArguments(
        readUnknown(runtimeEvent, "accumulatedArguments"),
      ) ||
      extractSkillNameFromArguments(readUnknown(payload, "arguments")) ||
      extractSkillNameFromArguments(readUnknown(payload, "args")) ||
      extractSkillNameFromArguments(readUnknown(event, "arguments")) ||
      extractSkillNameFromText(readString(runtimeEvent, "arguments")) ||
      extractSkillNameFromText(
        readString(runtimeEvent, "accumulated_arguments"),
      ) ||
      extractSkillNameFromText(
        readString(runtimeEvent, "accumulatedArguments"),
      ) ||
      extractSkillNameFromText(readString(event, "message")),
  );
}

export function extractSkillNameFromEvent(event: unknown): string {
  if (!isRecord(event)) {
    return "";
  }
  const payload = recordValue(event, "payload");
  const runtimeEvent = readRuntimeEvent(event);
  const toolName = extractToolNameFromEvent(event);
  return normalizeSkillNameCandidate(
    extractSkillNameFromToolName(toolName) ||
      stringValue(
        findFirstValueByKeys(event, [
          "skillName",
          "skill_name",
          "command_name",
        ]),
      ) ||
      extractSkillNameFromArguments(readUnknown(runtimeEvent, "arguments")) ||
      extractSkillNameFromArguments(
        readUnknown(runtimeEvent, "accumulated_arguments"),
      ) ||
      extractSkillNameFromArguments(
        readUnknown(runtimeEvent, "accumulatedArguments"),
      ) ||
      extractSkillNameFromArguments(readUnknown(payload, "arguments")) ||
      extractSkillNameFromArguments(readUnknown(payload, "args")) ||
      extractSkillNameFromArguments(readUnknown(event, "arguments")) ||
      extractSkillNameFromText(readString(runtimeEvent, "arguments")) ||
      extractSkillNameFromText(
        readString(runtimeEvent, "accumulated_arguments"),
      ) ||
      extractSkillNameFromText(
        readString(runtimeEvent, "accumulatedArguments"),
      ) ||
      extractSkillNameFromText(readString(payload, "delta")) ||
      extractSkillNameFromText(readString(event, "message")),
  );
}

export function collectInvokedSkillNamesFromRuntimeValue(
  value: unknown,
  declaredSkillNames: string[],
): string[] {
  if (!isRecord(value)) {
    return [];
  }
  const threadRead = recordValue(value, "threadRead");
  return uniqueSkillNames(
    [
      ...collectRuntimeProcessInvokedSkillNames(value),
      ...collectRuntimeProcessInvokedSkillNames(
        recordValue(value, "runtimeProcess"),
      ),
      ...collectRuntimeProcessInvokedSkillNames(recordValue(value, "process")),
      ...collectInvokedSkillNamesFromEvents(readRecordArray(value, "events")),
      ...collectInvokedSkillNamesFromEvents(
        readRecordArray(value, "taskEvents"),
      ),
      ...collectInvokedSkillNamesFromRuntimeFacts(value, declaredSkillNames),
      ...collectInvokedSkillNamesFromRuntimeFacts(
        threadRead,
        declaredSkillNames,
      ),
    ],
    declaredSkillNames,
  );
}

export function formatToolTitle(toolName: string, skillName: string): string {
  const name = formatToolName(toolName, skillName);
  if (skillName || /^Skill/i.test(String(toolName || ""))) {
    return `Skill · ${skillName || "待解析名称"}`;
  }
  if (/ToolSearch/i.test(name)) {
    return `检索工具 · ${name}`;
  }
  if (/Bash|Shell|Command/i.test(name)) {
    return `本地执行 · ${name}`;
  }
  if (/^Agent|SubAgent|Team/i.test(name)) {
    return `子任务 · ${name}`;
  }
  return `工具 · ${name || "未命名"}`;
}

export function formatToolName(toolName: string, skillName: string): string {
  if (skillName && /^Skill/i.test(String(toolName || ""))) {
    return skillName;
  }
  return String(toolName || "").trim();
}

export function uniqueSkillNames(
  values: Array<string | undefined | null>,
  declaredSkillNames: string[] = [],
): string[] {
  const normalized = uniqueTextValues(
    values.map((value) => normalizeSkillNameCandidate(String(value || ""))),
  );
  const declared = uniqueTextValues(
    declaredSkillNames.map((value) => normalizeSkillNameCandidate(value)),
  );
  return normalized.filter(
    (value) => !isPartialSkillName(value, normalized, declared),
  );
}

function isRuntimeTaskProjection(value: Record<string, unknown>): boolean {
  return Boolean(
    (value.taskId ||
      value.taskStatus ||
      value.threadRead ||
      value.runtimeProcess) &&
    (value.status || value.taskStatus || value.threadRead || value.result),
  );
}

function collectSkillNamesFromList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string") {
        return item;
      }
      if (!isRecord(item)) {
        return "";
      }
      return String(
        item.skill ??
          item.skillName ??
          item.skill_name ??
          item.id ??
          item.name ??
          "",
      );
    })
    .filter(Boolean);
}

function collectRuntimeProcessInvokedSkillNames(value: unknown): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return collectSkillNamesFromList(value.invokedSkillNames);
}

function collectInvokedSkillNamesFromEvents(events: unknown[]): string[] {
  return events.map(extractInvokedSkillNameFromEvent);
}

function collectInvokedSkillNamesFromRuntimeFacts(
  value: unknown,
  declaredSkillNames: string[],
): string[] {
  if (!isRecord(value)) {
    return [];
  }
  return uniqueSkillNames(
    [
      ...collectSkillNamesFromToolCallList(
        readRecordArray(value, "tool_calls"),
      ),
      ...collectSkillNamesFromToolCallList(readRecordArray(value, "toolCalls")),
      ...collectSkillNamesFromToolCallList(
        readRecordArray(value, "toolRequests"),
      ),
      ...collectSkillNamesFromTurns(
        readRecordArray(value, "turns"),
        declaredSkillNames,
      ),
      ...collectSkillNamesFromArtifacts(
        readRecordArray(value, "artifacts"),
        declaredSkillNames,
      ),
    ],
    declaredSkillNames,
  );
}

function collectSkillNamesFromToolCallList(toolCalls: unknown[]): string[] {
  return toolCalls.map(extractSkillNameFromToolCall);
}

function collectSkillNamesFromTurns(
  turns: unknown[],
  declaredSkillNames: string[],
): string[] {
  return uniqueSkillNames(
    turns.flatMap((turn) =>
      collectSkillNamesFromNestedRuntimeObject(turn, declaredSkillNames),
    ),
    declaredSkillNames,
  );
}

function collectSkillNamesFromNestedRuntimeObject(
  value: unknown,
  declaredSkillNames: string[],
  depth = 5,
): string[] {
  if (depth < 0) {
    return [];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectSkillNamesFromNestedRuntimeObject(
        item,
        declaredSkillNames,
        depth - 1,
      ),
    );
  }
  if (!isRecord(value)) {
    return typeof value === "string"
      ? collectSkillNamesFromText(value, declaredSkillNames)
      : [];
  }
  const names = [
    extractSkillNameFromToolCall(value),
    ...collectSkillNamesFromRuntimeTextFields(value, declaredSkillNames),
  ];
  for (const [key, child] of Object.entries(value)) {
    if (isStaticSkillDeclarationKey(key)) {
      continue;
    }
    names.push(
      ...collectSkillNamesFromNestedRuntimeObject(
        child,
        declaredSkillNames,
        depth - 1,
      ),
    );
  }
  return uniqueSkillNames(names, declaredSkillNames);
}

function collectSkillNamesFromArtifacts(
  artifacts: unknown[],
  declaredSkillNames: string[],
): string[] {
  return uniqueSkillNames(
    artifacts.flatMap((artifact) =>
      collectSkillNamesFromNestedRuntimeObject(artifact, declaredSkillNames),
    ),
    declaredSkillNames,
  );
}

function collectSkillNamesFromRuntimeTextFields(
  value: Record<string, unknown>,
  declaredSkillNames: string[],
): string[] {
  const textKeys = [
    "message",
    "summary",
    "title",
    "content",
    "markdown",
    "text",
    "output",
    "result",
  ];
  return uniqueSkillNames(
    textKeys.flatMap((key) => {
      const text = value[key];
      return typeof text === "string"
        ? collectSkillNamesFromText(text, declaredSkillNames)
        : [];
    }),
    declaredSkillNames,
  );
}

function extractSkillNameFromToolCall(value: unknown): string {
  if (!isRecord(value)) {
    return "";
  }
  const functionRecord = recordValue(value, "function");
  const toolName =
    readString(value, "toolName") ||
    readString(value, "tool_name") ||
    readString(value, "name") ||
    readString(functionRecord, "name");
  return normalizeSkillNameCandidate(
    extractSkillNameFromToolName(toolName) ||
      extractSkillNameFromArguments(readUnknown(value, "arguments")) ||
      extractSkillNameFromArguments(readUnknown(value, "args")) ||
      extractSkillNameFromArguments(readUnknown(value, "input")) ||
      extractSkillNameFromArguments(readUnknown(functionRecord, "arguments")) ||
      extractSkillNameFromText(readString(value, "arguments")) ||
      extractSkillNameFromText(readString(functionRecord, "arguments")),
  );
}

function extractSkillNameFromToolName(toolName: string): string {
  const match = String(toolName || "").match(/^Skill\(([^)]+)\)$/i);
  return match?.[1] ?? "";
}

function extractSkillNameFromText(text: string): string {
  const value = String(text || "").trim();
  if (!value) {
    return "";
  }
  const parsed = parseJsonObject(value);
  if (parsed) {
    return stringValue(
      findFirstValueByKeys(parsed, [
        "skill",
        "skillName",
        "skill_name",
        "command_name",
      ]),
    );
  }
  const match = value.match(
    /["']?(?:skill|skillName|skill_name|command_name)["']?\s*[:=]\s*["']?([@A-Za-z0-9_:/.-]+)/,
  );
  return match?.[1] ?? "";
}

function collectSkillNamesFromText(
  text: string,
  declaredSkillNames: string[] = [],
): string[] {
  const value = String(text || "").trim();
  if (!value) {
    return [];
  }
  const names: string[] = [];
  const parsed = parseJsonValue(value);
  if (parsed !== null) {
    names.push(...collectSkillNamesFromStructuredValue(parsed));
  }
  const keyedPattern =
    /["']?(?:skill|skillName|skill_name|command_name)["']?\s*[:=]\s*["']?([@A-Za-z0-9_:/.-]+)/g;
  for (const match of value.matchAll(keyedPattern)) {
    names.push(match[1] ?? "");
  }
  const explicitSkillPattern =
    /(?:\bSkill\b|技能)\s*[·:：=-]?\s*["']?([@A-Za-z0-9_:/.-]+)/gi;
  for (const match of value.matchAll(explicitSkillPattern)) {
    names.push(match[1] ?? "");
  }
  const completedTokenPattern =
    /\b([@A-Za-z0-9_:/.-]*[-@:/][@A-Za-z0-9_:/.-]*)\b\s+(?:completed|succeeded|finished|done|已完成|完成)/gi;
  for (const match of value.matchAll(completedTokenPattern)) {
    names.push(match[1] ?? "");
  }
  for (const skillName of declaredSkillNames) {
    if (!skillName || !value.includes(skillName)) {
      continue;
    }
    if (
      new RegExp(
        `${escapeRegExp(skillName)}[\\s\\S]{0,32}(completed|succeeded|finished|done|已完成|完成|调用|执行|recorded|已记录)|` +
          `(Skill|技能|调用|执行|recorded|已记录)[\\s\\S]{0,32}${escapeRegExp(skillName)}`,
        "i",
      ).test(value)
    ) {
      names.push(skillName);
    }
  }
  return uniqueSkillNames(names, declaredSkillNames);
}

function collectSkillNamesFromStructuredValue(
  value: unknown,
  depth = 5,
): string[] {
  if (depth < 0) {
    return [];
  }
  if (typeof value === "string") {
    return [extractSkillNameFromText(value)];
  }
  if (Array.isArray(value)) {
    return value.flatMap((item) =>
      collectSkillNamesFromStructuredValue(item, depth - 1),
    );
  }
  if (!isRecord(value)) {
    return [];
  }
  const names: string[] = [];
  for (const key of ["skill", "skillName", "skill_name", "command_name"]) {
    names.push(stringValue(value[key]));
  }
  for (const child of Object.values(value)) {
    names.push(...collectSkillNamesFromStructuredValue(child, depth - 1));
  }
  return names;
}

function extractSkillNameFromArguments(value: unknown): string {
  if (typeof value === "string") {
    return extractSkillNameFromText(value);
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const skillName = extractSkillNameFromArguments(item);
      if (skillName) {
        return skillName;
      }
    }
    return "";
  }
  if (!isRecord(value)) {
    return "";
  }
  return stringValue(
    findFirstValueByKeys(
      value,
      ["skill", "skillName", "skill_name", "command_name"],
      3,
    ),
  );
}

function normalizeSkillNameCandidate(value: string): string {
  const text = String(value || "").trim();
  if (
    !text ||
    /^(Skill|completed|complete|running|failed|failure|started|succeeded|success|done|工具|技能)$/i.test(
      text,
    )
  ) {
    return "";
  }
  return /^[\w@:/.-]+$/.test(text) ? text : "";
}

function uniqueTextValues(values: Array<string | undefined | null>): string[] {
  return Array.from(
    new Set(values.map((value) => String(value || "").trim()).filter(Boolean)),
  );
}

function isPartialSkillName(
  value: string,
  allValues: string[],
  declaredSkillNames: string[],
): boolean {
  if (!value) {
    return true;
  }
  if (
    declaredSkillNames.some(
      (candidate) => candidate !== value && candidate.startsWith(value),
    )
  ) {
    return true;
  }
  if (declaredSkillNames.includes(value)) {
    return false;
  }
  return allValues.some(
    (candidate) =>
      candidate !== value &&
      candidate.startsWith(value) &&
      (/^[-_:/@.]/.test(candidate.slice(value.length)) ||
        /[-_:/@]/.test(value)),
  );
}

function isStaticSkillDeclarationKey(key: string): boolean {
  return [
    "requiredSkills",
    "skills",
    "skillRefs",
    "skillContract",
    "expectedOutput",
    "agentTaskContract",
  ].includes(key);
}

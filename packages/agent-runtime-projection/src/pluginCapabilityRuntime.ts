import type {
  AgentUiProjectionContext,
  AgentUiProjectionEvent,
  AgentUiRuntimeStatus,
} from "@limecloud/agent-ui-contracts";

import {
  compactProjectionFields,
  definedString,
  normalizeProjectionIdList,
  readBooleanField,
  readRecord,
  readStringField,
} from "./normalization.js";

export type AgentUiPluginCapabilityRuntimeIssueCode =
  | "missing_plugin_operation"
  | "plugin_read_missing_skill_contents"
  | "plugin_interface_asset_not_absolute"
  | "plugin_interface_asset_outside_root"
  | "install_wrote_global_mcp_config"
  | "installed_plugin_missing_from_catalog"
  | "installed_mcp_missing_from_catalog"
  | "installed_skill_missing_from_catalog"
  | "followup_request_bypassed_turn_start"
  | "followup_request_missing_installed_mcp"
  | "followup_request_missing_installed_skill"
  | "stale_plugin_install_recommendation_present"
  | "capability_catalog_missing_generation"
  | "capability_missing_provenance"
  | "remote_install_cache_not_refreshed";

export interface AgentUiPluginCapabilityRuntimeIssue {
  code: AgentUiPluginCapabilityRuntimeIssueCode;
  path: string;
  message: string;
}

export interface AgentUiPluginCapabilityRuntimeProjectionInput {
  pluginOperations?: unknown;
  pluginList?: unknown;
  pluginReads?: unknown;
  skillReads?: unknown;
  installResults?: unknown;
  capabilityCatalog?: unknown;
  followupRequests?: unknown;
  timestamp?: string | null;
}

export interface AgentUiPluginInterfaceAssetSnapshot {
  field: string;
  path: string;
  absolute: boolean;
  withinPluginRoot: boolean;
}

export interface AgentUiPluginRuntimeSnapshot {
  id: string;
  name?: string;
  root?: string;
  source?: string;
  installed: boolean;
  enabled: boolean;
  skillNames: string[];
  mcpServerNames: string[];
  appToolNames: string[];
  interfaceAssetPaths: AgentUiPluginInterfaceAssetSnapshot[];
}

export interface AgentUiPluginSkillReadSnapshot {
  pluginId: string;
  skillName: string;
  enabled: boolean;
  remote: boolean;
  contentsPresent: boolean;
  contentPreview?: string;
}

export interface AgentUiPluginInstallSnapshot {
  pluginId: string;
  pluginName?: string;
  completed: boolean;
  userConfirmed: boolean;
  cacheRefreshed: boolean;
  wroteGlobalMcpConfig: boolean;
  skillNames: string[];
  mcpServerNames: string[];
  appToolNames: string[];
}

export interface AgentUiPluginCapabilityCatalogSnapshot {
  generation?: string;
  installedPluginIds: string[];
  skillNames: string[];
  mcpServerNames: string[];
  appToolNames: string[];
  provenanceIds: string[];
}

export interface AgentUiPluginFollowupRequestSnapshot {
  requestId: string;
  turnId?: string;
  wentThroughTurnStart: boolean;
  skillNames: string[];
  mcpServerNames: string[];
  appToolNames: string[];
  recommendationToolNames: string[];
}

export interface AgentUiPluginCapabilityRuntimeSnapshot {
  operationCount: number;
  plugins: AgentUiPluginRuntimeSnapshot[];
  skillReads: AgentUiPluginSkillReadSnapshot[];
  installResults: AgentUiPluginInstallSnapshot[];
  capabilityCatalog: AgentUiPluginCapabilityCatalogSnapshot;
  followupRequests: AgentUiPluginFollowupRequestSnapshot[];
  catalogStable: boolean;
  followupStable: boolean;
  validationIssues: AgentUiPluginCapabilityRuntimeIssue[];
}

function issue(
  code: AgentUiPluginCapabilityRuntimeIssueCode,
  path: string,
  message: string,
): AgentUiPluginCapabilityRuntimeIssue {
  return { code, path, message };
}

function recordArray(value: unknown): Record<string, unknown>[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => readRecord(item))
    .filter((item): item is Record<string, unknown> => Boolean(item));
}

function normalizePath(value: string | undefined): string | undefined {
  const trimmed = definedString(value);
  if (!trimmed) return undefined;
  return trimmed.replace(/^file:\/\//, "").replace(/\\/g, "/");
}

function isAbsolutePath(path: string): boolean {
  return path.startsWith("/") || /^[A-Za-z]:\//.test(path);
}

function pathWithin(path: string | undefined, root: string | undefined): boolean {
  const normalizedPath = normalizePath(path);
  const normalizedRoot = normalizePath(root);
  if (!normalizedPath || !normalizedRoot) return false;
  return (
    normalizedPath === normalizedRoot ||
    normalizedPath.startsWith(`${normalizedRoot.replace(/\/+$/g, "")}/`)
  );
}

function readGeneration(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (typeof value === "string") return definedString(value);
  return undefined;
}

function readNameList(value: unknown): string[] {
  if (typeof value === "string") return normalizeProjectionIdList([value]);
  if (!Array.isArray(value)) return [];
  return normalizeProjectionIdList(
    value.map((item) => {
      if (typeof item === "string") return item;
      const record = readRecord(item);
      return readStringField(record, [
        "name",
        "id",
        "server",
        "serverName",
        "server_name",
        "tool",
        "skillName",
        "skill_name",
      ]);
    }),
  );
}

function firstNameList(...values: unknown[]): string[] {
  for (const value of values) {
    const names = readNameList(value);
    if (names.length > 0) return names;
  }
  return [];
}

function operationRecords(input: AgentUiPluginCapabilityRuntimeProjectionInput) {
  return [
    ...recordArray(input.pluginOperations),
    ...recordArray(input.pluginList),
    ...recordArray(input.pluginReads),
    ...recordArray(input.skillReads),
    ...recordArray(input.installResults),
  ];
}

function assetRecordsFromValue(
  value: unknown,
  field: string,
): Array<{ field: string; path: string }> {
  if (typeof value === "string") {
    const path = definedString(value);
    return path ? [{ field, path }] : [];
  }
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (typeof item === "string") return definedString(item);
      const record = readRecord(item);
      return readStringField(record, ["path", "url", "uri"]);
    })
    .filter((path): path is string => Boolean(path))
    .map((path) => ({ field, path }));
}

function interfaceAssets(
  record: Record<string, unknown>,
  pluginRoot: string | undefined,
): AgentUiPluginInterfaceAssetSnapshot[] {
  const source = readRecord(record.interface) ?? record;
  const assets = [
    ...assetRecordsFromValue(source.composerIcon ?? source.composer_icon, "composerIcon"),
    ...assetRecordsFromValue(source.logo, "logo"),
    ...assetRecordsFromValue(source.screenshots, "screenshots"),
  ];
  return assets.map(({ field, path }) => {
    const normalized = normalizePath(path) ?? path;
    const absolute = isAbsolutePath(normalized);
    return {
      field,
      path: normalized,
      absolute,
      withinPluginRoot: pluginRoot ? pathWithin(normalized, pluginRoot) : true,
    };
  });
}

function pluginId(record: Record<string, unknown>): string | undefined {
  return readStringField(record, [
    "pluginId",
    "plugin_id",
    "remotePluginId",
    "remote_plugin_id",
    "id",
  ]);
}

function buildPlugin(
  record: Record<string, unknown>,
): AgentUiPluginRuntimeSnapshot | undefined {
  const id = pluginId(record);
  if (!id) return undefined;
  const root = normalizePath(
    readStringField(record, ["root", "pluginRoot", "plugin_root", "path"]),
  );
  return compactProjectionFields({
    id,
    name: readStringField(record, ["name", "pluginName", "plugin_name"]),
    root,
    source: readStringField(record, ["source", "marketplace", "marketplaceName"]),
    installed: readBooleanField(record, ["installed"]) ?? false,
    enabled: readBooleanField(record, ["enabled"]) ?? false,
    skillNames: firstNameList(record.skillNames, record.skills, record.skill_names),
    mcpServerNames: firstNameList(
      record.mcpServerNames,
      record.mcpServers,
      record.mcp_server_names,
    ),
    appToolNames: firstNameList(record.appToolNames, record.appTools, record.app_tool_names),
    interfaceAssetPaths: interfaceAssets(record, root),
  } satisfies AgentUiPluginRuntimeSnapshot);
}

function pluginsForInput(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginRuntimeSnapshot[] {
  const plugins: AgentUiPluginRuntimeSnapshot[] = [];
  for (const record of [...recordArray(input.pluginList), ...recordArray(input.pluginReads)]) {
    const plugin = buildPlugin(record);
    if (plugin) plugins.push(plugin);
  }
  const seen = new Set<string>();
  return plugins.filter((plugin) => {
    if (seen.has(plugin.id)) return false;
    seen.add(plugin.id);
    return true;
  });
}

function skillReadsForInput(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginSkillReadSnapshot[] {
  const reads: AgentUiPluginSkillReadSnapshot[] = [];
  for (const record of recordArray(input.skillReads)) {
    const plugin = pluginId(record);
    const skillName = readStringField(record, ["skillName", "skill_name", "name"]);
    if (!plugin || !skillName) continue;
    const contents = readStringField(record, [
      "contents",
      "skillMdContents",
      "skill_md_contents",
      "body",
    ]);
    reads.push(
      compactProjectionFields({
        pluginId: plugin,
        skillName,
        enabled:
          readBooleanField(record, ["enabled"]) ??
          readStringField(record, ["status"]) === "ENABLED",
        remote: Boolean(
          readStringField(record, ["remoteMarketplaceName", "remote_marketplace_name"]),
        ),
        contentsPresent: Boolean(contents),
        contentPreview: contents?.slice(0, 160),
      } satisfies AgentUiPluginSkillReadSnapshot),
    );
  }
  return reads;
}

function installResultsForInput(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginInstallSnapshot[] {
  const results: AgentUiPluginInstallSnapshot[] = [];
  for (const record of recordArray(input.installResults)) {
    const plugin = pluginId(record);
    if (!plugin) continue;
    results.push(
      compactProjectionFields({
        pluginId: plugin,
        pluginName: readStringField(record, ["pluginName", "plugin_name", "name"]),
        completed: readBooleanField(record, ["completed", "installed"]) ?? true,
        userConfirmed: readBooleanField(record, ["userConfirmed", "user_confirmed"]) ?? true,
        cacheRefreshed:
          readBooleanField(record, [
            "cacheRefreshed",
            "cache_refreshed",
            "catalogRefreshed",
            "catalog_refreshed",
          ]) ?? false,
        wroteGlobalMcpConfig:
          readBooleanField(record, [
            "wroteGlobalMcpConfig",
            "wrote_global_mcp_config",
            "configContainsMcpServer",
            "config_contains_mcp_server",
          ]) ?? false,
        skillNames: firstNameList(record.skillNames, record.skills, record.skill_names),
        mcpServerNames: firstNameList(
          record.mcpServerNames,
          record.mcpServers,
          record.mcp_server_names,
        ),
        appToolNames: firstNameList(record.appToolNames, record.appTools, record.app_tool_names),
      } satisfies AgentUiPluginInstallSnapshot),
    );
  }
  return results;
}

function catalogForInput(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginCapabilityCatalogSnapshot {
  const record = readRecord(input.capabilityCatalog) ?? {};
  return {
    generation: readGeneration(record.generation ?? record.version),
    installedPluginIds: firstNameList(
      record.installedPluginIds,
      record.installed_plugin_ids,
      record.plugins,
    ),
    skillNames: firstNameList(record.skillNames, record.skills, record.skill_names),
    mcpServerNames: firstNameList(
      record.mcpServerNames,
      record.mcpServers,
      record.mcp_server_names,
    ),
    appToolNames: firstNameList(record.appToolNames, record.appTools, record.app_tool_names),
    provenanceIds: firstNameList(
      record.provenanceIds,
      record.provenance,
      record.sources,
      record.sourceIds,
    ),
  };
}

function followupRequestsForInput(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginFollowupRequestSnapshot[] {
  const requests: AgentUiPluginFollowupRequestSnapshot[] = [];
  for (const [index, record] of recordArray(input.followupRequests).entries()) {
    requests.push(
      compactProjectionFields({
        requestId:
          readStringField(record, ["requestId", "request_id", "id"]) ??
          `followup-${index + 1}`,
        turnId: readStringField(record, ["turnId", "turn_id"]),
        wentThroughTurnStart:
          readBooleanField(record, [
            "wentThroughTurnStart",
            "went_through_turn_start",
            "turnStart",
            "turn_start",
          ]) ?? false,
        skillNames: firstNameList(record.skillNames, record.skills, record.skill_names),
        mcpServerNames: firstNameList(
          record.mcpServerNames,
          record.mcpServers,
          record.mcp_server_names,
        ),
        appToolNames: firstNameList(record.appToolNames, record.appTools, record.app_tool_names),
        recommendationToolNames: firstNameList(
          record.recommendationToolNames,
          record.recommendationTools,
          record.tools,
        ),
      } satisfies AgentUiPluginFollowupRequestSnapshot),
    );
  }
  return requests;
}

function hasAll(values: readonly string[], expected: readonly string[]): boolean {
  return expected.every((value) => values.includes(value));
}

function validateSnapshot(
  snapshot: Omit<
    AgentUiPluginCapabilityRuntimeSnapshot,
    "catalogStable" | "followupStable" | "validationIssues"
  >,
): AgentUiPluginCapabilityRuntimeIssue[] {
  const issues: AgentUiPluginCapabilityRuntimeIssue[] = [];
  const catalog = snapshot.capabilityCatalog;

  if (snapshot.operationCount === 0) {
    issues.push(
      issue(
        "missing_plugin_operation",
        "$.pluginOperations",
        "Plugin capability runtime guard requires a list/read/install operation.",
      ),
    );
  }
  if (!catalog.generation) {
    issues.push(
      issue(
        "capability_catalog_missing_generation",
        "$.capabilityCatalog.generation",
        "Plugin capability catalog must carry a generation after list/read/install changes.",
      ),
    );
  }
  if (catalog.provenanceIds.length === 0) {
    issues.push(
      issue(
        "capability_missing_provenance",
        "$.capabilityCatalog.provenanceIds",
        "Plugin capabilities must preserve plugin/source provenance.",
      ),
    );
  }

  snapshot.skillReads.forEach((read, index) => {
    if (read.enabled && !read.contentsPresent) {
      issues.push(
        issue(
          "plugin_read_missing_skill_contents",
          `$.skillReads[${index}].contents`,
          "Enabled remote plugin skill reads must return SKILL.md contents.",
        ),
      );
    }
  });

  snapshot.plugins.forEach((plugin, pluginIndex) => {
    plugin.interfaceAssetPaths.forEach((asset, assetIndex) => {
      if (!asset.absolute) {
        issues.push(
          issue(
            "plugin_interface_asset_not_absolute",
            `$.plugins[${pluginIndex}].interfaceAssetPaths[${assetIndex}]`,
            "Plugin list interface assets must be normalized to absolute paths.",
          ),
        );
      }
      if (!asset.withinPluginRoot) {
        issues.push(
          issue(
            "plugin_interface_asset_outside_root",
            `$.plugins[${pluginIndex}].interfaceAssetPaths[${assetIndex}]`,
            "Plugin interface asset paths must stay under the plugin root.",
          ),
        );
      }
    });
  });

  snapshot.installResults.forEach((install, installIndex) => {
    if (install.wroteGlobalMcpConfig) {
      issues.push(
        issue(
          "install_wrote_global_mcp_config",
          `$.installResults[${installIndex}]`,
          "Plugin install must not write bundled MCP servers into global config.",
        ),
      );
    }
    if (install.completed && !install.cacheRefreshed) {
      issues.push(
        issue(
          "remote_install_cache_not_refreshed",
          `$.installResults[${installIndex}].cacheRefreshed`,
          "Completed plugin install must refresh plugin/app capability caches before followup requests.",
        ),
      );
    }
    if (install.completed && !catalog.installedPluginIds.includes(install.pluginId)) {
      issues.push(
        issue(
          "installed_plugin_missing_from_catalog",
          "$.capabilityCatalog.installedPluginIds",
          "Installed plugins must be reflected in the capability catalog.",
        ),
      );
    }
    if (!hasAll(catalog.mcpServerNames, install.mcpServerNames)) {
      issues.push(
        issue(
          "installed_mcp_missing_from_catalog",
          "$.capabilityCatalog.mcpServerNames",
          "Bundled plugin MCP servers must become catalog capabilities.",
        ),
      );
    }
    if (!hasAll(catalog.skillNames, install.skillNames)) {
      issues.push(
        issue(
          "installed_skill_missing_from_catalog",
          "$.capabilityCatalog.skillNames",
          "Plugin skills must become catalog capabilities.",
        ),
      );
    }
  });

  snapshot.followupRequests.forEach((request, requestIndex) => {
    if (!request.wentThroughTurnStart) {
      issues.push(
        issue(
          "followup_request_bypassed_turn_start",
          `$.followupRequests[${requestIndex}].wentThroughTurnStart`,
          "Plugin capability changes must be consumed by normal turn/start followup requests.",
        ),
      );
    }
    for (const install of snapshot.installResults) {
      if (!hasAll(request.mcpServerNames, install.mcpServerNames)) {
        issues.push(
          issue(
            "followup_request_missing_installed_mcp",
            `$.followupRequests[${requestIndex}].mcpServerNames`,
            "Followup requests must see MCP servers made available by plugin install.",
          ),
        );
      }
      if (!hasAll(request.skillNames, install.skillNames)) {
        issues.push(
          issue(
            "followup_request_missing_installed_skill",
            `$.followupRequests[${requestIndex}].skillNames`,
            "Followup requests must see plugin skills made available by plugin install.",
          ),
        );
      }
    }
    if (request.recommendationToolNames.includes("request_plugin_install")) {
      issues.push(
        issue(
          "stale_plugin_install_recommendation_present",
          `$.followupRequests[${requestIndex}].recommendationToolNames`,
          "Installed plugin recommendations must be filtered from refreshed followup requests.",
        ),
      );
    }
  });

  return issues;
}

function runtimeStatus(
  issues: readonly AgentUiPluginCapabilityRuntimeIssue[],
): AgentUiRuntimeStatus {
  return issues.length > 0 ? "failed" : "completed";
}

export function extractCodexPluginCapabilityRuntimeSnapshot(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
): AgentUiPluginCapabilityRuntimeSnapshot {
  const plugins = pluginsForInput(input);
  const skillReads = skillReadsForInput(input);
  const installResults = installResultsForInput(input);
  const capabilityCatalog = catalogForInput(input);
  const followupRequests = followupRequestsForInput(input);
  const base = {
    operationCount: operationRecords(input).length,
    plugins,
    skillReads,
    installResults,
    capabilityCatalog,
    followupRequests,
  };
  const validationIssues = validateSnapshot(base);
  return {
    ...base,
    catalogStable: !validationIssues.some((item) =>
      [
        "installed_plugin_missing_from_catalog",
        "installed_mcp_missing_from_catalog",
        "installed_skill_missing_from_catalog",
        "capability_catalog_missing_generation",
        "capability_missing_provenance",
        "remote_install_cache_not_refreshed",
      ].includes(item.code),
    ),
    followupStable: !validationIssues.some((item) =>
      [
        "followup_request_bypassed_turn_start",
        "followup_request_missing_installed_mcp",
        "followup_request_missing_installed_skill",
        "stale_plugin_install_recommendation_present",
      ].includes(item.code),
    ),
    validationIssues,
  };
}

export function buildCodexPluginCapabilityRuntimeProjectionEvent(
  input: AgentUiPluginCapabilityRuntimeProjectionInput,
  context: AgentUiProjectionContext = {},
): AgentUiProjectionEvent {
  const snapshot = extractCodexPluginCapabilityRuntimeSnapshot(input);
  const status = runtimeStatus(snapshot.validationIssues);
  return compactProjectionFields({
    type: "context.changed",
    sourceType: "plugin_capability_runtime_projection",
    sequence: context.sequence,
    timestamp: definedString(input.timestamp ?? undefined) ?? context.timestamp,
    sessionId: definedString(context.sessionId ?? undefined),
    threadId: definedString(context.threadId ?? undefined),
    runId: definedString(context.runId ?? undefined),
    turnId: definedString(context.turnId ?? undefined),
    owner: "context",
    scope: "thread",
    phase: snapshot.validationIssues.length > 0 ? "failed" : "completed",
    surface: "timeline_evidence",
    persistence: "snapshot",
    control: "open_detail",
    runtimeEntity: "agent_turn",
    runtimeStatus: status,
    latestTurnStatus: status,
    payload: {
      pluginCapabilityRuntimeEvent: "capability_catalog_snapshot",
      operationCount: snapshot.operationCount,
      pluginIds: snapshot.plugins.map((plugin) => plugin.id),
      installedPluginIds: snapshot.capabilityCatalog.installedPluginIds,
      skillNames: snapshot.capabilityCatalog.skillNames,
      mcpServerNames: snapshot.capabilityCatalog.mcpServerNames,
      appToolNames: snapshot.capabilityCatalog.appToolNames,
      catalogStable: snapshot.catalogStable,
      followupStable: snapshot.followupStable,
      pluginCapabilityRuntime: snapshot,
      validationIssues: snapshot.validationIssues,
    },
  } satisfies AgentUiProjectionEvent);
}

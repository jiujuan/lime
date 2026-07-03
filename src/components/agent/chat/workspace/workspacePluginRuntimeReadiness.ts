import type {
  InstalledPluginState,
  ReadinessIssue,
} from "@/features/plugin/types";
import type {
  PluginCliDeclaration,
  PluginConnectorDeclaration,
  PluginContract,
  PluginHookDeclaration,
  PluginWorkflowDeclaration,
} from "@/features/plugin";

export type WorkspacePluginRuntimeReadinessStatus =
  | "ready"
  | "declared"
  | "degraded"
  | "needs_setup"
  | "blocked";

export type WorkspacePluginRuntimeReadinessItemStatus =
  | "ready"
  | "declared"
  | "degraded"
  | "needs_setup"
  | "blocked";

export interface WorkspacePluginRuntimeReadinessItem {
  id: string;
  title?: string;
  required: boolean;
  status: WorkspacePluginRuntimeReadinessItemStatus;
  reasonCodes: string[];
  source: "workflow_ref" | "manifest_declaration" | "runtime_registry";
  kind?: string;
  event?: string;
  entrypoint?: string;
}

export interface WorkspacePluginRuntimeReadiness {
  source: "host_runtime_readiness";
  pluginId: string;
  activePluginUiId?: string;
  workflowKey?: string;
  taskKind?: string;
  status: WorkspacePluginRuntimeReadinessStatus;
  checkedAt?: string;
  connectorRefs: string[];
  hookRefs: string[];
  cliRefs: string[];
  connectors: WorkspacePluginRuntimeReadinessItem[];
  hooks: WorkspacePluginRuntimeReadinessItem[];
  clis: WorkspacePluginRuntimeReadinessItem[];
  blockerCodes: string[];
  warningCodes: string[];
}

export interface BuildWorkspacePluginRuntimeReadinessParams {
  contract: PluginContract;
  installedPlugin?: InstalledPluginState;
  activePluginUiId?: string;
  workflowKey?: string;
  taskKind?: string;
  intentKey?: string;
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function workflowForActivation(
  contract: PluginContract,
  params: Pick<
    BuildWorkspacePluginRuntimeReadinessParams,
    "workflowKey" | "taskKind" | "intentKey"
  >,
): PluginWorkflowDeclaration | undefined {
  return contract.workflows.find((workflow) => {
    if (params.workflowKey && workflow.key === params.workflowKey) {
      return true;
    }
    if (
      params.intentKey &&
      workflow.triggerIntents?.includes(params.intentKey)
    ) {
      return true;
    }
    return Boolean(params.taskKind && workflow.taskKind === params.taskKind);
  });
}

function flattenHookPolicy(
  policy: PluginWorkflowDeclaration["hookPolicy"],
): string[] {
  if (!policy) {
    return [];
  }
  return uniqueStrings(Object.values(policy).flat());
}

function issueCodes(issues: readonly ReadinessIssue[] | undefined): string[] {
  return uniqueStrings(issues?.map((issue) => issue.code) ?? []);
}

function isHostBlocked(app: InstalledPluginState | undefined): boolean {
  return Boolean(
    app?.disabled ||
    app?.readiness.status === "blocked" ||
    app?.readiness.blockers.some((issue) => issue.severity === "blocker"),
  );
}

function baseItemStatus(
  app: InstalledPluginState | undefined,
  declarationAvailable: boolean,
  registryAvailable: boolean,
): WorkspacePluginRuntimeReadinessItemStatus {
  if (isHostBlocked(app)) {
    return "blocked";
  }
  if (!app) {
    return registryAvailable || declarationAvailable ? "declared" : "blocked";
  }
  if (app.readiness.status === "needs-setup") {
    return "needs_setup";
  }
  if (app.readiness.status === "degraded") {
    return "degraded";
  }
  if (declarationAvailable) {
    return "ready";
  }
  return registryAvailable ? "declared" : "blocked";
}

function baseReasonCodes(params: {
  app?: InstalledPluginState;
  declarationAvailable: boolean;
  registryAvailable: boolean;
  missingDeclarationCode: string;
}): string[] {
  if (params.app?.disabled) {
    return ["PLUGIN_DISABLED"];
  }
  const blockers = issueCodes(params.app?.readiness.blockers);
  if (blockers.length > 0) {
    return blockers;
  }
  if (!params.declarationAvailable && !params.registryAvailable) {
    return [params.missingDeclarationCode];
  }
  if (!params.declarationAvailable && params.registryAvailable) {
    return ["PLUGIN_RUNTIME_REGISTRY_DECLARED"];
  }
  if (params.app?.readiness.status === "needs-setup") {
    return ["PLUGIN_RUNTIME_NEEDS_SETUP"];
  }
  if (params.app?.readiness.status === "degraded") {
    return ["PLUGIN_RUNTIME_DEGRADED"];
  }
  return [];
}

function itemStatusRank(
  status: WorkspacePluginRuntimeReadinessItemStatus,
): number {
  switch (status) {
    case "blocked":
      return 4;
    case "needs_setup":
      return 3;
    case "degraded":
      return 2;
    case "declared":
      return 1;
    case "ready":
      return 0;
  }
}

function topStatus(
  items: readonly WorkspacePluginRuntimeReadinessItem[],
): WorkspacePluginRuntimeReadinessStatus {
  const worst = items.reduce(
    (status, item) =>
      itemStatusRank(item.status) > itemStatusRank(status)
        ? item.status
        : status,
    "ready" as WorkspacePluginRuntimeReadinessItemStatus,
  );
  return worst;
}

function declarationById<T extends { id?: string; key?: string }>(
  declarations: readonly T[],
  id: string,
): T | undefined {
  return declarations.find(
    (declaration) => declaration.id === id || declaration.key === id,
  );
}

function buildCliItems(params: {
  refs: readonly string[];
  declarations: readonly PluginCliDeclaration[];
  app?: InstalledPluginState;
}): WorkspacePluginRuntimeReadinessItem[] {
  const refs = uniqueStrings([
    ...params.refs,
    ...params.declarations
      .filter((declaration) => declaration.required)
      .map((declaration) => declaration.id),
  ]);
  return refs.map((id) => {
    const matchedDeclaration = declarationById(params.declarations, id);
    const declaration =
      matchedDeclaration ??
      (params.declarations.length === 1 ? params.declarations[0] : undefined);
    const declarationAvailable = Boolean(
      declaration?.entrypoint ||
      declaration?.registry ||
      declaration?.commands?.length,
    );
    const registryAvailable = params.declarations.length > 0;
    return {
      id,
      title: declaration?.title,
      required: declaration?.required === true || params.refs.includes(id),
      status: baseItemStatus(
        params.app,
        declarationAvailable,
        registryAvailable,
      ),
      reasonCodes: baseReasonCodes({
        app: params.app,
        declarationAvailable,
        registryAvailable,
        missingDeclarationCode: "PLUGIN_CLI_DECLARATION_MISSING",
      }),
      source: matchedDeclaration
        ? "manifest_declaration"
        : declaration
          ? "runtime_registry"
          : "workflow_ref",
      entrypoint: declaration?.entrypoint ?? declaration?.registry,
    };
  });
}

function buildConnectorItems(params: {
  refs: readonly string[];
  declarations: readonly PluginConnectorDeclaration[];
  registryAvailable: boolean;
  app?: InstalledPluginState;
}): WorkspacePluginRuntimeReadinessItem[] {
  const refs = uniqueStrings([
    ...params.refs,
    ...params.declarations
      .filter((declaration) => declaration.required)
      .map((declaration) => declaration.id),
  ]);
  return refs.map((id) => {
    const declaration = declarationById(params.declarations, id);
    const declarationAvailable = Boolean(declaration);
    return {
      id,
      title: declaration?.title,
      required: declaration?.required === true || params.refs.includes(id),
      status: baseItemStatus(
        params.app,
        declarationAvailable,
        params.registryAvailable,
      ),
      reasonCodes: baseReasonCodes({
        app: params.app,
        declarationAvailable,
        registryAvailable: params.registryAvailable,
        missingDeclarationCode: "PLUGIN_CONNECTOR_DECLARATION_MISSING",
      }),
      source: declaration
        ? "manifest_declaration"
        : params.registryAvailable
          ? "runtime_registry"
          : "workflow_ref",
      kind: declaration?.kind,
    };
  });
}

function buildHookItems(params: {
  refs: readonly string[];
  declarations: readonly PluginHookDeclaration[];
  registryAvailable: boolean;
  app?: InstalledPluginState;
}): WorkspacePluginRuntimeReadinessItem[] {
  const refs = uniqueStrings([
    ...params.refs,
    ...params.declarations
      .filter((declaration) => declaration.required)
      .map((declaration) => declaration.key),
  ]);
  return refs.map((id) => {
    const declaration = declarationById(params.declarations, id);
    const declarationAvailable = Boolean(
      declaration?.entrypoint || declaration?.path || declaration?.event,
    );
    return {
      id,
      title: declaration?.title,
      required: declaration?.required === true || params.refs.includes(id),
      status: baseItemStatus(
        params.app,
        declarationAvailable,
        params.registryAvailable,
      ),
      reasonCodes: baseReasonCodes({
        app: params.app,
        declarationAvailable,
        registryAvailable: params.registryAvailable,
        missingDeclarationCode: "PLUGIN_HOOK_DECLARATION_MISSING",
      }),
      source: declaration
        ? "manifest_declaration"
        : params.registryAvailable
          ? "runtime_registry"
          : "workflow_ref",
      event: declaration?.event,
      entrypoint: declaration?.entrypoint ?? declaration?.path,
    };
  });
}

function agentRuntimeRegistryAvailable(
  app: InstalledPluginState | undefined,
  key: "connectors" | "hooks",
): boolean {
  const runtime = asRecord(app?.manifest.agentRuntime);
  const declaration = asRecord(runtime?.[key]);
  if (key === "connectors") {
    return Boolean(readString(declaration?.registry));
  }
  return Boolean(
    readString(declaration?.directory) ||
    readString(declaration?.registry) ||
    Array.isArray(declaration?.handlers),
  );
}

function runtimeRegistryAvailable(
  contract: PluginContract,
  app: InstalledPluginState | undefined,
  key: "connectors" | "hooks",
): boolean {
  return Boolean(
    contract.componentPaths[key] ||
    contract.contributions?.[key] ||
    agentRuntimeRegistryAvailable(app, key),
  );
}

export function buildWorkspacePluginRuntimeReadiness({
  contract,
  installedPlugin,
  activePluginUiId,
  workflowKey,
  taskKind,
  intentKey,
}: BuildWorkspacePluginRuntimeReadinessParams): WorkspacePluginRuntimeReadiness {
  const workflow = workflowForActivation(contract, {
    workflowKey,
    taskKind,
    intentKey,
  });
  const connectorRefs = uniqueStrings(workflow?.connectorRefs ?? []);
  const hookRefs = flattenHookPolicy(workflow?.hookPolicy);
  const cliRefs = uniqueStrings(workflow?.cliRefs ?? []);
  const connectors = buildConnectorItems({
    refs: connectorRefs,
    declarations: contract.connectors,
    registryAvailable: runtimeRegistryAvailable(
      contract,
      installedPlugin,
      "connectors",
    ),
    app: installedPlugin,
  });
  const hooks = buildHookItems({
    refs: hookRefs,
    declarations: contract.hooks,
    registryAvailable: runtimeRegistryAvailable(
      contract,
      installedPlugin,
      "hooks",
    ),
    app: installedPlugin,
  });
  const clis = buildCliItems({
    refs: cliRefs,
    declarations: contract.clis,
    app: installedPlugin,
  });
  const items = [...connectors, ...hooks, ...clis];
  const blockerCodes = uniqueStrings(
    items
      .filter((item) => item.status === "blocked")
      .flatMap((item) => item.reasonCodes),
  );
  const warningCodes = uniqueStrings(
    items
      .filter((item) => item.status !== "blocked")
      .flatMap((item) => item.reasonCodes),
  );

  return {
    source: "host_runtime_readiness",
    pluginId: contract.id,
    activePluginUiId,
    workflowKey: workflow?.key ?? workflowKey,
    taskKind: workflow?.taskKind ?? taskKind,
    status: blockerCodes.length > 0 ? "blocked" : topStatus(items),
    checkedAt: installedPlugin?.readiness.checkedAt,
    connectorRefs,
    hookRefs,
    cliRefs,
    connectors,
    hooks,
    clis,
    blockerCodes,
    warningCodes,
  };
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}

function readString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function readStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return uniqueStrings(value.map(readString));
}

function readReadinessItems(
  value: unknown,
): WorkspacePluginRuntimeReadinessItem[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.flatMap((item) => {
    const record = asRecord(item);
    const id = readString(record?.id);
    const status = readString(
      record?.status,
    ) as WorkspacePluginRuntimeReadinessItemStatus;
    if (
      !record ||
      !id ||
      !["ready", "declared", "degraded", "needs_setup", "blocked"].includes(
        status,
      )
    ) {
      return [];
    }
    return [
      {
        id,
        title: readString(record.title),
        required: record.required === true,
        status,
        reasonCodes: readStringArray(record.reasonCodes ?? record.reason_codes),
        source:
          readString(record.source) === "manifest_declaration" ||
          readString(record.source) === "runtime_registry"
            ? (readString(
                record.source,
              ) as WorkspacePluginRuntimeReadinessItem["source"])
            : "workflow_ref",
        kind: readString(record.kind),
        event: readString(record.event),
        entrypoint: readString(record.entrypoint),
      },
    ];
  });
}

export function extractWorkspacePluginRuntimeReadinessFromRequestMetadata(
  requestMetadata: Record<string, unknown> | undefined,
): WorkspacePluginRuntimeReadiness | null {
  const metadata = asRecord(requestMetadata);
  const harness = asRecord(metadata?.harness);
  const activation =
    asRecord(harness?.plugin_activation) ||
    asRecord(harness?.pluginActivation) ||
    asRecord(metadata?.plugin_activation) ||
    asRecord(metadata?.pluginActivation);
  const readiness =
    asRecord(activation?.runtime_readiness) ||
    asRecord(activation?.runtimeReadiness) ||
    asRecord(harness?.plugin_runtime_readiness) ||
    asRecord(harness?.pluginRuntimeReadiness);
  const pluginId =
    readString(readiness?.pluginId) ?? readString(readiness?.plugin_id);
  const status = readString(
    readiness?.status,
  ) as WorkspacePluginRuntimeReadinessStatus;
  if (
    !readiness ||
    !pluginId ||
    !["ready", "declared", "degraded", "needs_setup", "blocked"].includes(
      status,
    )
  ) {
    return null;
  }
  return {
    source: "host_runtime_readiness",
    pluginId,
    activePluginUiId:
      readString(readiness.activePluginUiId) ??
      readString(readiness.active_plugin_ui_id),
    workflowKey:
      readString(readiness.workflowKey) ?? readString(readiness.workflow_key),
    taskKind: readString(readiness.taskKind) ?? readString(readiness.task_kind),
    status,
    checkedAt:
      readString(readiness.checkedAt) ?? readString(readiness.checked_at),
    connectorRefs: readStringArray(
      readiness.connectorRefs ?? readiness.connector_refs,
    ),
    hookRefs: readStringArray(readiness.hookRefs ?? readiness.hook_refs),
    cliRefs: readStringArray(readiness.cliRefs ?? readiness.cli_refs),
    connectors: readReadinessItems(readiness.connectors),
    hooks: readReadinessItems(readiness.hooks),
    clis: readReadinessItems(readiness.clis),
    blockerCodes: readStringArray(
      readiness.blockerCodes ?? readiness.blocker_codes,
    ),
    warningCodes: readStringArray(
      readiness.warningCodes ?? readiness.warning_codes,
    ),
  };
}

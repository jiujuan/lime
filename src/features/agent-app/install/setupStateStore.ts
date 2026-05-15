import type {
  AgentAppSetupBindingKind,
  AgentAppSetupBindingRecord,
  AgentAppSetupState,
} from "../types";

const SETUP_STATE_GROUPS: Record<
  AgentAppSetupBindingKind,
  keyof AgentAppSetupState
> = {
  knowledge: "knowledgeBindings",
  skill: "skills",
  tool: "tools",
  artifact: "artifactTypes",
  eval: "evals",
  secret: "secrets",
  overlay: "overlays",
  service: "services",
  workflow: "workflows",
};

function bindingId(record: Pick<AgentAppSetupBindingRecord, "appId" | "kind" | "key">): string {
  return `${record.appId}::${record.kind}::${record.key}`;
}

export function buildSetupStateFromBindings(
  records: AgentAppSetupBindingRecord[],
  appId: string,
): AgentAppSetupState {
  const state: AgentAppSetupState = {};
  records
    .filter((record) => record.appId === appId)
    .forEach((record) => {
      const group = SETUP_STATE_GROUPS[record.kind];
      state[group] = {
        ...(state[group] ?? {}),
        [record.key]: record.resolved,
      };
    });
  return state;
}

export class InMemoryAgentAppSetupStateStore {
  private readonly records = new Map<string, AgentAppSetupBindingRecord>();

  upsert(record: AgentAppSetupBindingRecord): AgentAppSetupBindingRecord {
    const stored = { ...record };
    this.records.set(bindingId(stored), stored);
    return stored;
  }

  list(appId?: string): AgentAppSetupBindingRecord[] {
    return Array.from(this.records.values())
      .filter((record) => !appId || record.appId === appId)
      .map((record) => ({ ...record }))
      .sort((left, right) => bindingId(left).localeCompare(bindingId(right)));
  }

  getSetupState(appId: string): AgentAppSetupState {
    return buildSetupStateFromBindings(this.list(appId), appId);
  }

  remove(record: Pick<AgentAppSetupBindingRecord, "appId" | "kind" | "key">): boolean {
    return this.records.delete(bindingId(record));
  }

  clearApp(appId: string): number {
    const keys = Array.from(this.records.keys()).filter((key) =>
      key.startsWith(`${appId}::`),
    );
    keys.forEach((key) => this.records.delete(key));
    return keys.length;
  }
}

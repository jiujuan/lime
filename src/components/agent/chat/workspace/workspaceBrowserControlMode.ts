export type WorkspaceBrowserControlOwner =
  | "agent"
  | "human"
  | "shared"
  | "unknown";

export interface WorkspaceBrowserControlPresentation {
  rawControlMode: string | null;
  rawLifecycleState: string | null;
  owner: WorkspaceBrowserControlOwner;
  humanTakeover: boolean;
  overlayVisible: boolean;
  labelKey: string | null;
  detailKey: string | null;
}

const CONTROL_PRESENTATION_COPY: Record<
  Exclude<WorkspaceBrowserControlOwner, "unknown">,
  { labelKey: string; detailKey: string }
> = {
  agent: {
    labelKey: "agentChat.rightSurface.browserControl.agent.label",
    detailKey: "agentChat.rightSurface.browserControl.agent.detail",
  },
  human: {
    labelKey: "agentChat.rightSurface.browserControl.human.label",
    detailKey: "agentChat.rightSurface.browserControl.human.detail",
  },
  shared: {
    labelKey: "agentChat.rightSurface.browserControl.shared.label",
    detailKey: "agentChat.rightSurface.browserControl.shared.detail",
  },
};

export function resolveWorkspaceBrowserControlPresentation(params: {
  controlMode?: string | null;
  lifecycleState?: string | null;
}): WorkspaceBrowserControlPresentation {
  const rawControlMode = normalizeNullableText(params.controlMode);
  const rawLifecycleState = normalizeNullableText(params.lifecycleState);
  const owner = resolveControlOwner(rawControlMode, rawLifecycleState);
  const humanTakeover = owner === "human";
  const overlayVisible = owner === "human" || owner === "shared";
  const copy = owner === "unknown" ? null : CONTROL_PRESENTATION_COPY[owner];

  return {
    rawControlMode,
    rawLifecycleState,
    owner,
    humanTakeover,
    overlayVisible,
    labelKey: copy?.labelKey ?? null,
    detailKey: copy?.detailKey ?? null,
  };
}

function resolveControlOwner(
  controlMode: string | null,
  lifecycleState: string | null,
): WorkspaceBrowserControlOwner {
  const mode = normalizeMode(controlMode);
  const lifecycle = normalizeMode(lifecycleState);
  if (
    isHumanControlValue(mode) ||
    lifecycle === "human_controlling" ||
    lifecycle === "human_takeover"
  ) {
    return "human";
  }
  if (
    mode === "shared" ||
    mode === "inspect" ||
    mode === "observe" ||
    lifecycle === "waiting_for_human"
  ) {
    return "shared";
  }
  if (
    mode === "agent" ||
    mode === "automation" ||
    lifecycle === "agent_resuming" ||
    lifecycle === "live"
  ) {
    return "agent";
  }
  return "unknown";
}

function isHumanControlValue(value: string): boolean {
  return (
    value === "human" ||
    value === "manual" ||
    value === "user" ||
    value === "human_takeover" ||
    value === "manual_takeover" ||
    value === "user_takeover"
  );
}

function normalizeNullableText(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function normalizeMode(value: string | null): string {
  return value?.trim().toLowerCase().replace(/[-\s]+/g, "_") || "";
}

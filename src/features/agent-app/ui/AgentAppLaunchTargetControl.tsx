import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import type {
  AgentAppLaunchTargetMode,
  AgentAppLaunchTargetPolicy,
  AgentAppRightSurfaceLaunchTargetOption,
} from "./agentAppLaunchTargetPolicy";

interface AgentAppLaunchTargetControlProps {
  policy: AgentAppLaunchTargetPolicy;
  selectedTargetId: string | null;
  onModeChange: (mode: AgentAppLaunchTargetMode) => void;
  onSelectedTargetIdChange: (targetId: string | null) => void;
}

type AgentAppLaunchTargetTranslate = (
  key: string,
  params?: Record<string, string | number>,
) => string;

function resolveTargetLabel(
  option: AgentAppRightSurfaceLaunchTargetOption,
  index: number,
  translate: AgentAppLaunchTargetTranslate,
): string {
  return (
    option.label ??
    translate("agentApp.apps.launchTarget.targetFallback", { index: index + 1 })
  );
}

export function AgentAppLaunchTargetControl({
  policy,
  selectedTargetId,
  onModeChange,
  onSelectedTargetIdChange,
}: AgentAppLaunchTargetControlProps) {
  const { t } = useTranslation("agent");
  const translate = useMemo<AgentAppLaunchTargetTranslate>(() => {
    const baseTranslate = t as unknown as AgentAppLaunchTargetTranslate;
    return (key, params) => String(baseTranslate(key, params));
  }, [t]);
  const targetLabels = useMemo(
    () =>
      policy.rightSurfaceTargets.map((option, index) => ({
        id: option.id,
        label: resolveTargetLabel(option, index, translate),
        description: option.description,
      })),
    [policy.rightSurfaceTargets, translate],
  );
  const currentTarget =
    targetLabels.find((option) => option.id === policy.rightSurfaceTargetId) ??
    targetLabels[0] ??
    null;
  const selectValue =
    selectedTargetId &&
    targetLabels.some((option) => option.id === selectedTargetId)
      ? selectedTargetId
      : (policy.rightSurfaceTargetId ?? "");

  return (
    <div
      className="flex flex-wrap items-center justify-between gap-3 rounded-[10px] border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-3 py-2"
      data-testid="agent-apps-launch-target-policy"
    >
      <div className="min-w-0">
        <p className="text-xs font-semibold text-[color:var(--lime-text-strong)]">
          {translate("agentApp.apps.launchTarget.label")}
        </p>
        {!policy.rightSurfaceAvailable ? (
          <p
            className="mt-0.5 text-xs text-[color:var(--lime-text-muted)]"
            data-testid="agent-apps-launch-target-unavailable"
          >
            {translate("agentApp.apps.launchTarget.rightSurfaceUnavailable")}
          </p>
        ) : currentTarget ? (
          <p
            className="mt-0.5 truncate text-xs text-[color:var(--lime-text-muted)]"
            data-testid="agent-apps-launch-target-current"
            title={currentTarget.description ?? currentTarget.label}
          >
            {translate("agentApp.apps.launchTarget.targetHint", {
              target: currentTarget.label,
            })}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {policy.mode === "rightSurface" &&
        policy.rightSurfaceAvailable &&
        targetLabels.length > 1 ? (
          <select
            className="h-9 min-w-[160px] rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] px-3 text-xs font-semibold text-[color:var(--lime-text-strong)] outline-none transition focus:border-[color:var(--lime-surface-border-strong)]"
            aria-label={translate("agentApp.apps.launchTarget.targetSelect")}
            value={selectValue}
            onChange={(event) =>
              onSelectedTargetIdChange(event.currentTarget.value || null)
            }
            data-testid="agent-apps-launch-target-select"
          >
            {targetLabels.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        ) : null}
        <div className="inline-flex rounded-full border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface)] p-1">
          <button
            type="button"
            className={`h-8 rounded-full px-3 text-xs font-semibold transition ${
              policy.mode === "standalone"
                ? "bg-[color:var(--lime-text-strong)] text-[color:var(--lime-surface)]"
                : "text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-hover)] hover:text-[color:var(--lime-text-strong)]"
            }`}
            aria-pressed={policy.mode === "standalone"}
            onClick={() => onModeChange("standalone")}
            data-testid="agent-apps-launch-target-standalone"
          >
            {translate("agentApp.apps.launchTarget.standalone")}
          </button>
          <button
            type="button"
            className={`h-8 rounded-full px-3 text-xs font-semibold transition ${
              policy.mode === "rightSurface"
                ? "bg-[color:var(--lime-text-strong)] text-[color:var(--lime-surface)]"
                : "text-[color:var(--lime-text-muted)] hover:bg-[color:var(--lime-surface-hover)] hover:text-[color:var(--lime-text-strong)]"
            } disabled:cursor-not-allowed disabled:text-[color:var(--lime-text-muted)] disabled:opacity-50 disabled:hover:bg-transparent`}
            aria-pressed={policy.mode === "rightSurface"}
            disabled={!policy.rightSurfaceAvailable}
            onClick={() => onModeChange("rightSurface")}
            data-testid="agent-apps-launch-target-right-surface"
          >
            {translate("agentApp.apps.launchTarget.rightSurface")}
          </button>
        </div>
      </div>
    </div>
  );
}

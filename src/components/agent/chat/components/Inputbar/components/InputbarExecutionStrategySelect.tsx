import React from "react";
import { ListChecks } from "lucide-react";
import {
  MetaToggleButton,
  MetaToggleCheck,
  MetaToggleGlyph,
  MetaToggleLabel,
} from "../styles";
import type { InputbarExecutionStrategyCopy } from "../inputbarWorkflowCopy";

interface InputbarExecutionStrategySelectProps {
  isFullscreen?: boolean;
  executionStrategy?: "react" | "code_orchestrated" | "auto";
  setExecutionStrategy?: (
    strategy: "react" | "code_orchestrated" | "auto",
  ) => void;
  copy: InputbarExecutionStrategyCopy;
}

export const InputbarExecutionStrategySelect: React.FC<
  InputbarExecutionStrategySelectProps
> = (props) => {
  const {
    isFullscreen = false,
    executionStrategy,
    setExecutionStrategy,
    copy,
  } = props;

  if (isFullscreen || !setExecutionStrategy) {
    return null;
  }

  const planEnabled = executionStrategy === "code_orchestrated";
  const toggleLabel = planEnabled ? copy.disable : copy.enable;

  return (
    <MetaToggleButton
      type="button"
      $checked={planEnabled}
      aria-label={toggleLabel}
      aria-pressed={planEnabled}
      data-testid="inputbar-plan-toggle"
      title={toggleLabel}
      onClick={() =>
        setExecutionStrategy(planEnabled ? "react" : "code_orchestrated")
      }
    >
      <MetaToggleCheck $checked={planEnabled} aria-hidden />
      <MetaToggleGlyph aria-hidden>
        <ListChecks strokeWidth={1.8} />
      </MetaToggleGlyph>
      <MetaToggleLabel>{copy.label}</MetaToggleLabel>
    </MetaToggleButton>
  );
};

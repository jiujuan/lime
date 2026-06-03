import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { buildInputbarToolsCopy } from "../components/inputbarToolsCopy";

export interface InputbarToolStates {
  objective: boolean;
  plan: boolean;
  subagent: boolean;
}

interface UseInputbarToolStateParams {
  toolStates?: Partial<InputbarToolStates>;
  onToolStatesChange?: (states: Partial<InputbarToolStates>) => void;
  openFileDialog: () => void;
}

const DEFAULT_INPUTBAR_TOOL_STATES: InputbarToolStates = {
  objective: false,
  plan: false,
  subagent: false,
};

export function useInputbarToolState({
  toolStates,
  onToolStatesChange,
  openFileDialog,
}: UseInputbarToolStateParams) {
  const { t } = useTranslation("agent");
  const copy = useMemo(() => buildInputbarToolsCopy((key) => t(key, {})), [t]);
  const [localToolStates, setLocalToolStates] = useState<InputbarToolStates>(
    DEFAULT_INPUTBAR_TOOL_STATES,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const objectiveEnabled = toolStates?.objective ?? localToolStates.objective;
  const planEnabled = toolStates?.plan ?? localToolStates.plan;
  const subagentEnabled = toolStates?.subagent ?? localToolStates.subagent;

  const activeTools = useMemo<Record<string, boolean>>(
    () => ({
      objective_mode: objectiveEnabled,
      task_mode: planEnabled,
      subagent_mode: subagentEnabled,
    }),
    [objectiveEnabled, planEnabled, subagentEnabled],
  );

  const updateToolStates = useCallback(
    (next: Partial<InputbarToolStates>) => {
      const current = {
        objective: toolStates?.objective ?? localToolStates.objective,
        plan: toolStates?.plan ?? localToolStates.plan,
        subagent: toolStates?.subagent ?? localToolStates.subagent,
      };
      const sanitizedNext = {
        objective: next.objective ?? current.objective,
        plan: next.plan ?? current.plan,
        subagent: next.subagent ?? current.subagent,
      };
      setLocalToolStates((prev) => ({
        objective:
          toolStates?.objective ?? sanitizedNext.objective ?? prev.objective,
        plan: toolStates?.plan ?? sanitizedNext.plan ?? prev.plan,
        subagent:
          toolStates?.subagent ?? sanitizedNext.subagent ?? prev.subagent,
      }));
      const changedKeys = Object.keys(next) as Array<keyof InputbarToolStates>;
      const callbackStates = changedKeys.reduce<Partial<InputbarToolStates>>(
        (states, key) => ({
          ...states,
          [key]: sanitizedNext[key],
        }),
        {},
      );
      onToolStatesChange?.(callbackStates);
      return sanitizedNext;
    },
    [
      localToolStates.subagent,
      localToolStates.plan,
      localToolStates.objective,
      onToolStatesChange,
      toolStates?.subagent,
      toolStates?.plan,
      toolStates?.objective,
    ],
  );

  const handleToolClick = useCallback(
    (tool: string) => {
      switch (tool) {
        case "task_mode": {
          const nextPlan = !planEnabled;
          updateToolStates({
            plan: nextPlan,
          });
          toast.info(copy.task.toast(nextPlan));
          break;
        }
        case "objective_mode": {
          const nextObjective = !objectiveEnabled;
          updateToolStates({
            objective: nextObjective,
          });
          break;
        }
        case "subagent_mode": {
          const nextSubagent = !subagentEnabled;
          updateToolStates({
            subagent: nextSubagent,
          });
          toast.info(copy.subagent.toast(nextSubagent));
          break;
        }
        case "attach":
          openFileDialog();
          break;
        case "fullscreen":
          setIsFullscreen((prev) => !prev);
          toast.info(
            isFullscreen ? copy.fullscreen.exited : copy.fullscreen.entered,
          );
          break;
        default:
          break;
      }
    },
    [
      copy,
      isFullscreen,
      objectiveEnabled,
      openFileDialog,
      planEnabled,
      subagentEnabled,
      updateToolStates,
    ],
  );

  const setSubagentEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled === subagentEnabled) {
        return;
      }
      updateToolStates({
        subagent: enabled,
      });
      toast.info(copy.subagent.toast(enabled));
    },
    [copy, subagentEnabled, updateToolStates],
  );

  return {
    activeTools,
    handleToolClick,
    setSubagentEnabled,
    isFullscreen,
    objectiveEnabled,
    planEnabled,
    subagentEnabled,
  };
}

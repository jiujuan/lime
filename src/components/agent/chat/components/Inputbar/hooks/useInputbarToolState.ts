import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { buildInputbarToolsCopy } from "../components/inputbarToolsCopy";

export interface InputbarToolStates {
  subagent: boolean;
}

interface UseInputbarToolStateParams {
  toolStates?: Partial<InputbarToolStates>;
  onToolStatesChange?: (states: InputbarToolStates) => void;
  openFileDialog: () => void;
}

const DEFAULT_INPUTBAR_TOOL_STATES: InputbarToolStates = {
  subagent: false,
};

export function useInputbarToolState({
  toolStates,
  onToolStatesChange,
  openFileDialog,
}: UseInputbarToolStateParams) {
  const { t } = useTranslation("agent");
  const copy = useMemo(
    () => buildInputbarToolsCopy((key) => t(key, {})),
    [t],
  );
  const [localToolStates, setLocalToolStates] = useState<InputbarToolStates>(
    DEFAULT_INPUTBAR_TOOL_STATES,
  );
  const [isFullscreen, setIsFullscreen] = useState(false);

  const subagentEnabled = toolStates?.subagent ?? localToolStates.subagent;

  const activeTools = useMemo<Record<string, boolean>>(
    () => ({
      subagent_mode: subagentEnabled,
    }),
    [subagentEnabled],
  );

  const updateToolStates = useCallback(
    (next: InputbarToolStates) => {
      setLocalToolStates((prev) => ({
        subagent: toolStates?.subagent ?? next.subagent ?? prev.subagent,
      }));
      const sanitizedNext = {
        subagent: next.subagent,
      };
      onToolStatesChange?.(sanitizedNext);
      return sanitizedNext;
    },
    [onToolStatesChange, toolStates?.subagent],
  );

  const handleToolClick = useCallback(
    (tool: string) => {
      switch (tool) {
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
      openFileDialog,
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
    [
      copy,
      subagentEnabled,
      updateToolStates,
    ],
  );

  return {
    activeTools,
    handleToolClick,
    setSubagentEnabled,
    isFullscreen,
    subagentEnabled,
  };
}

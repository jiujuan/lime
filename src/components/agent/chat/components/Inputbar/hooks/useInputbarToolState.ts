import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { buildInputbarToolsCopy } from "../components/inputbarToolsCopy";

export interface InputbarToolStates {
  webSearch: boolean;
  thinking: boolean;
  subagent: boolean;
}

interface UseInputbarToolStateParams {
  toolStates?: Partial<InputbarToolStates>;
  onToolStatesChange?: (states: InputbarToolStates) => void;
  openFileDialog: () => void;
}

const DEFAULT_INPUTBAR_TOOL_STATES: InputbarToolStates = {
  webSearch: false,
  thinking: false,
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

  const webSearchEnabled = toolStates?.webSearch ?? localToolStates.webSearch;
  const thinkingEnabled = toolStates?.thinking ?? localToolStates.thinking;
  const subagentEnabled = toolStates?.subagent ?? localToolStates.subagent;

  const activeTools = useMemo<Record<string, boolean>>(
    () => ({
      web_search: webSearchEnabled,
      thinking: thinkingEnabled,
      subagent_mode: subagentEnabled,
    }),
    [thinkingEnabled, webSearchEnabled, subagentEnabled],
  );

  const updateToolStates = useCallback(
    (next: InputbarToolStates) => {
      setLocalToolStates((prev) => ({
        webSearch: toolStates?.webSearch ?? next.webSearch ?? prev.webSearch,
        thinking: toolStates?.thinking ?? next.thinking ?? prev.thinking,
        subagent: toolStates?.subagent ?? next.subagent ?? prev.subagent,
      }));
      onToolStatesChange?.(next);
      return next;
    },
    [
      onToolStatesChange,
      toolStates?.subagent,
      toolStates?.thinking,
      toolStates?.webSearch,
    ],
  );

  const handleToolClick = useCallback(
    (tool: string) => {
      switch (tool) {
        case "thinking": {
          const nextThinking = !thinkingEnabled;
          updateToolStates({
            webSearch: webSearchEnabled,
            thinking: nextThinking,
            subagent: subagentEnabled,
          });
          toast.info(copy.thinking.toast(nextThinking));
          break;
        }
        case "web_search": {
          const nextWebSearch = !webSearchEnabled;
          updateToolStates({
            webSearch: nextWebSearch,
            thinking: thinkingEnabled,
            subagent: subagentEnabled,
          });
          toast.info(copy.webSearch.toast(nextWebSearch));
          break;
        }
        case "subagent_mode": {
          const nextSubagent = !subagentEnabled;
          updateToolStates({
            webSearch: webSearchEnabled,
            thinking: thinkingEnabled,
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
      thinkingEnabled,
      subagentEnabled,
      updateToolStates,
      webSearchEnabled,
    ],
  );

  const setSubagentEnabled = useCallback(
    (enabled: boolean) => {
      if (enabled === subagentEnabled) {
        return;
      }
      updateToolStates({
        webSearch: webSearchEnabled,
        thinking: thinkingEnabled,
        subagent: enabled,
      });
      toast.info(copy.subagent.toast(enabled));
    },
    [
      copy,
      subagentEnabled,
      thinkingEnabled,
      updateToolStates,
      webSearchEnabled,
    ],
  );

  return {
    activeTools,
    handleToolClick,
    setSubagentEnabled,
    isFullscreen,
    thinkingEnabled,
    subagentEnabled,
    webSearchEnabled,
  };
}

import React from "react";
import { useTranslation } from "react-i18next";
import { Lightbulb, Globe, Workflow } from "lucide-react";
import { ToolButton } from "../styles";
import { isGeneralResearchTheme } from "../../../utils/generalAgentPrompt";
import { buildInputbarToolsCopy } from "./inputbarToolsCopy";

interface InputbarToolsProps {
  onToolClick: (tool: string) => void;
  activeTools: Record<string, boolean>;
  toolMode?: "default" | "attach-only";
  activeTheme?: string;
}

export const InputbarTools: React.FC<InputbarToolsProps> = ({
  onToolClick,
  activeTools,
  toolMode = "default",
  activeTheme,
}) => {
  const { t } = useTranslation("agent");
  const copy = React.useMemo(
    () => buildInputbarToolsCopy((key) => t(key, {})),
    [t],
  );
  const isGeneralTheme = isGeneralResearchTheme(activeTheme);
  const thinkingEnabled = Boolean(activeTools["thinking"]);
  const webSearchEnabled = Boolean(activeTools["web_search"]);
  const subagentEnabled = Boolean(activeTools["subagent_mode"]);

  return (
    <div className="flex items-center flex-wrap gap-2">
      {toolMode === "default" ? (
        <>
          <ToolButton
            type="button"
            onClick={() => onToolClick("thinking")}
            className={thinkingEnabled ? "active" : ""}
            aria-pressed={thinkingEnabled}
            title={copy.thinking.title(thinkingEnabled)}
          >
            <Lightbulb />
            <span>{copy.thinking.label}</span>
          </ToolButton>

          <ToolButton
            type="button"
            onClick={() => onToolClick("web_search")}
            className={webSearchEnabled ? "active" : ""}
            aria-pressed={webSearchEnabled}
            title={copy.webSearch.title(webSearchEnabled)}
            data-testid="toggle-web-search"
          >
            <Globe />
            <span>{copy.webSearch.label}</span>
          </ToolButton>

          {isGeneralTheme ? (
            <>
              <ToolButton
                type="button"
                onClick={() => onToolClick("subagent_mode")}
                className={subagentEnabled ? "active" : ""}
                aria-pressed={subagentEnabled}
                title={copy.subagent.title(subagentEnabled)}
                data-testid="toggle-subagent-mode"
              >
                <Workflow />
                <span>{copy.subagent.label}</span>
              </ToolButton>
            </>
          ) : null}
        </>
      ) : null}
    </div>
  );
};

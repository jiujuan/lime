import React from "react";
import { useTranslation } from "react-i18next";
import { Workflow } from "lucide-react";
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
  const subagentEnabled = Boolean(activeTools["subagent_mode"]);

  return (
    <div className="flex items-center flex-wrap gap-2">
      {toolMode === "default" && isGeneralTheme ? (
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
      ) : null}
    </div>
  );
};

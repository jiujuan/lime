import {
  ChevronDown,
  ChevronRight,
  MessageSquare,
  Play,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import type { McpPromptDefinition, McpPromptResult } from "@/lib/api/mcp";
import { mcpPromptTargetKey } from "./mcpPromptBrowserModel";

interface McpPromptServerGroupProps {
  serverName: string;
  prompts: McpPromptDefinition[];
  expanded: boolean;
  activePrompt: string | null;
  promptArgs: Record<string, string>;
  promptResult: McpPromptResult | null;
  calling: boolean;
  callError: string | null;
  onToggleServer: (serverName: string) => void;
  onTogglePrompt: (prompt: McpPromptDefinition) => void;
  onPromptArgChange: (name: string, value: string) => void;
  onCallPrompt: (prompt: McpPromptDefinition) => Promise<void>;
}

export function McpPromptServerGroup({
  serverName,
  prompts,
  expanded,
  activePrompt,
  promptArgs,
  promptResult,
  calling,
  callError,
  onToggleServer,
  onTogglePrompt,
  onPromptArgChange,
  onCallPrompt,
}: McpPromptServerGroupProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="border rounded-lg">
      <button
        onClick={() => onToggleServer(serverName)}
        className="w-full p-2.5 flex items-center gap-2 hover:bg-muted/50 rounded-t-lg"
      >
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="h-4 w-4 text-muted-foreground" />
        )}
        <span className="font-medium text-sm">{serverName}</span>
        <span className="text-xs text-muted-foreground">
          {`(${t("settings.mcpPage.runtime.promptBrowser.promptCount", {
            count: prompts.length,
          })})`}
        </span>
      </button>

      {expanded && (
        <div className="border-t">
          {prompts.map((prompt) => (
            <McpPromptRow
              key={mcpPromptTargetKey(prompt)}
              prompt={prompt}
              active={activePrompt === mcpPromptTargetKey(prompt)}
              promptArgs={promptArgs}
              promptResult={promptResult}
              calling={calling}
              callError={callError}
              onTogglePrompt={onTogglePrompt}
              onPromptArgChange={onPromptArgChange}
              onCallPrompt={onCallPrompt}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface McpPromptRowProps {
  prompt: McpPromptDefinition;
  active: boolean;
  promptArgs: Record<string, string>;
  promptResult: McpPromptResult | null;
  calling: boolean;
  callError: string | null;
  onTogglePrompt: (prompt: McpPromptDefinition) => void;
  onPromptArgChange: (name: string, value: string) => void;
  onCallPrompt: (prompt: McpPromptDefinition) => Promise<void>;
}

function McpPromptRow({
  prompt,
  active,
  promptArgs,
  promptResult,
  calling,
  callError,
  onTogglePrompt,
  onPromptArgChange,
  onCallPrompt,
}: McpPromptRowProps) {
  const { t } = useTranslation("settings");

  return (
    <div className="border-b last:border-b-0">
      <div className="p-2.5 pl-8 flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <MessageSquare className="h-3.5 w-3.5 flex-shrink-0 text-sky-600 dark:text-sky-400" />
            <span className="font-mono text-sm text-sky-700 dark:text-sky-300">
              {prompt.name}
            </span>
          </div>
          {prompt.description && (
            <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
              {prompt.description}
            </p>
          )}
          {prompt.arguments.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5">
              {prompt.arguments.map((arg) => (
                <span
                  key={arg.name}
                  className={cn(
                    "px-1.5 py-0.5 text-xs rounded",
                    arg.required
                      ? "bg-orange-500/10 text-orange-600"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {arg.name}
                  {arg.required && " *"}
                </span>
              ))}
            </div>
          )}
        </div>
        <button
          onClick={() => onTogglePrompt(prompt)}
          className="p-1 rounded hover:bg-muted text-muted-foreground flex-shrink-0"
          title={t("settings.mcpPage.runtime.promptBrowser.callTitle")}
        >
          {active ? <X className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
      </div>

      {active && (
        <div className="px-8 pb-3 space-y-3">
          {prompt.arguments.length > 0 && (
            <div className="space-y-2">
              {prompt.arguments.map((arg) => (
                <div key={arg.name}>
                  <label className="block text-xs font-medium text-muted-foreground mb-1">
                    {arg.name}
                    {arg.required && (
                      <span className="text-destructive ml-0.5">*</span>
                    )}
                    {arg.description && (
                      <span className="font-normal ml-1">
                        - {arg.description}
                      </span>
                    )}
                  </label>
                  <input
                    type="text"
                    value={promptArgs[arg.name] || ""}
                    onChange={(event) =>
                      onPromptArgChange(arg.name, event.target.value)
                    }
                    className="w-full px-2.5 py-1.5 rounded border bg-background text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary outline-none"
                    placeholder={t(
                      "settings.mcpPage.runtime.promptBrowser.argPlaceholder",
                      { name: arg.name },
                    )}
                  />
                </div>
              ))}
            </div>
          )}

          <button
            onClick={() => onCallPrompt(prompt)}
            disabled={calling}
            className="rounded border border-emerald-200 bg-[linear-gradient(135deg,#0ea5e9_0%,#14b8a6_52%,#10b981_100%)] px-3 py-1.5 text-sm text-white shadow-sm shadow-emerald-950/15 hover:opacity-95 disabled:opacity-50"
          >
            {calling
              ? t("settings.mcpPage.runtime.promptBrowser.fetching")
              : t("settings.mcpPage.runtime.promptBrowser.fetch")}
          </button>

          {callError && (
            <div className="p-2 rounded bg-destructive/10 text-destructive text-xs">
              {callError}
            </div>
          )}

          {promptResult && (
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              {promptResult.description && (
                <p className="text-xs text-muted-foreground">
                  {promptResult.description}
                </p>
              )}
              {promptResult.messages.map((message, index) => (
                <div key={index} className="bg-background p-2 rounded border">
                  <span className="text-xs font-medium text-muted-foreground">
                    {message.role}
                  </span>
                  <div className="text-sm mt-1 whitespace-pre-wrap">
                    {message.content.type === "text"
                      ? message.content.text
                      : `[${message.content.type}]`}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

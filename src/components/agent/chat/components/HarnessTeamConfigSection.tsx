import { Bot } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { TeamRoleDefinition } from "../utils/teamDefinitions";
import {
  HarnessStatusSection as Section,
  type HarnessSectionKey,
} from "./HarnessStatusSectionFrame";
import { agentText } from "./harnessPanelText";

interface HarnessTeamConfigSectionProps {
  selectedTeamLabel: string | null;
  selectedTeamSummary: string | null;
  selectedTeamRoles: TeamRoleDefinition[] | null;
  registerSectionRef: (
    key: HarnessSectionKey,
    node: HTMLElement | null,
  ) => void;
}

export function HarnessTeamConfigSection({
  selectedTeamLabel,
  selectedTeamSummary,
  selectedTeamRoles,
  registerSectionRef,
}: HarnessTeamConfigSectionProps) {
  return (
    <Section
      sectionKey="team_config"
      title={agentText(
        "agentChat.harness.generated.618a4c825b",
        "当前 Subagents",
      )}
      badge={
        selectedTeamRoles && selectedTeamRoles.length > 0
          ? `${selectedTeamRoles.length} 个子代理`
          : undefined
      }
      registerRef={registerSectionRef}
    >
      <div className="space-y-3">
        <div className="rounded-xl border border-sky-200/80 bg-sky-50/50 p-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <Bot className="h-4 w-4 text-sky-600" />
            <span>{selectedTeamLabel || "当前已启用 Subagents"}</span>
          </div>
          {selectedTeamSummary ? (
            <div className="mt-2 text-sm text-muted-foreground">
              {selectedTeamSummary}
            </div>
          ) : (
            <div className="mt-2 text-sm text-muted-foreground">
              {agentText(
                "agentChat.harness.generated.1c66e4e8ac",
                "本次会优先参考所选 Subagents profile，按需拆出子代理线程继续处理。",
              )}
            </div>
          )}
        </div>

        {selectedTeamRoles && selectedTeamRoles.length > 0 ? (
          <div className="grid gap-2 lg:grid-cols-2">
            {selectedTeamRoles.map((role, index) => (
              <div
                key={`${role.id || role.label}-${index}`}
                className="rounded-xl border border-border bg-background p-3"
              >
                <div className="flex flex-wrap items-center gap-2">
                  <div className="text-sm font-medium text-foreground">
                    {role.label}
                  </div>
                  {role.profileId ? (
                    <Badge variant="outline">
                      {agentText(
                        "agentChat.harness.generated.06d0f38dd2",
                        "模板",
                      )}{" "}
                      {role.profileId}
                    </Badge>
                  ) : null}
                  {role.roleKey ? (
                    <Badge variant="outline">
                      {agentText(
                        "agentChat.harness.generated.db181821a1",
                        "职责",
                      )}{" "}
                      {role.roleKey}
                    </Badge>
                  ) : null}
                </div>
                <div className="mt-2 text-xs leading-5 text-muted-foreground">
                  {role.summary}
                </div>
                {role.skillIds && role.skillIds.length > 0 ? (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {role.skillIds.map((skillId) => (
                      <Badge
                        key={`${role.id || role.label}-${skillId}`}
                        variant="secondary"
                      >
                        {skillId}
                      </Badge>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>
    </Section>
  );
}

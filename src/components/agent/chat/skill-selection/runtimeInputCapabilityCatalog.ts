import { useEffect, useState } from "react";
import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogCommandEntries,
  subscribeSkillCatalogChanged,
  type SkillCatalog,
  type SkillCatalogCommandEntry,
} from "@/lib/api/skillCatalog";
import type { AsterExecutionStrategy } from "@/lib/api/agentRuntime";
import {
  INPUTBAR_BUILTIN_COMMANDS,
  listBuiltinCommandsFromSkillCatalog,
  listRuntimeSceneSlashCommandsFromSkillCatalog,
  type BuiltinInputCommand,
  type RuntimeSceneSlashCommand,
} from "./builtinCommands";

export interface RuntimeMentionAgentTurnRoute {
  commandKey: string;
  executionStrategy?: AsterExecutionStrategy;
}

export interface RuntimeInputCapabilityCatalog {
  builtinCommands: BuiltinInputCommand[];
  sceneCommands: RuntimeSceneSlashCommand[];
  mentionCommandPrefixKeyMap: Map<string, string>;
  mentionCommandSkillIdMap: Map<string, string>;
  mentionAgentTurnRouteMap: Map<string, RuntimeMentionAgentTurnRoute>;
}

export interface RuntimeMentionCommandCatalog {
  mentionCommandPrefixKeyMap: Map<string, string>;
  mentionCommandSkillIdMap: Map<string, string>;
  mentionAgentTurnRouteMap: Map<string, RuntimeMentionAgentTurnRoute>;
}

function normalizeMentionCommandPrefix(value?: string | null): string {
  if (typeof value !== "string") {
    return "";
  }

  return value.trim().toLowerCase();
}

function buildMentionCommandSkillIdMap(
  catalog: SkillCatalog,
): Map<string, string> {
  return new Map(
    listSkillCatalogCommandEntries(catalog)
      .filter((entry) =>
        entry.triggers.some((trigger) => trigger.mode === "mention"),
      )
      .flatMap((entry) => {
        const commandKey = entry.commandKey.trim();
        const skillId = entry.binding?.skillId?.trim();

        return commandKey && skillId ? [[commandKey, skillId] as const] : [];
      }),
  );
}

function buildMentionCommandPrefixKeyMap(
  catalog: SkillCatalog,
): Map<string, string> {
  return new Map(
    listSkillCatalogCommandEntries(catalog).flatMap((entry) => {
      const commandKey = entry.commandKey.trim();
      if (!commandKey) {
        return [];
      }

      return entry.triggers
        .filter((trigger) => trigger.mode === "mention")
        .flatMap((trigger) => {
          const prefix = normalizeMentionCommandPrefix(trigger.prefix);
          return prefix ? [[prefix, commandKey] as const] : [];
        });
    }),
  );
}

export function parseCatalogExecutionStrategy(
  value?: string,
): "react" | undefined {
  if (value === "react" || value === "code_orchestrated" || value === "auto") {
    return "react";
  }
  return undefined;
}

function buildAgentTurnRoute(
  entry: SkillCatalogCommandEntry,
): RuntimeMentionAgentTurnRoute | null {
  const commandKey = entry.commandKey.trim();
  if (!commandKey || entry.binding?.executionKind !== "agent_turn") {
    return null;
  }

  const requestDefaults = entry.binding.requestDefaults ?? {};
  const executionStrategy = parseCatalogExecutionStrategy(
    requestDefaults.executionStrategy ?? requestDefaults.execution_strategy,
  );

  if (!executionStrategy) {
    return null;
  }

  return {
    commandKey,
    executionStrategy,
  };
}

function buildMentionAgentTurnRouteMap(
  catalog: SkillCatalog,
): Map<string, RuntimeMentionAgentTurnRoute> {
  return new Map(
    listSkillCatalogCommandEntries(catalog)
      .map((entry) => buildAgentTurnRoute(entry))
      .filter(
        (route): route is RuntimeMentionAgentTurnRoute => Boolean(route),
      )
      .map((route) => [route.commandKey, route] as const),
  );
}

export function buildRuntimeMentionCommandCatalog(
  catalog: SkillCatalog,
): RuntimeMentionCommandCatalog {
  return {
    mentionCommandPrefixKeyMap: buildMentionCommandPrefixKeyMap(catalog),
    mentionCommandSkillIdMap: buildMentionCommandSkillIdMap(catalog),
    mentionAgentTurnRouteMap: buildMentionAgentTurnRouteMap(catalog),
  };
}

export function buildRuntimeInputCapabilityCatalog(
  catalog: SkillCatalog,
): RuntimeInputCapabilityCatalog {
  const builtinCommands = listBuiltinCommandsFromSkillCatalog(catalog);

  return {
    builtinCommands:
      builtinCommands.length > 0 ? builtinCommands : INPUTBAR_BUILTIN_COMMANDS,
    sceneCommands: listRuntimeSceneSlashCommandsFromSkillCatalog(catalog),
    ...buildRuntimeMentionCommandCatalog(catalog),
  };
}

function readRuntimeMentionCommandCatalogSnapshot(): RuntimeMentionCommandCatalog {
  return buildRuntimeMentionCommandCatalog(getCurrentSkillCatalogSnapshot());
}

function readRuntimeInputCapabilityCatalogSnapshot(): RuntimeInputCapabilityCatalog {
  return buildRuntimeInputCapabilityCatalog(getCurrentSkillCatalogSnapshot());
}

export function useRuntimeMentionCommandCatalog(): RuntimeMentionCommandCatalog {
  const [catalog, setCatalog] = useState<RuntimeMentionCommandCatalog>(() =>
    readRuntimeMentionCommandCatalogSnapshot(),
  );

  useEffect(() => {
    const syncCatalog = () => {
      setCatalog(readRuntimeMentionCommandCatalogSnapshot());
    };

    syncCatalog();
    return subscribeSkillCatalogChanged(syncCatalog);
  }, []);

  return catalog;
}

export function useRuntimeInputCapabilityCatalog(): RuntimeInputCapabilityCatalog {
  const [catalog, setCatalog] = useState<RuntimeInputCapabilityCatalog>(() =>
    readRuntimeInputCapabilityCatalogSnapshot(),
  );

  useEffect(() => {
    const syncCatalog = () => {
      setCatalog(readRuntimeInputCapabilityCatalogSnapshot());
    };

    syncCatalog();
    return subscribeSkillCatalogChanged(syncCatalog);
  }, []);

  return catalog;
}

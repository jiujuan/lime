import { INPUTBAR_BUILTIN_COMMANDS } from "../skill-selection/builtinCommands";
import type { Message } from "../types";

const USER_COMMAND_TAG_CANDIDATES = INPUTBAR_BUILTIN_COMMANDS.map((command) =>
  command.commandPrefix.trim(),
)
  .filter((prefix) => prefix.startsWith("@"))
  .sort((left, right) => right.length - left.length);

function resolveUserCommandRoutePrefix(
  route: Message["inputCapabilityRoute"],
): string | null {
  if (!route) {
    return null;
  }
  if (route.kind === "builtin_command" || route.kind === "runtime_scene") {
    const prefix = route.commandPrefix.trim();
    return prefix.startsWith("@") ? prefix : null;
  }
  return null;
}

export function parseLeadingUserCommandTag(
  content: string,
  route?: Message["inputCapabilityRoute"],
): { tag: string; body: string } | null {
  const trimmed = content.trimStart();
  const routePrefix = resolveUserCommandRoutePrefix(route);
  if (!trimmed.startsWith("@")) {
    return routePrefix
      ? {
          tag: routePrefix,
          body: content.trim(),
        }
      : null;
  }

  const candidates = routePrefix
    ? [
        routePrefix,
        ...USER_COMMAND_TAG_CANDIDATES.filter(
          (candidate) => candidate.toLowerCase() !== routePrefix.toLowerCase(),
        ),
      ]
    : USER_COMMAND_TAG_CANDIDATES;
  const matchedTag = candidates.find((candidate) => {
    const prefix = trimmed.slice(0, candidate.length);
    if (prefix.toLowerCase() !== candidate.toLowerCase()) {
      return false;
    }
    const nextChar = trimmed.charAt(candidate.length);
    return !nextChar || /\s/u.test(nextChar);
  });
  if (!matchedTag) {
    return null;
  }

  return {
    tag: matchedTag,
    body: trimmed.slice(matchedTag.length).trimStart(),
  };
}

export function resolveInstalledSkillMessageLabel(
  message: Message,
): string | null {
  const route = message.inputCapabilityRoute;
  if (route?.kind !== "installed_skill") {
    return null;
  }

  return route.skillName?.trim() || route.skillKey.trim() || null;
}

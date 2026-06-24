import type { Artifact } from "@/lib/artifact/types";
import type { Message } from "../types";
import { mergeArtifacts } from "../utils/messageArtifacts";
import { mergeMessageArtifactsIntoStore } from "./browserAssistArtifact";

export interface ResolveWorkspaceArtifactsFromMessagesParams {
  activeTheme: string;
  messages: readonly Pick<Message, "artifacts">[];
  currentArtifacts: Artifact[];
  browserAssistScopeKey: string | null;
}

function stringifyArtifactForCompare(artifact: Artifact): string {
  return JSON.stringify(artifact);
}

export function areWorkspaceArtifactsEqual(
  left: readonly Artifact[],
  right: readonly Artifact[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }

  return left.every((artifact, index) => {
    const other = right[index];
    return (
      other !== undefined &&
      stringifyArtifactForCompare(artifact) ===
        stringifyArtifactForCompare(other)
    );
  });
}

export function resolveWorkspaceArtifactsFromMessages({
  activeTheme,
  messages,
  currentArtifacts,
  browserAssistScopeKey,
}: ResolveWorkspaceArtifactsFromMessagesParams): Artifact[] {
  if (activeTheme !== "general") {
    return [];
  }

  const messageArtifacts = mergeArtifacts(
    messages.flatMap((message) => message.artifacts || []),
  );
  return mergeMessageArtifactsIntoStore(
    messageArtifacts,
    currentArtifacts,
    browserAssistScopeKey,
  );
}

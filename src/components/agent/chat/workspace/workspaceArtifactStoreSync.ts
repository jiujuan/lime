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

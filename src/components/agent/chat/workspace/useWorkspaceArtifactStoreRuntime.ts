import { useCallback, useEffect, useMemo } from "react";
import {
  settleLiveArtifactAfterStreamStops,
  useArtifactDisplayState,
} from "../hooks/useArtifactDisplayState";
import type { Artifact } from "@/lib/artifact/types";
import type { Message } from "../types";
import { mergeArtifacts } from "../utils/messageArtifacts";
import { resolveActiveArtifactViewTargetId } from "./workspaceArtifactViewTarget";
import { resolveWorkspaceSelectedArtifactIdCorrection } from "./workspaceArtifactSelection";
import {
  areWorkspaceArtifactsEqual,
  resolveWorkspaceArtifactsFromMessages,
} from "./workspaceArtifactStoreSync";
import { resolveSettledWorkbenchArtifacts } from "./workspaceSettledArtifacts";

type ArtifactStoreSetter<T> = (update: T | ((previous: T) => T)) => void;

interface UseWorkspaceArtifactStoreRuntimeParams {
  activeTheme: string;
  artifacts: Artifact[];
  browserAssistScopeKey: string | null;
  defaultSelectedArtifactId: string | null;
  isSending: boolean;
  liveArtifact: Artifact | null;
  messages: readonly Pick<Message, "artifacts">[];
  preferGeneralCanvasFilePreview: boolean;
  selectedArtifact: Artifact | null | undefined;
  selectedArtifactId: string | null;
  setArtifacts: ArtifactStoreSetter<Artifact[]>;
  setSelectedArtifactId: ArtifactStoreSetter<string | null>;
  upsertGeneralArtifact: (artifact: Artifact) => void;
}

export function shouldPersistSettledLiveArtifact({
  activeTheme,
  liveArtifact,
  settledLiveArtifact,
}: {
  activeTheme: string;
  liveArtifact: Artifact | null;
  settledLiveArtifact: Artifact | null;
}): boolean {
  return Boolean(
    activeTheme === "general" &&
    liveArtifact &&
    settledLiveArtifact &&
    liveArtifact !== settledLiveArtifact,
  );
}

export function useWorkspaceGeneralArtifactUpsert({
  setArtifacts,
}: {
  setArtifacts: ArtifactStoreSetter<Artifact[]>;
}): (artifact: Artifact) => void {
  return useCallback(
    (artifact: Artifact) => {
      setArtifacts((currentArtifacts) =>
        mergeArtifacts([...currentArtifacts, artifact]),
      );
    },
    [setArtifacts],
  );
}

export function useWorkspaceArtifactStoreRuntime({
  activeTheme,
  artifacts,
  browserAssistScopeKey,
  defaultSelectedArtifactId,
  isSending,
  liveArtifact,
  messages,
  preferGeneralCanvasFilePreview,
  selectedArtifact,
  selectedArtifactId,
  setArtifacts,
  setSelectedArtifactId,
  upsertGeneralArtifact,
}: UseWorkspaceArtifactStoreRuntimeParams) {
  const settledLiveArtifact = useMemo(
    () =>
      settleLiveArtifactAfterStreamStops(liveArtifact, {
        streamActive: isSending,
      }),
    [isSending, liveArtifact],
  );
  const settledWorkbenchArtifacts = useMemo(
    () => resolveSettledWorkbenchArtifacts(artifacts, settledLiveArtifact),
    [artifacts, settledLiveArtifact],
  );
  const artifactDisplayState = useArtifactDisplayState(
    settledLiveArtifact,
    artifacts,
  );
  const currentCanvasArtifact = artifactDisplayState.liveArtifact;
  const displayedCanvasArtifact = artifactDisplayState.displayArtifact;
  const activeArtifactViewTargetId = resolveActiveArtifactViewTargetId({
    displayedArtifact: displayedCanvasArtifact,
    currentCanvasArtifact,
    selectedArtifact,
    liveArtifact,
  });

  useEffect(() => {
    setArtifacts((currentArtifacts) => {
      const nextArtifacts = resolveWorkspaceArtifactsFromMessages({
        activeTheme,
        messages,
        currentArtifacts,
        browserAssistScopeKey,
      });
      return areWorkspaceArtifactsEqual(currentArtifacts, nextArtifacts)
        ? currentArtifacts
        : nextArtifacts;
    });
  }, [activeTheme, browserAssistScopeKey, messages, setArtifacts]);

  useEffect(() => {
    const correctedSelectedArtifactId =
      resolveWorkspaceSelectedArtifactIdCorrection({
        activeTheme,
        artifacts,
        selectedArtifact,
        selectedArtifactId,
        defaultSelectedArtifactId,
        preferGeneralCanvasFilePreview,
      });
    if (correctedSelectedArtifactId !== undefined) {
      setSelectedArtifactId(correctedSelectedArtifactId);
    }
  }, [
    activeTheme,
    artifacts,
    defaultSelectedArtifactId,
    preferGeneralCanvasFilePreview,
    selectedArtifact,
    selectedArtifactId,
    setSelectedArtifactId,
  ]);

  useEffect(() => {
    if (
      !shouldPersistSettledLiveArtifact({
        activeTheme,
        liveArtifact,
        settledLiveArtifact,
      })
    ) {
      return;
    }

    upsertGeneralArtifact(settledLiveArtifact as Artifact);
  }, [activeTheme, liveArtifact, settledLiveArtifact, upsertGeneralArtifact]);

  return {
    activeArtifactViewTargetId,
    artifactDisplayState,
    currentCanvasArtifact,
    displayedCanvasArtifact,
    settledLiveArtifact,
    settledWorkbenchArtifacts,
  };
}

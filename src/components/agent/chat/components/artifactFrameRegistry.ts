import type React from "react";
import type { Artifact } from "@/lib/artifact/types";

export interface SaveMessageAsKnowledgeSource {
  messageId: string;
  content: string;
  sourceName?: string;
  description?: string | null;
}

export interface ArtifactFrameRendererProps {
  artifact: Artifact;
  messageId: string;
  onArtifactClick?: (artifact: Artifact) => void;
  onSaveMessageAsKnowledge?: (
    source: SaveMessageAsKnowledgeSource,
  ) => void;
}

export interface ArtifactFrameRendererEntry {
  id: string;
  priority: number;
  supports: (artifact: Artifact) => boolean;
  component: React.ComponentType<ArtifactFrameRendererProps>;
}

class ArtifactFrameRegistry {
  private entries: ArtifactFrameRendererEntry[] = [];

  register(entry: ArtifactFrameRendererEntry): void {
    const nextEntries = this.entries.filter((item) => item.id !== entry.id);
    nextEntries.push(entry);
    this.entries = nextEntries.sort((a, b) => {
      if (a.priority !== b.priority) {
        return b.priority - a.priority;
      }
      return a.id.localeCompare(b.id);
    });
  }

  resolve(artifact: Artifact): ArtifactFrameRendererEntry | undefined {
    return this.entries.find((entry) => entry.supports(artifact));
  }

  getAll(): ArtifactFrameRendererEntry[] {
    return [...this.entries];
  }

  getById(id: string): ArtifactFrameRendererEntry | undefined {
    return this.entries.find((entry) => entry.id === id);
  }

  clear(): void {
    this.entries = [];
  }
}

export const artifactFrameRegistry = new ArtifactFrameRegistry();

export function registerArtifactFrameRenderer(
  entry: ArtifactFrameRendererEntry,
): void {
  artifactFrameRegistry.register(entry);
}

export function resolveArtifactFrameRenderer(
  artifact: Artifact,
): ArtifactFrameRendererEntry | undefined {
  return artifactFrameRegistry.resolve(artifact);
}

export function clearArtifactFrameRegistry(): void {
  artifactFrameRegistry.clear();
}

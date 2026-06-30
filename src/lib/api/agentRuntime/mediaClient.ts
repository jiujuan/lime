import type {
  CompleteAudioGenerationTaskArtifactRequest,
  CompleteImageGenerationTaskArtifactRequest,
  CreateAudioGenerationTaskArtifactRequest,
  CreateImageGenerationTaskArtifactRequest,
  ListMediaTaskArtifactsRequest,
  ListMediaTaskArtifactsOutput,
  MediaTaskArtifactOutput,
  MediaTaskLookupRequest,
} from "./types";
import type { AgentRuntimeBridgeInvoke } from "./transport";

export interface AgentRuntimeMediaClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}

function createRetiredMediaTaskCommandError(command: string): Error {
  return new Error(
    `${command} is retired; use src/lib/api/mediaTasks.ts App Server current methods`,
  );
}

async function rejectRetiredMediaTaskCommand<T>(command: string): Promise<T> {
  throw createRetiredMediaTaskCommandError(command);
}

export function createMediaClient({
  bridgeInvoke,
}: AgentRuntimeMediaClientDeps = {}) {
  void bridgeInvoke;

  async function createImageGenerationTaskArtifact(
    request: CreateImageGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "create_image_generation_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function createAudioGenerationTaskArtifact(
    request: CreateAudioGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "create_audio_generation_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function completeAudioGenerationTaskArtifact(
    request: CompleteAudioGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "complete_audio_generation_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function completeImageGenerationTaskArtifact(
    request: CompleteImageGenerationTaskArtifactRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "complete_image_generation_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function getMediaTaskArtifact(
    request: MediaTaskLookupRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "get_media_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function listMediaTaskArtifacts(
    request: ListMediaTaskArtifactsRequest,
  ): Promise<ListMediaTaskArtifactsOutput> {
    void request;
    const command = "list_media_task_artifacts";
    return rejectRetiredMediaTaskCommand(command);
  }

  async function cancelMediaTaskArtifact(
    request: MediaTaskLookupRequest,
  ): Promise<MediaTaskArtifactOutput> {
    void request;
    const command = "cancel_media_task_artifact";
    return rejectRetiredMediaTaskCommand(command);
  }

  return {
    cancelMediaTaskArtifact,
    completeAudioGenerationTaskArtifact,
    completeImageGenerationTaskArtifact,
    createAudioGenerationTaskArtifact,
    createImageGenerationTaskArtifact,
    getMediaTaskArtifact,
    listMediaTaskArtifacts,
  };
}

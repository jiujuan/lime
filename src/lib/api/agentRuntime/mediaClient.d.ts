import type { CompleteAudioGenerationTaskArtifactRequest, CreateAudioGenerationTaskArtifactRequest, CreateImageGenerationTaskArtifactRequest, ListMediaTaskArtifactsRequest, ListMediaTaskArtifactsOutput, MediaTaskArtifactOutput, MediaTaskLookupRequest } from "./types";
import { type AgentRuntimeBridgeInvoke } from "./transport";
export interface AgentRuntimeMediaClientDeps {
    bridgeInvoke?: AgentRuntimeBridgeInvoke;
}
export declare function createMediaClient({ bridgeInvoke, }?: AgentRuntimeMediaClientDeps): {
    cancelMediaTaskArtifact: (request: MediaTaskLookupRequest) => Promise<MediaTaskArtifactOutput>;
    completeAudioGenerationTaskArtifact: (request: CompleteAudioGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>;
    createAudioGenerationTaskArtifact: (request: CreateAudioGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>;
    createImageGenerationTaskArtifact: (request: CreateImageGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>;
    getMediaTaskArtifact: (request: MediaTaskLookupRequest) => Promise<MediaTaskArtifactOutput>;
    listMediaTaskArtifacts: (request: ListMediaTaskArtifactsRequest) => Promise<ListMediaTaskArtifactsOutput>;
};
export declare const cancelMediaTaskArtifact: (request: MediaTaskLookupRequest) => Promise<MediaTaskArtifactOutput>, completeAudioGenerationTaskArtifact: (request: CompleteAudioGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>, createAudioGenerationTaskArtifact: (request: CreateAudioGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>, createImageGenerationTaskArtifact: (request: CreateImageGenerationTaskArtifactRequest) => Promise<MediaTaskArtifactOutput>, getMediaTaskArtifact: (request: MediaTaskLookupRequest) => Promise<MediaTaskArtifactOutput>, listMediaTaskArtifacts: (request: ListMediaTaskArtifactsRequest) => Promise<ListMediaTaskArtifactsOutput>;

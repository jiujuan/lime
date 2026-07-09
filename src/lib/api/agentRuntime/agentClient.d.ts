import type {
  AgentRuntimeGeneratedTitleResult,
  AgentRuntimeInitStatus,
} from "./types";
import { type AgentRuntimeBridgeInvoke } from "./transport";
export interface AgentRuntimeAgentClientDeps {
  bridgeInvoke?: AgentRuntimeBridgeInvoke;
}
export interface GenerateAgentRuntimeTitleRequest {
  sessionId?: string;
  previewText?: string;
  titleKind?: "session" | "image_task";
}
export declare function createAgentClient({
  bridgeInvoke,
}?: AgentRuntimeAgentClientDeps): {
  generateAgentRuntimeTitleResult: (
    request: GenerateAgentRuntimeTitleRequest,
  ) => Promise<AgentRuntimeGeneratedTitleResult>;
  generateAgentRuntimeTitle: (
    request: GenerateAgentRuntimeTitleRequest,
  ) => Promise<string>;
  generateAgentRuntimeSessionTitle: (
    sessionId: string,
    previewText?: string,
  ) => Promise<string>;
  initAgentRuntime: () => Promise<AgentRuntimeInitStatus>;
};
export declare const generateAgentRuntimeTitleResult: (
    request: GenerateAgentRuntimeTitleRequest,
  ) => Promise<AgentRuntimeGeneratedTitleResult>,
  generateAgentRuntimeTitle: (
    request: GenerateAgentRuntimeTitleRequest,
  ) => Promise<string>,
  generateAgentRuntimeSessionTitle: (
    sessionId: string,
    previewText?: string,
  ) => Promise<string>,
  initAgentRuntime: () => Promise<AgentRuntimeInitStatus>;

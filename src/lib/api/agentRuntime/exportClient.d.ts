import { AppServerClient } from "@/lib/api/appServer";
import { type AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "./types";
export type AgentRuntimeEvidenceExportAppServerClient = Pick<
  AppServerClient,
  | "exportEvidence"
  | "exportHandoffBundle"
  | "exportReplayCase"
  | "exportAnalysisHandoff"
  | "exportReviewDecisionTemplate"
  | "saveReviewDecision"
>;
export interface AgentRuntimeExportClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeEvidenceExportAppServerClient;
}
export declare function createExportClient({
  appServerClient,
  invokeCommand,
}?: AgentRuntimeExportClientDeps): {
  exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
  ) => Promise<AgentRuntimeAnalysisHandoff>;
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<AgentRuntimeEvidencePack>;
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
  ) => Promise<AgentRuntimeHandoffBundle>;
  exportAgentRuntimeReplayCase: (
    sessionId: string,
  ) => Promise<AgentRuntimeReplayCase>;
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;
  saveAgentRuntimeReviewDecision: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;
};
export declare const exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
  ) => Promise<AgentRuntimeAnalysisHandoff>,
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<AgentRuntimeEvidencePack>,
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
  ) => Promise<AgentRuntimeHandoffBundle>,
  exportAgentRuntimeReplayCase: (
    sessionId: string,
  ) => Promise<AgentRuntimeReplayCase>,
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>,
  saveAgentRuntimeReviewDecision: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;

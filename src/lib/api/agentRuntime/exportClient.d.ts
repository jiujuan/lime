import { AppServerClient } from "@/lib/api/appServer";
import { type AgentRuntimeCommandInvoke } from "./transport";
import type {
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeSaveReviewDecisionRequest,
} from "./evidenceTypes";
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
export interface AgentRuntimeExportOptions {
  locale?: string | null;
}
export declare function createExportClient({
  appServerClient,
  invokeCommand,
}?: AgentRuntimeExportClientDeps): {
  exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeAnalysisHandoff>;
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<AgentRuntimeEvidencePack>;
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeHandoffBundle>;
  exportAgentRuntimeReplayCase: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeReplayCase>;
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;
  saveAgentRuntimeReviewDecision: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;
};
export declare const exportAgentRuntimeAnalysisHandoff: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeAnalysisHandoff>,
  exportAgentRuntimeEvidencePack: (
    sessionId: string,
  ) => Promise<AgentRuntimeEvidencePack>,
  exportAgentRuntimeHandoffBundle: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeHandoffBundle>,
  exportAgentRuntimeReplayCase: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeReplayCase>,
  exportAgentRuntimeReviewDecisionTemplate: (
    sessionId: string,
    options?: AgentRuntimeExportOptions,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>,
  saveAgentRuntimeReviewDecision: (
    request: AgentRuntimeSaveReviewDecisionRequest,
  ) => Promise<AgentRuntimeReviewDecisionTemplate>;

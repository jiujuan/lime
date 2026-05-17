import { type AgentRuntimeCommandInvoke } from "./transport";
import type { AgentRuntimeAnalysisHandoff, AgentRuntimeEvidencePack, AgentRuntimeHandoffBundle, AgentRuntimeReplayCase, AgentRuntimeReviewDecisionTemplate, AgentRuntimeSaveReviewDecisionRequest } from "./types";
export interface AgentRuntimeExportClientDeps {
    invokeCommand?: AgentRuntimeCommandInvoke;
}
export declare function createExportClient({ invokeCommand, }?: AgentRuntimeExportClientDeps): {
    exportAgentRuntimeAnalysisHandoff: (sessionId: string) => Promise<AgentRuntimeAnalysisHandoff>;
    exportAgentRuntimeEvidencePack: (sessionId: string) => Promise<AgentRuntimeEvidencePack>;
    exportAgentRuntimeHandoffBundle: (sessionId: string) => Promise<AgentRuntimeHandoffBundle>;
    exportAgentRuntimeReplayCase: (sessionId: string) => Promise<AgentRuntimeReplayCase>;
    exportAgentRuntimeReviewDecisionTemplate: (sessionId: string) => Promise<AgentRuntimeReviewDecisionTemplate>;
    saveAgentRuntimeReviewDecision: (request: AgentRuntimeSaveReviewDecisionRequest) => Promise<AgentRuntimeReviewDecisionTemplate>;
};
export declare const exportAgentRuntimeAnalysisHandoff: (sessionId: string) => Promise<AgentRuntimeAnalysisHandoff>, exportAgentRuntimeEvidencePack: (sessionId: string) => Promise<AgentRuntimeEvidencePack>, exportAgentRuntimeHandoffBundle: (sessionId: string) => Promise<AgentRuntimeHandoffBundle>, exportAgentRuntimeReplayCase: (sessionId: string) => Promise<AgentRuntimeReplayCase>, exportAgentRuntimeReviewDecisionTemplate: (sessionId: string) => Promise<AgentRuntimeReviewDecisionTemplate>, saveAgentRuntimeReviewDecision: (request: AgentRuntimeSaveReviewDecisionRequest) => Promise<AgentRuntimeReviewDecisionTemplate>;

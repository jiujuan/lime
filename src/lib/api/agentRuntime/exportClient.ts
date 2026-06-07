import { AppServerClient } from "@/lib/api/appServer";
import { projectAppServerEvidenceExportToRuntimeEvidencePack } from "./appServerEvidenceExportProjection";
import { AGENT_RUNTIME_COMMANDS } from "./commandManifest.generated";
import {
  normalizeAnalysisHandoff,
  normalizeHandoffBundle,
  normalizeReplayCase,
  normalizeReviewDecisionTemplate,
} from "./normalizers";
import {
  invokeAgentRuntimeCommand,
  type AgentRuntimeCommandInvoke,
} from "./transport";
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
  "exportEvidence"
>;

export interface AgentRuntimeExportClientDeps {
  invokeCommand?: AgentRuntimeCommandInvoke;
  appServerClient?: AgentRuntimeEvidenceExportAppServerClient;
}

export function createExportClient({
  appServerClient = new AppServerClient(),
  invokeCommand = invokeAgentRuntimeCommand,
}: AgentRuntimeExportClientDeps = {}) {
  async function exportAgentRuntimeHandoffBundle(
    sessionId: string,
  ): Promise<AgentRuntimeHandoffBundle> {
    return normalizeHandoffBundle(
      await invokeCommand(AGENT_RUNTIME_COMMANDS.exportHandoffBundle, {
        sessionId,
      }),
    );
  }

  async function exportAgentRuntimeAnalysisHandoff(
    sessionId: string,
  ): Promise<AgentRuntimeAnalysisHandoff> {
    return normalizeAnalysisHandoff(
      await invokeCommand(AGENT_RUNTIME_COMMANDS.exportAnalysisHandoff, {
        sessionId,
      }),
    );
  }

  async function exportAgentRuntimeReviewDecisionTemplate(
    sessionId: string,
  ): Promise<AgentRuntimeReviewDecisionTemplate> {
    return normalizeReviewDecisionTemplate(
      await invokeCommand(AGENT_RUNTIME_COMMANDS.exportReviewDecisionTemplate, {
        sessionId,
      }),
    );
  }

  async function saveAgentRuntimeReviewDecision(
    request: AgentRuntimeSaveReviewDecisionRequest,
  ): Promise<AgentRuntimeReviewDecisionTemplate> {
    return normalizeReviewDecisionTemplate(
      await invokeCommand(AGENT_RUNTIME_COMMANDS.saveReviewDecision, {
        request,
      }),
    );
  }

  async function exportAgentRuntimeEvidencePack(
    sessionId: string,
  ): Promise<AgentRuntimeEvidencePack> {
    const normalizedSessionId = sessionId.trim();
    if (!normalizedSessionId) {
      throw new Error("sessionId is required to export App Server evidence");
    }

    const response = await appServerClient.exportEvidence({
      sessionId: normalizedSessionId,
      includeEvents: true,
      includeArtifacts: true,
      includeEvidencePack: true,
    });
    return projectAppServerEvidenceExportToRuntimeEvidencePack(response.result);
  }

  async function exportAgentRuntimeReplayCase(
    sessionId: string,
  ): Promise<AgentRuntimeReplayCase> {
    return normalizeReplayCase(
      await invokeCommand(AGENT_RUNTIME_COMMANDS.exportReplayCase, {
        sessionId,
      }),
    );
  }

  return {
    exportAgentRuntimeAnalysisHandoff,
    exportAgentRuntimeEvidencePack,
    exportAgentRuntimeHandoffBundle,
    exportAgentRuntimeReplayCase,
    exportAgentRuntimeReviewDecisionTemplate,
    saveAgentRuntimeReviewDecision,
  };
}

export const {
  exportAgentRuntimeAnalysisHandoff,
  exportAgentRuntimeEvidencePack,
  exportAgentRuntimeHandoffBundle,
  exportAgentRuntimeReplayCase,
  exportAgentRuntimeReviewDecisionTemplate,
  saveAgentRuntimeReviewDecision,
} = createExportClient();

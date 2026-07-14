import type {
  AgentRuntimeEvidencePack,
  AgentRuntimeHandoffBundle,
  AgentRuntimeAnalysisHandoff,
  AgentRuntimeReplayCase,
  AgentRuntimeReviewDecisionTemplate,
  AgentRuntimeThreadReadModel,
} from "./types";
export declare function normalizeAnalysisHandoff(
  value: unknown,
): AgentRuntimeAnalysisHandoff;
export declare function normalizeHandoffBundle(
  value: unknown,
): AgentRuntimeHandoffBundle;
export declare function normalizeEvidencePack(
  value: unknown,
): AgentRuntimeEvidencePack;
export declare function normalizeReplayCase(
  value: unknown,
): AgentRuntimeReplayCase;
export declare function normalizeReviewDecisionTemplate(
  value: unknown,
): AgentRuntimeReviewDecisionTemplate;
export declare function normalizeThreadReadModel(
  threadRead?: AgentRuntimeThreadReadModel | null,
): AgentRuntimeThreadReadModel | null | undefined;

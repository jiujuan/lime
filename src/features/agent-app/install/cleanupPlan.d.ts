import type { AgentAppProjection, AppCleanupPlan } from "../types";
export declare function buildCleanupPlan(params: {
    projection: AgentAppProjection;
    dataRoot?: string;
    generatedAt?: string;
}): AppCleanupPlan;

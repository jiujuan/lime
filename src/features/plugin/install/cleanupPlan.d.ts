import type { PluginProjection, AppCleanupPlan } from "../types";
export declare function buildCleanupPlan(params: {
    projection: PluginProjection;
    dataRoot?: string;
    generatedAt?: string;
}): AppCleanupPlan;

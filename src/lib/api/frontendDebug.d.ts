export interface FrontendDebugLogReport {
    message: string;
    level?: "debug" | "info" | "warn" | "error";
    category?: string;
    context?: unknown;
}
export declare function reportFrontendDebugLog(report: FrontendDebugLogReport): Promise<void>;

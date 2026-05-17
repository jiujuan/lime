import type { AgentAppSetupState, AgentAppPackageVerificationResult, CloudBootstrapApp, HostCapabilityProfile, InstalledAppPreview, PackageIdentity } from "../types";
export declare class AgentAppInstalledPreviewError extends Error {
    constructor(message: string);
}
export declare function buildInstalledAppPreview(params?: {
    fixture?: unknown;
    identity?: PackageIdentity;
    cloud?: CloudBootstrapApp;
    packageVerification?: AgentAppPackageVerificationResult;
    setup?: AgentAppSetupState;
    profile?: HostCapabilityProfile;
    loadedAt?: string;
    checkedAt?: string;
    generatedAt?: string;
}): InstalledAppPreview;

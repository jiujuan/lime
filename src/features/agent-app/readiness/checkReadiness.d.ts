import type { AgentAppPackageVerificationResult, AgentAppProjection, AgentAppSetupState, CloudBootstrapApp, HostCapabilityProfile, NormalizedAppManifest, ReadinessResult } from "../types";
export declare function checkReadiness(params: {
    manifest: NormalizedAppManifest;
    projection: AgentAppProjection;
    profile?: HostCapabilityProfile;
    cloud?: CloudBootstrapApp;
    packageVerification?: AgentAppPackageVerificationResult;
    setup?: AgentAppSetupState;
    checkedAt?: string;
}): ReadinessResult;

import type { PluginPackageVerificationResult, PluginProjection, PluginSetupState, CloudBootstrapApp, HostCapabilityProfile, NormalizedAppManifest, ReadinessResult } from "../types";
export declare function checkReadiness(params: {
    manifest: NormalizedAppManifest;
    projection: PluginProjection;
    profile?: HostCapabilityProfile;
    cloud?: CloudBootstrapApp;
    packageVerification?: PluginPackageVerificationResult;
    setup?: PluginSetupState;
    checkedAt?: string;
}): ReadinessResult;

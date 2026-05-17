import type { AgentAppProjection, NormalizedAppManifest, PackageIdentity } from "../types";
export declare function projectApp(params: {
    manifest: NormalizedAppManifest;
    identity: PackageIdentity;
}): AgentAppProjection;

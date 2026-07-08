import {
  compatiblePluginStandardVersions,
  currentPluginStandardVersion,
} from "../readiness/hostCapabilityProfile";
import { summarizeRuntimeProfile } from "../runtime-profile";
import type { HostCapabilityProfile, LimeRuntimeProfile } from "../types";
import {
  LIME_CAPABILITY_DEFINITIONS,
  type LimeCapabilityDefinitionRecord,
} from "../sdk/capabilityCatalog";
import type { PluginHostBridgeCapabilityRequest } from "./hostBridge";
import {
  buildCapabilityDiscoveryEntry,
  buildPluginStandardProfile,
} from "./capabilityDispatcherProfile";
import { PluginCapabilityDispatcherError } from "./capabilityDispatcherError";
import { readStringParam } from "./capabilityDispatcherRequestInput";
import { throwUnsupportedMethod } from "./capabilityDispatcherUnsupported";

function resolveCapabilityDefinition(
  name: string,
): LimeCapabilityDefinitionRecord {
  const definition = LIME_CAPABILITY_DEFINITIONS.find(
    (item) => item.name === name,
  );
  if (!definition) {
    throw new PluginCapabilityDispatcherError(
      "CAPABILITY_NOT_FOUND",
      `${name} is not a known Lime capability.`,
    );
  }
  return definition;
}

export function dispatchCapabilities(
  request: PluginHostBridgeCapabilityRequest,
  profile: HostCapabilityProfile,
  runtimeProfile: LimeRuntimeProfile | undefined,
  standardProfile: {
    manifestVersion?: string;
    agentRuntime?: unknown;
    requirements?: unknown;
    boundary?: unknown;
    integrations?: unknown;
    operations?: unknown;
  } = {},
): unknown {
  if (request.method === "list") {
    return LIME_CAPABILITY_DEFINITIONS.map((definition) =>
      buildCapabilityDiscoveryEntry(definition, profile, runtimeProfile),
    );
  }
  if (request.method === "get") {
    const capability = readStringParam(request, "capability", 0);
    return buildCapabilityDiscoveryEntry(
      resolveCapabilityDefinition(capability),
      profile,
      runtimeProfile,
    );
  }
  if (request.method === "getProfile") {
    const agentRuntime = standardProfile.agentRuntime ?? profile.agentRuntime;
    const payload: Record<string, unknown> = {
      appRuntimeVersion: profile.appRuntimeVersion,
      standardVersions: profile.standardVersions ?? {
        current: currentPluginStandardVersion,
        compatible: [...compatiblePluginStandardVersions],
      },
      runtimeTargets: [...profile.runtimeTargets],
      capabilities: Object.fromEntries(
        LIME_CAPABILITY_DEFINITIONS.map((definition) => [
          definition.name,
          buildCapabilityDiscoveryEntry(definition, profile, runtimeProfile),
        ]),
      ),
      standards: buildPluginStandardProfile({
        manifestVersion: standardProfile.manifestVersion,
        agentRuntime,
        requirements: standardProfile.requirements,
        boundary: standardProfile.boundary,
        integrations: standardProfile.integrations,
        operations: standardProfile.operations,
      }),
      featureFlags: { ...profile.featureFlags },
    };
    if (agentRuntime !== undefined) {
      payload.agentRuntime = agentRuntime;
    }
    if (runtimeProfile) {
      payload.runtimeProfile = summarizeRuntimeProfile(runtimeProfile);
      payload.runtimeCapabilities = runtimeProfile.capabilities;
    }
    if (standardProfile.requirements !== undefined) {
      payload.requirements = standardProfile.requirements;
    }
    if (standardProfile.boundary !== undefined) {
      payload.boundary = standardProfile.boundary;
    }
    if (standardProfile.integrations !== undefined) {
      payload.integrations = standardProfile.integrations;
    }
    if (standardProfile.operations !== undefined) {
      payload.operations = standardProfile.operations;
    }
    return payload;
  }
  throwUnsupportedMethod(request);
}

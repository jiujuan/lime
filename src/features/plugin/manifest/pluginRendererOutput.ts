import type {
  PluginArtifactRendererActionDeclaration,
  PluginArtifactRendererDeclaration,
  PluginContract,
  PluginRendererKind,
} from "./types";
import {
  resolvePluginRuntimeAuthorization,
  type PluginRuntimeAuthorizationDecision,
} from "./pluginRuntimeAuthorization";

export interface PluginRendererOutputContract {
  pluginId: string;
  artifactType: string;
  surfaceKind: string;
  paneKind: string;
  rendererKind: PluginRendererKind;
  outputArtifactKind: string | null;
  entry: string | null;
  actionKeys: string[];
  actions: PluginArtifactRendererActionDeclaration[];
  capabilities: string[];
  runtimeAuthorization: PluginRuntimeAuthorizationDecision;
}

export interface ResolvePluginRendererOutputContractParams {
  artifactType?: string | null;
  surfaceKind?: string | null;
  paneKind?: string | null;
  actionKey?: string | null;
  outputArtifactKind?: string | null;
}

function normalizeString(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized ? normalized : null;
}

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  return Array.from(
    new Set(
      values
        .map(normalizeString)
        .filter((value): value is string => Boolean(value)),
    ),
  );
}

function rendererPaneKind(
  renderer: PluginArtifactRendererDeclaration,
): string {
  return (
    normalizeString(renderer.paneKind) ??
    normalizeString(renderer.defaultPane) ??
    renderer.surfaceKind
  );
}

function rendererActionKeys(
  renderer: PluginArtifactRendererDeclaration,
): string[] {
  return uniqueStrings([
    ...(renderer.actionKeys ?? []),
    ...(renderer.actions ?? []).map((action) => action.key),
  ]);
}

function buildOutputContract(params: {
  contract: PluginContract;
  renderer: PluginArtifactRendererDeclaration;
}): PluginRendererOutputContract {
  const { contract, renderer } = params;
  return {
    pluginId: contract.id,
    artifactType: renderer.artifactType,
    surfaceKind: renderer.surfaceKind,
    paneKind: rendererPaneKind(renderer),
    rendererKind: renderer.rendererKind,
    outputArtifactKind: normalizeString(renderer.outputArtifactKind),
    entry: normalizeString(renderer.entry),
    actionKeys: rendererActionKeys(renderer),
    actions: renderer.actions ?? [],
    capabilities: uniqueStrings(renderer.capabilities ?? []),
    runtimeAuthorization: resolvePluginRuntimeAuthorization({
      pluginId: contract.id,
      rendererKind: renderer.rendererKind,
      outputArtifactKind: renderer.outputArtifactKind,
    }),
  };
}

export function buildPluginRendererOutputContracts(
  contract: PluginContract,
): PluginRendererOutputContract[] {
  return contract.artifactRenderers.map((renderer) =>
    buildOutputContract({ contract, renderer }),
  );
}

function actionMatches(
  renderer: PluginArtifactRendererDeclaration,
  actionKey: string | null,
): boolean {
  if (!actionKey) {
    return true;
  }
  return rendererActionKeys(renderer).includes(actionKey);
}

function outputArtifactKindMatches(
  renderer: PluginArtifactRendererDeclaration,
  outputArtifactKind: string | null,
): boolean {
  if (!outputArtifactKind) {
    return true;
  }
  return normalizeString(renderer.outputArtifactKind) === outputArtifactKind;
}

export function resolvePluginRendererOutputContract(
  contract: PluginContract,
  params: ResolvePluginRendererOutputContractParams,
): PluginRendererOutputContract | null {
  const artifactType = normalizeString(params.artifactType);
  const surfaceKind = normalizeString(params.surfaceKind);
  const paneKind = normalizeString(params.paneKind);
  const actionKey = normalizeString(params.actionKey);
  const outputArtifactKind = normalizeString(params.outputArtifactKind);

  const renderer =
    contract.artifactRenderers.find((candidate) => {
      if (!outputArtifactKindMatches(candidate, outputArtifactKind)) {
        return false;
      }
      if (artifactType && candidate.artifactType !== artifactType) {
        return false;
      }
      if (surfaceKind && candidate.surfaceKind !== surfaceKind) {
        return false;
      }
      if (paneKind && rendererPaneKind(candidate) !== paneKind) {
        return false;
      }
      return actionMatches(candidate, actionKey);
    }) ??
    contract.artifactRenderers.find((candidate) => {
      if (!artifactType) {
        return false;
      }
      if (!outputArtifactKindMatches(candidate, outputArtifactKind)) {
        return false;
      }
      return (
        (candidate.artifactType === artifactType ||
          rendererPaneKind(candidate) === artifactType ||
          candidate.surfaceKind === artifactType) &&
        actionMatches(candidate, actionKey)
      );
    }) ??
    contract.artifactRenderers.find(
      (candidate) =>
        Boolean(outputArtifactKind) &&
        outputArtifactKindMatches(candidate, outputArtifactKind) &&
        actionMatches(candidate, actionKey),
    ) ??
    contract.artifactRenderers.find((candidate) =>
      outputArtifactKindMatches(candidate, outputArtifactKind) &&
      actionMatches(candidate, actionKey),
    );

  return renderer ? buildOutputContract({ contract, renderer }) : null;
}

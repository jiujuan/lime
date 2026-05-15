import type {
  ExpertCatalogProjectionItem,
  ExpertInstallOverlayRecord,
} from "./types";

export interface BuildExpertRuntimeMetadataOptions {
  catalogVersion?: string;
  tenantId?: string;
  overlay?: ExpertInstallOverlayRecord | null;
  skillRefsOverride?: string[] | null;
}

export interface ExpertRuntimeMetadata extends Record<string, unknown> {
  expert: {
    expertId: string;
    releaseId: string;
    title: string;
    category: string;
    source: string;
    catalogVersion?: string;
    tenantId?: string;
    personaRef: string;
    personaHash?: string;
    memoryTemplateRef?: string;
    skillRefs: string[];
    workflowRefs: string[];
    memoryEnabled: boolean;
    workflowEnabled: boolean;
  };
  harness: {
    expert: {
      expert_id: string;
      release_id: string;
      title: string;
      category: string;
      source: string;
      catalog_version?: string;
      tenant_id?: string;
      persona_ref: string;
      persona_hash?: string;
      memory_template_ref?: string;
      skill_refs: string[];
      workflow_refs: string[];
      memory_enabled: boolean;
      workflow_enabled: boolean;
    };
  };
}

function optionalString(value?: string): string | undefined {
  const normalized = value?.trim();
  return normalized ? normalized : undefined;
}

export function formatExpertRefList(refs: string[], emptyLabel: string): string {
  return refs.length > 0 ? refs.join("、") : emptyLabel;
}

export function buildExpertRuntimeMetadata(
  expert: ExpertCatalogProjectionItem,
  options: BuildExpertRuntimeMetadataOptions = {},
): ExpertRuntimeMetadata {
  const memoryEnabled = options.overlay?.memoryEnabled ?? true;
  const workflowEnabled = options.overlay?.workflowEnabled ?? true;
  const skillRefs =
    options.skillRefsOverride && options.skillRefsOverride.length > 0
      ? [...options.skillRefsOverride]
      : [...expert.release.skillRefs];
  const common = {
    expertId: expert.id,
    releaseId: expert.release.releaseId,
    title: expert.title,
    category: expert.category,
    source: expert.source,
    catalogVersion: optionalString(options.catalogVersion),
    tenantId: optionalString(options.tenantId),
    personaRef: expert.release.personaRef,
    personaHash: optionalString(expert.release.personaHash),
    memoryTemplateRef: memoryEnabled
      ? optionalString(expert.release.memoryTemplateRef)
      : undefined,
    skillRefs,
    workflowRefs: workflowEnabled ? [...expert.release.workflowRefs] : [],
    memoryEnabled,
    workflowEnabled,
  };

  return {
    expert: common,
    harness: {
      expert: {
        expert_id: common.expertId,
        release_id: common.releaseId,
        title: common.title,
        category: common.category,
        source: common.source,
        catalog_version: common.catalogVersion,
        tenant_id: common.tenantId,
        persona_ref: common.personaRef,
        persona_hash: common.personaHash,
        memory_template_ref: common.memoryTemplateRef,
        skill_refs: [...common.skillRefs],
        workflow_refs: [...common.workflowRefs],
        memory_enabled: common.memoryEnabled,
        workflow_enabled: common.workflowEnabled,
      },
    },
  };
}

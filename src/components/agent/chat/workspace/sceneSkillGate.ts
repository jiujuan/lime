import type { SkillCatalogSceneEntry } from "@/lib/api/skillCatalog";
import type { Project } from "@/lib/api/project";
import type { A2UIFormData, A2UIResponse } from "@/components/workspace/a2ui/types";
import { agentZhCNResource as agentSourceResource } from "@/i18n/agentResources";
import type {
  ServiceSkillItem,
  ServiceSkillSlotDefinition,
  ServiceSkillSlotOption,
  ServiceSkillSlotType,
  ServiceSkillSlotValues,
} from "../service-skills/types";
import {
  buildServiceSkillSlotFieldA2UI,
  readServiceSkillSlotValueFromA2UIFormData,
} from "../service-skills/slotFormA2UI";

export type RuntimeSceneGateKind = "require_inputs";

export interface RuntimeSceneGateSlotField {
  kind: "slot";
  key: string;
  label: string;
  slotType: ServiceSkillSlotType;
  required: boolean;
  placeholder?: string;
  helpText?: string;
  options?: ServiceSkillSlotOption[];
  defaultValue?: string;
}

export interface RuntimeSceneGateProjectField {
  kind: "project";
  key: "project_id";
  label: string;
  required: true;
  description?: string;
}

export type RuntimeSceneGateField =
  | RuntimeSceneGateSlotField
  | RuntimeSceneGateProjectField;

export interface RuntimeSceneGateRequest {
  kind: RuntimeSceneGateKind;
  gateKey: string;
  rawText: string;
  sceneKey: string;
  commandPrefix: string;
  sceneTitle: string;
  sceneSummary?: string;
  skillId: string;
  fields: RuntimeSceneGateField[];
}

export interface RuntimeSceneGateSubmission {
  slotValues: Record<string, string>;
  projectId?: string;
  missingFieldLabels: string[];
}

export interface RuntimeSceneGatePrefill {
  slotValues?: ServiceSkillSlotValues;
  projectId?: string;
  hint?: string;
}

export interface RuntimeSceneGateCopy {
  projectFieldLabel?: string;
  projectFieldDescription?: string;
  projectWorkspaceTypeGeneral?: string;
  projectDefaultLabel?: string;
  projectIdPlaceholder?: string;
  projectIdHelperText?: string;
  fallbackDescription?: string;
  submitLabel?: string;
  itemSeparator?: string;
  missingProject?: string;
  missingDefault?: string;
  unavailableMessage?: string;
  launchFailedFallback?: string;
  formatTitle?: (sceneTitle: string) => string;
  formatMissingSlotsAndProject?: (
    slotLabels: string[],
    projectLabel: string,
  ) => string;
  formatMissingSlots?: (slotLabels: string[]) => string;
  formatLaunchFailed?: (message: string) => string;
}

export interface ResolvedRuntimeSceneGateCopy {
  projectFieldLabel: string;
  projectFieldDescription: string;
  projectWorkspaceTypeGeneral: string;
  projectDefaultLabel: string;
  projectIdPlaceholder: string;
  projectIdHelperText: string;
  fallbackDescription: string;
  submitLabel: string;
  itemSeparator: string;
  missingProject: string;
  missingDefault: string;
  unavailableMessage: string;
  launchFailedFallback: string;
  formatTitle: (sceneTitle: string) => string;
  formatMissingSlotsAndProject: (
    slotLabels: string[],
    projectLabel: string,
  ) => string;
  formatMissingSlots: (slotLabels: string[]) => string;
  formatLaunchFailed: (message: string) => string;
}

type AgentSourceResourceKey = keyof typeof agentSourceResource;

function interpolateRuntimeSceneGateSourceTemplate(
  template: string,
  values?: Record<string, number | string>,
): string {
  return template.replace(/\{\{\s*(\w+)\s*\}\}/g, (match, name) => {
    const value = values?.[name];
    return value == null ? match : String(value);
  });
}

function translateRuntimeSceneGateSourceKey(
  key: string,
  values?: Record<string, number | string>,
): string {
  const template = agentSourceResource[key as AgentSourceResourceKey] ?? key;
  return interpolateRuntimeSceneGateSourceTemplate(template, values);
}

const SOURCE_RUNTIME_SCENE_GATE_COPY: ResolvedRuntimeSceneGateCopy = {
  projectFieldLabel: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.label",
  ),
  projectFieldDescription: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.description",
  ),
  projectWorkspaceTypeGeneral: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.workspaceType.general",
  ),
  projectDefaultLabel: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.defaultLabel",
  ),
  projectIdPlaceholder: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.placeholder",
  ),
  projectIdHelperText: translateRuntimeSceneGateSourceKey(
    "sceneGate.project.helperText",
  ),
  fallbackDescription: translateRuntimeSceneGateSourceKey(
    "sceneGate.description.fallback",
  ),
  submitLabel: translateRuntimeSceneGateSourceKey("sceneGate.action.submit"),
  itemSeparator: translateRuntimeSceneGateSourceKey(
    "sceneGate.validation.itemSeparator",
  ),
  missingProject: translateRuntimeSceneGateSourceKey(
    "sceneGate.validation.missingProject",
  ),
  missingDefault: translateRuntimeSceneGateSourceKey(
    "sceneGate.validation.missingDefault",
  ),
  unavailableMessage: translateRuntimeSceneGateSourceKey(
    "sceneGate.toast.unavailable",
  ),
  launchFailedFallback: translateRuntimeSceneGateSourceKey(
    "sceneGate.toast.launchFailedFallback",
  ),
  formatTitle: (sceneTitle) =>
    translateRuntimeSceneGateSourceKey("sceneGate.title", {
      title: sceneTitle,
    }),
  formatMissingSlotsAndProject: (slotLabels, projectLabel) =>
    translateRuntimeSceneGateSourceKey(
      "sceneGate.validation.missingSlotsAndProject",
      {
        fields: slotLabels.join(
          translateRuntimeSceneGateSourceKey(
            "sceneGate.validation.itemSeparator",
          ),
        ),
        project: projectLabel,
      },
    ),
  formatMissingSlots: (slotLabels) =>
    translateRuntimeSceneGateSourceKey("sceneGate.validation.missingSlots", {
      fields: slotLabels.join(
        translateRuntimeSceneGateSourceKey(
          "sceneGate.validation.itemSeparator",
        ),
      ),
    }),
  formatLaunchFailed: (message) =>
    translateRuntimeSceneGateSourceKey("sceneGate.toast.launchFailed", {
      message,
    }),
};

export function resolveRuntimeSceneGateCopy(
  copy?: RuntimeSceneGateCopy,
): ResolvedRuntimeSceneGateCopy {
  const itemSeparator =
    copy?.itemSeparator ?? SOURCE_RUNTIME_SCENE_GATE_COPY.itemSeparator;
  return {
    ...SOURCE_RUNTIME_SCENE_GATE_COPY,
    ...(copy ?? {}),
    itemSeparator,
    formatMissingSlotsAndProject:
      copy?.formatMissingSlotsAndProject ??
      ((slotLabels, projectLabel) =>
        translateRuntimeSceneGateSourceKey(
          "sceneGate.validation.missingSlotsAndProject",
          {
            fields: slotLabels.join(itemSeparator),
            project: projectLabel,
          },
        )),
    formatMissingSlots:
      copy?.formatMissingSlots ??
      ((slotLabels) =>
        translateRuntimeSceneGateSourceKey(
          "sceneGate.validation.missingSlots",
          {
            fields: slotLabels.join(itemSeparator),
          },
        )),
  };
}

function normalizeOptionalText(value: unknown): string | undefined {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim();
  return normalized ? normalized : undefined;
}

function buildGateKey(
  sceneKey: string,
  fields: RuntimeSceneGateField[],
): string {
  const fieldKey = fields
    .map((field) => `${field.kind}:${field.key}`)
    .sort()
    .join("|");
  return `${sceneKey}:${fieldKey}`;
}

function buildRuntimeSceneGateFields(params: {
  missingSlots?: ServiceSkillSlotDefinition[];
  requireProject?: boolean;
  copy?: RuntimeSceneGateCopy;
}): RuntimeSceneGateField[] {
  const copy = resolveRuntimeSceneGateCopy(params.copy);
  const fields: RuntimeSceneGateField[] = [];

  for (const slot of params.missingSlots || []) {
    fields.push({
      kind: "slot",
      key: slot.key,
      label: slot.label,
      slotType: slot.type,
      required: slot.required,
      placeholder: slot.placeholder,
      helpText: slot.helpText,
      options: slot.options,
      defaultValue: slot.defaultValue,
    });
  }

  if (params.requireProject) {
    fields.push({
      kind: "project",
      key: "project_id",
      label: copy.projectFieldLabel,
      required: true,
      description: copy.projectFieldDescription,
    });
  }

  return fields;
}

export function buildRuntimeSceneGateRequest(params: {
  rawText: string;
  sceneEntry: SkillCatalogSceneEntry;
  skill: ServiceSkillItem;
  missingSlots?: ServiceSkillSlotDefinition[];
  requireProject?: boolean;
  copy?: RuntimeSceneGateCopy;
}): RuntimeSceneGateRequest | null {
  const fields = buildRuntimeSceneGateFields({
    missingSlots: params.missingSlots,
    requireProject: params.requireProject,
    copy: params.copy,
  });
  if (fields.length === 0) {
    return null;
  }

  return {
    kind: "require_inputs",
    gateKey: buildGateKey(params.sceneEntry.sceneKey, fields),
    rawText: params.rawText,
    sceneKey: params.sceneEntry.sceneKey,
    commandPrefix: params.sceneEntry.commandPrefix,
    sceneTitle: params.sceneEntry.title || params.skill.title,
    sceneSummary: params.sceneEntry.summary || params.skill.summary,
    skillId: params.skill.id,
    fields,
  };
}

function buildProjectChoiceOptions(
  projects: Project[],
  copy: ResolvedRuntimeSceneGateCopy,
): Array<{
  value: string;
  label: string;
  description?: string;
}> {
  return projects.map((project) => {
    const descriptionParts = [
      project.workspaceType === "general"
        ? copy.projectWorkspaceTypeGeneral
        : project.workspaceType,
      project.isDefault ? copy.projectDefaultLabel : undefined,
      normalizeOptionalText(project.rootPath),
    ].filter((part): part is string => Boolean(part));

    return {
      value: project.id,
      label: project.name,
      description: descriptionParts.join(" · ") || undefined,
    };
  });
}

function buildFieldHelperText(
  field: RuntimeSceneGateField,
): string | undefined {
  if (field.kind === "project") {
    return field.description;
  }

  const parts = [
    normalizeOptionalText(field.helpText),
    normalizeOptionalText(field.placeholder),
  ].filter((part): part is string => Boolean(part));
  return parts.join(" · ") || undefined;
}

function resolveChoiceInitialValue(
  options: RuntimeSceneGateSlotField["options"] | Array<{ value: string }>,
  value: string | undefined,
): string[] {
  const availableOptions = options || [];
  const normalizedValue = normalizeOptionalText(value);
  if (!normalizedValue) {
    return [];
  }

  if (!availableOptions.some((option) => option.value === normalizedValue)) {
    return [];
  }

  return [normalizedValue];
}

function buildSlotFieldComponent(
  field: RuntimeSceneGateSlotField,
  prefill: RuntimeSceneGatePrefill | undefined,
  components: A2UIResponse["components"],
  childIds: string[],
): void {
  const fieldId = field.key;
  const prefillValue = normalizeOptionalText(prefill?.slotValues?.[field.key]);
  components.push(
    buildServiceSkillSlotFieldA2UI(
      {
        key: field.key,
        label: field.label,
        type: field.slotType,
        required: field.required,
        placeholder: field.placeholder,
        helpText: buildFieldHelperText(field),
        options: field.options,
        defaultValue: field.defaultValue,
      },
      {
        fieldId,
        initialValue:
          resolveChoiceInitialValue(field.options || [], prefillValue)[0] ||
          prefillValue,
      },
    ),
  );
  childIds.push(fieldId);
}

function buildProjectFieldComponent(
  field: RuntimeSceneGateProjectField,
  projects: Project[],
  prefill: RuntimeSceneGatePrefill | undefined,
  components: A2UIResponse["components"],
  childIds: string[],
  copy: ResolvedRuntimeSceneGateCopy,
): void {
  const helperText = buildFieldHelperText(field);
  const fieldId = field.key;
  const projectOptions = buildProjectChoiceOptions(projects, copy);
  const prefillProjectId = normalizeOptionalText(prefill?.projectId);

  if (projectOptions.length > 0) {
    components.push({
      id: fieldId,
      component: "ChoicePicker",
      label: field.label,
      options: projectOptions,
      value: resolveChoiceInitialValue(projectOptions, prefillProjectId),
      variant: "mutuallyExclusive",
      layout: "wrap",
    });
    childIds.push(fieldId);
    return;
  }

  components.push({
    id: fieldId,
    component: "TextField",
    label: field.label,
    value: prefillProjectId || "",
    placeholder: copy.projectIdPlaceholder,
    helperText: helperText || copy.projectIdHelperText,
  });
  childIds.push(fieldId);
}

export function buildRuntimeSceneGateA2UIForm(params: {
  request: RuntimeSceneGateRequest;
  projects?: Project[];
  prefill?: RuntimeSceneGatePrefill;
  copy?: RuntimeSceneGateCopy;
}): A2UIResponse {
  const { request, projects = [], prefill } = params;
  const copy = resolveRuntimeSceneGateCopy(params.copy);
  const components: A2UIResponse["components"] = [];
  const childIds: string[] = [];

  const titleId = `${request.gateKey}:title`;
  components.push({
    id: titleId,
    component: "Text",
    text: copy.formatTitle(request.sceneTitle),
    variant: "h3",
  });
  childIds.push(titleId);

  const descriptionId = `${request.gateKey}:description`;
  components.push({
    id: descriptionId,
    component: "Text",
    text: request.sceneSummary || copy.fallbackDescription,
    variant: "caption",
  });
  childIds.push(descriptionId);

  const prefillHint = normalizeOptionalText(prefill?.hint);
  if (prefillHint) {
    const hintId = `${request.gateKey}:prefill-hint`;
    components.push({
      id: hintId,
      component: "Text",
      text: prefillHint,
      variant: "caption",
    });
    childIds.push(hintId);
  }

  for (const field of request.fields) {
    if (field.kind === "project") {
      buildProjectFieldComponent(
        field,
        projects,
        prefill,
        components,
        childIds,
        copy,
      );
      continue;
    }

    buildSlotFieldComponent(field, prefill, components, childIds);
  }

  const rootId = `${request.gateKey}:root`;
  components.push({
    id: rootId,
    component: "Column",
    children: childIds,
    gap: 16,
    align: "stretch",
  });

  return {
    id: `scene-gate:${request.gateKey}`,
    root: rootId,
    components,
    data: {},
    submitAction: {
      label: copy.submitLabel,
      action: {
        name: "submit",
      },
    },
  };
}

export function readRuntimeSceneGateSubmission(params: {
  request: RuntimeSceneGateRequest;
  formData: A2UIFormData;
  prefill?: RuntimeSceneGatePrefill;
}): RuntimeSceneGateSubmission {
  const slotValues: Record<string, string> = {};
  let projectId: string | undefined;
  const missingFieldLabels: string[] = [];

  for (const field of params.request.fields) {
    const submittedValue =
      readServiceSkillSlotValueFromA2UIFormData(params.formData, field.key) ||
      (field.kind === "project"
        ? normalizeOptionalText(params.prefill?.projectId)
        : normalizeOptionalText(params.prefill?.slotValues?.[field.key]));
    if (!submittedValue) {
      if (field.required) {
        missingFieldLabels.push(field.label);
      }
      continue;
    }

    if (field.kind === "project") {
      projectId = submittedValue;
      continue;
    }

    slotValues[field.key] = submittedValue;
  }

  return {
    slotValues,
    projectId,
    missingFieldLabels,
  };
}

export function formatRuntimeSceneGateValidationMessage(
  request: RuntimeSceneGateRequest,
  copyInput?: RuntimeSceneGateCopy,
): string {
  const copy = resolveRuntimeSceneGateCopy(copyInput);
  const slotLabels = request.fields
    .filter(
      (field): field is RuntimeSceneGateSlotField => field.kind === "slot",
    )
    .map((field) => field.label.trim())
    .filter(Boolean);
  const requiresProject = request.fields.some(
    (field) => field.kind === "project",
  );

  if (slotLabels.length > 0 && requiresProject) {
    return copy.formatMissingSlotsAndProject(
      slotLabels,
      copy.projectFieldLabel,
    );
  }

  if (slotLabels.length > 0) {
    return copy.formatMissingSlots(slotLabels);
  }

  if (requiresProject) {
    return copy.missingProject;
  }

  return copy.missingDefault;
}

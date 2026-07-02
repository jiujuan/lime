export type ModelSkillLaunchKey =
  | "image_command_intent"
  | "cover_skill_launch"
  | "video_skill_launch"
  | "broadcast_skill_launch"
  | "resource_search_skill_launch"
  | "research_skill_launch"
  | "report_skill_launch"
  | "deep_search_skill_launch"
  | "site_search_skill_launch"
  | "pdf_read_skill_launch"
  | "summary_skill_launch"
  | "translation_skill_launch"
  | "analysis_skill_launch"
  | "transcription_skill_launch"
  | "url_parse_skill_launch"
  | "typesetting_skill_launch"
  | "presentation_skill_launch"
  | "form_skill_launch"
  | "webpage_skill_launch";

export type ModelSkillRequestContextKey =
  | "image_task"
  | "cover_task"
  | "video_task"
  | "broadcast_task"
  | "resource_search_task"
  | "research_request"
  | "report_request"
  | "deep_search_request"
  | "site_search_request"
  | "pdf_read_request"
  | "summary_request"
  | "translation_request"
  | "analysis_request"
  | "transcription_task"
  | "url_parse_task"
  | "typesetting_task"
  | "presentation_request"
  | "form_request"
  | "webpage_request";

export type ModelSkillName =
  | "image_generate"
  | "cover_generate"
  | "video_generate"
  | "broadcast_generate"
  | "modal_resource_search"
  | "research"
  | "report_generate"
  | "site_search"
  | "pdf_read"
  | "summary"
  | "translation"
  | "analysis"
  | "transcription_generate"
  | "url_parse"
  | "typesetting"
  | "presentation_generate"
  | "form_generate"
  | "webpage_generate";

export type SessionBoundRequestContextKey = Extract<
  ModelSkillRequestContextKey,
  | "image_task"
  | "cover_task"
  | "video_task"
  | "broadcast_task"
  | "resource_search_task"
  | "transcription_task"
  | "url_parse_task"
  | "typesetting_task"
>;

export interface ModelSkillLaunchDescriptor {
  launchKey: ModelSkillLaunchKey;
  requestContextKey: ModelSkillRequestContextKey;
  defaultKind: ModelSkillRequestContextKey;
  skillName: ModelSkillName;
}

export const MODEL_SKILL_LAUNCH = {
  image: {
    launchKey: "image_command_intent",
    requestContextKey: "image_task",
    defaultKind: "image_task",
    skillName: "image_generate",
  },
  cover: {
    launchKey: "cover_skill_launch",
    requestContextKey: "cover_task",
    defaultKind: "cover_task",
    skillName: "cover_generate",
  },
  video: {
    launchKey: "video_skill_launch",
    requestContextKey: "video_task",
    defaultKind: "video_task",
    skillName: "video_generate",
  },
  broadcast: {
    launchKey: "broadcast_skill_launch",
    requestContextKey: "broadcast_task",
    defaultKind: "broadcast_task",
    skillName: "broadcast_generate",
  },
  resourceSearch: {
    launchKey: "resource_search_skill_launch",
    requestContextKey: "resource_search_task",
    defaultKind: "resource_search_task",
    skillName: "modal_resource_search",
  },
  research: {
    launchKey: "research_skill_launch",
    requestContextKey: "research_request",
    defaultKind: "research_request",
    skillName: "research",
  },
  report: {
    launchKey: "report_skill_launch",
    requestContextKey: "report_request",
    defaultKind: "report_request",
    skillName: "report_generate",
  },
  deepSearch: {
    launchKey: "deep_search_skill_launch",
    requestContextKey: "deep_search_request",
    defaultKind: "deep_search_request",
    skillName: "research",
  },
  siteSearch: {
    launchKey: "site_search_skill_launch",
    requestContextKey: "site_search_request",
    defaultKind: "site_search_request",
    skillName: "site_search",
  },
  pdfRead: {
    launchKey: "pdf_read_skill_launch",
    requestContextKey: "pdf_read_request",
    defaultKind: "pdf_read_request",
    skillName: "pdf_read",
  },
  summary: {
    launchKey: "summary_skill_launch",
    requestContextKey: "summary_request",
    defaultKind: "summary_request",
    skillName: "summary",
  },
  translation: {
    launchKey: "translation_skill_launch",
    requestContextKey: "translation_request",
    defaultKind: "translation_request",
    skillName: "translation",
  },
  analysis: {
    launchKey: "analysis_skill_launch",
    requestContextKey: "analysis_request",
    defaultKind: "analysis_request",
    skillName: "analysis",
  },
  transcription: {
    launchKey: "transcription_skill_launch",
    requestContextKey: "transcription_task",
    defaultKind: "transcription_task",
    skillName: "transcription_generate",
  },
  urlParse: {
    launchKey: "url_parse_skill_launch",
    requestContextKey: "url_parse_task",
    defaultKind: "url_parse_task",
    skillName: "url_parse",
  },
  typesetting: {
    launchKey: "typesetting_skill_launch",
    requestContextKey: "typesetting_task",
    defaultKind: "typesetting_task",
    skillName: "typesetting",
  },
  presentation: {
    launchKey: "presentation_skill_launch",
    requestContextKey: "presentation_request",
    defaultKind: "presentation_request",
    skillName: "presentation_generate",
  },
  form: {
    launchKey: "form_skill_launch",
    requestContextKey: "form_request",
    defaultKind: "form_request",
    skillName: "form_generate",
  },
  webpage: {
    launchKey: "webpage_skill_launch",
    requestContextKey: "webpage_request",
    defaultKind: "webpage_request",
    skillName: "webpage_generate",
  },
} as const satisfies Record<string, ModelSkillLaunchDescriptor>;

export type ModelSkillLaunchId = keyof typeof MODEL_SKILL_LAUNCH;

export const MODEL_SKILL_LAUNCH_DESCRIPTORS = Object.values(
  MODEL_SKILL_LAUNCH,
) as readonly ModelSkillLaunchDescriptor[];

export const SESSION_BOUND_MODEL_SKILL_LAUNCHES = [
  MODEL_SKILL_LAUNCH.image,
  MODEL_SKILL_LAUNCH.cover,
  MODEL_SKILL_LAUNCH.video,
  MODEL_SKILL_LAUNCH.broadcast,
  MODEL_SKILL_LAUNCH.resourceSearch,
  MODEL_SKILL_LAUNCH.transcription,
  MODEL_SKILL_LAUNCH.urlParse,
  MODEL_SKILL_LAUNCH.typesetting,
] as const satisfies readonly (ModelSkillLaunchDescriptor & {
  requestContextKey: SessionBoundRequestContextKey;
})[];

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }
  return value as Record<string, unknown>;
}

export function buildModelSkillLaunchRequestMetadata(
  descriptor: ModelSkillLaunchDescriptor,
  existingMetadata: Record<string, unknown> | undefined,
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  const scopedRequestContext = asRecord(
    requestContext[descriptor.requestContextKey],
  );
  const existingHarness = asRecord(existingMetadata?.harness);

  if (descriptor.launchKey === "image_command_intent") {
    const currentHarness = { ...(existingHarness || {}) };
    delete currentHarness.allow_model_skills;
    delete currentHarness.image_skill_launch;
    delete currentHarness.imageSkillLaunch;

    return {
      ...(existingMetadata || {}),
      harness: {
        ...currentHarness,
        image_command_intent: {
          kind:
            typeof requestContext.kind === "string"
              ? requestContext.kind
              : descriptor.defaultKind,
          ...(scopedRequestContext
            ? {
                image_task: scopedRequestContext,
              }
            : { request_context: requestContext }),
        },
      },
    };
  }

  return {
    ...(existingMetadata || {}),
    harness: {
      ...(existingHarness || {}),
      allow_model_skills: true,
      [descriptor.launchKey]: {
        skill_name: descriptor.skillName,
        kind:
          typeof requestContext.kind === "string"
            ? requestContext.kind
            : descriptor.defaultKind,
        ...(scopedRequestContext
          ? {
              [descriptor.requestContextKey]: scopedRequestContext,
            }
          : { request_context: requestContext }),
      },
    },
  };
}

function buildLaunchRequestMetadata(
  descriptor: ModelSkillLaunchDescriptor,
  existingMetadata: Record<string, unknown> | undefined,
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  return buildModelSkillLaunchRequestMetadata(
    descriptor,
    existingMetadata,
    requestContext,
  );
}

export function buildModelSkillLaunchRequestMetadataFor(
  launchId: ModelSkillLaunchId,
  existingMetadata: Record<string, unknown> | undefined,
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  return buildLaunchRequestMetadata(
    MODEL_SKILL_LAUNCH[launchId],
    existingMetadata,
    requestContext,
  );
}

export function buildImageCommandIntentRequestMetadata(
  existingMetadata: Record<string, unknown> | undefined,
  requestContext: Record<string, unknown>,
): Record<string, unknown> {
  return buildModelSkillLaunchRequestMetadataFor(
    "image",
    existingMetadata,
    requestContext,
  );
}

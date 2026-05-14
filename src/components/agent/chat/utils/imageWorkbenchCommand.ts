import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogCommandEntries,
  type SkillCatalogCommandEntry,
} from "@/lib/api/skillCatalog";

export type ImageWorkbenchCommandTrigger = string;

export type ImageWorkbenchCommandMode = "generate" | "edit" | "variation";

const MAX_IMAGE_WORKBENCH_COUNT = 16;
const STORYBOARD_3X3_REGEX =
  /(?:\b3\s*[x×*]\s*3\b|九宫格|storyboard)(?:\s*(?:分镜(?:板|版)?|网格图))?/i;

interface ImageWorkbenchCommandDefinition {
  commandKey: string;
  trigger: string;
  mode?: ImageWorkbenchCommandMode;
  layoutHint?: string;
  count?: number;
  providerId?: string;
  modelId?: string;
  entrySource?: string;
  executorMode?: "images_api" | "responses_image_generation";
  priority?: number;
}

export interface ParsedImageWorkbenchCommand {
  rawText: string;
  commandKey?: string;
  trigger: ImageWorkbenchCommandTrigger;
  body: string;
  mode: ImageWorkbenchCommandMode;
  prompt: string;
  count: number;
  layoutHint?: string;
  size?: string;
  aspectRatio?: string;
  targetRef?: string;
  providerId?: string;
  modelId?: string;
  entrySource?: string;
  executorMode?: "images_api" | "responses_image_generation";
}

const TARGET_REF_REGEX = /#(img-[a-z0-9_-]+)/i;
const SIZE_REGEX = /\b(\d{3,4}x\d{3,4})\b/i;
const ASPECT_RATIO_REGEX = /\b(1:1|16:9|9:16|4:3|3:4|3:2|2:3|21:9|4:5|5:4)\b/i;

function isImageWorkbenchCommandEntry(
  entry: SkillCatalogCommandEntry,
): boolean {
  return (
    entry.binding?.requestDefaults?.imageWorkbench === "true" ||
    entry.binding?.requestDefaults?.image_workbench === "true"
  );
}

function readCommandRequestDefault(
  entry: SkillCatalogCommandEntry,
  ...keys: string[]
): string | undefined {
  const defaults = entry.binding?.requestDefaults;
  if (!defaults) {
    return undefined;
  }

  for (const key of keys) {
    const value = defaults[key]?.trim();
    if (value) {
      return value;
    }
  }
  return undefined;
}

function readCommandExecutorMode(
  entry: SkillCatalogCommandEntry,
): ImageWorkbenchCommandDefinition["executorMode"] {
  const value = readCommandRequestDefault(
    entry,
    "executorMode",
    "executor_mode",
  );
  return value === "images_api" || value === "responses_image_generation"
    ? value
    : undefined;
}

function buildImageWorkbenchCommandDefinitions(): ImageWorkbenchCommandDefinition[] {
  const definitions = listSkillCatalogCommandEntries(
    getCurrentSkillCatalogSnapshot(),
  )
    .filter(isImageWorkbenchCommandEntry)
    .flatMap((entry) =>
      entry.triggers.map((trigger) => {
        const providerId = readCommandRequestDefault(
          entry,
          "providerId",
          "provider_id",
        );
        const modelId = readCommandRequestDefault(
          entry,
          "model",
          "modelId",
          "model_id",
        );
        const modeDefault = readCommandRequestDefault(entry, "mode");
        const mode: ImageWorkbenchCommandMode | undefined =
          modeDefault === "edit" ||
          modeDefault === "variation" ||
          modeDefault === "generate"
            ? modeDefault
            : undefined;
        const layoutHint = readCommandRequestDefault(
          entry,
          "layoutHint",
          "layout_hint",
        );
        const entrySource = readCommandRequestDefault(
          entry,
          "entrySource",
          "entry_source",
        );
        const executorMode = readCommandExecutorMode(entry);
        const count = Number(readCommandRequestDefault(entry, "count")) || 0;
        const definition: ImageWorkbenchCommandDefinition = {
          commandKey: entry.commandKey,
          trigger: trigger.prefix,
          priority: entry.commandKey.startsWith("image_model_")
            ? 3
            : providerId
              ? 2
              : modelId
                ? 1
                : 0,
        };
        if (mode) {
          definition.mode = mode;
        }
        if (layoutHint) {
          definition.layoutHint = layoutHint;
        }
        if (count > 0) {
          definition.count = count;
        }
        if (providerId) {
          definition.providerId = providerId;
        }
        if (modelId) {
          definition.modelId = modelId;
        }
        if (entrySource) {
          definition.entrySource = entrySource;
        }
        if (executorMode) {
          definition.executorMode = executorMode;
        }
        return definition;
      }),
    );

  return definitions.sort(
    (left, right) =>
      right.trigger.length - left.trigger.length ||
      (right.priority ?? 0) - (left.priority ?? 0),
  );
}

function matchImageWorkbenchCommandPrefix(
  text: string,
): { definition: ImageWorkbenchCommandDefinition; body: string } | null {
  const trimmed = text.trimStart();
  if (!trimmed) {
    return null;
  }

  for (const definition of buildImageWorkbenchCommandDefinitions()) {
    const prefix = trimmed.slice(0, definition.trigger.length);
    if (prefix.toLowerCase() !== definition.trigger.toLowerCase()) {
      continue;
    }
    const nextChar = trimmed.charAt(definition.trigger.length);
    if (nextChar && !/\s/u.test(nextChar)) {
      continue;
    }
    return {
      definition,
      body: trimmed.slice(definition.trigger.length).trim(),
    };
  }
  return null;
}

function clampCount(value: number | null | undefined): number {
  if (!value || !Number.isFinite(value)) {
    return 1;
  }
  return Math.max(1, Math.min(MAX_IMAGE_WORKBENCH_COUNT, Math.trunc(value)));
}

function extractExplicitCount(body: string): number | undefined {
  const patterns = [
    /(?:出|生成|要)\s*(\d+)\s*张/i,
    /(\d+)\s*张/i,
    /\bx\s*(\d+)\b/i,
  ];

  for (const pattern of patterns) {
    const matched = body.match(pattern);
    if (matched) {
      return clampCount(Number.parseInt(matched[1] || "", 10));
    }
  }

  return undefined;
}

function resolveLayoutHint(params: {
  commandDefinition: ImageWorkbenchCommandDefinition;
  body: string;
  explicitCount?: number;
}): string | undefined {
  if (STORYBOARD_3X3_REGEX.test(params.body)) {
    return "storyboard_3x3";
  }

  if (
    params.commandDefinition.layoutHint &&
    (params.explicitCount == null || params.explicitCount === 9)
  ) {
    return params.commandDefinition.layoutHint;
  }

  return undefined;
}

function extractCount(params: {
  commandDefinition: ImageWorkbenchCommandDefinition;
  explicitCount?: number;
  layoutHint?: string;
}): number {
  const { commandDefinition, explicitCount, layoutHint } = params;
  if (layoutHint === "storyboard_3x3") {
    return 9;
  }

  if (explicitCount != null) {
    return explicitCount;
  }

  return clampCount(commandDefinition.count || 1);
}

function resolveMode(
  commandDefinition: ImageWorkbenchCommandDefinition,
  normalizedBody: string,
  targetRef?: string,
): ImageWorkbenchCommandMode {
  if (commandDefinition.mode) {
    return commandDefinition.mode;
  }
  if (/^(编辑|edit|修改)(?:\s|$|[:：])/i.test(normalizedBody)) {
    return "edit";
  }
  if (/^(重绘|变体|variation|variant)(?:\s|$|[:：])/i.test(normalizedBody)) {
    return "variation";
  }
  if (/^(生成|create|generate)(?:\s|$|[:：])/i.test(normalizedBody)) {
    return "generate";
  }
  return targetRef ? "variation" : "generate";
}

function stripPromptDecorations(body: string, layoutHint?: string): string {
  const normalizedBody = layoutHint
    ? body
        .replace(
          /(?:\b3\s*[x×*]\s*3\b|九宫格|storyboard)(?:\s*(?:分镜(?:板|版)?|网格图))?/gi,
          "",
        )
        .replace(/\b分镜(?:板|版)?\b/gi, "")
    : body;

  return normalizedBody
    .replace(/^(生成|create|generate)(?:\s|$|[:：])*/i, "")
    .replace(/^(编辑|edit|修改)(?:\s|$|[:：])*/i, "")
    .replace(/^(重绘|变体|variation|variant)(?:\s|$|[:：])*/i, "")
    .replace(TARGET_REF_REGEX, "")
    .replace(/(?:出|生成|要)\s*\d+\s*张/gi, "")
    .replace(/\d+\s*张/gi, "")
    .replace(/\bx\s*\d+\b/gi, "")
    .replace(SIZE_REGEX, "")
    .replace(ASPECT_RATIO_REGEX, "")
    .replace(/[，,]\s*[，,]+/g, "，")
    .replace(/^[,\s，。；;:：]+|[,\s，。；;:：]+$/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function resolveSize(body: string): { size?: string; aspectRatio?: string } {
  const explicitSize = body.match(SIZE_REGEX)?.[1];
  if (explicitSize) {
    return { size: explicitSize };
  }

  const aspectRatio = body.match(ASPECT_RATIO_REGEX)?.[1];
  if (!aspectRatio) {
    return {};
  }

  const mappedSizes: Record<string, string> = {
    "1:1": "1024x1024",
    "16:9": "1792x1024",
    "21:9": "1792x1024",
    "4:3": "1152x864",
    "3:2": "1344x768",
    "5:4": "1152x864",
    "9:16": "1024x1792",
    "3:4": "864x1152",
    "2:3": "768x1344",
    "4:5": "864x1152",
  };

  return {
    size: mappedSizes[aspectRatio],
    aspectRatio,
  };
}

export function parseImageWorkbenchCommand(
  text: string,
): ParsedImageWorkbenchCommand | null {
  const matched = matchImageWorkbenchCommandPrefix(text);
  if (!matched) {
    return null;
  }

  const { definition, body } = matched;
  const targetRef = body.match(TARGET_REF_REGEX)?.[1];
  const normalizedBody = body.trim();
  const mode = resolveMode(definition, normalizedBody, targetRef);
  const explicitCount = extractExplicitCount(normalizedBody);
  const layoutHint = resolveLayoutHint({
    commandDefinition: definition,
    body: normalizedBody,
    explicitCount,
  });
  const { size, aspectRatio } = resolveSize(normalizedBody);

  return {
    rawText: text,
    commandKey: definition.commandKey,
    trigger: definition.trigger,
    body,
    mode,
    prompt: stripPromptDecorations(normalizedBody, layoutHint),
    count: extractCount({
      commandDefinition: definition,
      explicitCount,
      layoutHint,
    }),
    layoutHint,
    size,
    aspectRatio,
    targetRef,
    ...(definition.providerId ? { providerId: definition.providerId } : {}),
    ...(definition.modelId ? { modelId: definition.modelId } : {}),
    ...(definition.entrySource ? { entrySource: definition.entrySource } : {}),
    ...(definition.executorMode
      ? { executorMode: definition.executorMode }
      : {}),
  };
}

export function shouldRouteImageWorkbenchCommandToSkill(input: {
  parsedCommand: ParsedImageWorkbenchCommand;
  attachedImageCount?: number;
}): boolean {
  const { parsedCommand, attachedImageCount = 0 } = input;
  return (
    parsedCommand.mode === "generate" &&
    !parsedCommand.targetRef &&
    attachedImageCount === 0
  );
}

export function buildImageGenerateSkillSlashCommand(
  parsedCommand: ParsedImageWorkbenchCommand,
): string {
  const normalizedBody = parsedCommand.body.trim();
  if (!normalizedBody) {
    return "/image_generate";
  }
  if (
    parsedCommand.mode === "edit" &&
    !/^(编辑|edit|修改)(?:\s|$|[:：])/i.test(normalizedBody)
  ) {
    return `/image_generate 编辑 ${normalizedBody}`;
  }
  if (
    parsedCommand.mode === "variation" &&
    !/^(重绘|变体|variation|variant)(?:\s|$|[:：])/i.test(normalizedBody)
  ) {
    return `/image_generate 重绘 ${normalizedBody}`;
  }
  return `/image_generate ${normalizedBody}`;
}

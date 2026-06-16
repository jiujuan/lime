import { resolveOemCloudRuntimeContext } from "./oemCloudRuntime";
import { skillsApi, type AppType, type SkillInspection } from "./skills";
import { getLimeI18n } from "@/i18n/createI18n";

const DEFAULT_SKILL_MARKETPLACE_API_BASE_URL =
  "https://lime-api.limeai.run/api";
const DEFAULT_SKILL_MARKETPLACE_WEBSITE_BASE_URL = "https://limeai.run";
const STATIC_SKILL_MARKETPLACE_PATH = "/skills/";
const STATIC_SKILL_PACKAGE_BASE_PATH = "/skill-packages";

type SkillMarketplaceSource =
  | {
      kind: "api";
      baseUrl: string;
    }
  | {
      kind: "static";
      websiteBaseUrl: string;
    };

export interface SkillMarketplaceVisualAsset {
  kind?: string;
  url?: string;
  svg?: string;
  prompt?: string;
  generatedAt?: string;
}

export interface SkillMarketplaceBundleResourceSummary {
  hasScripts: boolean;
  hasReferences: boolean;
  hasAssets: boolean;
}

export interface SkillMarketplaceBundleStandardCompliance {
  isStandard: boolean;
  validationErrors?: string[];
  deprecatedFields?: string[];
}

export interface SkillMarketplaceBundleSummary {
  name: string;
  description: string;
  license?: string;
  compatibility?: string;
  metadata?: Record<string, string>;
  allowedTools?: string[];
  resourceSummary: SkillMarketplaceBundleResourceSummary;
  standardCompliance: SkillMarketplaceBundleStandardCompliance;
}

export interface SkillMarketplaceItem {
  id: string;
  name: string;
  aliases: string[];
  title: string;
  summary: string;
  category: string;
  outputHint: string;
  version: string;
  sort: number;
  icon?: SkillMarketplaceVisualAsset;
  cover?: SkillMarketplaceVisualAsset;
  contentHash?: string;
  bundle?: SkillMarketplaceBundleSummary;
  updatedAt?: string;
}

export interface SkillMarketplaceFile {
  path: string;
  content: string;
  encoding?: string;
  sha256?: string;
}

export interface SkillMarketplaceBundle {
  manifestVersion: string;
  name: string;
  aliases: string[];
  version: string;
  contentHash: string;
  fileCount: number;
  files: SkillMarketplaceFile[];
}

export interface SkillMarketplaceInstallResult {
  directory: string;
  inspection: SkillInspection;
}

interface SkillMarketplaceEnvelope {
  code: number;
  message?: string;
  data: unknown;
}

export interface ListSkillMarketplaceParams {
  query?: string;
  category?: string;
  sort?: string;
}

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeOptionalText(value: unknown): string | undefined {
  const normalized = normalizeText(value);
  return normalized ? normalized : undefined;
}

function normalizeBaseUrl(value: unknown): string | null {
  const normalized = normalizeText(value);
  return normalized ? normalized.replace(/\/+$/, "") : null;
}

function normalizeSkillPackageSlug(value: unknown): string | null {
  const normalized = normalizeText(value).toLowerCase();
  return /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/.test(normalized)
    ? normalized
    : null;
}

function tMarketplaceError(
  key: string,
  options?: Record<string, unknown>,
): string {
  const translate = getLimeI18n().t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return translate(`skills.workspace.marketplace.error.${key}`, {
    ns: "agent",
    ...(options || {}),
  });
}

function readEnvValue(name: string): string | null {
  const env = import.meta.env as Record<string, string | boolean | undefined>;
  const value = env[name];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function hasOwn(value: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isStringList(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isOptionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function isOptionalStringList(value: unknown): boolean {
  return value === undefined || isStringList(value);
}

function isMarketplaceSuccessCode(code: number): boolean {
  return code === 0 || code === 200;
}

function isOptionalStringRecord(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.values(value).every((item) => typeof item === "string"))
  );
}

function normalizeStringList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => normalizeText(item))
    .filter((item) => item.length > 0);
}

function normalizeStringRecord(
  value: unknown,
): Record<string, string> | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const result: Record<string, string> = {};
  for (const [key, item] of Object.entries(value)) {
    const normalizedKey = normalizeText(key);
    const normalizedValue = normalizeText(item);
    if (normalizedKey && normalizedValue) {
      result[normalizedKey] = normalizedValue;
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function normalizeVisualAsset(
  value: unknown,
): SkillMarketplaceVisualAsset | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const svg = normalizeOptionalText(value.svg);
  const url = normalizeOptionalText(value.url);
  if (!svg && !url) {
    return undefined;
  }
  return {
    kind: normalizeOptionalText(value.kind),
    url,
    svg,
    prompt: normalizeOptionalText(value.prompt),
    generatedAt: normalizeOptionalText(value.generatedAt),
  };
}

function normalizeResourceSummary(
  value: unknown,
): SkillMarketplaceBundleResourceSummary {
  const record = isRecord(value) ? value : {};
  return {
    hasScripts: Boolean(record.hasScripts),
    hasReferences: Boolean(record.hasReferences),
    hasAssets: Boolean(record.hasAssets),
  };
}

function normalizeStandardCompliance(
  value: unknown,
): SkillMarketplaceBundleStandardCompliance {
  const record = isRecord(value) ? value : {};
  return {
    isStandard: Boolean(record.isStandard),
    validationErrors: normalizeStringList(record.validationErrors),
    deprecatedFields: normalizeStringList(record.deprecatedFields),
  };
}

function normalizeBundleSummary(
  value: unknown,
): SkillMarketplaceBundleSummary | undefined {
  if (!isRecord(value)) {
    return undefined;
  }
  const name = normalizeText(value.name);
  const description = normalizeText(value.description);
  if (!name && !description) {
    return undefined;
  }
  return {
    name,
    description,
    license: normalizeOptionalText(value.license),
    compatibility: normalizeOptionalText(value.compatibility),
    metadata: normalizeStringRecord(value.metadata),
    allowedTools: normalizeStringList(value.allowedTools),
    resourceSummary: normalizeResourceSummary(value.resourceSummary),
    standardCompliance: normalizeStandardCompliance(value.standardCompliance),
  };
}

function assertMarketplaceVisualAsset(value: unknown): void {
  if (
    value !== undefined &&
    (!isRecord(value) ||
      !isOptionalString(value.kind) ||
      !isOptionalString(value.url) ||
      !isOptionalString(value.svg) ||
      !isOptionalString(value.prompt) ||
      !isOptionalString(value.generatedAt))
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
}

function assertResourceSummary(value: unknown): void {
  if (
    !isRecord(value) ||
    (value.hasScripts !== undefined && typeof value.hasScripts !== "boolean") ||
    (value.hasReferences !== undefined &&
      typeof value.hasReferences !== "boolean") ||
    (value.hasAssets !== undefined && typeof value.hasAssets !== "boolean")
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
}

function assertStandardCompliance(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.isStandard !== "boolean" ||
    !isOptionalStringList(value.validationErrors) ||
    !isOptionalStringList(value.deprecatedFields)
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
}

function assertBundleSummary(value: unknown): void {
  if (value === undefined) {
    return;
  }
  if (
    !isRecord(value) ||
    typeof value.name !== "string" ||
    typeof value.description !== "string" ||
    !isOptionalString(value.license) ||
    !isOptionalString(value.compatibility) ||
    !isOptionalStringRecord(value.metadata) ||
    !isOptionalStringList(value.allowedTools)
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
  assertResourceSummary(value.resourceSummary);
  assertStandardCompliance(value.standardCompliance);
}

function assertMarketplaceItem(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    !value.id.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !isOptionalStringList(value.aliases) ||
    typeof value.title !== "string" ||
    !value.title.trim() ||
    typeof value.summary !== "string" ||
    typeof value.category !== "string" ||
    typeof value.outputHint !== "string" ||
    typeof value.version !== "string" ||
    !isFiniteNumber(value.sort) ||
    !isOptionalString(value.contentHash) ||
    !isOptionalString(value.updatedAt)
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
  assertMarketplaceVisualAsset(value.icon);
  assertMarketplaceVisualAsset(value.cover);
  assertBundleSummary(value.bundle);
}

function assertMarketplaceListPayload(
  value: unknown,
): asserts value is { items: unknown[] } {
  if (!isRecord(value) || !Array.isArray(value.items)) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
  for (const item of value.items) {
    assertMarketplaceItem(item);
  }
}

function normalizeMarketplaceItem(value: unknown): SkillMarketplaceItem | null {
  if (!isRecord(value)) {
    return null;
  }
  const name = normalizeText(value.name);
  const id = normalizeText(value.id) || name;
  const title = normalizeText(value.title) || name;
  if (!id || !name || !title) {
    return null;
  }

  return {
    id,
    name,
    aliases: normalizeStringList(value.aliases),
    title,
    summary: normalizeText(value.summary),
    category: normalizeText(value.category),
    outputHint: normalizeText(value.outputHint),
    version: normalizeText(value.version),
    sort: typeof value.sort === "number" ? value.sort : 0,
    icon: normalizeVisualAsset(value.icon),
    cover: normalizeVisualAsset(value.cover),
    contentHash: normalizeOptionalText(value.contentHash),
    bundle: normalizeBundleSummary(value.bundle),
    updatedAt: normalizeOptionalText(value.updatedAt),
  };
}

function normalizeMarketplaceItems(value: unknown): SkillMarketplaceItem[] {
  assertMarketplaceListPayload(value);
  return value.items
    .map(normalizeMarketplaceItem)
    .filter((item): item is SkillMarketplaceItem => Boolean(item));
}

function readStaticMarketplaceVersion(value: unknown): string {
  const explicitVersion = normalizeOptionalText(
    isRecord(value) ? value.version : undefined,
  );
  if (explicitVersion) {
    return explicitVersion;
  }

  const meta = normalizeText(isRecord(value) ? value.meta : undefined);
  const parts = meta
    .split(/[·|]/)
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.at(-1) ?? "";
}

function normalizeStaticMarketplaceItem(
  value: unknown,
  index: number,
): SkillMarketplaceItem | null {
  if (!isRecord(value)) {
    return null;
  }

  const launch = isRecord(value.launch) ? value.launch : null;
  if (normalizeText(launch?.type) !== "service_skill") {
    return null;
  }

  const slug = normalizeSkillPackageSlug(value.slug);
  const skillName = normalizeSkillPackageSlug(launch?.skillId) ?? slug;
  if (!slug || !skillName) {
    return null;
  }

  const title = normalizeText(value.title) || skillName;
  const description = normalizeText(value.description);
  const summary = normalizeText(value.summary) || description;

  return {
    id: `official:${skillName}`,
    name: skillName,
    aliases: [],
    title,
    summary,
    category: normalizeText(value.category),
    outputHint: description || summary,
    version: readStaticMarketplaceVersion(value),
    sort: index,
  };
}

function decodeNextFlightEscapedText(value: string): string {
  return value
    .replace(/\\u([0-9a-fA-F]{4})/g, (_match, hex: string) =>
      String.fromCharCode(Number.parseInt(hex, 16)),
    )
    .replace(/\\(["\\/bfnrt])/g, (_match, token: string) => {
      switch (token) {
        case '"':
          return '"';
        case "\\":
          return "\\";
        case "/":
          return "/";
        case "b":
          return "\b";
        case "f":
          return "\f";
        case "n":
          return "\n";
        case "r":
          return "\r";
        case "t":
          return "\t";
        default:
          return token;
      }
    });
}

function extractJsonValue(source: string, startIndex: number): string | null {
  const opening = source[startIndex];
  const closing = opening === "[" ? "]" : opening === "{" ? "}" : null;
  if (!closing) {
    return null;
  }

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let index = startIndex; index < source.length; index += 1) {
    const char = source[index];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === '"') {
        inString = false;
      }
      continue;
    }

    if (char === '"') {
      inString = true;
      continue;
    }
    if (char === opening) {
      depth += 1;
      continue;
    }
    if (char === closing) {
      depth -= 1;
      if (depth === 0) {
        return source.slice(startIndex, index + 1);
      }
    }
  }

  return null;
}

function parseStaticMarketplaceItems(html: string): SkillMarketplaceItem[] {
  const decoded = decodeNextFlightEscapedText(html);
  const marker = '"skills":[';
  const itemsByName = new Map<string, SkillMarketplaceItem>();
  let searchStart = 0;
  let globalIndex = 0;

  while (searchStart < decoded.length) {
    const markerIndex = decoded.indexOf(marker, searchStart);
    if (markerIndex < 0) {
      break;
    }

    const arrayStart = markerIndex + marker.length - 1;
    const json = extractJsonValue(decoded, arrayStart);
    if (json) {
      try {
        const payload = JSON.parse(json) as unknown;
        if (Array.isArray(payload)) {
          for (const value of payload) {
            const item = normalizeStaticMarketplaceItem(value, globalIndex);
            globalIndex += 1;
            if (item && !itemsByName.has(item.name)) {
              itemsByName.set(item.name, item);
            }
          }
        }
      } catch {
        // Continue scanning; malformed chunks are ignored and fail closed below.
      }
    }

    searchStart = arrayStart + Math.max(json?.length ?? 1, 1);
  }

  const items = Array.from(itemsByName.values());
  if (items.length === 0) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }
  return items;
}

function filterStaticMarketplaceItems(
  items: SkillMarketplaceItem[],
  params: ListSkillMarketplaceParams,
): SkillMarketplaceItem[] {
  const query = normalizeText(params.query).toLowerCase();
  const category = normalizeText(params.category).toLowerCase();

  return items.filter((item) => {
    if (category && item.category.toLowerCase() !== category) {
      return false;
    }
    if (!query) {
      return true;
    }
    const searchable = [
      item.name,
      item.title,
      item.summary,
      item.category,
      item.outputHint,
    ]
      .join("\n")
      .toLowerCase();
    return searchable.includes(query);
  });
}

function assertMarketplaceFile(value: unknown): void {
  if (
    !isRecord(value) ||
    typeof value.path !== "string" ||
    !value.path.trim() ||
    typeof value.content !== "string" ||
    !isOptionalString(value.encoding) ||
    !isOptionalString(value.sha256)
  ) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }
}

function normalizeMarketplaceFile(value: unknown): SkillMarketplaceFile | null {
  if (!isRecord(value)) {
    return null;
  }
  const path = normalizeText(value.path);
  const content = typeof value.content === "string" ? value.content : "";
  if (!path) {
    return null;
  }
  return {
    path,
    content,
    encoding: normalizeOptionalText(value.encoding),
    sha256: normalizeOptionalText(value.sha256),
  };
}

function assertMarketplaceBundle(value: unknown): void {
  if (!isRecord(value)) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }

  const fileCount = value.fileCount;
  if (
    typeof fileCount !== "number" ||
    !Number.isInteger(fileCount) ||
    fileCount < 1
  ) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }

  if (
    typeof value.manifestVersion !== "string" ||
    !value.manifestVersion.trim() ||
    typeof value.name !== "string" ||
    !value.name.trim() ||
    !isOptionalStringList(value.aliases) ||
    typeof value.version !== "string" ||
    typeof value.contentHash !== "string" ||
    !Array.isArray(value.files) ||
    value.files.length === 0 ||
    fileCount !== value.files.length
  ) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }
  for (const file of value.files) {
    assertMarketplaceFile(file);
  }
}

function normalizeMarketplaceBundle(
  value: unknown,
): SkillMarketplaceBundle | null {
  assertMarketplaceBundle(value);
  if (!isRecord(value)) {
    return null;
  }
  const name = normalizeText(value.name);
  const files = Array.isArray(value.files)
    ? value.files
        .map(normalizeMarketplaceFile)
        .filter((file): file is SkillMarketplaceFile => Boolean(file))
    : [];
  if (!name || files.length === 0) {
    return null;
  }
  return {
    manifestVersion: normalizeText(value.manifestVersion) || "agentskills.v1",
    name,
    aliases: normalizeStringList(value.aliases),
    version: normalizeText(value.version),
    contentHash: normalizeText(value.contentHash),
    fileCount:
      typeof value.fileCount === "number" ? value.fileCount : files.length,
    files,
  };
}

function readEnvelopeMessage(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.message !== "string") {
    return null;
  }
  const message = payload.message.trim();
  return message || null;
}

function assertMarketplaceEnvelope(
  payload: unknown,
): asserts payload is SkillMarketplaceEnvelope {
  if (
    !isRecord(payload) ||
    typeof payload.code !== "number" ||
    !isOptionalString(payload.message) ||
    !hasOwn(payload, "data")
  ) {
    throw new Error(tMarketplaceError("invalidResponse"));
  }

  if (!isMarketplaceSuccessCode(payload.code)) {
    throw new Error(
      readEnvelopeMessage(payload) || tMarketplaceError("invalidResponse"),
    );
  }
}

async function requestMarketplaceJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      readEnvelopeMessage(payload) ||
        tMarketplaceError("requestFailed", { status: response.status }),
    );
  }

  assertMarketplaceEnvelope(payload);

  return payload.data as T;
}

async function requestStaticMarketplaceHtml(url: string): Promise<string> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "text/html" },
  });

  const html = await response.text();
  if (!response.ok) {
    throw new Error(
      tMarketplaceError("requestFailed", { status: response.status }),
    );
  }

  return html;
}

async function requestStaticMarketplaceJson<T>(url: string): Promise<T> {
  const response = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
  });

  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(
      tMarketplaceError("requestFailed", { status: response.status }),
    );
  }

  return payload as T;
}

function resolveSkillMarketplaceSource(): SkillMarketplaceSource {
  const explicitBaseUrl = normalizeBaseUrl(
    readEnvValue("VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL") ??
      readEnvValue("VITE_LIME_CONTROL_PLANE_API_BASE_URL"),
  );
  if (explicitBaseUrl) {
    return { kind: "api", baseUrl: explicitBaseUrl };
  }

  return {
    kind: "static",
    websiteBaseUrl:
      normalizeBaseUrl(
        readEnvValue("VITE_LIME_SKILL_MARKETPLACE_WEBSITE_URL"),
      ) ??
      DEFAULT_SKILL_MARKETPLACE_WEBSITE_BASE_URL,
  };
}

function buildStaticMarketplaceUrl(
  source: Extract<SkillMarketplaceSource, { kind: "static" }>,
): string {
  return `${source.websiteBaseUrl}${STATIC_SKILL_MARKETPLACE_PATH}`;
}

function buildStaticSkillPackageUrl(
  source: Extract<SkillMarketplaceSource, { kind: "static" }>,
  skillName: string,
  fileName: string,
): string {
  const slug = normalizeSkillPackageSlug(skillName);
  if (!slug) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }
  return `${source.websiteBaseUrl}${STATIC_SKILL_PACKAGE_BASE_PATH}/${encodeURIComponent(
    slug,
  )}/latest/${encodeURIComponent(fileName)}`;
}

export function resolveSkillMarketplaceApiBaseUrl(): string {
  const explicitBaseUrl = normalizeBaseUrl(
    readEnvValue("VITE_LIME_SKILL_MARKETPLACE_API_BASE_URL") ??
      readEnvValue("VITE_LIME_CONTROL_PLANE_API_BASE_URL"),
  );
  if (explicitBaseUrl) {
    return explicitBaseUrl;
  }

  const runtime = resolveOemCloudRuntimeContext();
  if (runtime?.controlPlaneBaseUrl) {
    return runtime.controlPlaneBaseUrl;
  }

  return DEFAULT_SKILL_MARKETPLACE_API_BASE_URL;
}

export async function listOfficialSkillMarketplace(
  params: ListSkillMarketplaceParams = {},
): Promise<SkillMarketplaceItem[]> {
  const source = resolveSkillMarketplaceSource();
  if (source.kind === "static") {
    const html = await requestStaticMarketplaceHtml(
      buildStaticMarketplaceUrl(source),
    );
    return filterStaticMarketplaceItems(
      parseStaticMarketplaceItems(html),
      params,
    );
  }

  const search = new URLSearchParams();
  if (params.query?.trim()) {
    search.set("query", params.query.trim());
  }
  if (params.category?.trim()) {
    search.set("category", params.category.trim());
  }
  if (params.sort?.trim()) {
    search.set("sort", params.sort.trim());
  }

  const query = search.toString();
  const data = await requestMarketplaceJson<unknown>(
    `${source.baseUrl}/v1/public/service-skills/marketplace${
      query ? `?${query}` : ""
    }`,
  );
  return normalizeMarketplaceItems(data);
}

export async function getOfficialSkillMarketplaceBundle(
  skillName: string,
): Promise<SkillMarketplaceBundle> {
  const normalizedSkillName = skillName.trim();
  if (!normalizedSkillName) {
    throw new Error(tMarketplaceError("skillNameRequired"));
  }

  const source = resolveSkillMarketplaceSource();
  if (source.kind === "static") {
    const data = await requestStaticMarketplaceJson<unknown>(
      buildStaticSkillPackageUrl(source, normalizedSkillName, "bundle.json"),
    );
    const bundle = normalizeMarketplaceBundle(data);
    if (!bundle) {
      throw new Error(tMarketplaceError("invalidBundle"));
    }
    return bundle;
  }

  const data = await requestMarketplaceJson<unknown>(
    `${source.baseUrl}/v1/public/service-skills/marketplace/${encodeURIComponent(
      normalizedSkillName,
    )}/bundle`,
  );
  const bundle = normalizeMarketplaceBundle(data);
  if (!bundle) {
    throw new Error(tMarketplaceError("invalidBundle"));
  }
  return bundle;
}

export async function installOfficialMarketplaceSkill(
  skillName: string,
  app: AppType = "lime",
): Promise<SkillMarketplaceInstallResult> {
  const source = resolveSkillMarketplaceSource();
  if (source.kind === "static") {
    const normalizedSkillName = skillName.trim();
    if (!normalizedSkillName) {
      throw new Error(tMarketplaceError("skillNameRequired"));
    }
    const slug = normalizeSkillPackageSlug(normalizedSkillName);
    if (!slug) {
      throw new Error(tMarketplaceError("invalidBundle"));
    }
    return skillsApi.installFromDownloadUrl(
      {
        skillName: slug,
        downloadUrl: buildStaticSkillPackageUrl(source, slug, `${slug}.zip`),
      },
      app,
    );
  }

  const bundle = await getOfficialSkillMarketplaceBundle(skillName);
  return skillsApi.installMarketplaceBundle(bundle, app);
}

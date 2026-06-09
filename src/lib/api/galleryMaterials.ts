import {
  APP_SERVER_METHOD_GALLERY_MATERIAL_GET,
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY,
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY,
  APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_MOOD,
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_CREATE,
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_DELETE,
  APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_UPDATE,
  createAppServerClient,
} from "./appServer";
import type {
  ColorMood,
  CreateGalleryMetadataRequest,
  GalleryMaterial,
  GalleryMaterialMetadata,
  ImageCategory,
  LayoutCategory,
} from "@/types/gallery-material";

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function assertNotErrorEnvelope(command: string, value: unknown): void {
  const hasErrorEnvelope =
    (isRecord(value) && "error" in value) ||
    (Array.isArray(value) &&
      value.some((item) => isRecord(item) && "error" in item));
  if (hasErrorEnvelope) {
    throw new Error(`${command} returned an error envelope`);
  }
}

function unwrapResponseField<T>(
  command: string,
  response: unknown,
  field: string,
): T {
  assertNotErrorEnvelope(command, response);
  if (!isRecord(response) || !(field in response)) {
    throw new Error(`${command} did not return ${field}`);
  }
  const result = response[field];
  assertNotErrorEnvelope(command, result);
  return result as T;
}

function isOptionalString(value: unknown): value is string | undefined {
  return value === undefined || typeof value === "string";
}

function isOptionalFiniteNumber(value: unknown): value is number | undefined {
  return (
    value === undefined || (typeof value === "number" && Number.isFinite(value))
  );
}

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((item) => typeof item === "string")
  );
}

function isGalleryMaterialMetadata(
  value: unknown,
): value is GalleryMaterialMetadata {
  return (
    isRecord(value) &&
    typeof value.materialId === "string" &&
    isStringArray(value.colors) &&
    isOptionalFiniteNumber(value.width) &&
    isOptionalFiniteNumber(value.height) &&
    isOptionalString(value.thumbnail) &&
    isOptionalString(value.colorSchemeJson) &&
    isOptionalFiniteNumber(value.elementCount) &&
    isOptionalString(value.preview) &&
    isOptionalString(value.fabricJson) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    typeof value.updatedAt === "number" &&
    Number.isFinite(value.updatedAt)
  );
}

function isGalleryMaterial(value: unknown): value is GalleryMaterial {
  return (
    isRecord(value) &&
    typeof value.id === "string" &&
    typeof value.projectId === "string" &&
    typeof value.name === "string" &&
    typeof value.type === "string" &&
    isOptionalString(value.filePath) &&
    isOptionalFiniteNumber(value.fileSize) &&
    isOptionalString(value.mimeType) &&
    isOptionalString(value.content) &&
    isStringArray(value.tags) &&
    isOptionalString(value.description) &&
    typeof value.createdAt === "number" &&
    Number.isFinite(value.createdAt) &&
    (value.metadata === undefined || isGalleryMaterialMetadata(value.metadata))
  );
}

function assertGalleryMaterialOrNull(
  command: string,
  value: unknown,
): asserts value is GalleryMaterial | null {
  if (value !== null && !isGalleryMaterial(value)) {
    throw new Error(`${command} did not return gallery material`);
  }
}

function assertGalleryMaterialMetadata(
  command: string,
  value: unknown,
): asserts value is GalleryMaterialMetadata {
  if (!isGalleryMaterialMetadata(value)) {
    throw new Error(`${command} did not return gallery material metadata`);
  }
}

function assertGalleryMaterialList(
  command: string,
  value: unknown,
): asserts value is GalleryMaterial[] {
  if (!Array.isArray(value) || !value.every(isGalleryMaterial)) {
    throw new Error(`${command} did not return gallery materials`);
  }
}

function assertVoidResult(command: string, value: unknown): void {
  if (
    value !== undefined &&
    value !== null &&
    (!isRecord(value) || Object.keys(value).length > 0)
  ) {
    throw new Error(`${command} did not return void result`);
  }
}

export async function getGalleryMaterial(
  materialId: string,
): Promise<GalleryMaterial | null> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_GET;
  const response = await createAppServerClient().getGalleryMaterial({
    materialId,
  });
  assertNotErrorEnvelope(command, response.result);
  const result =
    isRecord(response.result) && "material" in response.result
      ? response.result.material
      : null;
  assertNotErrorEnvelope(command, result);
  assertGalleryMaterialOrNull(command, result);
  return result;
}

export async function createGalleryMetadata(
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_CREATE;
  const response =
    await createAppServerClient().createGalleryMaterialMetadata(request);
  const result = unwrapResponseField<unknown>(
    command,
    response.result,
    "metadata",
  );
  assertGalleryMaterialMetadata(command, result);
  return result;
}

export async function updateGalleryMetadata(
  materialId: string,
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_UPDATE;
  const response = await createAppServerClient().updateGalleryMaterialMetadata({
    materialId,
    metadata: { ...request, materialId },
  });
  const result = unwrapResponseField<unknown>(
    command,
    response.result,
    "metadata",
  );
  assertGalleryMaterialMetadata(command, result);
  return result;
}

export async function deleteGalleryMetadata(materialId: string): Promise<void> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_DELETE;
  const response = await createAppServerClient().deleteGalleryMaterialMetadata({
    materialId,
  });
  assertVoidResult(command, response.result);
}

export async function listGalleryMaterialsByImageCategory(
  projectId: string,
  category?: ImageCategory | null,
): Promise<GalleryMaterial[]> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY;
  const response =
    await createAppServerClient().listGalleryMaterialsByImageCategory({
      projectId,
      category: category ?? null,
    });
  const result = unwrapResponseField<unknown>(
    command,
    response.result,
    "materials",
  );
  assertGalleryMaterialList(command, result);
  return result;
}

export async function listGalleryMaterialsByLayoutCategory(
  projectId: string,
  category?: LayoutCategory | null,
): Promise<GalleryMaterial[]> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY;
  const response =
    await createAppServerClient().listGalleryMaterialsByLayoutCategory({
      projectId,
      category: category ?? null,
    });
  const result = unwrapResponseField<unknown>(
    command,
    response.result,
    "materials",
  );
  assertGalleryMaterialList(command, result);
  return result;
}

export async function listGalleryMaterialsByMood(
  projectId: string,
  mood?: ColorMood | null,
): Promise<GalleryMaterial[]> {
  const command = APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_MOOD;
  const response = await createAppServerClient().listGalleryMaterialsByMood({
    projectId,
    mood: mood ?? null,
  });
  const result = unwrapResponseField<unknown>(
    command,
    response.result,
    "materials",
  );
  assertGalleryMaterialList(command, result);
  return result;
}

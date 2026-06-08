import { safeInvoke } from "@/lib/dev-bridge";
import type {
  ColorMood,
  CreateGalleryMetadataRequest,
  GalleryMaterial,
  GalleryMaterialMetadata,
  ImageCategory,
  LayoutCategory,
} from "@/types/gallery-material";

interface DiagnosticFacadeMeta {
  category?: string;
  source?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function getDiagnosticFacadeMeta(value: unknown): DiagnosticFacadeMeta | null {
  const ownDiagnostic =
    isRecord(value) && isRecord(value.diagnostic) ? value.diagnostic : null;
  const arrayDiagnosticValue = Array.isArray(value)
    ? (value as unknown[] & { __diagnostic?: unknown }).__diagnostic
    : null;
  const arrayDiagnostic = isRecord(arrayDiagnosticValue)
    ? arrayDiagnosticValue
    : null;
  const diagnostic = ownDiagnostic ?? arrayDiagnostic;

  return diagnostic ? (diagnostic as DiagnosticFacadeMeta) : null;
}

async function invokeGalleryCommand<T>(
  command: string,
  args: Record<string, unknown>,
): Promise<T> {
  const result = await safeInvoke<T>(command, args);
  const diagnostic = getDiagnosticFacadeMeta(result);
  if (diagnostic) {
    const source = diagnostic.source || diagnostic.category || "diagnostic";
    throw new Error(
      `${command} 尚未接入真实图库材料 current 通道，收到 ${source} 诊断返回。`,
    );
  }

  return result;
}

export async function getGalleryMaterial(
  materialId: string,
): Promise<GalleryMaterial | null> {
  return invokeGalleryCommand<GalleryMaterial | null>("get_gallery_material", {
    materialId,
  });
}

export async function createGalleryMetadata(
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  return invokeGalleryCommand<GalleryMaterialMetadata>(
    "create_gallery_material_metadata",
    {
      req: request,
    },
  );
}

export async function updateGalleryMetadata(
  materialId: string,
  request: CreateGalleryMetadataRequest,
): Promise<GalleryMaterialMetadata> {
  return invokeGalleryCommand<GalleryMaterialMetadata>(
    "update_gallery_material_metadata",
    {
      materialId,
      req: request,
    },
  );
}

export async function deleteGalleryMetadata(materialId: string): Promise<void> {
  await invokeGalleryCommand<void>("delete_gallery_material_metadata", {
    materialId,
  });
}

export async function listGalleryMaterialsByImageCategory(
  projectId: string,
  category?: ImageCategory | null,
): Promise<GalleryMaterial[]> {
  return invokeGalleryCommand<GalleryMaterial[]>(
    "list_gallery_materials_by_image_category",
    {
      projectId,
      category: category ?? null,
    },
  );
}

export async function listGalleryMaterialsByLayoutCategory(
  projectId: string,
  category?: LayoutCategory | null,
): Promise<GalleryMaterial[]> {
  return invokeGalleryCommand<GalleryMaterial[]>(
    "list_gallery_materials_by_layout_category",
    {
      projectId,
      category: category ?? null,
    },
  );
}

export async function listGalleryMaterialsByMood(
  projectId: string,
  mood?: ColorMood | null,
): Promise<GalleryMaterial[]> {
  return invokeGalleryCommand<GalleryMaterial[]>(
    "list_gallery_materials_by_mood",
    {
      projectId,
      mood: mood ?? null,
    },
  );
}

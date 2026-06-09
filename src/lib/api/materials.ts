import { safeInvoke } from "@/lib/dev-bridge";
import { assertNotDiagnosticFacade } from "./diagnosticFacade";
import type {
  Material,
  MaterialFilter,
  MaterialType,
  MaterialUpdate,
  UploadMaterialRequest,
} from "@/types/material";

type RawMaterial = Partial<Material> & {
  material_type?: string;
  project_id?: string;
  file_path?: string;
  file_size?: number;
  mime_type?: string;
  created_at?: number;
};

export interface ImportMaterialFromUrlRequest {
  projectId: string;
  name: string;
  type: MaterialType;
  url: string;
  tags?: string[];
  description?: string;
}

export interface ImportedMaterialRef {
  id: string;
}

const normalizeTimestampMs = (value?: number): number => {
  if (!value || Number.isNaN(value)) {
    return Date.now();
  }

  return value < 1_000_000_000_000 ? value * 1000 : value;
};

const buildUploadRequestPayload = (
  request: UploadMaterialRequest,
): Record<string, unknown> => ({
  projectId: request.projectId,
  project_id: request.projectId,
  name: request.name,
  type: request.type,
  filePath: request.filePath,
  file_path: request.filePath,
  content: request.content,
  tags: request.tags ?? [],
  description: request.description,
});

const buildImportRequestPayload = (
  request: ImportMaterialFromUrlRequest,
): Record<string, unknown> => ({
  projectId: request.projectId,
  project_id: request.projectId,
  name: request.name,
  type: request.type,
  url: request.url,
  tags: request.tags ?? [],
  description: request.description,
});

const assertMaterialResult = (
  command: string,
  material: unknown,
  fallbackProjectId: string = "",
): Material => {
  assertNotDiagnosticFacade(command, material, "真实 Materials current 通道");
  if (!material || typeof material !== "object") {
    throw new Error(`${command} did not return a material object`);
  }

  return normalizeMaterial(material as RawMaterial, fallbackProjectId);
};

export function normalizeMaterial(
  material: RawMaterial,
  fallbackProjectId: string = "",
): Material {
  return {
    id: material.id ?? "",
    projectId: material.projectId ?? material.project_id ?? fallbackProjectId,
    name: material.name ?? "未命名素材",
    type: (material.type ??
      material.material_type ??
      "document") as MaterialType,
    filePath: material.filePath ?? material.file_path,
    fileSize: material.fileSize ?? material.file_size,
    mimeType: material.mimeType ?? material.mime_type,
    content: material.content,
    tags: material.tags ?? [],
    description: material.description,
    createdAt: normalizeTimestampMs(material.createdAt ?? material.created_at),
  };
}

export async function listMaterials(
  projectId: string,
  filter?: MaterialFilter | null,
): Promise<Material[]> {
  const materials = await safeInvoke<RawMaterial[]>("list_materials", {
    projectId,
    project_id: projectId,
    filter: filter ?? null,
  });

  assertNotDiagnosticFacade(
    "list_materials",
    materials,
    "真实 Materials current 通道",
  );
  if (!Array.isArray(materials)) {
    throw new Error("list_materials did not return a materials array");
  }

  return materials.map((material) => normalizeMaterial(material, projectId));
}

export async function getMaterialCount(projectId: string): Promise<number> {
  const count = await safeInvoke<number>("get_material_count", {
    projectId,
    project_id: projectId,
  });

  assertNotDiagnosticFacade(
    "get_material_count",
    count,
    "真实 Materials current 通道",
  );
  if (typeof count !== "number" || Number.isNaN(count)) {
    throw new Error("get_material_count did not return a number");
  }

  return count;
}

export async function uploadMaterial(
  request: UploadMaterialRequest,
): Promise<Material> {
  const material = await safeInvoke<RawMaterial>("upload_material", {
    req: buildUploadRequestPayload(request),
  });
  return assertMaterialResult("upload_material", material, request.projectId);
}

export async function importMaterialFromUrl(
  request: ImportMaterialFromUrlRequest,
): Promise<ImportedMaterialRef> {
  const result = await safeInvoke<ImportedMaterialRef>("import_material_from_url", {
    req: buildImportRequestPayload(request),
  });
  assertNotDiagnosticFacade(
    "import_material_from_url",
    result,
    "真实 Materials current 通道",
  );
  if (!result || typeof result.id !== "string") {
    throw new Error("import_material_from_url did not return an imported material id");
  }

  return result;
}

export async function updateMaterial(
  id: string,
  update: MaterialUpdate,
): Promise<Material> {
  const material = await safeInvoke<RawMaterial>("update_material", {
    id,
    update,
  });
  return assertMaterialResult("update_material", material);
}

export async function deleteMaterial(id: string): Promise<void> {
  const result = await safeInvoke<unknown>("delete_material", { id });
  assertNotDiagnosticFacade(
    "delete_material",
    result,
    "真实 Materials current 通道",
  );
  if (result !== null && result !== undefined) {
    throw new Error("delete_material did not return void");
  }
}

export async function getMaterialContent(id: string): Promise<string> {
  const content = await safeInvoke<string>("get_material_content", { id });
  assertNotDiagnosticFacade(
    "get_material_content",
    content,
    "真实 Materials current 通道",
  );
  if (typeof content !== "string") {
    throw new Error("get_material_content did not return content text");
  }

  return content;
}

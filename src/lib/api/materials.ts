import {
  APP_SERVER_METHOD_PROJECT_MATERIAL_CONTENT,
  APP_SERVER_METHOD_PROJECT_MATERIAL_COUNT,
  APP_SERVER_METHOD_PROJECT_MATERIAL_DELETE,
  APP_SERVER_METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL,
  APP_SERVER_METHOD_PROJECT_MATERIAL_LIST,
  APP_SERVER_METHOD_PROJECT_MATERIAL_UPDATE,
  APP_SERVER_METHOD_PROJECT_MATERIAL_UPLOAD,
  createAppServerClient,
  type AppServerProjectMaterial,
  type AppServerProjectMaterialImportFromUrlParams,
  type AppServerProjectMaterialUploadParams,
} from "./appServer";
import type {
  Material,
  MaterialFilter,
  MaterialType,
  MaterialUpdate,
  UploadMaterialRequest,
} from "@/types/material";

type RawMaterial = Partial<Omit<Material, "type">> & {
  type?: string;
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
): AppServerProjectMaterialUploadParams => ({
  projectId: request.projectId,
  name: request.name,
  type: request.type,
  filePath: request.filePath,
  content: request.content,
  tags: request.tags ?? [],
  description: request.description,
});

const buildImportRequestPayload = (
  request: ImportMaterialFromUrlRequest,
): AppServerProjectMaterialImportFromUrlParams => ({
  projectId: request.projectId,
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
  if (!material || typeof material !== "object") {
    throw new Error(`${command} did not return a material object`);
  }

  return normalizeMaterial(material as RawMaterial, fallbackProjectId);
};

export function normalizeMaterial(
  material: RawMaterial | AppServerProjectMaterial,
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
  const response = await createAppServerClient().listProjectMaterials({
    projectId,
    filter: filter ?? null,
  });
  const materials = response.result.materials;

  if (!Array.isArray(materials)) {
    throw new Error(
      `${APP_SERVER_METHOD_PROJECT_MATERIAL_LIST} did not return a materials array`,
    );
  }

  return materials.map((material) => normalizeMaterial(material, projectId));
}

export async function getMaterialCount(projectId: string): Promise<number> {
  const response = await createAppServerClient().countProjectMaterials({
    projectId,
  });
  const count = response.result.count;

  if (typeof count !== "number" || Number.isNaN(count)) {
    throw new Error(
      `${APP_SERVER_METHOD_PROJECT_MATERIAL_COUNT} did not return a number`,
    );
  }

  return count;
}

export async function uploadMaterial(
  request: UploadMaterialRequest,
): Promise<Material> {
  const response = await createAppServerClient().uploadProjectMaterial(
    buildUploadRequestPayload(request),
  );
  return assertMaterialResult(
    APP_SERVER_METHOD_PROJECT_MATERIAL_UPLOAD,
    response.result.material,
    request.projectId,
  );
}

export async function importMaterialFromUrl(
  request: ImportMaterialFromUrlRequest,
): Promise<ImportedMaterialRef> {
  const response = await createAppServerClient().importProjectMaterialFromUrl(
    buildImportRequestPayload(request),
  );
  const material = response.result.material;
  if (!material || typeof material.id !== "string") {
    throw new Error(
      `${APP_SERVER_METHOD_PROJECT_MATERIAL_IMPORT_FROM_URL} did not return an imported material id`,
    );
  }

  return { id: material.id };
}

export async function updateMaterial(
  id: string,
  update: MaterialUpdate,
): Promise<Material> {
  const response = await createAppServerClient().updateProjectMaterial({
    id,
    update,
  });
  return assertMaterialResult(
    APP_SERVER_METHOD_PROJECT_MATERIAL_UPDATE,
    response.result.material,
  );
}

export async function deleteMaterial(id: string): Promise<void> {
  const response = await createAppServerClient().deleteProjectMaterial({ id });
  const result = response.result;
  if (
    result !== null &&
    result !== undefined &&
    (typeof result !== "object" ||
      Array.isArray(result) ||
      Object.keys(result).length > 0)
  ) {
    throw new Error(
      `${APP_SERVER_METHOD_PROJECT_MATERIAL_DELETE} did not return void`,
    );
  }
}

export async function getMaterialContent(id: string): Promise<string> {
  const response = await createAppServerClient().readProjectMaterialContent({
    id,
  });
  const content = response.result.content;
  if (typeof content !== "string") {
    throw new Error(
      `${APP_SERVER_METHOD_PROJECT_MATERIAL_CONTENT} did not return content text`,
    );
  }

  return content;
}

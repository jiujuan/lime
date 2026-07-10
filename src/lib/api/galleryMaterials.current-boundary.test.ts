import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";
import { readAppServerApiSources } from "../../test/appServerApiSources";

const LEGACY_GALLERY_MATERIAL_FACADE_COMMANDS = [
  "create_gallery_material_metadata",
  "get_gallery_material_metadata",
  "get_gallery_material",
  "list_gallery_materials_by_image_category",
  "list_gallery_materials_by_layout_category",
  "list_gallery_materials_by_mood",
  "update_gallery_material_metadata",
  "delete_gallery_material_metadata",
];

const CURRENT_GALLERY_MATERIAL_METHOD_CONSTANTS = [
  "APP_SERVER_METHOD_GALLERY_MATERIAL_GET",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_CREATE",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_UPDATE",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_METADATA_DELETE",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_IMAGE_CATEGORY",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_LAYOUT_CATEGORY",
  "APP_SERVER_METHOD_GALLERY_MATERIAL_LIST_BY_MOOD",
];

const CURRENT_GALLERY_MATERIAL_CLIENT_HELPERS = [
  "getGalleryMaterial",
  "createGalleryMaterialMetadata",
  "updateGalleryMaterialMetadata",
  "deleteGalleryMaterialMetadata",
  "listGalleryMaterialsByImageCategory",
  "listGalleryMaterialsByLayoutCategory",
  "listGalleryMaterialsByMood",
];

const CURRENT_GALLERY_MATERIAL_METHODS = [
  "galleryMaterial/get",
  "galleryMaterialMetadata/get",
  "galleryMaterialMetadata/create",
  "galleryMaterialMetadata/update",
  "galleryMaterialMetadata/delete",
  "galleryMaterial/listByImageCategory",
  "galleryMaterial/listByLayoutCategory",
  "galleryMaterial/listByMood",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function readOptionalRepoFile(path: string): string {
  const absolutePath = resolve(cwd(), path);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function expectStringLiteralsAbsent(source: string, literals: string[]): void {
  for (const literal of literals) {
    expect(source).not.toContain(`"${literal}"`);
    expect(source).not.toContain(`'${literal}'`);
  }
}

function readAgentCommandCatalog(): Record<string, unknown> {
  return JSON.parse(
    readRepoFile("src/lib/governance/agentCommandCatalog.json"),
  );
}

function expectCatalogSurfaceAbsent(
  catalog: Record<string, unknown>,
  surface: string,
): void {
  const value = catalog[surface];
  expect(Array.isArray(value), `${surface} should be an array`).toBe(true);
  for (const command of LEGACY_GALLERY_MATERIAL_FACADE_COMMANDS) {
    expect(value).not.toContain(command);
  }
}

function readDeprecatedCommandReplacements(
  catalog: Record<string, unknown>,
): Record<string, unknown> {
  const replacements = catalog.deprecatedCommandReplacements;
  expect(
    replacements &&
      typeof replacements === "object" &&
      !Array.isArray(replacements),
    "deprecatedCommandReplacements should be an object",
  ).toBe(true);
  return replacements as Record<string, unknown>;
}

describe("galleryMaterials current App Server boundary", () => {
  it("galleryMaterials API 应固定走 App Server current helper", () => {
    const source = readRepoFile("src/lib/api/galleryMaterials.ts");

    expect(source).toContain("createAppServerClient");
    for (const methodConstant of CURRENT_GALLERY_MATERIAL_METHOD_CONSTANTS) {
      expect(source).toContain(methodConstant);
    }
    for (const helper of CURRENT_GALLERY_MATERIAL_CLIENT_HELPERS) {
      expect(source).toContain(`.${helper}(`);
    }
    expectStringLiteralsAbsent(source, LEGACY_GALLERY_MATERIAL_FACADE_COMMANDS);
    expect(source).not.toContain("safeInvoke(");
  });

  it("App Server protocol / client 应记录 Gallery material current 方法", () => {
    const appServerSource = readAppServerApiSources();
    const generatedClientProtocolSource = readRepoFile(
      "packages/app-server-client/src/generated/protocol-types.ts",
    );
    const rustProtocolSource = [
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/method_names.rs",
      ),
      readRepoFile(
        "lime-rs/crates/app-server-protocol/src/protocol/v0/gallery.rs",
      ),
    ].join("\n");

    for (const methodConstant of CURRENT_GALLERY_MATERIAL_METHOD_CONSTANTS) {
      expect(appServerSource).toContain(methodConstant);
    }
    for (const helper of CURRENT_GALLERY_MATERIAL_CLIENT_HELPERS) {
      expect(appServerSource).toContain(`${helper}(`);
    }
    for (const method of CURRENT_GALLERY_MATERIAL_METHODS) {
      expect(generatedClientProtocolSource).toContain(`"${method}"`);
      expect(rustProtocolSource).toContain(`"${method}"`);
    }
  });

  it("旧 Gallery material facade 不应回到 Electron、DevBridge、mock 或治理正向 surface", () => {
    const catalog = readAgentCommandCatalog();
    const restrictedProductionSources = [
      readRepoFile("electron/ipcChannels.ts"),
      readRepoFile("electron/hostCommands.ts"),
      readRepoFile("src/lib/dev-bridge/commandPolicy.ts"),
      readRepoFile("src/lib/dev-bridge/mockPriorityCommands.ts"),
      readRepoFile("src/lib/desktop-host/core.ts"),
    ].join("\n");

    expectCatalogSurfaceAbsent(catalog, "runtimeGatewayCommands");
    expectCatalogSurfaceAbsent(catalog, "capabilityDraftCommands");
    expectStringLiteralsAbsent(
      restrictedProductionSources,
      LEGACY_GALLERY_MATERIAL_FACADE_COMMANDS,
    );
  });

  it("旧 Gallery material Rust wrapper / runner / dispatcher 不应回流", () => {
    const legacyRustSources = [
      readOptionalRepoFile("lime-rs/src/app/runner.rs"),
      readOptionalRepoFile("lime-rs/src/commands/mod.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher/files.rs"),
      readOptionalRepoFile("lime-rs/src/dev_bridge/dispatcher/materials.rs"),
    ].join("\n");

    expectStringLiteralsAbsent(
      legacyRustSources,
      LEGACY_GALLERY_MATERIAL_FACADE_COMMANDS,
    );
    expect(legacyRustSources).not.toContain("gallery_material_cmd");
    expect(
      existsSync(
        resolve(cwd(), "lime-rs/src/commands/gallery_material_cmd.rs"),
      ),
    ).toBe(false);
  });

  it("旧 poster 命令 replacement 应直接指向 App Server Gallery methods", () => {
    const replacements = readDeprecatedCommandReplacements(
      readAgentCommandCatalog(),
    );

    expect(replacements).toMatchObject({
      create_poster_metadata: "galleryMaterialMetadata/create",
      get_poster_metadata: "galleryMaterialMetadata/get",
      get_poster_material: "galleryMaterial/get",
      update_poster_metadata: "galleryMaterialMetadata/update",
      delete_poster_metadata: "galleryMaterialMetadata/delete",
      list_by_image_category: "galleryMaterial/listByImageCategory",
      list_by_layout_category: "galleryMaterial/listByLayoutCategory",
      list_by_mood: "galleryMaterial/listByMood",
    });
  });
});

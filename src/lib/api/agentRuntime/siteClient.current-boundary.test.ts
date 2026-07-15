import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { cwd } from "node:process";
import { describe, expect, it } from "vitest";

const SITE_ADAPTER_SYMBOLS = [
  "siteApplyAdapterCatalogBootstrap",
  "siteClearAdapterCatalogCache",
  "siteDebugRunAdapter",
  "siteGetAdapterCatalogStatus",
  "siteGetAdapterInfo",
  "siteGetAdapterLaunchReadiness",
  "siteImportAdapterYamlBundle",
  "siteListAdapters",
  "siteRecommendAdapters",
  "siteRunAdapter",
  "siteSaveAdapterResult",
  "siteSearchAdapters",
];

function readRepoFile(path: string): string {
  return readFileSync(resolve(cwd(), path), "utf8");
}

function expectRetiredSiteClientTopLevelExportsAbsent(source: string): void {
  expect(source).not.toContain("export const {");
  expect(source).not.toContain("export declare const");
  for (const symbol of SITE_ADAPTER_SYMBOLS) {
    expect(source).not.toContain(`export const ${symbol}`);
    expect(source).not.toContain(`export declare const ${symbol}`);
    expect(source).not.toContain(`export function ${symbol}`);
    expect(source).not.toContain(`export declare function ${symbol}`);
  }
}

describe("agentRuntime siteClient current boundary", () => {
  it("agentRuntime 公共聚合入口已删除且不得恢复", () => {
    for (const path of [
      "src/lib/api/agentRuntime.ts",
      "src/lib/api/agentRuntime.d.ts",
      "src/lib/api/agentRuntime/index.ts",
      "src/lib/api/agentRuntime/index.d.ts",
    ]) {
      expect(existsSync(resolve(cwd(), path)), path).toBe(false);
    }
  });

  it("retired siteClient 只保留 fail-closed 工厂，不应重新调用旧 bridge", () => {
    const source = readRepoFile("src/lib/api/agentRuntime/siteClient.ts");
    const declarations = readRepoFile(
      "src/lib/api/agentRuntime/siteClient.d.ts",
    );

    expect(source).toContain("rejectRetiredSiteAdapterCommand");
    expect(source).toContain(
      "Site Adapter moves to App Server current methods",
    );
    expect(source).not.toContain("bridgeInvoke(");
    expect(source).not.toContain("safeInvoke(");
    expectRetiredSiteClientTopLevelExportsAbsent(source);
    expectRetiredSiteClientTopLevelExportsAbsent(declarations);
  });

  it("webview-api 保留唯一前端网关，并通过 retired 工厂 fail closed", () => {
    const source = readRepoFile("src/lib/webview-api.ts");

    expect(source).toContain(
      'import { createSiteClient } from "@/lib/api/agentRuntime/siteClient";',
    );
    expect(source).toContain("const retiredSiteClient = createSiteClient();");
    for (const symbol of SITE_ADAPTER_SYMBOLS) {
      expect(source).toContain(`retiredSiteClient.${symbol}`);
    }
    expect(source).not.toContain('from "@/lib/api/agentRuntime";');
  });

  it("createAgentRuntimeClient 不再混入 retired Site Adapter 方法", () => {
    const source = readRepoFile("src/lib/api/agentRuntime/clientFactory.ts");
    const declarations = readRepoFile(
      "src/lib/api/agentRuntime/clientFactory.d.ts",
    );

    expect(source).not.toContain("createSiteClient");
    expect(source).not.toContain("./siteClient");
    for (const symbol of SITE_ADAPTER_SYMBOLS) {
      expect(source).not.toContain(symbol);
      expect(declarations).not.toContain(symbol);
    }
  });
});

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ALLOWED_EXTERNAL_BACKEND_LAUNCH_FILES,
  EXTERNAL_BACKEND_LAUNCH_SNIPPETS,
  EXTERNAL_BACKEND_SCAN_DIRS,
  REPO_ROOT,
  collectTextFiles,
  repoRelative,
} from "./appServerRuntimeBoundary.testSupport";

describe("app-server backend mode boundary", () => {
  it("App Server 不应恢复独立 backend_mode=agent", () => {
    const runtimeFactory = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/runtime_factory.rs"),
      "utf8",
    );
    const daemonBackend = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server-daemon/src/backend.rs"),
      "utf8",
    );
    const electronHost = readFileSync(
      join(REPO_ROOT, "electron/appServerHost.ts"),
      "utf8",
    );

    expect(runtimeFactory).toContain('"runtime" => Ok(Self::Runtime)');
    expect(runtimeFactory).not.toMatch(/["']agent["']\s*=>\s*Ok/u);
    expect(daemonBackend).toContain(
      'assert!(SidecarBackendMode::parse("agent").is_err());',
    );
    expect(electronHost).not.toContain('normalized === "agent"');
    expect(electronHost).not.toContain("APP_SERVER_BACKEND_MODE=agent");
  });

  it("ExternalBackend 只能保留为显式 override 或受控 fixture", () => {
    const electronHost = readFileSync(
      join(REPO_ROOT, "electron/appServerHost.ts"),
      "utf8",
    );
    const devSidecar = readFileSync(
      join(REPO_ROOT, "scripts/lib/electron-dev-sidecar.mjs"),
      "utf8",
    );
    const sidecarTypes = readFileSync(
      join(REPO_ROOT, "packages/app-server-client/src/sidecar-types.ts"),
      "utf8",
    );
    const sidecarManifest = readFileSync(
      join(REPO_ROOT, "packages/app-server-client/src/sidecar-manifest.ts"),
      "utf8",
    );
    const appServerMain = readFileSync(
      join(REPO_ROOT, "lime-rs/crates/app-server/src/main.rs"),
      "utf8",
    );

    expect(electronHost).toContain(
      'resolveRuntimeBackendLaunchOptions("runtime")',
    );
    expect(electronHost).toContain('normalized === "external"');
    expect(electronHost).toContain(
      "process.env.APP_SERVER_BACKEND_COMMAND?.trim()",
    );
    expect(devSidecar).toContain('defaultMode = "runtime"');
    expect(devSidecar).toContain('requestedMode !== "external"');
    expect(sidecarTypes).toContain('> = "unavailable";');
    expect(sidecarManifest).toContain(
      "backendMode: DEFAULT_STANDALONE_BACKEND_MODE",
    );
    expect(appServerMain).toContain(
      "--backend-command is required when --backend external",
    );

    const unregistered = EXTERNAL_BACKEND_SCAN_DIRS.flatMap((dir) =>
      collectTextFiles(join(REPO_ROOT, dir)),
    )
      .map((file) => ({
        path: repoRelative(file),
        source: readFileSync(file, "utf8"),
      }))
      .filter(({ source }) =>
        EXTERNAL_BACKEND_LAUNCH_SNIPPETS.some((snippet) =>
          source.includes(snippet),
        ),
      )
      .filter(({ path }) => !ALLOWED_EXTERNAL_BACKEND_LAUNCH_FILES.has(path))
      .map(({ path }) => path);

    expect(
      unregistered,
      "ExternalBackend 是 compat / controlled-fixture 边界，只能出现在 standalone CLI、SDK smoke、fixture 或 dev 显式 override；生产默认必须继续走 AppServerBackendMode::Runtime",
    ).toEqual([]);
  });
});

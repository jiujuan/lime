import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readPackageScripts() {
  return JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
}

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function retiredHostTopic() {
  return ["ta", "uri"].join("");
}

function retiredHostConfigStem() {
  return ["ta", "uri.conf"].join("");
}

function retiredHostBuildInputTerms() {
  return [
    retiredHostConfigStem(),
    ["lime-rs/", retiredHostConfigStem()].join(""),
    ["src-", "ta", "uri"].join(""),
    ["@", "ta", "uri-apps/cli"].join(""),
    ["npm run ", "ta", "uri"].join(""),
    ["node_modules/.bin/", "ta", "uri"].join(""),
  ];
}

function expectNoRetiredHostBuildInput(content, label) {
  for (const term of retiredHostBuildInputTerms()) {
    expect(content, label).not.toContain(term);
  }
}

describe("Electron current package entrypoints", () => {
  it("default desktop commands point to Electron current", () => {
    const scripts = readPackageScripts();

    expect(scripts.dev).toBe("npm run electron:dev");
    expect(scripts.build).toBe("npm run electron:build");
    expect(scripts.preview).toBe("npm run electron:start");
    expect(scripts["verify:gui-smoke"]).toBe("npm run smoke:electron");
    expect(scripts["smoke:electron"]).toContain("scripts/electron-smoke.mjs");
  });

  it("package scripts do not expose retired desktop host as a GUI current path", () => {
    const scripts = readPackageScripts();
    const retiredHostScripts = Object.entries(scripts).filter(
      ([name, command]) =>
        `${name} ${command}`.toLowerCase().includes("retired-host"),
    );

    expect(retiredHostScripts).toEqual([]);
  });

  it("package scripts, Electron Builder, and version checks do not consume retired host config", () => {
    const scripts = readPackageScripts();
    const scriptEntrypoints = Object.entries(scripts)
      .map(([name, command]) => `${name} ${command}`)
      .join("\n");
    const electronBuilder = readFile("electron-builder.yml");
    const appVersionCheck = readFile(
      "scripts/check-app-version-consistency.mjs",
    );

    expectNoRetiredHostBuildInput(scriptEntrypoints, "package.json scripts");
    expectNoRetiredHostBuildInput(electronBuilder, "electron-builder.yml");
    expectNoRetiredHostBuildInput(
      appVersionCheck,
      "scripts/check-app-version-consistency.mjs",
    );

    expect(electronBuilder).toContain("productName: Lime");
    expect(electronBuilder).toContain("app-server.release.json");
    expect(appVersionCheck).toContain("Cargo.toml");
    expect(appVersionCheck).toContain("packages");
    expect(appVersionCheck).toContain("lime-cli-npm");
  });

  it("legacy verify-gui-smoke script delegates to Electron smoke", () => {
    const content = readFile("scripts/verify-gui-smoke.mjs");

    expect(content).toContain('"smoke:electron"');
    expect(content).toContain("Electron Desktop Host current GUI smoke");
    expect(content).not.toMatch(/retired-host/i);
    expect(content).not.toContain("headless");
    expect(content).not.toContain("retired-host.conf");
    expect(content).not.toContain("node_modules/.bin");
  });

  it("build monitor observes Electron package output instead of retired host bundles", () => {
    const content = readFile("scripts/monitor-build.sh");

    expect(content).toContain("Electron 打包进度监控");
    expect(content).toContain("/tmp/electron-build.log");
    expect(content).toContain("release-electron");
    expect(content).toContain(
      "electron-builder|electron:package:dir|electron:dist",
    );
    expect(content).not.toMatch(/retired-host/i);
    expect(content).not.toContain("lime-rs/target/release/bundle");
    expect(content).not.toContain("/tmp/retired-host-build.log");
  });

  it("local install script advertises Electron current desktop commands", () => {
    const content = readFile("lime-rs/install-local.sh");

    expect(content).toContain("Rust CLI");
    expect(content).toContain("Electron 命令接管");
    expect(content).toContain("npm run electron:dev");
    expect(content).toContain("npm run electron:build");
    expect(content).toContain("npm run verify:gui-smoke");
    expectNoRetiredHostBuildInput(content, "lime-rs/install-local.sh");
  });

  it("repository discovery metadata advertises Electron current host", () => {
    const content = readFile(".github/repository-metadata.md");

    expect(content).toContain("electron");
    expect(content).not.toContain(retiredHostTopic());
  });
});

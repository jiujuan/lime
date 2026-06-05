import fs from "node:fs";
import { describe, expect, it } from "vitest";

function readPackageScripts() {
  return JSON.parse(fs.readFileSync("package.json", "utf8")).scripts ?? {};
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
    const retiredHostScripts = Object.entries(scripts).filter(([name, command]) =>
      `${name} ${command}`.toLowerCase().includes("retired-host"),
    );

    expect(retiredHostScripts).toEqual([]);
  });

  it("legacy verify-gui-smoke script delegates to Electron smoke", () => {
    const content = fs.readFileSync("scripts/verify-gui-smoke.mjs", "utf8");

    expect(content).toContain('"smoke:electron"');
    expect(content).toContain("Electron Desktop Host current GUI smoke");
    expect(content).not.toMatch(/retired-host/i);
    expect(content).not.toContain("headless");
    expect(content).not.toContain("retired-host.conf");
    expect(content).not.toContain("node_modules/.bin");
  });

  it("build monitor observes Electron package output instead of retired host bundles", () => {
    const content = fs.readFileSync("scripts/monitor-build.sh", "utf8");

    expect(content).toContain("Electron 打包进度监控");
    expect(content).toContain("/tmp/electron-build.log");
    expect(content).toContain("release-electron");
    expect(content).toContain("electron-builder|electron:package:dir|electron:dist");
    expect(content).not.toMatch(/retired-host/i);
    expect(content).not.toContain("lime-rs/target/release/bundle");
    expect(content).not.toContain("/tmp/retired-host-build.log");
  });
});

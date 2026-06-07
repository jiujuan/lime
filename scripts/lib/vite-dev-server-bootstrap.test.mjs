import fs from "node:fs";
import { describe, expect, it } from "vitest";

import { runViteDevServerBootstrap } from "./vite-dev-server-bootstrap.mjs";

describe("vite dev server bootstrap current mode", () => {
  it("rejects the retired non-browser bridge mode", async () => {
    await expect(
      runViteDevServerBootstrap({ browserBridge: false }),
    ).rejects.toThrow(/Electron current entrypoints/);
  });

  it("does not expose retired native dev server mode", () => {
    const content = fs.readFileSync(
      "scripts/lib/vite-dev-server-bootstrap.mjs",
      "utf8",
    );

    expect(content).toContain("browser DevBridge mock mode");
    expect(content).not.toContain(["TA", "URI_ENV_PLATFORM"].join(""));
    expect(content).not.toContain([".vite-", "ta", "uri"].join(""));
    expect(content).not.toContain(["Ta", "uri 原生模式"].join(""));
    expect(content).not.toContain(["Ta", "uri dev server"].join(""));
    expect(content).not.toContain(["Ta", "uri dialog"].join(""));
  });
});

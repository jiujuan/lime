import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import { createVitestSmokeConfig } from "./vitest-smoke-runner.mjs";

describe("vitest smoke runner current aliases", () => {
  it("generates temporary Vitest config with current desktop-host and workspace aliases", () => {
    const rootDir = process.cwd();
    const config = createVitestSmokeConfig(rootDir);

    try {
      const content = fs.readFileSync(config.configPath, "utf8");

      expect(content).toContain("src/lib/desktop-host");
      expect(content).toContain("plugin-dialog.ts");
      expect(content).toContain("plugin-shell.ts");
      expect(content).toContain("plugin-deep-link.ts");
      expect(content).toContain("packages/app-server-client/src/browser.ts");
      expect(content).toContain(
        "packages/agent-runtime-client/src/sessionGateway.ts",
      );
      expect(content).toContain("packages/agent-ui-contracts/src/index.ts");
      expect(content).toContain(
        "packages/agent-runtime-projection/src/index.ts",
      );
      expect(content).toContain("packages/agent-runtime-ui/src/index.ts");
      expect(content).not.toContain(["src/lib/", "ta", "uri-mock"].join(""));
      expect(path.basename(path.dirname(config.configPath))).toMatch(
        /^vitest-smoke-/,
      );
      expect(path.basename(path.dirname(config.configPath))).not.toMatch(
        /^lime-/,
      );
    } finally {
      config.cleanup();
    }

    expect(fs.existsSync(config.configPath)).toBe(false);
  });
});

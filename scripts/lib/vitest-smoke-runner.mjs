import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pathToFileURL } from "node:url";

const desktopHostAliasPatterns = [
  ["^@/lib/desktop-host/core$", "core.ts"],
  ["^@/lib/desktop-host/event$", "event.ts"],
  ["^@/lib/desktop-host/window$", "window.ts"],
  ["^@/lib/desktop-host/window$", "window.ts"],
  ["^@/lib/desktop-host/window$", "window.ts"],
  ["^@/lib/desktop-host/plugin-dialog$", "plugin-dialog.ts"],
  ["^@/lib/desktop-host/plugin-shell$", "plugin-shell.ts"],
  ["^@/lib/desktop-host/plugin-deep-link$", "plugin-deep-link.ts"],
  ["^@/lib/desktop-host/plugin-global-shortcut$", "plugin-global-shortcut.ts"],
];

function toFileUrl(filePath) {
  return pathToFileURL(filePath).href;
}

export function createVitestSmokeConfig(rootDir) {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "vitest-smoke-"));
  const configPath = path.join(tempDir, "vitest.config.mjs");
  const cacheDir = path.join(tempDir, "vite-cache");
  const desktopHostDir = path.join(rootDir, "src/lib/desktop-host");
  const aliasSpecs = desktopHostAliasPatterns.map(([pattern, target]) => ({
    pattern,
    replacement: path.join(desktopHostDir, target),
  }));

  fs.writeFileSync(
    configPath,
    `import path from "node:path";\n` +
      `import { defineConfig } from ${JSON.stringify(
        toFileUrl(path.join(rootDir, "node_modules/vite/dist/node/index.js")),
      )};\n` +
      `import react from ${JSON.stringify(
        toFileUrl(
          path.join(rootDir, "node_modules/@vitejs/plugin-react/dist/index.js"),
        ),
      )};\n` +
      `import svgr from ${JSON.stringify(
        toFileUrl(path.join(rootDir, "node_modules/vite-plugin-svgr/dist/index.js")),
      )};\n` +
      `const rootDir = ${JSON.stringify(rootDir)};\n` +
      `const aliasSpecs = ${JSON.stringify(aliasSpecs)};\n` +
      `export default defineConfig({\n` +
      `  root: rootDir,\n` +
      `  cacheDir: ${JSON.stringify(cacheDir)},\n` +
      `  define: { "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION || "test") },\n` +
      `  plugins: [react({ jsxRuntime: "automatic", jsxImportSource: "react", babel: { compact: true } }), svgr()],\n` +
      `  resolve: { alias: [\n` +
      `    { find: "@", replacement: path.resolve(rootDir, "src") },\n` +
      `    ...aliasSpecs.map((entry) => ({ find: new RegExp(entry.pattern), replacement: entry.replacement })),\n` +
      `  ] },\n` +
      `  test: {\n` +
      `    globals: true,\n` +
      `    environment: "jsdom",\n` +
      `    exclude: ["**/node_modules/**", "**/dist/**", "**/lime-rs/target/**"],\n` +
      `  },\n` +
      `});\n`,
  );

  return {
    configPath,
    cleanup() {
      fs.rmSync(tempDir, { recursive: true, force: true });
    },
  };
}

export function runVitestSmoke({ rootDir, label, args, logPrefix, env }) {
  const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
  const config = createVitestSmokeConfig(rootDir);
  const startedAt = Date.now();

  console.log(`\n[${logPrefix}] > ${label}`);

  try {
    const result = spawnSync(
      npmCommand,
      ["exec", "--", "vitest", "run", ...args, "--config", config.configPath],
      {
        cwd: rootDir,
        stdio: "inherit",
        env: { ...process.env, ...env },
      },
    );

    if (result.error) {
      throw result.error;
    }

    if (typeof result.status === "number" && result.status !== 0) {
      const error = new Error(`[${logPrefix}] ${label} 失败`);
      error.exitCode = result.status;
      throw error;
    }

    return {
      label,
      status: "pass",
      durationMs: Date.now() - startedAt,
      args,
    };
  } finally {
    config.cleanup();
  }
}

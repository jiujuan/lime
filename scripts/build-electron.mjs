import { build } from "vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const devMode = process.argv.includes("--dev");
const sharedExternal = ["electron", /^node:/];
const appServerClientSource = path.resolve(
  repoRoot,
  "packages/app-server-client/src/index.ts",
);

async function buildMain() {
  await build({
    configFile: false,
    resolve: {
      alias: [
        {
          find: "app-server-client",
          replacement: appServerClientSource,
        },
      ],
    },
    build: {
      target: "node22",
      ssr: "electron/main.ts",
      outDir: "dist-electron/main",
      emptyOutDir: true,
      rollupOptions: {
        external: sharedExternal,
        output: {
          entryFileNames: "main.js",
          format: "es",
        },
      },
    },
  });
}

async function buildPreload() {
  await build({
    configFile: false,
    build: {
      target: "node22",
      ssr: "electron/preload.ts",
      outDir: "dist-electron/preload",
      emptyOutDir: true,
      rollupOptions: {
        external: ["electron", /^node:/],
        output: {
          entryFileNames: "preload.cjs",
          format: "cjs",
        },
      },
    },
  });
}

await buildMain();
await buildPreload();

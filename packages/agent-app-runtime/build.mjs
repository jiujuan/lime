import { build } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdirSync, rmSync, existsSync, readFileSync, writeFileSync } from 'node:fs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '../..');
const require = createRequire(import.meta.url);
const distDir = resolve(__dirname, 'dist');
const workspaceAliases = [
  { find: '@', replacement: resolve(root, 'src') },
  {
    find: 'app-server-client',
    replacement: resolve(root, 'packages/app-server-client/src/index.ts'),
  },
  {
    find: '@limecloud/agent-runtime-client',
    replacement: resolve(root, 'packages/agent-runtime-client/src/index.ts'),
  },
  {
    find: '@limecloud/agent-ui-contracts',
    replacement: resolve(root, 'packages/agent-ui-contracts/src/index.ts'),
  },
  {
    find: '@limecloud/agent-runtime-projection',
    replacement: resolve(root, 'packages/agent-runtime-projection/src/index.ts'),
  },
  {
    find: '@limecloud/agent-runtime-ui',
    replacement: resolve(root, 'packages/agent-runtime-ui/src/index.ts'),
  },
];

if (existsSync(distDir)) {
  rmSync(distDir, { recursive: true });
}

const sharedBuildOptions = {
  root,
  configFile: false,
  publicDir: false,
  resolve: {
    alias: workspaceAliases,
  },
  build: {
    outDir: distDir,
    emptyOutDir: true,
    lib: {
      entry: resolve(root, 'src/features/agent-app/sdk/index.ts'),
      formats: ['es'],
      fileName: 'index',
    },
    rollupOptions: {
      // 无外部依赖，全量打包
      external: [],
      output: {
        preserveModules: true,
        preserveModulesRoot: resolve(root, 'src/features/agent-app/sdk'),
        entryFileNames: '[name].js',
      },
    },
    target: 'es2020',
    sourcemap: false,
  },
};

await build(sharedBuildOptions);

await build({
  root,
  configFile: false,
  publicDir: false,
  resolve: {
    alias: workspaceAliases,
  },
  build: {
    outDir: distDir,
    emptyOutDir: false,
    lib: {
      entry: resolve(__dirname, 'src/projection.ts'),
      formats: ['es'],
      fileName: 'projection',
    },
    rollupOptions: {
      external: [],
      output: {
        entryFileNames: 'projection.js',
      },
    },
    target: 'es2020',
    sourcemap: false,
  },
});

execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '--project',
    resolve(__dirname, 'tsconfig.types.json'),
  ],
  { cwd: __dirname, stdio: 'inherit' },
);

execFileSync(
  process.execPath,
  [
    require.resolve('typescript/bin/tsc'),
    '--project',
    resolve(__dirname, 'tsconfig.public-types.json'),
  ],
  { cwd: __dirname, stdio: 'inherit' },
);

const publicTypesDir = resolve(distDir, 'types');
const publicProjectionTypes = resolve(
  distDir,
  '.types-public/packages/agent-app-runtime/src/projection.d.ts',
);
mkdirSync(publicTypesDir, { recursive: true });
cpSync(publicProjectionTypes, resolve(publicTypesDir, 'projection.d.ts'));
rmSync(resolve(distDir, '.types-public'), { recursive: true, force: true });

appendOnce(resolve(distDir, 'index.js'), '\nexport * from "./projection.js";\n');
appendOnce(
  resolve(distDir, 'types/sdk/index.d.ts'),
  '\nexport * from "../projection";\n',
);

console.log('✓ @limecloud/agent-app-runtime built to dist/');

function appendOnce(filePath, snippet) {
  const content = readFileSync(filePath, 'utf8');
  if (!content.includes(snippet.trim())) {
    writeFileSync(filePath, `${content.replace(/\s*$/, '')}${snippet}`);
  }
}

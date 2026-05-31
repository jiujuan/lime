import { describe, expect, it } from "vitest";

import {
  classifyVitestTestFile,
  isVitestTestFile,
  normalizeVitestPath,
} from "./vitest-layer-classifier.mjs";

describe("vitest-layer-classifier unit boundary", () => {
  it("应识别 Vitest 测试文件路径并归一 Windows 分隔符", () => {
    expect(isVitestTestFile("src/lib/foo.test.ts")).toBe(true);
    expect(isVitestTestFile("src/lib/foo.spec.tsx")).toBe(true);
    expect(isVitestTestFile("src/lib/foo.ts")).toBe(false);
    expect(normalizeVitestPath("src\\lib\\foo.test.ts")).toBe(
      "src/lib/foo.test.ts",
    );
  });

  it("无外部边界的 TypeScript 测试默认归为 unit", () => {
    expect(
      classifyVitestTestFile({
        filePath: "src/lib/model/providerModelLoadOptions.test.ts",
        source: "import { describe, expect, it } from 'vitest';",
      }),
    ).toMatchObject({
      layer: "unit",
      reasons: ["default:unit"],
    });
  });

  it("React 或 jsdom 测试应归为 component", () => {
    expect(
      classifyVitestTestFile({
        filePath: "src/components/Foo.test.tsx",
        source: "import { render, screen } from '@testing-library/react';",
      }),
    ).toMatchObject({
      layer: "component",
    });

    expect(
      classifyVitestTestFile({
        filePath: "src/components/Foo.test.ts",
        source: "expect(window.localStorage).toBeDefined();",
      }),
    ).toMatchObject({
      layer: "component",
    });
  });

  it("Tauri / DevBridge / command catalog 测试应归为 contract", () => {
    expect(
      classifyVitestTestFile({
        filePath: "src/lib/api/agent.test.ts",
        source: "import { safeInvoke } from '../dev-bridge/safeInvoke';",
      }),
    ).toMatchObject({
      layer: "contract",
    });

    expect(
      classifyVitestTestFile({
        filePath: "src/lib/governance/commands.test.ts",
        source: "expect(mockPriorityCommands).toContain('agent_runtime_submit_turn');",
      }),
    ).toMatchObject({
      layer: "contract",
    });
  });

  it("文件系统、子进程、网络和显式 integration 名称应归为 integration", () => {
    const samples = [
      {
        filePath: "scripts/foo.test.ts",
        source: "import fs from 'node:fs';",
      },
      {
        filePath: "scripts/foo.test.ts",
        source: "import { spawnSync } from 'node:child_process';",
      },
      {
        filePath: "scripts/foo.test.ts",
        source: "await fetch('http://127.0.0.1:3030/health');",
      },
      {
        filePath: "src/components/Foo.integration.test.tsx",
        source: "import { render } from '@testing-library/react';",
      },
      {
        filePath: "src/lib/api/project-integration.test.ts",
        source: "import { describe, expect, it } from 'vitest';",
      },
    ];

    for (const sample of samples) {
      expect(classifyVitestTestFile(sample)).toMatchObject({
        layer: "integration",
      });
    }
  });

  it("更高风险边界优先于组件特征", () => {
    expect(
      classifyVitestTestFile({
        filePath: "src/components/Foo.test.tsx",
        source:
          "import { render } from '@testing-library/react'; import fs from 'node:fs';",
      }),
    ).toMatchObject({
      layer: "integration",
    });
  });

  it("显式 e2e / smoke / live 和 Playwright 自动化测试应归为 e2e", () => {
    const samples = [
      {
        filePath: "src/features/foo.e2e.test.ts",
        source: "import { describe, expect, it } from 'vitest';",
      },
      {
        filePath: "src/features/foo-smoke.test.ts",
        source: "import { describe, expect, it } from 'vitest';",
      },
      {
        filePath: "src/components/image-gen/useImageGen.live.test.ts",
        source: "import { describe, expect, it } from 'vitest';",
      },
      {
        filePath: "src/features/foo.test.ts",
        source: "import { test } from '@playwright/test';",
      },
    ];

    for (const sample of samples) {
      expect(classifyVitestTestFile(sample)).toMatchObject({
        layer: "e2e",
      });
    }
  });

  it("smoke helper 和 Playwright 文本引用不应误归为 e2e", () => {
    expect(
      classifyVitestTestFile({
        filePath: "scripts/lib/managed-objective-automation-smoke-support.test.mjs",
        source: "import { describe, expect, it } from 'vitest';",
      }),
    ).toMatchObject({
      layer: "unit",
    });

    expect(
      classifyVitestTestFile({
        filePath: "src/components/agent/chat/utils/toolSearchResultSummary.test.ts",
        source:
          "expect(resolveLabel('mcp__playwright__browser_click')).toBe('扩展工具');",
      }),
    ).toMatchObject({
      layer: "unit",
    });
  });
});

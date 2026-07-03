import { describe, expect, it } from "vitest";
import {
  classifyPluginReadinessIssueCode,
  getPrimaryPluginReadinessIssueCategory,
  summarizePluginReadinessIssueCategories,
} from "./pluginReadinessIssueClassification";

describe("pluginReadinessIssueClassification", () => {
  it("按 stable readiness code 归类发布门禁问题", () => {
    expect(classifyPluginReadinessIssueCode("PACKAGE_HASH_MISMATCH")).toBe(
      "package",
    );
    expect(
      classifyPluginReadinessIssueCode("MANIFEST_HASH_UNVERIFIED"),
    ).toBe("package");
    expect(classifyPluginReadinessIssueCode("CLOUD_REGISTRATION_REQUIRED"))
      .toBe("cloud");
    expect(
      classifyPluginReadinessIssueCode(
        "CLOUD_SIGNATURE_VERIFICATION_FAILED",
      ),
    ).toBe("cloud");
    expect(classifyPluginReadinessIssueCode("CAPABILITY_MISSING")).toBe(
      "capability",
    );
    expect(
      classifyPluginReadinessIssueCode(
        "TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED",
      ),
    ).toBe("taskRuntime");
    expect(classifyPluginReadinessIssueCode("NEW_UNKNOWN_CODE")).toBe(
      "unknown",
    );
  });

  it("汇总分类时保留总次数和唯一 code", () => {
    const summaries = summarizePluginReadinessIssueCategories([
      "CAPABILITY_MISSING",
      "CAPABILITY_MISSING",
      "SECRET_REQUIRED",
      "TOOL_REQUIRED",
      " ",
      null,
    ]);

    expect(summaries).toEqual([
      {
        category: "capability",
        count: 2,
        codes: ["CAPABILITY_MISSING"],
      },
      {
        category: "permission",
        count: 1,
        codes: ["SECRET_REQUIRED"],
      },
      {
        category: "resource",
        count: 1,
        codes: ["TOOL_REQUIRED"],
      },
    ]);
  });

  it("primary category 按发布门禁优先级选择", () => {
    const summaries = summarizePluginReadinessIssueCategories([
      "CAPABILITY_MISSING",
      "PACKAGE_HASH_MISSING",
      "LEGACY_OR_DEPRECATED_APP",
      "CLOUD_APP_DISABLED",
    ]);

    expect(getPrimaryPluginReadinessIssueCategory(summaries)).toBe(
      "legacy",
    );
  });
});

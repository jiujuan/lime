import { describe, expect, it } from "vitest";
import {
  classifyAgentAppReadinessIssueCode,
  getPrimaryAgentAppReadinessIssueCategory,
  summarizeAgentAppReadinessIssueCategories,
} from "./agentAppReadinessIssueClassification";

describe("agentAppReadinessIssueClassification", () => {
  it("按 stable readiness code 归类发布门禁问题", () => {
    expect(classifyAgentAppReadinessIssueCode("PACKAGE_HASH_MISMATCH")).toBe(
      "package",
    );
    expect(
      classifyAgentAppReadinessIssueCode("MANIFEST_HASH_UNVERIFIED"),
    ).toBe("package");
    expect(classifyAgentAppReadinessIssueCode("CLOUD_REGISTRATION_REQUIRED"))
      .toBe("cloud");
    expect(
      classifyAgentAppReadinessIssueCode(
        "CLOUD_SIGNATURE_VERIFICATION_FAILED",
      ),
    ).toBe("cloud");
    expect(classifyAgentAppReadinessIssueCode("CAPABILITY_MISSING")).toBe(
      "capability",
    );
    expect(
      classifyAgentAppReadinessIssueCode(
        "TASK_RUNTIME_DIRECT_PROVIDER_ACCESS_UNSUPPORTED",
      ),
    ).toBe("taskRuntime");
    expect(classifyAgentAppReadinessIssueCode("NEW_UNKNOWN_CODE")).toBe(
      "unknown",
    );
  });

  it("汇总分类时保留总次数和唯一 code", () => {
    const summaries = summarizeAgentAppReadinessIssueCategories([
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
    const summaries = summarizeAgentAppReadinessIssueCategories([
      "CAPABILITY_MISSING",
      "PACKAGE_HASH_MISSING",
      "LEGACY_OR_DEPRECATED_APP",
      "CLOUD_APP_DISABLED",
    ]);

    expect(getPrimaryAgentAppReadinessIssueCategory(summaries)).toBe(
      "legacy",
    );
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { HarnessVerificationSummarySection } from "./HarnessVerificationSummarySection";
import { changeLimeLocale } from "@/i18n/createI18n";

const mountedRoots: Array<{ container: HTMLDivElement; root: Root }> = [];

function renderSection() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <HarnessVerificationSummarySection
        summary={{
          artifact_validator: {
            applicable: true,
            fallback_used_count: 0,
            issue_count: 2,
            outcome: "blocking_failure",
            record_count: 1,
            repaired_count: 1,
          },
          browser_verification: undefined,
          focus_verification_failure_outcomes: ["missing artifact"],
          focus_verification_recovered_outcomes: ["browser recovered"],
          gui_smoke: {
            has_output_preview: true,
            outcome: "recovered",
            passed: false,
            status: "failed",
          },
        }}
      />,
    );
  });

  mountedRoots.push({ container, root });
  return container;
}

describe("HarnessVerificationSummarySection", () => {
  beforeEach(async () => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT?: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    while (mountedRoots.length > 0) {
      const mounted = mountedRoots.pop();
      if (!mounted) {
        continue;
      }
      act(() => {
        mounted.root.unmount();
      });
      mounted.container.remove();
    }
    document.body.innerHTML = "";
    await changeLimeLocale("zh-CN");
  });

  it("uses agent namespace resources for verification section chrome", () => {
    const container = renderSection();
    const text = container.textContent ?? "";

    expect(text).toContain("Verification Results");
    expect(text).toContain("Artifact Validation");
    expect(text).toContain("Blocking failure");
    expect(text).toContain("Records 1 · issues 2 · repaired 1 · fallback 0");
    expect(text).toContain("Recovered");
    expect(text).toContain("Status failed · exit Unknown · Failed");
    expect(text).toContain("Verification failure focus");
    expect(text).toContain("Recovered results");
    expect(text).toContain("missing artifact");
    expect(text).not.toContain("验证结果");
    expect(text).not.toContain("验证失败焦点");
  });
});

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildHarnessEvidenceVerificationCardPresentations,
  resolveHarnessVerificationOutcomeBadgePresentation,
} from "./harnessVerificationPresentation";
import { changeLimeLocale, getLimeI18n } from "@/i18n/createI18n";

function buildPresentationOptions() {
  return {
    locale: "en-US",
    t: getLimeI18n().getFixedT("en-US", "agent"),
  };
}

describe("harnessVerificationPresentation", () => {
  beforeEach(async () => {
    await changeLimeLocale("en-US");
  });

  afterEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("应统一 outcome 徽标文案与样式", () => {
    const { t } = buildPresentationOptions();

    expect(
      resolveHarnessVerificationOutcomeBadgePresentation("success", t),
    ).toEqual({
      label: "Passed",
      variant: "secondary",
    });
    expect(
      resolveHarnessVerificationOutcomeBadgePresentation("blocking_failure", t),
    ).toEqual({
      label: "Blocking failure",
      variant: "destructive",
    });
    expect(
      resolveHarnessVerificationOutcomeBadgePresentation("advisory_failure", t),
    ).toEqual({
      label: "Advisory failure",
      variant: "outline",
    });
    expect(
      resolveHarnessVerificationOutcomeBadgePresentation("recovered", t),
    ).toEqual({
      label: "Recovered",
      variant: "outline",
    });
    expect(
      resolveHarnessVerificationOutcomeBadgePresentation(undefined, t),
    ).toEqual({
      label: "Unknown",
      variant: "outline",
    });
  });

  it("应把 evidence verification summary 统一转换成前端展示卡片", () => {
    expect(
      buildHarnessEvidenceVerificationCardPresentations(
        {
          artifact_validator: {
            applicable: true,
            record_count: 1,
            issue_count: 2,
            repaired_count: 1,
            fallback_used_count: 0,
            outcome: "blocking_failure",
          },
          browser_verification: {
            record_count: 2,
            success_count: 1,
            failure_count: 1,
            unknown_count: 0,
            outcome: "advisory_failure",
          },
          gui_smoke: {
            status: "failed",
            exit_code: 1,
            passed: false,
            has_output_preview: true,
            outcome: "recovered",
          },
          focus_verification_failure_outcomes: [],
          focus_verification_recovered_outcomes: [],
        },
        buildPresentationOptions(),
      ),
    ).toEqual([
      {
        key: "artifact_validator",
        title: "Artifact Validation",
        badge: {
          label: "Blocking failure",
          variant: "destructive",
        },
        description: "Records 1 · issues 2 · repaired 1 · fallback 0",
      },
      {
        key: "browser_verification",
        title: "Browser Verification",
        badge: {
          label: "Advisory failure",
          variant: "outline",
        },
        description: "Records 2 · success 1 · failed 1 · unknown 0",
      },
      {
        key: "gui_smoke",
        title: "GUI Smoke",
        badge: {
          label: "Recovered",
          variant: "outline",
        },
        description: "Status failed · exit 1 · Failed",
      },
    ]);
  });

  it("应为缺失或不适用的验证提供统一兜底文案", () => {
    expect(
      buildHarnessEvidenceVerificationCardPresentations(
        {
          artifact_validator: {
            applicable: false,
            record_count: 0,
            issue_count: 0,
            repaired_count: 0,
            fallback_used_count: 0,
          },
          browser_verification: undefined,
          gui_smoke: {
            passed: true,
            has_output_preview: false,
          },
          focus_verification_failure_outcomes: [],
          focus_verification_recovered_outcomes: [],
        },
        buildPresentationOptions(),
      ),
    ).toEqual([
      {
        key: "artifact_validator",
        title: "Artifact Validation",
        badge: {
          label: "Unknown",
          variant: "outline",
        },
        description: "No applicable artifact validation.",
      },
      {
        key: "gui_smoke",
        title: "GUI Smoke",
        badge: {
          label: "Unknown",
          variant: "outline",
        },
        description: "Status Unknown · exit Unknown · Passed",
      },
    ]);
  });
});

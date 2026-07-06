import { describe, expect, it } from "vitest";

import {
  buildContentFactoryProductionReadinessBlockerPlan,
  classifyContentFactoryProductionReadinessCode,
} from "./content-factory-production-readiness-plan.mjs";

describe("content factory production readiness blocker plan", () => {
  it("keeps the report ready when no blocker codes remain", () => {
    expect(buildContentFactoryProductionReadinessBlockerPlan([])).toMatchObject(
      {
        blockedCount: 0,
        blockedPhaseCount: 0,
        nextPhase: null,
        ready: true,
      },
    );
  });

  it("groups operator inputs separately from desktop cloud_release E2E", () => {
    const plan = buildContentFactoryProductionReadinessBlockerPlan([
      { code: "production_package_url_missing" },
      { code: "production_catalog_missing" },
      { code: "production_fetch_cloud_evidence_missing" },
      { code: "production_gui_signature_not_verified" },
      { code: "production_workflow_resume_lifecycle_missing" },
    ]);

    expect(plan).toMatchObject({
      ready: false,
      nextPhase: {
        id: "studio_publish_inputs",
        owner: "operator",
      },
    });
    expect(
      plan.phases.find((phase) => phase.id === "studio_publish_inputs"),
    ).toMatchObject({
      blocked: true,
      commandHint:
        "npm run plugin:content-factory-production-readiness-pipeline -- --expected-version <version> --package-url <https-url> --tenant-id <tenant-id> --studio-token-env LIME_AGENT_APP_STUDIO_TOKEN # requires local env: LIME_AGENT_APP_STUDIO_TOKEN",
      codes: ["production_package_url_missing"],
    });
    expect(
      plan.phases.find((phase) => phase.id === "studio_publish_inputs")
        ?.commandHint,
    ).not.toContain("<token>");
    expect(
      plan.phases.find((phase) => phase.id === "studio_publish_inputs")
        ?.nextAction,
    ).toContain("只有覆盖默认地址时才传 --api-base");
    expect(
      plan.phases.find((phase) => phase.id === "desktop_cloud_release_e2e"),
    ).toMatchObject({
      blocked: true,
      codes: [
        "production_gui_signature_not_verified",
        "production_workflow_resume_lifecycle_missing",
      ],
    });
  });

  it("uses specific preflight blockers to drive the next meaningful phase", () => {
    const plan = buildContentFactoryProductionReadinessBlockerPlan([
      "production_preflight_not_ready",
      "production_app_signature_yaml_missing",
      "production_trust_root_missing",
      "production_catalog_missing",
    ]);

    expect(plan.nextPhase).toMatchObject({
      id: "release_signing_and_trust",
      owner: "operator",
    });
    expect(
      plan.phases.find((phase) => phase.id === "release_signing_and_trust")
        ?.commandHint,
    ).toContain("--generate-signature-proof");
    expect(
      plan.phases.find((phase) => phase.id === "release_signing_and_trust")
        ?.commandHint,
    ).toContain("requires local env: PLUGIN_SIGNING_PRIVATE_KEY_PEM");
    expect(
      plan.phases.find((phase) => phase.id === "release_signing_and_trust")
        ?.commandHint,
    ).not.toContain("<private-key>");
    expect(
      plan.phases.find((phase) => phase.id === "release_signing_and_trust")
        ?.commandHint,
    ).not.toContain("--app-signature <app.signature.yaml>");
    expect(plan.summary).toContain("production_app_signature_yaml_missing");
  });

  it("keeps cryptographic signature verification blockers in release signing", () => {
    const plan = buildContentFactoryProductionReadinessBlockerPlan([
      "production_signature_payload_hash_mismatch",
      "production_signature_cryptographic_verification_failed",
      "production_signature_trust_root_public_key_missing",
      "production_preflight_signature_cryptographic_verification_missing",
    ]);

    expect(plan.nextPhase).toMatchObject({
      id: "release_signing_and_trust",
      owner: "operator",
    });
    expect(
      plan.phases.find((phase) => phase.id === "release_signing_and_trust"),
    ).toMatchObject({
      blocked: true,
      count: 4,
    });
  });

  it("fails closed for unknown production blocker codes", () => {
    expect(
      classifyContentFactoryProductionReadinessCode(
        "production_new_requirement_missing",
      ),
    ).toMatchObject({
      id: "unknown",
    });
    expect(
      buildContentFactoryProductionReadinessBlockerPlan([
        "production_new_requirement_missing",
      ]),
    ).toMatchObject({
      ready: false,
      nextPhase: {
        id: "unknown",
        owner: "engineering",
      },
    });
  });
});

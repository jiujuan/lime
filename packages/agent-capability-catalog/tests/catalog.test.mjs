import assert from "node:assert/strict";
import test from "node:test";

import {
  AGENT_SHARED_CAPABILITIES,
  assertAgentCapabilitiesAllowed,
  buildAgentCapabilityPolicy,
  getAgentCapabilityDefinition,
  resolveAgentCapabilityId,
  resolveAgentCapabilityIds,
  validateAgentCapabilities,
} from "../dist/index.js";

test("resolves stable capability ids from legacy and Claw aliases", () => {
  assert.equal(resolveAgentCapabilityId("web_search"), "lime.capability.research.search");
  assert.equal(resolveAgentCapabilityId("pdf_extract"), "lime.capability.pdf.read");
  assert.equal(resolveAgentCapabilityId("image_generation"), "lime.capability.image.generate");
  assert.deepEqual(resolveAgentCapabilityIds(["research", "web_search", "pdf"]), [
    "lime.capability.pdf.read",
    "lime.capability.research.search",
  ]);
});

test("builds a reusable runtime policy with contracts", () => {
  const policy = buildAgentCapabilityPolicy({
    selectedSkillSlugs: ["copywriting-master", "copywriting-master"],
    permissionMode: "safe",
    requiredCapabilities: ["research", "pdf_extract"],
    capabilityHints: ["summary"],
  });

  assert.deepEqual(policy.selectedSkillSlugs, ["copywriting-master"]);
  assert.equal(policy.permissionMode, "safe");
  assert.deepEqual(policy.requiredCapabilities, [
    "lime.capability.pdf.read",
    "lime.capability.research.search",
  ]);
  assert.deepEqual(policy.capabilityHints, ["lime.capability.summary.generate"]);
  assert.equal(policy.metadata.capabilityContracts.length, 3);
  assert.ok(policy.metadata.capabilityContracts.every((contract) => contract.requiredKeys.includes("taskKind")));
});

test("validates unknown and not allowed capabilities", () => {
  assert.deepEqual(validateAgentCapabilities({ capabilities: ["unknown"] }).map((issue) => issue.code), ["unknown-capability"]);
  assert.deepEqual(validateAgentCapabilities({
    capabilities: ["image"],
    allowlist: ["research"],
  }).map((issue) => issue.code), ["not-allowed"]);
  assert.throws(() => assertAgentCapabilitiesAllowed({ capabilities: ["image"], allowlist: ["research"] }), /not allowed/);
});

test("catalog exposes definitions for all shared ids", () => {
  for (const capabilityId of AGENT_SHARED_CAPABILITIES) {
    const definition = getAgentCapabilityDefinition(capabilityId);
    assert.ok(definition, capabilityId);
    assert.equal(definition.owner, "agent-runtime");
  }
});

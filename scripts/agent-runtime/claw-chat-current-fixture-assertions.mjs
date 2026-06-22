import { summarizeBackendLedger } from "./claw-chat-current-fixture-backend-ledger.mjs";
import { buildAssertionContext } from "./claw-chat-current-fixture-assertion-context.mjs";
import { buildCommonAssertions } from "./claw-chat-current-fixture-common-assertions.mjs";
import { buildNotApplicableAssertions } from "./claw-chat-current-fixture-not-applicable-assertions.mjs";
import { buildScenarioAssertions } from "./claw-chat-current-fixture-scenario-assertions.mjs";
import { assert } from "./claw-chat-current-fixture-utils.mjs";

export function buildFixtureAssertionReport(input) {
  const backendSummary = summarizeBackendLedger(input.backendLedger);
  const context = buildAssertionContext(input);
  const commonAssertions = buildCommonAssertions(context);
  const scenarioAssertions = buildScenarioAssertions(context);
  const notApplicableAssertions = buildNotApplicableAssertions(context);
  const assertions = {
    ...commonAssertions,
    ...scenarioAssertions,
  };

  for (const [key, passed] of Object.entries(assertions)) {
    assert(passed, `断言失败: ${key}`);
  }

  return {
    appServerRequestMethods: context.appServerRequestMethods,
    backendSummary,
    assertions,
    commonAssertions,
    scenarioAssertions,
    notApplicableAssertions,
  };
}

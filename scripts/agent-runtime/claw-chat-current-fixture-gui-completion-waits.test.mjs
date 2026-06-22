import { describe, expect, it } from "vitest";

import { countTextOccurrences } from "./claw-chat-current-fixture-gui-completion-waits.mjs";

describe("claw chat current fixture GUI completion waits", () => {
  it("counts summary occurrences for duplicate rendering guards", () => {
    expect(countTextOccurrences("", "summary")).toBe(0);
    expect(countTextOccurrences("summary\nprocess\nsummary", "summary")).toBe(
      2,
    );
    expect(countTextOccurrences("summary", "")).toBe(0);
  });
});

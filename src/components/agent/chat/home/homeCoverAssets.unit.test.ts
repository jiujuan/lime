import { describe, expect, it } from "vitest";

import { resolveHomeCoverAsset } from "./homeCoverAssets";

describe("resolveHomeCoverAsset", () => {
  it("uses bundled WebP assets instead of file-root public paths", () => {
    const cover = resolveHomeCoverAsset("viral");

    expect(cover).toMatch(/home-cover-viral.*\.webp$/);
    expect(cover).not.toContain("/home-covers/");
  });

  it("keeps semantic fallback selection on the bundled asset owner", () => {
    expect(resolveHomeCoverAsset("weekly trend report")).toMatch(
      /home-cover-trend.*\.webp$/,
    );
    expect(resolveHomeCoverAsset("unknown-skill")).toMatch(
      /home-cover-review.*\.webp$/,
    );
  });
});

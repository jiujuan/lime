import { describe, expect, it } from "vitest";
import {
  DREAM_BLOSSOM_DARK_SKIN_VARIABLE_OVERRIDES,
  DREAM_BLOSSOM_SKIN_VARIABLES,
} from "./dreamBlossomHomeSkin";

describe("dreamBlossomHomeSkin", () => {
  it("应提供覆盖 App Shell、侧栏、Chrome 和输入区的浅色 token", () => {
    expect(DREAM_BLOSSOM_SKIN_VARIABLES).toMatchObject({
      "--lime-app-bg": "#fdf3f7",
      "--lime-sidebar-active": "#f4d9e3",
      "--lime-chrome-rail": "#f8e8ef",
      "--lime-composer-border-focus": "#cf7192",
    });
  });

  it("深色模式应保留 Dream Blossom 的酒红语义", () => {
    expect(DREAM_BLOSSOM_DARK_SKIN_VARIABLE_OVERRIDES).toMatchObject({
      "--lime-app-bg": "#160f14",
      "--lime-sidebar-active": "#482d3a",
      "--lime-brand": "#ec8eae",
      "--lime-composer-surface": "#251820",
    });
  });
});

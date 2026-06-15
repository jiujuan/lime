import { describe, expect, it } from "vitest";
import { buildUpdateNotificationWindowUrl } from "./updateNotificationWindowUrl";

describe("buildUpdateNotificationWindowUrl", () => {
  it("开发环境应直接打开 dev server 下的更新路由", () => {
    expect(
      buildUpdateNotificationWindowUrl({
        appPath: "/Applications/Lime.app/Contents/Resources/app.asar",
        devServerUrl: "http://127.0.0.1:1420/",
        current: "1.57.0",
        latest: "1.58.0",
        downloadUrl: "https://example.com/release",
      }),
    ).toBe(
      "http://127.0.0.1:1420/update-notification?lime_window=update-notification&current=1.57.0&latest=1.58.0&download_url=https%3A%2F%2Fexample.com%2Frelease",
    );
  });

  it("打包环境应经 index.html 窗口路由进入更新提醒页", () => {
    const url = buildUpdateNotificationWindowUrl({
      appPath: "/Applications/Lime.app/Contents/Resources/app.asar",
      latest: "1.58.0",
    });

    expect(url).toContain("/dist/index.html?");
    expect(url).toContain("lime_window=update-notification");
    expect(url).toContain("latest=1.58.0");
  });
});

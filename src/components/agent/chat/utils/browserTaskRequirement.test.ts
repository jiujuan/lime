import { describe, expect, it } from "vitest";

import { detectBrowserTaskRequirement } from "./browserTaskRequirement";

describe("browserTaskRequirement", () => {
  it("发布微信公众号文章应识别为必须浏览器且需要用户步骤", () => {
    expect(
      detectBrowserTaskRequirement("帮我把这篇文章发布到微信公众号后台"),
    ).toMatchObject({
      requirement: "required_with_user_step",
      launchUrl: "https://mp.weixin.qq.com/",
      platformLabel: "微信公众号后台",
    });
  });

  it("后台表单提交任务应识别为必须浏览器", () => {
    expect(
      detectBrowserTaskRequirement("登录后台填写表单并提交线索"),
    ).toMatchObject({
      requirement: "required_with_user_step",
    });
  });

  it("写公众号文章不应误判为微信公众号后台操作", () => {
    expect(
      detectBrowserTaskRequirement("@内容工厂 写一篇公众号文章"),
    ).toBeNull();
    expect(detectBrowserTaskRequirement("写一篇公众号文章")).toBeNull();
  });

  it("普通网页浏览与阅读不应误判为必须浏览器任务", () => {
    expect(
      detectBrowserTaskRequirement("打开京东商品页看看今天的价格"),
    ).toBeNull();
  });

  it("显式 URL + Browser Assist 指令应识别为必须浏览器任务", () => {
    expect(
      detectBrowserTaskRequirement(
        "打开 https://news.baidu.com，使用浏览器协助模式执行，并把实时浏览器画面显示在右侧画布中。",
      ),
    ).toMatchObject({
      requirement: "required",
      launchUrl: "https://news.baidu.com",
    });
  });

  it("发布验收与控制台检查不应误判为网页后台任务", () => {
    expect(
      detectBrowserTaskRequirement(
        "请生成发布验收摘要，包含慢输入压力、发送到对话页链路和控制台检查。",
      ),
    ).toBeNull();
  });

  it("X / Twitter 发布任务也应识别为必须浏览器且需要用户步骤", () => {
    expect(
      detectBrowserTaskRequirement(
        "平台:X / Twitter 帮我整理成可直接发布的版本",
      ),
    ).toMatchObject({
      requirement: "required_with_user_step",
      launchUrl: "https://x.com/compose/post",
      platformLabel: "X / Twitter",
    });
  });
});

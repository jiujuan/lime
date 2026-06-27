import { describe, expect, it } from "vitest";
import {
  applyInputbarPluginSelection,
  normalizeInputbarPluginTrigger,
  removeInputbarPluginSelection,
  resolveInputbarPluginDisplayName,
} from "./pluginInputCapability";

describe("pluginInputCapability", () => {
  it("展示名称为空时应回退显示插件 id", () => {
    expect(
      resolveInputbarPluginDisplayName({
        pluginId: "content-workbench",
        displayName: " ",
      }),
    ).toBe("content-workbench");
  });

  it("应优先使用展示名称生成显式触发前缀", () => {
    expect(
      normalizeInputbarPluginTrigger({
        pluginId: "content-workbench",
        displayName: "内容工厂",
      }),
    ).toBe("@内容工厂");
  });

  it("选择插件技能时应生成 @插件:技能 触发前缀", () => {
    expect(
      normalizeInputbarPluginTrigger(
        {
          pluginId: "content-workbench",
          displayName: "内容工厂",
        },
        {
          skillId: "article-writer",
          title: "文章写作",
        },
      ),
    ).toBe("@内容工厂:文章写作");
  });

  it("展示名称为空时应回退到插件 id", () => {
    expect(
      normalizeInputbarPluginTrigger({
        pluginId: "content-workbench",
        displayName: " ",
      }),
    ).toBe("@content-workbench");
  });

  it("选择插件时应把显式触发前缀写到输入开头", () => {
    expect(
      applyInputbarPluginSelection({
        input: "整理选题",
        plugin: {
          pluginId: "content-workbench",
          displayName: "内容工厂",
        },
      }).text,
    ).toBe("@内容工厂 整理选题");
  });

  it("选择插件技能时应把显式技能触发前缀写到输入开头", () => {
    const selection = applyInputbarPluginSelection({
      input: "整理选题",
      plugin: {
        pluginId: "content-workbench",
        displayName: "内容工厂",
      },
      skill: {
        skillId: "article-writer",
        title: "文章写作",
      },
    });

    expect(selection).toMatchObject({
      skill: {
        skillId: "article-writer",
      },
      trigger: "@内容工厂:文章写作",
      text: "@内容工厂:文章写作 整理选题",
    });
  });

  it("已存在同一触发前缀时不应重复叠加", () => {
    expect(
      applyInputbarPluginSelection({
        input: "@内容工厂 整理选题",
        plugin: {
          pluginId: "content-workbench",
          displayName: "内容工厂",
        },
      }).text,
    ).toBe("@内容工厂 整理选题");
  });

  it("从 @ 面板补全出的触发前缀应保留尾随空格", () => {
    expect(
      applyInputbarPluginSelection({
        input: "@内容工厂 ",
        plugin: {
          pluginId: "content-workbench",
          displayName: "内容工厂",
        },
      }).text,
    ).toBe("@内容工厂 ");
  });

  it("移除插件选择时应清除对应触发前缀", () => {
    const selection = applyInputbarPluginSelection({
      input: "整理选题",
      plugin: {
        pluginId: "content-workbench",
        displayName: "内容工厂",
      },
    });

    expect(
      removeInputbarPluginSelection({
        input: "@内容工厂 整理选题",
        selection,
      }),
    ).toBe("整理选题");
  });
});

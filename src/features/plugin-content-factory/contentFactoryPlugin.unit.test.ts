import { describe, expect, it } from "vitest";
import contentFactoryFixture from "@/features/plugin/testing/fixtures/content-factory-app.json";
import {
  buildContentFactoryPluginDogfoodContract,
  CONTENT_FACTORY_PLUGIN_ENTRY_KEY,
  CONTENT_FACTORY_PLUGIN_GENERATE_ENTRY_KEY,
  CONTENT_FACTORY_PLUGIN_ID,
} from "./contentFactoryPlugin";

describe("contentFactoryPlugin", () => {
  const dogfoodParams = { manifest: contentFactoryFixture };

  it("应把内容工厂 dogfood 固定为插件 contract，而不是旧独立应用入口", () => {
    const dogfood = buildContentFactoryPluginDogfoodContract(dogfoodParams);

    expect(dogfood.contract).toMatchObject({
      id: CONTENT_FACTORY_PLUGIN_ID,
      displayName: "内容工厂",
      provenance: {
        sourceKind: "plugin_manifest",
        sourceId: CONTENT_FACTORY_PLUGIN_ID,
      },
      rightSurface: {
        defaultActiveTab: "articleWorkspace",
        articleWorkspace: {
          enabled: true,
          primaryObjectKind: "articleDraft",
        },
        historyRestore: {
          enabled: true,
          restoreSelection: true,
          restoreLayout: true,
        },
      },
    });
    expect(dogfood.contract.activationEntries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          key: CONTENT_FACTORY_PLUGIN_ENTRY_KEY,
          intent: "manual",
          defaultObjectKind: "articleDraft",
        }),
        expect.objectContaining({
          key: CONTENT_FACTORY_PLUGIN_GENERATE_ENTRY_KEY,
          intent: "at_command",
          defaultObjectKind: "articleDraft",
        }),
        expect.objectContaining({
          key: "content_article_generate",
          title: "写文章",
          aliases: ["@写文章", "@写作"],
          intent: "at_command",
          defaultObjectKind: "articleDraft",
        }),
      ]),
    );
  });

  it("应声明内容工厂 MVP 需要的 host builtin 产物 renderer", () => {
    const dogfood = buildContentFactoryPluginDogfoodContract(dogfoodParams);

    expect(dogfood.contract.artifactRenderers).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          artifactType: "markdown_document",
          surfaceKind: "documentCanvas",
          rendererKind: "host_builtin",
          outputArtifactKind: "content_factory.workspace_patch",
        }),
        expect.objectContaining({
          artifactType: "image_set",
          surfaceKind: "imageGrid",
          rendererKind: "host_builtin",
        }),
        expect.objectContaining({
          artifactType: "video_script",
          surfaceKind: "documentCanvas",
          rendererKind: "host_builtin",
        }),
        expect.objectContaining({
          artifactType: "storyboard",
          surfaceKind: "storyboard",
          rendererKind: "host_builtin",
        }),
        expect.objectContaining({
          artifactType: "delivery_checklist",
          surfaceKind: "checklist",
          rendererKind: "host_builtin",
        }),
      ]),
    );
  });

  it("应生成可显式 @ 激活的 catalog 与可激活 registry", () => {
    const dogfood = buildContentFactoryPluginDogfoodContract(dogfoodParams);

    expect(dogfood.registryItem).toMatchObject({
      pluginId: CONTENT_FACTORY_PLUGIN_ID,
      installed: true,
      enabled: true,
      activationState: "activatable",
      capabilityStates: expect.arrayContaining(["activatable", "renderable"]),
    });
    expect(dogfood.activationCatalog.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prefix: "@内容工厂",
          pluginId: CONTENT_FACTORY_PLUGIN_ID,
          activeEntryKey: CONTENT_FACTORY_PLUGIN_ENTRY_KEY,
          defaultObjectKind: "articleDraft",
          activationState: "activatable",
        }),
      ]),
    );
  });

  it("dogfood catalog 应从 manifest aliases 提供写文章入口", () => {
    const { activationCatalog: catalog } =
      buildContentFactoryPluginDogfoodContract(dogfoodParams);

    expect(catalog.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          prefix: "@写文章",
          pluginId: CONTENT_FACTORY_PLUGIN_ID,
          activeEntryKey: "content_article_generate",
          defaultObjectKind: "articleDraft",
          activationState: "activatable",
        }),
        expect.objectContaining({
          prefix: "@写作",
          pluginId: CONTENT_FACTORY_PLUGIN_ID,
          activeEntryKey: "content_article_generate",
          defaultObjectKind: "articleDraft",
          activationState: "activatable",
        }),
      ]),
    );
  });
});

/**
 * @file hotkeyCatalog.ts
 * @description 快捷键页的共享事实源
 */

import {
  formatShortcutTokens,
  type HotkeyPlatform,
} from "@/lib/hotkeys/platform";
import type { AuditedHotkeyDefinition, HotkeyScene } from "@/lib/hotkeys/types";
import { DOCUMENT_CANVAS_HOTKEYS } from "@/lib/workspace/workbenchCanvas";
import { DOCUMENT_EDITOR_HOTKEYS } from "@/lib/workspace/workbenchCanvas";
import { WORKBENCH_SIDEBAR_TOGGLE_HOTKEY } from "@/components/workspace/hooks/workbenchHotkeys";

export type HotkeyStatusKind =
  | "ready"
  | "inactive"
  | "needs-config"
  | "runtime-error";

export interface AuditedHotkeyItem extends AuditedHotkeyDefinition {
  keys: string[];
  status: HotkeyStatusKind;
  statusLabel: string;
  statusDescription: string;
  available: boolean;
}

export interface AuditedHotkeySection {
  scene: HotkeyScene;
  title: string;
  description: string;
  hotkeys: AuditedHotkeyItem[];
}

type AuditedHotkeyCopyFields = Pick<
  AuditedHotkeyDefinition,
  "label" | "description" | "source" | "condition"
>;

export type HotkeyCatalogTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface HotkeyCatalogCopy {
  definitions: Record<string, AuditedHotkeyCopyFields>;
  scenes: Record<HotkeyScene, { title: string; description: string }>;
  status: {
    staticReadyLabel: string;
  };
}

interface AuditedHotkeySummary {
  total: number;
  ready: number;
  attention: number;
  globalReady: number;
}

interface AuditedHotkeyCatalog {
  sections: AuditedHotkeySection[];
  summary: AuditedHotkeySummary;
}

interface BuildHotkeyCatalogParams {
  platform: HotkeyPlatform;
  copy?: HotkeyCatalogCopy;
}

function buildDefinitionCopy(
  definitions: AuditedHotkeyDefinition[],
): Record<string, AuditedHotkeyCopyFields> {
  return Object.fromEntries(
    definitions.map((definition) => [
      definition.id,
      {
        label: definition.label,
        description: definition.description,
        source: definition.source,
        condition: definition.condition,
      },
    ]),
  );
}

export function createHotkeyCatalogCopy(
  t: HotkeyCatalogTranslate,
): HotkeyCatalogCopy {
  return {
    definitions: {
      "workspace-sidebar-toggle": {
        label: t(
          "settings.hotkeys.catalog.definitions.workspaceSidebarToggle.label",
        ),
        description: t(
          "settings.hotkeys.catalog.definitions.workspaceSidebarToggle.description",
        ),
        source: t(
          "settings.hotkeys.catalog.definitions.workspaceSidebarToggle.source",
        ),
        condition: t(
          "settings.hotkeys.catalog.definitions.workspaceSidebarToggle.condition",
        ),
      },
      "document-editor-save": {
        label: t(
          "settings.hotkeys.catalog.definitions.documentEditorSave.label",
        ),
        description: t(
          "settings.hotkeys.catalog.definitions.documentEditorSave.description",
        ),
        source: t(
          "settings.hotkeys.catalog.definitions.documentEditorSave.source",
        ),
        condition: t(
          "settings.hotkeys.catalog.definitions.documentEditorSave.condition",
        ),
      },
      "document-editor-cancel": {
        label: t(
          "settings.hotkeys.catalog.definitions.documentEditorCancel.label",
        ),
        description: t(
          "settings.hotkeys.catalog.definitions.documentEditorCancel.description",
        ),
        source: t(
          "settings.hotkeys.catalog.definitions.documentEditorCancel.source",
        ),
        condition: t(
          "settings.hotkeys.catalog.definitions.documentEditorCancel.condition",
        ),
      },
      "document-canvas-undo": {
        label: t(
          "settings.hotkeys.catalog.definitions.documentCanvasUndo.label",
        ),
        description: t(
          "settings.hotkeys.catalog.definitions.documentCanvasUndo.description",
        ),
        source: t(
          "settings.hotkeys.catalog.definitions.documentCanvasUndo.source",
        ),
        condition: t(
          "settings.hotkeys.catalog.definitions.documentCanvasUndo.condition",
        ),
      },
      "document-canvas-redo": {
        label: t(
          "settings.hotkeys.catalog.definitions.documentCanvasRedo.label",
        ),
        description: t(
          "settings.hotkeys.catalog.definitions.documentCanvasRedo.description",
        ),
        source: t(
          "settings.hotkeys.catalog.definitions.documentCanvasRedo.source",
        ),
        condition: t(
          "settings.hotkeys.catalog.definitions.documentCanvasRedo.condition",
        ),
      },
    },
    scenes: {
      global: {
        title: t("settings.hotkeys.catalog.scene.global.title"),
        description: t("settings.hotkeys.catalog.scene.global.description"),
      },
      workspace: {
        title: t("settings.hotkeys.catalog.scene.workspace.title"),
        description: t("settings.hotkeys.catalog.scene.workspace.description"),
      },
      "document-editor": {
        title: t("settings.hotkeys.catalog.scene.documentEditor.title"),
        description: t(
          "settings.hotkeys.catalog.scene.documentEditor.description",
        ),
      },
      "document-canvas": {
        title: t("settings.hotkeys.catalog.scene.documentCanvas.title"),
        description: t(
          "settings.hotkeys.catalog.scene.documentCanvas.description",
        ),
      },
    },
    status: {
      staticReadyLabel: t("settings.hotkeys.catalog.status.static.readyLabel"),
    },
  };
}

const DEFAULT_HOTKEY_CATALOG_COPY: HotkeyCatalogCopy = {
  definitions: buildDefinitionCopy([
    WORKBENCH_SIDEBAR_TOGGLE_HOTKEY,
    ...DOCUMENT_EDITOR_HOTKEYS,
    ...DOCUMENT_CANVAS_HOTKEYS,
  ]),
  scenes: {
    global: {
      title: "全局快捷键",
      description: "离开当前页面也能触发，是否可用取决于运行时是否注册成功。",
    },
    workspace: {
      title: "工作区",
      description: "用于主工作区导航与侧栏控制。",
    },
    "document-editor": {
      title: "文档编辑器",
      description: "针对源码/富文本编辑态的保存与退出操作。",
    },
    "document-canvas": {
      title: "文档画布",
      description: "用于文档画布层级的撤销与重做。",
    },
  },
  status: {
    staticReadyLabel: "可直接使用",
  },
};

function applyDefinitionCopy(
  definition: AuditedHotkeyDefinition,
  copy: HotkeyCatalogCopy,
): AuditedHotkeyDefinition {
  return {
    ...definition,
    ...copy.definitions[definition.id],
  };
}

function createStaticHotkeyItem(
  definition: AuditedHotkeyDefinition,
  platform: HotkeyPlatform,
  copy: HotkeyCatalogCopy,
): AuditedHotkeyItem {
  const copiedDefinition = applyDefinitionCopy(definition, copy);

  return {
    ...copiedDefinition,
    keys: formatShortcutTokens(copiedDefinition.shortcut, platform),
    status: "ready",
    statusLabel: copy.status.staticReadyLabel,
    statusDescription: copiedDefinition.condition,
    available: true,
  };
}

export function buildAuditedHotkeyCatalog({
  platform,
  copy = DEFAULT_HOTKEY_CATALOG_COPY,
}: BuildHotkeyCatalogParams): AuditedHotkeyCatalog {
  const sections: AuditedHotkeySection[] = [
    {
      scene: "workspace",
      ...copy.scenes.workspace,
      hotkeys: [
        createStaticHotkeyItem(WORKBENCH_SIDEBAR_TOGGLE_HOTKEY, platform, copy),
      ],
    },
    {
      scene: "document-editor",
      ...copy.scenes["document-editor"],
      hotkeys: DOCUMENT_EDITOR_HOTKEYS.map((item) =>
        createStaticHotkeyItem(item, platform, copy),
      ),
    },
    {
      scene: "document-canvas",
      ...copy.scenes["document-canvas"],
      hotkeys: DOCUMENT_CANVAS_HOTKEYS.map((item) =>
        createStaticHotkeyItem(item, platform, copy),
      ),
    },
  ];

  const hotkeys = sections.flatMap((section) => section.hotkeys);
  const ready = hotkeys.filter((item) => item.available).length;

  return {
    sections,
    summary: {
      total: hotkeys.length,
      ready,
      attention: hotkeys.length - ready,
      globalReady: 0,
    },
  };
}

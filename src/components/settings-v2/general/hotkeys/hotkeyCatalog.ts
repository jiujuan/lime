/**
 * @file hotkeyCatalog.ts
 * @description 快捷键页的共享事实源
 */

import type { VoiceInputConfig } from "@/lib/api/asrProvider";
import type { HotkeyRuntimeStatus } from "@/lib/api/hotkeys";
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

interface HotkeyStatusCopy {
  label: string;
  description: string;
}

export type HotkeyCatalogTranslate = (
  key: string,
  options?: Record<string, unknown>,
) => string;

export interface HotkeyCatalogCopy {
  definitions: Record<string, AuditedHotkeyCopyFields>;
  scenes: Record<HotkeyScene, { title: string; description: string }>;
  status: {
    staticReadyLabel: string;
    voiceInput: {
      inactive: HotkeyStatusCopy;
      needsConfig: HotkeyStatusCopy;
      runtimeError: HotkeyStatusCopy;
      ready: HotkeyStatusCopy;
    };
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
  voiceConfig: Partial<VoiceInputConfig>;
  runtimeStatus: HotkeyRuntimeStatus | null;
  copy?: HotkeyCatalogCopy;
}

const GLOBAL_SHORTCUT_DEFINITIONS: AuditedHotkeyDefinition[] = [
  {
    id: "voice-input",
    label: "语音输入",
    description: "按下开始录音，松开后识别并输出文本。",
    shortcut: "",
    scope: "global",
    scene: "global",
    source: "语音服务",
    condition: "依赖语音输入已启用且系统允许注册全局快捷键。",
  },
];

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
      "voice-input": {
        label: t("settings.hotkeys.catalog.definitions.voiceInput.label"),
        description: t(
          "settings.hotkeys.catalog.definitions.voiceInput.description",
        ),
        source: t("settings.hotkeys.catalog.definitions.voiceInput.source"),
        condition: t(
          "settings.hotkeys.catalog.definitions.voiceInput.condition",
        ),
      },
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
      voiceInput: {
        inactive: {
          label: t("settings.hotkeys.catalog.status.voiceInput.inactive.label"),
          description: t(
            "settings.hotkeys.catalog.status.voiceInput.inactive.description",
          ),
        },
        needsConfig: {
          label: t(
            "settings.hotkeys.catalog.status.voiceInput.needsConfig.label",
          ),
          description: t(
            "settings.hotkeys.catalog.status.voiceInput.needsConfig.description",
          ),
        },
        runtimeError: {
          label: t(
            "settings.hotkeys.catalog.status.voiceInput.runtimeError.label",
          ),
          description: t(
            "settings.hotkeys.catalog.status.voiceInput.runtimeError.description",
          ),
        },
        ready: {
          label: t("settings.hotkeys.catalog.status.voiceInput.ready.label"),
          description: t(
            "settings.hotkeys.catalog.status.voiceInput.ready.description",
          ),
        },
      },
    },
  };
}

const DEFAULT_HOTKEY_CATALOG_COPY: HotkeyCatalogCopy = {
  definitions: buildDefinitionCopy([
    ...GLOBAL_SHORTCUT_DEFINITIONS,
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
    voiceInput: {
      inactive: {
        label: "功能未启用",
        description: "去语音服务里开启语音输入后才会注册全局快捷键。",
      },
      needsConfig: {
        label: "未设置快捷键",
        description: "语音输入已启用，但没有配置可注册的快捷键。",
      },
      runtimeError: {
        label: "未注册到系统",
        description: "语音输入已启用，但运行时未成功注册快捷键。",
      },
      ready: {
        label: "运行中",
        description: "已完成注册，可以直接唤起语音输入。",
      },
    },
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

function buildVoiceInputHotkey(
  platform: HotkeyPlatform,
  voiceConfig: Partial<VoiceInputConfig>,
  runtimeStatus: HotkeyRuntimeStatus | null,
  copy: HotkeyCatalogCopy,
): AuditedHotkeyItem {
  const definition = applyDefinitionCopy(GLOBAL_SHORTCUT_DEFINITIONS[0]!, copy);
  const shortcut = voiceConfig.shortcut ?? "";
  const enabled = voiceConfig.enabled ?? false;
  const registered = runtimeStatus?.voice.shortcut_registered ?? enabled;
  const statusCopy = copy.status.voiceInput;

  if (!enabled) {
    return {
      ...definition,
      shortcut,
      keys: formatShortcutTokens(shortcut, platform),
      status: "inactive",
      statusLabel: statusCopy.inactive.label,
      statusDescription: statusCopy.inactive.description,
      available: false,
    };
  }

  if (!shortcut.trim()) {
    return {
      ...definition,
      shortcut,
      keys: formatShortcutTokens(shortcut, platform),
      status: "needs-config",
      statusLabel: statusCopy.needsConfig.label,
      statusDescription: statusCopy.needsConfig.description,
      available: false,
    };
  }

  if (!registered) {
    return {
      ...definition,
      shortcut,
      keys: formatShortcutTokens(shortcut, platform),
      status: "runtime-error",
      statusLabel: statusCopy.runtimeError.label,
      statusDescription: statusCopy.runtimeError.description,
      available: false,
    };
  }

  return {
    ...definition,
    shortcut,
    keys: formatShortcutTokens(shortcut, platform),
    status: "ready",
    statusLabel: statusCopy.ready.label,
    statusDescription: statusCopy.ready.description,
    available: true,
  };
}

export function buildAuditedHotkeyCatalog({
  platform,
  voiceConfig,
  runtimeStatus,
  copy = DEFAULT_HOTKEY_CATALOG_COPY,
}: BuildHotkeyCatalogParams): AuditedHotkeyCatalog {
  const sections: AuditedHotkeySection[] = [
    {
      scene: "global",
      ...copy.scenes.global,
      hotkeys: [
        buildVoiceInputHotkey(platform, voiceConfig, runtimeStatus, copy),
      ],
    },
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
  const globalReady =
    sections[0]?.hotkeys.filter((item) => item.available).length ?? 0;

  return {
    sections,
    summary: {
      total: hotkeys.length,
      ready,
      attention: hotkeys.length - ready,
      globalReady,
    },
  };
}

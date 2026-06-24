import {
  app,
  clipboard,
  Menu,
  shell,
  type BrowserWindow,
  type MenuItemConstructorOptions,
  type WebContentsView,
} from "./electronRuntime";

export interface EmbeddedBrowserContextMenuController {
  view: WebContentsView;
  window: BrowserWindow;
  navigate(url: string): void;
  emitState(): void;
}

type EmbeddedBrowserContextMenuLocale =
  | "zh-CN"
  | "zh-TW"
  | "en-US"
  | "ja-JP"
  | "ko-KR";

interface EmbeddedBrowserContextMenuParams {
  x: number;
  y: number;
  pageURL?: string;
  linkURL?: string;
  srcURL?: string;
  mediaType?: string;
  selectionText?: string;
  isEditable?: boolean;
}

type EmbeddedBrowserContextMenuLabelKey =
  | "back"
  | "copyImage"
  | "copyImageAddress"
  | "copyLink"
  | "copyPageUrl"
  | "forward"
  | "openLinkExternal"
  | "openLinkHere"
  | "openPageExternal"
  | "reload"
  | "saveImageAs";

const CONTEXT_MENU_LABELS: Record<
  EmbeddedBrowserContextMenuLocale,
  Record<EmbeddedBrowserContextMenuLabelKey, string>
> = {
  "zh-CN": {
    back: "后退",
    copyImage: "复制图片",
    copyImageAddress: "复制图片地址",
    copyLink: "复制链接地址",
    copyPageUrl: "复制当前页地址",
    forward: "前进",
    openLinkExternal: "在系统浏览器中打开链接",
    openLinkHere: "在当前标签页打开链接",
    openPageExternal: "在系统浏览器中打开当前页",
    reload: "重新加载",
    saveImageAs: "图片另存为",
  },
  "zh-TW": {
    back: "返回",
    copyImage: "複製圖片",
    copyImageAddress: "複製圖片位址",
    copyLink: "複製連結位址",
    copyPageUrl: "複製目前頁面位址",
    forward: "前進",
    openLinkExternal: "在系統瀏覽器中開啟連結",
    openLinkHere: "在目前分頁開啟連結",
    openPageExternal: "在系統瀏覽器中開啟目前頁面",
    reload: "重新載入",
    saveImageAs: "圖片另存為",
  },
  "en-US": {
    back: "Back",
    copyImage: "Copy Image",
    copyImageAddress: "Copy Image Address",
    copyLink: "Copy Link Address",
    copyPageUrl: "Copy Page URL",
    forward: "Forward",
    openLinkExternal: "Open Link in System Browser",
    openLinkHere: "Open Link in Current Tab",
    openPageExternal: "Open Current Page in System Browser",
    reload: "Reload",
    saveImageAs: "Save Image As",
  },
  "ja-JP": {
    back: "戻る",
    copyImage: "画像をコピー",
    copyImageAddress: "画像アドレスをコピー",
    copyLink: "リンクのアドレスをコピー",
    copyPageUrl: "現在のページ URL をコピー",
    forward: "進む",
    openLinkExternal: "システムブラウザーでリンクを開く",
    openLinkHere: "現在のタブでリンクを開く",
    openPageExternal: "現在のページをシステムブラウザーで開く",
    reload: "再読み込み",
    saveImageAs: "画像を別名で保存",
  },
  "ko-KR": {
    back: "뒤로",
    copyImage: "이미지 복사",
    copyImageAddress: "이미지 주소 복사",
    copyLink: "링크 주소 복사",
    copyPageUrl: "현재 페이지 주소 복사",
    forward: "앞으로",
    openLinkExternal: "시스템 브라우저에서 링크 열기",
    openLinkHere: "현재 탭에서 링크 열기",
    openPageExternal: "시스템 브라우저에서 현재 페이지 열기",
    reload: "다시 로드",
    saveImageAs: "이미지를 다른 이름으로 저장",
  },
};

export function installEmbeddedBrowserContextMenu(
  controller: EmbeddedBrowserContextMenuController,
): void {
  controller.view.webContents.on("context-menu", (_event, params) => {
    showEmbeddedBrowserContextMenu(
      controller,
      normalizeContextMenuParams(params),
    );
  });
}

export function showEmbeddedBrowserContextMenu(
  controller: EmbeddedBrowserContextMenuController,
  params: EmbeddedBrowserContextMenuParams,
): void {
  const template = buildEmbeddedBrowserContextMenuTemplate(controller, params);
  if (template.length === 0) {
    return;
  }
  Menu.buildFromTemplate(template).popup({ window: controller.window });
}

function buildEmbeddedBrowserContextMenuTemplate(
  controller: EmbeddedBrowserContextMenuController,
  params: EmbeddedBrowserContextMenuParams,
): MenuItemConstructorOptions[] {
  const webContents = controller.view.webContents;
  const labels = CONTEXT_MENU_LABELS[resolveContextMenuLocale()];
  const linkUrl = normalizeHttpUrl(params.linkURL || "");
  const pageUrl = normalizeHttpUrl(params.pageURL || webContents.getURL());
  const imageUrl =
    params.mediaType === "image" ? normalizeHttpUrl(params.srcURL || "") : null;
  const hasSelection = Boolean(params.selectionText?.trim());
  const items: MenuItemConstructorOptions[] = [];

  if (params.isEditable) {
    items.push(
      { role: "undo" },
      { role: "redo" },
      { type: "separator" },
      { role: "cut" },
      { role: "copy" },
      { role: "paste" },
      { role: "delete" },
      { type: "separator" },
      { role: "selectAll" },
    );
    return items;
  }

  if (linkUrl) {
    items.push(
      {
        label: labels.openLinkHere,
        click: () => {
          controller.navigate(linkUrl);
          controller.emitState();
        },
      },
      {
        label: labels.openLinkExternal,
        click: () => {
          void shell.openExternal(linkUrl);
        },
      },
      {
        label: labels.copyLink,
        click: () => clipboard.writeText(linkUrl),
      },
    );
  }

  if (imageUrl) {
    appendSeparator(items);
    items.push(
      {
        label: labels.copyImage,
        click: () => webContents.copyImageAt(params.x, params.y),
      },
      {
        label: labels.copyImageAddress,
        click: () => clipboard.writeText(imageUrl),
      },
      {
        label: labels.saveImageAs,
        click: () => webContents.downloadURL(imageUrl),
      },
    );
  }

  if (hasSelection) {
    appendSeparator(items);
    items.push({ role: "copy" });
  }

  appendSeparator(items);
  items.push(
    {
      label: labels.back,
      enabled: webContents.navigationHistory.canGoBack(),
      click: () => webContents.navigationHistory.goBack(),
    },
    {
      label: labels.forward,
      enabled: webContents.navigationHistory.canGoForward(),
      click: () => webContents.navigationHistory.goForward(),
    },
    {
      label: labels.reload,
      click: () => webContents.reload(),
    },
    { type: "separator" },
    { role: "selectAll" },
  );

  if (pageUrl) {
    items.push(
      {
        label: labels.copyPageUrl,
        click: () => clipboard.writeText(pageUrl),
      },
      {
        label: labels.openPageExternal,
        click: () => {
          void shell.openExternal(pageUrl);
        },
      },
    );
  }

  return items;
}

function appendSeparator(items: MenuItemConstructorOptions[]): void {
  if (items.length === 0 || items[items.length - 1]?.type === "separator") {
    return;
  }
  items.push({ type: "separator" });
}

function normalizeContextMenuParams(
  value: unknown,
): EmbeddedBrowserContextMenuParams {
  const record = readRecord(value) || {};
  return {
    x: readInteger(record.x) ?? 0,
    y: readInteger(record.y) ?? 0,
    pageURL: readString(record.pageURL) ?? undefined,
    linkURL: readString(record.linkURL) ?? undefined,
    srcURL: readString(record.srcURL) ?? undefined,
    mediaType: readString(record.mediaType) ?? undefined,
    selectionText: readString(record.selectionText) ?? undefined,
    isEditable:
      typeof record.isEditable === "boolean" ? record.isEditable : false,
  };
}

function resolveContextMenuLocale(): EmbeddedBrowserContextMenuLocale {
  const locale = app.getLocale().toLowerCase();
  if (locale.startsWith("zh-tw") || locale.startsWith("zh-hk")) {
    return "zh-TW";
  }
  if (locale.startsWith("en")) {
    return "en-US";
  }
  if (locale.startsWith("ja")) {
    return "ja-JP";
  }
  if (locale.startsWith("ko")) {
    return "ko-KR";
  }
  return "zh-CN";
}

function normalizeHttpUrl(value: string): string | null {
  try {
    const url = new URL(value.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

function readRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function readString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Math.round(value)
    : null;
}

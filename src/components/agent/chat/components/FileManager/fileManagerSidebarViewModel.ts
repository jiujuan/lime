import type { FileEntry, FileManagerLocation } from "@/lib/api/fileBrowser";

const APPLICATION_ENTRY_PATTERN = /\.(app|appref-ms|exe|lnk)$/i;
const SKILL_PACKAGE_ENTRY_PATTERN = /\.(?:skill|skills)$/i;
const CONTEXT_MENU_WIDTH_PX = 208;
const CONTEXT_MENU_HEIGHT_PX = 320;
const CONTEXT_MENU_GAP_PX = 8;

export type FileManagerContextMenuAction =
  | "open"
  | "reveal"
  | "add"
  | "preview-workspace"
  | "install-skill-package"
  | "import-knowledge"
  | "copy-path"
  | "copy-name"
  | "pin"
  | "refresh";

export interface FileManagerActionLabels {
  open: string;
  reveal: string;
  addToChat: string;
  preview: string;
  importKnowledge: string;
  importKnowledgeTitle: string;
  copyPath: string;
  copyName: string;
  pin: string;
  refresh: string;
  installPackage: string;
  installPackageTitle: string;
}

export interface FileManagerContextMenuActionDescriptor {
  action: FileManagerContextMenuAction;
  label: string;
  disabled?: boolean;
  title?: string;
}

interface ContextMenuRectLike {
  left: number;
  right: number;
  top: number;
  bottom: number;
  width: number;
}

export function asPinnedLocation(value: unknown): FileManagerLocation | null {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    typeof record.label !== "string" ||
    typeof record.path !== "string" ||
    typeof record.kind !== "string"
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label,
    path: record.path,
    kind: record.kind,
  };
}

export function isApplicationEntry(
  entry: FileEntry,
  activeLocationKind: string,
): boolean {
  if (APPLICATION_ENTRY_PATTERN.test(entry.name)) {
    return true;
  }
  return activeLocationKind === "applications" && !entry.isDir;
}

export function isSkillPackageEntry(entry: FileEntry): boolean {
  return !entry.isDir && SKILL_PACKAGE_ENTRY_PATTERN.test(entry.name);
}

export function resolveContextMenuPosition({
  clientX,
  clientY,
  sidebarRect,
  viewportWidth,
  viewportHeight,
}: {
  clientX: number;
  clientY: number;
  sidebarRect: ContextMenuRectLike | null;
  viewportWidth: number;
  viewportHeight: number;
}): { x: number; y: number } {
  const usableSidebarRect =
    sidebarRect && sidebarRect.width > 0 ? sidebarRect : null;
  const leftBoundary = Math.max(
    CONTEXT_MENU_GAP_PX,
    usableSidebarRect
      ? usableSidebarRect.left + CONTEXT_MENU_GAP_PX
      : CONTEXT_MENU_GAP_PX,
  );
  const rightBoundary = Math.min(
    viewportWidth - CONTEXT_MENU_GAP_PX,
    usableSidebarRect
      ? usableSidebarRect.right - CONTEXT_MENU_GAP_PX
      : viewportWidth - CONTEXT_MENU_GAP_PX,
  );
  const topBoundary = Math.max(
    CONTEXT_MENU_GAP_PX,
    usableSidebarRect
      ? usableSidebarRect.top + CONTEXT_MENU_GAP_PX
      : CONTEXT_MENU_GAP_PX,
  );
  const bottomBoundary = Math.min(
    viewportHeight - CONTEXT_MENU_GAP_PX,
    usableSidebarRect
      ? usableSidebarRect.bottom - CONTEXT_MENU_GAP_PX
      : viewportHeight - CONTEXT_MENU_GAP_PX,
  );

  return {
    x: Math.max(
      leftBoundary,
      Math.min(clientX, rightBoundary - CONTEXT_MENU_WIDTH_PX),
    ),
    y: Math.max(
      topBoundary,
      Math.min(clientY, bottomBoundary - CONTEXT_MENU_HEIGHT_PX),
    ),
  };
}

export function buildContextMenuActionDescriptors({
  entry,
  knowledgeImportEnabled,
  workspacePreviewEnabled,
  skillPackageInstallEnabled,
  labels,
  knowledgeUnsupportedMessage = null,
}: {
  entry: FileEntry;
  knowledgeImportEnabled: boolean;
  workspacePreviewEnabled: boolean;
  skillPackageInstallEnabled: boolean;
  labels: FileManagerActionLabels;
  knowledgeUnsupportedMessage?: string | null;
}): FileManagerContextMenuActionDescriptor[] {
  const isSkillPackage = isSkillPackageEntry(entry);
  const actions: FileManagerContextMenuActionDescriptor[] = [
    { action: "open", label: labels.open },
    { action: "reveal", label: labels.reveal },
  ];

  if (skillPackageInstallEnabled && isSkillPackage) {
    actions.push({
      action: "install-skill-package",
      label: labels.installPackage,
      title: labels.installPackageTitle,
    });
  } else {
    actions.push({ action: "add", label: labels.addToChat });
  }

  if (workspacePreviewEnabled && !entry.isDir && !isSkillPackage) {
    actions.push({
      action: "preview-workspace",
      label: labels.preview,
    });
  }

  if (knowledgeImportEnabled && !entry.isDir && !isSkillPackage) {
    actions.push({
      action: "import-knowledge",
      label: labels.importKnowledge,
      disabled: Boolean(knowledgeUnsupportedMessage),
      title: knowledgeUnsupportedMessage || labels.importKnowledgeTitle,
    });
  }

  actions.push(
    { action: "copy-path", label: labels.copyPath },
    { action: "copy-name", label: labels.copyName },
    { action: "pin", label: labels.pin },
    { action: "refresh", label: labels.refresh },
  );

  return actions;
}

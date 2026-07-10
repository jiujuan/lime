import type { ComponentProps, ReactNode } from "react";
import { FileManagerSidebar } from "../components/FileManager/FileManagerSidebar";
import type { FileManagerSidebarController } from "../hooks/useFileManagerSidebar";

type FileManagerSidebarProps = ComponentProps<typeof FileManagerSidebar>;

interface RenderWorkspaceFileManagerSidebarRuntimeParams {
  fileManagerSidebar: Pick<
    FileManagerSidebarController,
    "closeFileManagerSidebar" | "fileManagerOpen"
  >;
  initialDirectory?: string | null;
  onAddPathReferences: FileManagerSidebarProps["onAddPathReferences"];
  onImportAsKnowledge: FileManagerSidebarProps["onImportAsKnowledge"];
  onInstallSkillPackage?: FileManagerSidebarProps["onInstallSkillPackage"];
  onOpenWorkspaceFile: (absolutePath: string) => void | Promise<void>;
}

export function renderWorkspaceFileManagerSidebarRuntime({
  fileManagerSidebar,
  initialDirectory,
  onAddPathReferences,
  onImportAsKnowledge,
  onInstallSkillPackage,
  onOpenWorkspaceFile,
}: RenderWorkspaceFileManagerSidebarRuntimeParams): ReactNode {
  return fileManagerSidebar.fileManagerOpen ? (
    <FileManagerSidebar
      onClose={fileManagerSidebar.closeFileManagerSidebar}
      onAddPathReferences={onAddPathReferences}
      onImportAsKnowledge={onImportAsKnowledge}
      onOpenFileInWorkspace={(entry) => {
        void onOpenWorkspaceFile(entry.path);
      }}
      onInstallSkillPackage={onInstallSkillPackage}
      initialDirectory={initialDirectory}
    />
  ) : null;
}

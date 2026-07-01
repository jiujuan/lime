import type { ReactNode } from "react";
import { PanelLeftOpen } from "lucide-react";
import {
  GeneralWorkbenchLeftExpandButton,
  PageContainer,
} from "./WorkspaceStyles";

interface WorkspaceShellSceneProps {
  compactChrome: boolean;
  isThemeWorkbench: boolean;
  generalWorkbenchSidebarNode: ReactNode;
  showGeneralWorkbenchLeftExpandButton: boolean;
  onExpandGeneralWorkbenchSidebar: () => void;
  fileManagerNode?: ReactNode;
  fileManagerToggleNode?: ReactNode;
  mainAreaNode: ReactNode;
}

export function WorkspaceShellScene({
  compactChrome,
  isThemeWorkbench,
  generalWorkbenchSidebarNode,
  showGeneralWorkbenchLeftExpandButton,
  onExpandGeneralWorkbenchSidebar,
  fileManagerNode,
  fileManagerToggleNode,
  mainAreaNode,
}: WorkspaceShellSceneProps) {
  return (
    <PageContainer
      $compact={compactChrome}
      className="lime-workbench-theme-scope"
      data-testid="workspace-shell-scene"
    >
      {isThemeWorkbench ? (
        generalWorkbenchSidebarNode
      ) : null}
      {showGeneralWorkbenchLeftExpandButton ? (
        <GeneralWorkbenchLeftExpandButton
          type="button"
          aria-label="展开上下文侧栏"
          onClick={onExpandGeneralWorkbenchSidebar}
          title="展开上下文侧栏"
        >
          <PanelLeftOpen size={14} />
        </GeneralWorkbenchLeftExpandButton>
      ) : null}
      {fileManagerNode}
      {fileManagerToggleNode}

      {mainAreaNode}
    </PageContainer>
  );
}

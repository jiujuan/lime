interface CapabilityDraftPanelProps {
  workspaceRoot?: string | null;
  projectPending?: boolean;
  projectError?: string | null;
  highlightedDraftId?: string | null;
  onRegisteredSkillsChanged?: () => void;
  className?: string;
}

export function CapabilityDraftPanel(_props: CapabilityDraftPanelProps) {
  return null;
}

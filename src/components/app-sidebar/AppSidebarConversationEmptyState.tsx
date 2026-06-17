import { Clock3 } from "lucide-react";
import styled from "styled-components";

const ConversationEmptyState = styled.div`
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  flex: 1;
  min-height: 42px;
  border-radius: 12px;
  padding: 10px;
  color: var(--sidebar-muted);
  font-size: 12px;
  background: color-mix(
    in srgb,
    var(--sidebar-search-bg, #ffffff) 78%,
    transparent
  );
  text-align: center;
`;

export function AppSidebarConversationEmptyState({ text }: { text: string }) {
  return (
    <ConversationEmptyState>
      <Clock3 size={14} />
      {text}
    </ConversationEmptyState>
  );
}

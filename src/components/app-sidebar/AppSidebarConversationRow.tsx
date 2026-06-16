import type { MouseEvent } from "react";
import styled from "styled-components";
import { MoreHorizontal, Pin } from "lucide-react";
import type { AsterSessionInfo } from "@/lib/api/agentRuntime";
import { recordAgentUiPerformanceMetric } from "@/lib/agentUiPerformanceMetrics";

interface AppSidebarConversationRowProps {
  session: AsterSessionInfo;
  title: string;
  meta: string;
  active: boolean;
  favorite: boolean;
  actionDisabled: boolean;
  favoriteBadgeLabel: string;
  moreActionsLabel: string;
  openActionMenuLabel: string;
  onNavigate: (session: AsterSessionInfo) => void;
  onOpenMenu: (
    event: MouseEvent<HTMLButtonElement>,
    session: AsterSessionInfo,
  ) => void;
}

const ConversationItemRow = styled.div<{
  $active?: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 4px;
  width: 100%;
  border-radius: 12px;
  background: ${({ $active }) =>
    $active ? "var(--lime-sidebar-active, #e6f8ea)" : "transparent"};
  transition:
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${({ $active }) =>
      $active ? "var(--sidebar-active)" : "var(--sidebar-hover)"};
  }
`;

const ConversationItemButton = styled.button<{
  $active?: boolean;
}>`
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
  min-width: 0;
  min-height: 38px;
  border: none;
  border-radius: 12px;
  padding: 0 10px;
  background: transparent;
  color: ${({ $active }) =>
    $active ? "var(--sidebar-active-foreground)" : "var(--sidebar-foreground)"};
  cursor: pointer;
  transition: color 0.18s ease;
`;

const ConversationItemDot = styled.span<{ $active?: boolean }>`
  width: 8px;
  height: 8px;
  flex-shrink: 0;
  border-radius: 999px;
  background: ${({ $active }) =>
    $active ? "var(--sidebar-active-foreground)" : "rgba(148, 163, 184, 0.72)"};
`;

const ConversationItemLabel = styled.span`
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-align: left;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 500;
`;

const ConversationFavoriteBadge = styled.span`
  width: 16px;
  height: 16px;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--sidebar-muted);

  svg {
    width: 13px;
    height: 13px;
  }
`;

const ConversationItemMeta = styled.span`
  flex-shrink: 0;
  font-size: 11px;
  color: var(--sidebar-muted);
`;

const ConversationItemActionButton = styled.button`
  width: 30px;
  min-width: 30px;
  height: 38px;
  border: none;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: var(--sidebar-muted);
  cursor: pointer;
  opacity: 0;
  pointer-events: none;
  transition:
    opacity 0.18s ease,
    background-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: var(--sidebar-hover);
    color: var(--sidebar-foreground);
  }

  &:disabled {
    cursor: default;
    opacity: 0.6;
  }

  ${ConversationItemRow}:hover &,
  ${ConversationItemRow}[data-active="true"] & {
    opacity: 1;
    pointer-events: auto;
  }

  svg {
    width: 15px;
    height: 15px;
  }
`;

export function AppSidebarConversationRow({
  session,
  title,
  meta,
  active,
  favorite,
  actionDisabled,
  favoriteBadgeLabel,
  moreActionsLabel,
  openActionMenuLabel,
  onNavigate,
  onOpenMenu,
}: AppSidebarConversationRowProps) {
  return (
    <ConversationItemRow
      $active={active}
      data-active={active ? "true" : "false"}
    >
      <ConversationItemButton
        type="button"
        $active={active}
        data-testid="app-sidebar-conversation-open"
        aria-current={active ? "page" : undefined}
        onClick={() => {
          recordAgentUiPerformanceMetric("sidebar.conversation.click", {
            sessionId: session.id,
            source: "conversation_shelf",
            cwd: session.working_dir ?? null,
          });
          onNavigate(session);
        }}
        title={title}
      >
        <ConversationItemDot $active={active} />
        <ConversationItemLabel>{title}</ConversationItemLabel>
        {favorite ? (
          <ConversationFavoriteBadge
            title={favoriteBadgeLabel}
            data-testid="app-sidebar-conversation-favorite-badge"
          >
            <Pin />
          </ConversationFavoriteBadge>
        ) : null}
        <ConversationItemMeta>{meta}</ConversationItemMeta>
      </ConversationItemButton>
      <ConversationItemActionButton
        type="button"
        aria-label={openActionMenuLabel}
        title={moreActionsLabel}
        disabled={actionDisabled}
        onClick={(event) => onOpenMenu(event, session)}
      >
        <MoreHorizontal />
      </ConversationItemActionButton>
    </ConversationItemRow>
  );
}

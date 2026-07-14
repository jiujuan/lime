import {
  ChevronDown,
  MessageSquare,
  MessageSquarePlus,
  Search,
  X,
} from "lucide-react";
import type { AgentSessionInfo } from "@/lib/api/agentRuntime/sessionTypes";
import { Modal } from "@/components/Modal";
import {
  SidebarSearchBody,
  SidebarSearchCloseButton,
  SidebarSearchCreateButton,
  SidebarSearchCreateText,
  SidebarSearchDivider,
  SidebarSearchEmptyState,
  SidebarSearchEnterHint,
  SidebarSearchHeader,
  SidebarSearchInput,
  SidebarSearchKey,
  SidebarSearchMoreButton,
  SidebarSearchResultButton,
  SidebarSearchResultList,
  SidebarSearchResultMeta,
  SidebarSearchResultTitle,
  SidebarSearchSectionLabel,
  SidebarSearchShortcut,
  SidebarSearchSurface,
} from "./AppSidebar.styles";

export interface AppSidebarSearchDialogCopy {
  inputLabel: string;
  closeLabel: string;
  createConversationLabel: string;
  matchesLabel: string;
  recentLabel: string;
  loadingLabel: string;
  selectProjectFirstLabel: string;
  emptyMatchesLabel: string;
  emptyRecentLabel: string;
  loadingMoreLabel: string;
  moreMatchesLabel: string;
  moreRecentLabel: string;
}

interface AppSidebarSearchDialogProps {
  isOpen: boolean;
  query: string;
  inputRef: {
    current: HTMLInputElement | null;
  };
  copy: AppSidebarSearchDialogCopy;
  sessions: AgentSessionInfo[];
  currentProjectId?: string | null;
  currentSessionId?: string | null;
  hasQuery: boolean;
  hasMoreResults: boolean;
  loading: boolean;
  loadingMore: boolean;
  resolveSessionTitle: (session: AgentSessionInfo) => string;
  formatSessionMeta: (session: AgentSessionInfo) => string;
  onClose: () => void;
  onQueryChange: (query: string) => void;
  onCreateConversation: () => void;
  onResultClick: (session: AgentSessionInfo) => void;
  onShowMore: () => void;
}

export function AppSidebarSearchDialog({
  isOpen,
  query,
  inputRef,
  copy,
  sessions,
  currentProjectId,
  currentSessionId,
  hasQuery,
  hasMoreResults,
  loading,
  loadingMore,
  resolveSessionTitle,
  formatSessionMeta,
  onClose,
  onQueryChange,
  onCreateConversation,
  onResultClick,
  onShowMore,
}: AppSidebarSearchDialogProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      className="border-none bg-transparent p-0 shadow-none"
      maxWidth="max-w-[832px]"
      showCloseButton={false}
    >
      <SidebarSearchSurface data-testid="app-sidebar-search-dialog">
        <SidebarSearchHeader>
          <Search aria-hidden="true" />
          <SidebarSearchInput
            ref={(node) => {
              inputRef.current = node;
            }}
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder={copy.inputLabel}
            aria-label={copy.inputLabel}
            data-testid="app-sidebar-search-input"
          />
          <SidebarSearchShortcut aria-hidden="true">
            <SidebarSearchKey>⌘</SidebarSearchKey>
            <SidebarSearchKey>K</SidebarSearchKey>
          </SidebarSearchShortcut>
          <SidebarSearchCloseButton
            type="button"
            aria-label={copy.closeLabel}
            onClick={onClose}
          >
            <X />
          </SidebarSearchCloseButton>
        </SidebarSearchHeader>
        <SidebarSearchDivider />
        <SidebarSearchBody>
          <SidebarSearchCreateButton
            type="button"
            onClick={onCreateConversation}
            data-testid="app-sidebar-search-new-conversation"
          >
            <MessageSquarePlus />
            <SidebarSearchCreateText>
              {copy.createConversationLabel}
            </SidebarSearchCreateText>
            <SidebarSearchEnterHint aria-hidden="true">
              ↵
            </SidebarSearchEnterHint>
          </SidebarSearchCreateButton>

          <SidebarSearchSectionLabel>
            {hasQuery ? copy.matchesLabel : copy.recentLabel}
          </SidebarSearchSectionLabel>

          {loading ? (
            <SidebarSearchEmptyState role="status">
              {copy.loadingLabel}
            </SidebarSearchEmptyState>
          ) : sessions.length > 0 ? (
            <SidebarSearchResultList>
              {sessions.map((session) => {
                const title = resolveSessionTitle(session);
                const isCurrentConversation = currentSessionId === session.id;
                return (
                  <SidebarSearchResultButton
                    key={session.id}
                    type="button"
                    $active={isCurrentConversation}
                    disabled={loading}
                    aria-current={isCurrentConversation ? "page" : undefined}
                    title={title}
                    data-testid="app-sidebar-search-result"
                    onClick={() => onResultClick(session)}
                  >
                    <MessageSquare />
                    <SidebarSearchResultTitle>
                      {title}
                    </SidebarSearchResultTitle>
                    <SidebarSearchResultMeta>
                      {formatSessionMeta(session)}
                    </SidebarSearchResultMeta>
                  </SidebarSearchResultButton>
                );
              })}
            </SidebarSearchResultList>
          ) : (
            <SidebarSearchEmptyState role="status">
              {!currentProjectId
                ? copy.selectProjectFirstLabel
                : hasQuery
                  ? copy.emptyMatchesLabel
                  : copy.emptyRecentLabel}
            </SidebarSearchEmptyState>
          )}

          {hasMoreResults ? (
            <SidebarSearchMoreButton
              type="button"
              disabled={loadingMore}
              onClick={onShowMore}
              data-testid="app-sidebar-search-more"
            >
              {loadingMore
                ? copy.loadingMoreLabel
                : hasQuery
                  ? copy.moreMatchesLabel
                  : copy.moreRecentLabel}
              <ChevronDown />
            </SidebarSearchMoreButton>
          ) : null}
        </SidebarSearchBody>
      </SidebarSearchSurface>
    </Modal>
  );
}

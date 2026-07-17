import { useEffect, useState } from "react";
import styled from "styled-components";
import {
  ArrowRight,
  ChevronDown,
  CircleAlert,
  Clock3,
  LoaderCircle,
  MessageCircle,
} from "lucide-react";
import { HomeStarterChips } from "./HomeStarterChips";
import { HomeMoreSkillsDrawer } from "./HomeMoreSkillsDrawer";
import { HomeGuideCards } from "./HomeGuideCards";
import { HomeSceneSkillManagerDialog } from "./HomeSceneSkillManagerDialog";
import type {
  HomeGuideCard,
  HomeProjectConversationGroup,
  HomeProjectConversationItem,
  HomeRecoverySession,
  HomeRecoverySessionStatus,
  HomeSkillSection,
  HomeSkillSurfaceItem,
  HomeStarterChip,
} from "./homeSurfaceTypes";
import type { HomeSurfaceChromeCopy } from "./homeSurfaceCopy";

const Surface = styled.div`
  display: flex;
  width: 100%;
  min-width: 0;
  flex-direction: column;
  gap: 0.9rem;
`;

const SupplementalRow = styled.div`
  display: flex;
  min-width: 0;
  flex-wrap: wrap;
  justify-content: flex-start;
  gap: 0.45rem;
`;

const SupplementalButton = styled.button`
  display: inline-flex;
  min-height: 32px;
  align-items: center;
  justify-content: center;
  border-radius: 999px;
  border: 1px solid var(--lime-surface-border, rgba(226, 232, 240, 0.9));
  background: var(--lime-surface, #fff);
  padding: 0.42rem 0.72rem;
  color: var(--lime-text, rgb(71 85 105));
  font-size: 12px;
  font-weight: 650;
  line-height: 1;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    color 160ms ease;

  &:hover {
    border-color: var(--lime-surface-border-strong, rgba(203, 213, 225, 0.96));
    background: var(--lime-surface-soft, rgba(248, 250, 252, 0.98));
    color: var(--lime-text-strong, rgb(15 23 42));
  }
`;

const ConversationShelf = styled.div`
  display: flex;
  width: min(680px, calc(100% - 2rem));
  min-width: 0;
  flex-direction: column;
  align-items: stretch;
  gap: 0.34rem;
  align-self: center;
`;

function resolveRecoverySessionAccent(status: HomeRecoverySessionStatus) {
  switch (status) {
    case "waiting":
      return "#f59e0b";
    case "queued":
      return "#0ea5e9";
    case "running":
      return "#14b8a6";
  }
}

function resolveRecoverySessionIconColor(status: HomeRecoverySessionStatus) {
  switch (status) {
    case "waiting":
      return "#b45309";
    case "queued":
      return "#0369a1";
    case "running":
      return "#0f766e";
  }
}

const RecoverySessionButton = styled.button<{
  $status: HomeRecoverySessionStatus;
}>`
  display: grid;
  width: min(680px, calc(100% - 2rem));
  min-width: 0;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.72rem;
  align-self: center;
  border: 1px solid
    ${({ $status }) => `color-mix(
      in srgb,
      ${resolveRecoverySessionAccent($status)} 42%,
      var(--lime-surface-border, rgba(226, 232, 240, 0.9))
    )`};
  border-radius: 8px;
  background: color-mix(
    in srgb,
    var(--lime-surface, #fff) 92%,
    ${({ $status }) => resolveRecoverySessionAccent($status)} 8%
  );
  padding: 0.7rem 0.82rem;
  color: var(--lime-text, rgb(71 85 105));
  text-align: left;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    box-shadow 160ms ease,
    color 160ms ease;

  &:hover {
    background: color-mix(
      in srgb,
      var(--lime-surface, #fff) 86%,
      ${({ $status }) => resolveRecoverySessionAccent($status)} 14%
    );
    color: var(--lime-text-strong, rgb(15 23 42));
    box-shadow: 0 8px 20px rgba(15, 23, 42, 0.08);
  }
`;

const RecoverySessionIcon = styled.span<{
  $status: HomeRecoverySessionStatus;
}>`
  display: inline-flex;
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border-radius: 8px;
  background: ${({ $status }) =>
    `color-mix(in srgb, ${resolveRecoverySessionAccent($status)} 14%, transparent)`};
  color: ${({ $status }) => resolveRecoverySessionIconColor($status)};

  svg[data-spin="true"] {
    animation: homeRecoverySpin 1.05s linear infinite;
  }

  @keyframes homeRecoverySpin {
    to {
      transform: rotate(360deg);
    }
  }
`;

const RecoverySessionText = styled.span`
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 0.18rem;
`;

const RecoverySessionTitle = styled.span`
  overflow: hidden;
  color: var(--lime-text-strong, rgb(15 23 42));
  font-size: 13.5px;
  font-weight: 760;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RecoverySessionSummary = styled.span`
  overflow: hidden;
  color: var(--lime-text-muted, rgb(100 116 139));
  font-size: 12px;
  font-weight: 520;
  line-height: 1.3;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const RecoverySessionAction = styled.span`
  display: inline-flex;
  min-width: max-content;
  align-items: center;
  gap: 0.24rem;
  color: var(--lime-text-strong, rgb(15 23 42));
  font-size: 12px;
  font-weight: 720;
  line-height: 1;
`;

const ConversationGroup = styled.section`
  display: flex;
  min-width: 0;
  flex-direction: column;
`;

const ConversationList = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
`;

const ConversationButton = styled.button`
  display: flex;
  width: 100%;
  min-width: 0;
  align-items: center;
  justify-content: flex-start;
  gap: 0.55rem;
  border: 0;
  border-bottom: 1px solid var(--lime-surface-border, rgba(226, 232, 240, 0.9));
  background: transparent;
  padding: 0.44rem 0.1rem;
  color: var(--lime-text, rgb(71 85 105));
  text-align: left;
  transition:
    background-color 160ms ease,
    color 160ms ease;

  &:hover {
    background: rgba(255, 255, 255, 0.48);
    color: var(--lime-text-strong, rgb(15 23 42));
  }
`;

const ConversationIcon = styled.span`
  display: inline-flex;
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  color: var(--lime-text-muted, rgb(100 116 139));
`;

const ConversationText = styled.span`
  display: block;
  min-width: 0;
  flex: 1 1 auto;
`;

const ConversationTitle = styled.span`
  overflow: hidden;
  color: inherit;
  font-size: 13.5px;
  font-weight: 650;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

const ConversationMoreWrap = styled.div`
  display: flex;
  min-width: 0;
  flex-direction: column;
  align-items: flex-start;
`;

const ConversationMoreButton = styled.button<{ $open: boolean }>`
  display: inline-flex;
  min-height: 28px;
  cursor: pointer;
  align-items: center;
  gap: 0.24rem;
  border-radius: 999px;
  border: 1px solid var(--lime-surface-border, rgba(226, 232, 240, 0.9));
  background: rgba(255, 255, 255, 0.62);
  padding: 0.28rem 0.56rem;
  color: var(--lime-text, rgb(71 85 105));
  font-size: 12px;
  font-weight: 650;
  line-height: 1;

  svg {
    transition: transform 160ms ease;
  }

  ${({ $open }) =>
    $open
      ? `
  svg {
    transform: rotate(180deg);
  }
`
      : ""}
`;

const ConversationMorePanel = styled.div`
  width: 100%;
  margin-top: 0.34rem;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
`;

export interface HomeSupplementalAction {
  id: string;
  label: string;
  title?: string;
  testId?: string;
  onSelect: () => void;
}

interface HomeStartSurfaceProps {
  starterChips: HomeStarterChip[];
  copy: HomeSurfaceChromeCopy;
  guideCards?: HomeGuideCard[];
  guideOpen?: boolean;
  recoverySession?: HomeRecoverySession | null;
  sections: HomeSkillSection[];
  conversationGroups?: HomeProjectConversationGroup[];
  supplementalActions?: HomeSupplementalAction[];
  onGuideOpenChange?: (open: boolean) => void;
  onSelectRecoverySession?: () => void;
  onSelectConversation?: (
    conversationId: string,
    statusReason?: string,
  ) => void;
  onSelectStarterChip: (chip: HomeStarterChip) => void;
  onSelectGuideCard?: (card: HomeGuideCard) => void;
  onSelectSkillItem: (item: HomeSkillSurfaceItem) => void;
}

export function HomeStartSurface({
  starterChips,
  copy,
  guideCards = [],
  guideOpen,
  recoverySession = null,
  sections,
  conversationGroups = [],
  supplementalActions = [],
  onGuideOpenChange,
  onSelectRecoverySession,
  onSelectConversation,
  onSelectStarterChip,
  onSelectGuideCard,
  onSelectSkillItem,
}: HomeStartSurfaceProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [managerOpen, setManagerOpen] = useState(false);
  const [internalGuideOpen, setInternalGuideOpen] = useState(false);
  const [conversationMoreOpen, setConversationMoreOpen] = useState(false);
  const resolvedGuideOpen = guideOpen ?? internalGuideOpen;
  const updateGuideOpen = (
    nextOpen: boolean | ((current: boolean) => boolean),
  ) => {
    const resolvedNextOpen =
      typeof nextOpen === "function" ? nextOpen(resolvedGuideOpen) : nextOpen;
    if (guideOpen === undefined) {
      setInternalGuideOpen(resolvedNextOpen);
    }
    onGuideOpenChange?.(resolvedNextOpen);
  };

  useEffect(() => {
    if (!drawerOpen) {
      return;
    }

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setDrawerOpen(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [drawerOpen]);

  const handleSelectStarterChip = (chip: HomeStarterChip) => {
    if (chip.launchKind === "open_drawer") {
      setDrawerOpen((current) => !current);
      updateGuideOpen(false);
      return;
    }
    if (chip.launchKind === "open_manager") {
      setManagerOpen(true);
      return;
    }
    if (chip.launchKind === "toggle_guide") {
      updateGuideOpen((current) => !current);
      setDrawerOpen(false);
      return;
    }
    updateGuideOpen(false);
    onSelectStarterChip(chip);
  };
  const visibleConversationGroups = conversationGroups.filter(
    (group) => group.conversations.length > 0,
  );
  const hasConversationGroups = visibleConversationGroups.length > 0;
  const conversationCount = visibleConversationGroups.reduce(
    (total, group) => total + group.conversations.length,
    0,
  );

  useEffect(() => {
    if (conversationCount === 0) {
      setConversationMoreOpen(false);
    }
  }, [conversationCount]);

  return (
    <Surface data-testid="home-start-surface">
      {!resolvedGuideOpen ? (
        <HomeStarterChips
          chips={starterChips}
          copy={copy}
          onSelect={handleSelectStarterChip}
        />
      ) : null}

      {!resolvedGuideOpen && recoverySession && onSelectRecoverySession ? (
        <RecoverySessionButton
          type="button"
          data-testid="home-unfinished-session-card"
          data-status={recoverySession.status}
          $status={recoverySession.status}
          title={recoverySession.summary || recoverySession.title}
          onClick={onSelectRecoverySession}
        >
          <RecoverySessionIcon $status={recoverySession.status} aria-hidden>
            {recoverySession.status === "waiting" ? (
              <CircleAlert size={17} strokeWidth={2.2} />
            ) : recoverySession.status === "queued" ? (
              <Clock3 size={17} strokeWidth={2.2} />
            ) : (
              <LoaderCircle size={17} strokeWidth={2.2} data-spin="true" />
            )}
          </RecoverySessionIcon>
          <RecoverySessionText>
            <RecoverySessionTitle>
              {copy.recoverySessionTitle(
                recoverySession.status,
                recoverySession.title,
              )}
            </RecoverySessionTitle>
            <RecoverySessionSummary>
              {recoverySession.summary ||
                copy.recoverySessionSummary(recoverySession.status)}
            </RecoverySessionSummary>
          </RecoverySessionText>
          <RecoverySessionAction>
            {copy.recoverySessionActionLabel(recoverySession.status)}
            <ArrowRight size={14} strokeWidth={2.2} aria-hidden />
          </RecoverySessionAction>
        </RecoverySessionButton>
      ) : null}

      {resolvedGuideOpen ? (
        <HomeGuideCards
          cards={guideCards}
          copy={copy}
          onSelect={(card) => onSelectGuideCard?.(card)}
        />
      ) : null}

      {!resolvedGuideOpen && hasConversationGroups ? (
        <ConversationShelf data-testid="home-project-conversations">
          <ConversationMoreWrap data-testid="home-project-conversation-more">
            <ConversationMoreButton
              type="button"
              $open={conversationMoreOpen}
              aria-expanded={conversationMoreOpen}
              onClick={() => setConversationMoreOpen((current) => !current)}
            >
              {copy.projectConversationsMoreLabel(conversationCount)}
              <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
            </ConversationMoreButton>
            {conversationMoreOpen ? (
              <ConversationMorePanel>
                <ConversationGroups
                  groups={visibleConversationGroups}
                  onSelectConversation={onSelectConversation}
                />
              </ConversationMorePanel>
            ) : null}
          </ConversationMoreWrap>
        </ConversationShelf>
      ) : null}

      {!resolvedGuideOpen &&
      !hasConversationGroups &&
      supplementalActions.length > 0 ? (
        <SupplementalRow data-testid="home-supplemental-actions">
          {supplementalActions.map((action) => (
            <SupplementalButton
              key={action.id}
              type="button"
              data-testid={action.testId}
              title={action.title}
              onClick={action.onSelect}
            >
              {action.label}
            </SupplementalButton>
          ))}
        </SupplementalRow>
      ) : null}

      <HomeMoreSkillsDrawer
        open={drawerOpen}
        copy={copy}
        sections={sections}
        onSelectItem={onSelectSkillItem}
      />
      <HomeSceneSkillManagerDialog
        open={managerOpen}
        onClose={() => setManagerOpen(false)}
      />
    </Surface>
  );
}

function ConversationGroups({
  groups,
  onSelectConversation,
}: {
  groups: HomeProjectConversationGroup[];
  onSelectConversation?: (
    conversationId: string,
    statusReason?: string,
  ) => void;
}) {
  return (
    <>
      {groups.map((group) => (
        <ConversationGroup
          key={group.projectId}
          data-testid="home-project-conversation-group"
          data-project-id={group.projectId}
        >
          <ConversationList>
            {group.conversations.map((conversation) => (
              <ConversationEntry
                key={conversation.id}
                conversation={conversation}
                onSelect={onSelectConversation}
              />
            ))}
          </ConversationList>
        </ConversationGroup>
      ))}
    </>
  );
}

function ConversationEntry({
  conversation,
  onSelect,
}: {
  conversation: HomeProjectConversationItem;
  onSelect?: (conversationId: string, statusReason?: string) => void;
}) {
  return (
    <ConversationButton
      type="button"
      data-testid="home-project-conversation"
      data-conversation-id={conversation.id}
      title={conversation.title}
      onClick={() => onSelect?.(conversation.id, conversation.statusReason)}
    >
      <ConversationIcon aria-hidden>
        <MessageCircle size={15} strokeWidth={1.8} />
      </ConversationIcon>
      <ConversationText>
        <ConversationTitle>{conversation.title}</ConversationTitle>
      </ConversationText>
    </ConversationButton>
  );
}

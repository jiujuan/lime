import { useEffect, useState } from "react";
import styled from "styled-components";
import { ChevronDown, MessageCircle } from "lucide-react";
import { HomeStarterChips } from "./HomeStarterChips";
import { HomeMoreSkillsDrawer } from "./HomeMoreSkillsDrawer";
import { HomeGuideCards } from "./HomeGuideCards";
import { HomeSceneSkillManagerDialog } from "./HomeSceneSkillManagerDialog";
import type {
  HomeGuideCard,
  HomeProjectConversationGroup,
  HomeProjectConversationItem,
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
  margin-top: 0.34rem;
  max-height: 220px;
  overflow-y: auto;
  scrollbar-width: thin;
`;

const HOME_PROJECT_CONVERSATIONS_VISIBLE_LIMIT = 3;

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
  sections: HomeSkillSection[];
  conversationGroups?: HomeProjectConversationGroup[];
  supplementalActions?: HomeSupplementalAction[];
  onGuideOpenChange?: (open: boolean) => void;
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
  sections,
  conversationGroups = [],
  supplementalActions = [],
  onGuideOpenChange,
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
  const { visibleGroups, overflowGroups, overflowCount } =
    splitConversationGroups(
      visibleConversationGroups,
      HOME_PROJECT_CONVERSATIONS_VISIBLE_LIMIT,
    );

  useEffect(() => {
    if (overflowCount === 0) {
      setConversationMoreOpen(false);
    }
  }, [overflowCount]);

  return (
    <Surface data-testid="home-start-surface">
      {!resolvedGuideOpen ? (
        <HomeStarterChips
          chips={starterChips}
          copy={copy}
          onSelect={handleSelectStarterChip}
        />
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
          <ConversationGroups
            groups={visibleGroups}
            onSelectConversation={onSelectConversation}
          />
          {overflowCount > 0 ? (
            <ConversationMoreWrap data-testid="home-project-conversation-more">
              <ConversationMoreButton
                type="button"
                $open={conversationMoreOpen}
                aria-expanded={conversationMoreOpen}
                onClick={() => setConversationMoreOpen((current) => !current)}
              >
                {copy.projectConversationsMoreLabel(overflowCount)}
                <ChevronDown size={14} strokeWidth={2.2} aria-hidden />
              </ConversationMoreButton>
              {conversationMoreOpen ? (
                <ConversationMorePanel>
                  <ConversationGroups
                    groups={overflowGroups}
                    onSelectConversation={onSelectConversation}
                  />
                </ConversationMorePanel>
              ) : null}
            </ConversationMoreWrap>
          ) : null}
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

function splitConversationGroups(
  groups: HomeProjectConversationGroup[],
  visibleLimit: number,
): {
  visibleGroups: HomeProjectConversationGroup[];
  overflowGroups: HomeProjectConversationGroup[];
  overflowCount: number;
} {
  let remainingVisible = Math.max(0, visibleLimit);
  const visibleGroups: HomeProjectConversationGroup[] = [];
  const overflowGroups: HomeProjectConversationGroup[] = [];

  for (const group of groups) {
    const visibleConversations = group.conversations.slice(0, remainingVisible);
    const overflowConversations = group.conversations.slice(
      visibleConversations.length,
    );

    if (visibleConversations.length > 0) {
      visibleGroups.push({
        ...group,
        conversations: visibleConversations,
      });
      remainingVisible -= visibleConversations.length;
    }

    if (overflowConversations.length > 0) {
      overflowGroups.push({
        ...group,
        conversations: overflowConversations,
      });
    }
  }

  return {
    visibleGroups,
    overflowGroups,
    overflowCount: overflowGroups.reduce(
      (total, group) => total + group.conversations.length,
      0,
    ),
  };
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

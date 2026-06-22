import styled from "styled-components";
import type { ExpertSkillRuntimeReadinessTone } from "./expertSkillRuntimeViewModel";

export const Panel = styled.aside`
  display: flex;
  width: 100%;
  max-width: none;
  min-width: 0;
  height: 100%;
  max-height: 100%;
  flex: 1 1 auto;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
  box-sizing: border-box;
  border: 0;
  border-radius: 0;
  background: var(--lime-surface, #ffffff);
  box-shadow: none;
  color: var(--lime-text, #1a3b2b);
  overscroll-behavior: contain;
  padding: 16px;
`;

export const PanelTitle = styled.div`
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--lime-text-strong, #123d2e);
  font-size: 14px;
  font-weight: 760;
`;

export const Header = styled.div`
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
`;

export const Avatar = styled.div`
  display: inline-flex;
  width: 40px;
  height: 40px;
  align-items: center;
  justify-content: center;
  border-radius: 16px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  font-size: 22px;
  box-shadow: inset 0 0 0 1px
    var(--lime-surface-border, rgba(226, 240, 226, 0.9));
  overflow: hidden;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
`;

export const HeaderText = styled.div`
  min-width: 0;
`;

export const ExpertTitle = styled.h2`
  margin: 0;
  overflow: hidden;
  color: var(--lime-text-strong, #123d2e);
  font-size: 15px;
  font-weight: 780;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const ExpertSummary = styled.p`
  margin: 3px 0 0;
  overflow: hidden;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.5;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const Section = styled.section`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

export const SectionHeaderRow = styled.div`
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
`;

export const SectionToggleButton = styled.button`
  display: flex;
  min-width: 0;
  flex: 1 1 auto;
  align-items: center;
  justify-content: space-between;
  border: 0;
  background: transparent;
  color: var(--lime-text-strong, #123d2e);
  cursor: pointer;
  padding: 0;
  font-size: 14px;
  font-weight: 740;
  text-align: left;
`;

export const SectionTitle = styled.span`
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
`;

export const IconActionButton = styled.button`
  display: inline-flex;
  width: 28px;
  height: 28px;
  flex: 0 0 auto;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--lime-brand, #10b981);
  border-radius: 10px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  cursor: pointer;
  transition:
    background 160ms ease,
    border-color 160ms ease,
    transform 160ms ease;

  &:hover {
    border-color: var(--lime-brand-strong, #166534);
    background: var(--lime-surface, #ffffff);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid var(--lime-focus-ring, rgba(16, 185, 129, 0.28));
    outline-offset: 2px;
  }
`;

export const Card = styled.div`
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.88));
  border-radius: 14px;
  background: var(--lime-surface-soft, #f8fcf9);
  padding: 10px;
`;

export const BlockTitle = styled.h3`
  margin: 0 0 7px;
  color: var(--lime-text-strong, #123d2e);
  font-size: 12px;
  font-weight: 760;

  &:not(:first-child) {
    margin-top: 12px;
  }
`;

export const BodyText = styled.p`
  margin: 0;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.55;
`;

export const BulletList = styled.ul`
  margin: 0;
  padding-left: 17px;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.55;
`;

export const ChipList = styled.div`
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
`;

export const Chip = styled.span`
  display: inline-flex;
  max-width: 100%;
  align-items: center;
  gap: 6px;
  border-radius: 10px;
  background: var(--lime-surface-muted, #f2f7f3);
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1;
  padding: 7px 9px;
`;

export const ChipLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SkillReadinessBadge = styled.span<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  background: ${({ $tone }) => {
    if ($tone === "ready") {
      return "rgba(16, 185, 129, 0.12)";
    }
    if ($tone === "warning") {
      return "rgba(245, 158, 11, 0.14)";
    }
    return "rgba(239, 68, 68, 0.12)";
  }};
  color: ${({ $tone }) => {
    if ($tone === "ready") {
      return "var(--lime-brand-strong, #166534)";
    }
    if ($tone === "warning") {
      return "#92400e";
    }
    return "#991b1b";
  }};
  font-size: 10px;
  font-weight: 760;
  line-height: 1;
  padding: 3px 5px;
`;

export const SkillRuntimeSummaryCard = styled(Card)<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: flex;
  flex-direction: column;
  gap: 7px;
  border-color: ${({ $tone }) => {
    if ($tone === "ready") {
      return "rgba(16, 185, 129, 0.28)";
    }
    if ($tone === "warning") {
      return "rgba(245, 158, 11, 0.32)";
    }
    return "rgba(239, 68, 68, 0.24)";
  }};
  background: ${({ $tone }) => {
    if ($tone === "ready") {
      return "rgba(236, 253, 245, 0.72)";
    }
    if ($tone === "warning") {
      return "rgba(255, 251, 235, 0.78)";
    }
    return "rgba(255, 241, 242, 0.62)";
  }};
`;

export const SkillRuntimeSummaryHeader = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
`;

export const SkillRuntimeSummaryTitle = styled.div`
  min-width: 0;
  color: var(--lime-text-strong, #123d2e);
  font-size: 12px;
  font-weight: 780;
  line-height: 1.4;
`;

export const SkillRuntimeSummaryCount = styled.span<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  background: var(--lime-surface, #ffffff);
  color: ${({ $tone }) => {
    if ($tone === "ready") {
      return "var(--lime-brand-strong, #166534)";
    }
    if ($tone === "warning") {
      return "#92400e";
    }
    return "#991b1b";
  }};
  font-size: 11px;
  font-weight: 780;
  line-height: 1;
  padding: 5px 7px;
`;

export const SkillRuntimeSummaryDetail = styled.div`
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.55;
`;

export const SkillRuntimeEditNotice = styled.div`
  border: 1px solid rgba(14, 165, 233, 0.18);
  border-radius: 10px;
  background: rgba(240, 249, 255, 0.84);
  color: #075985;
  font-size: 11px;
  font-weight: 700;
  line-height: 1.45;
  padding: 7px 8px;
`;

export const SkillRuntimeTraceBadge = styled.span<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: inline-flex;
  width: fit-content;
  max-width: 100%;
  align-items: center;
  border-radius: 999px;
  background: var(--lime-surface, #ffffff);
  color: ${({ $tone }) => {
    if ($tone === "ready") {
      return "var(--lime-brand-strong, #166534)";
    }
    if ($tone === "warning") {
      return "#92400e";
    }
    return "var(--lime-text-muted, #6b826b)";
  }};
  font-size: 11px;
  font-weight: 720;
  line-height: 1.3;
  padding: 5px 7px;
`;

export const SkillRuntimeInvocationRow = styled.div`
  display: flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
`;

export const SkillRuntimeInvocationStatus = styled.span<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border-radius: 999px;
  background: ${({ $tone }) => {
    if ($tone === "ready") {
      return "rgba(16, 185, 129, 0.12)";
    }
    if ($tone === "warning") {
      return "rgba(245, 158, 11, 0.14)";
    }
    return "var(--lime-surface, #ffffff)";
  }};
  color: ${({ $tone }) => {
    if ($tone === "ready") {
      return "var(--lime-brand-strong, #166534)";
    }
    if ($tone === "warning") {
      return "#92400e";
    }
    return "var(--lime-text-muted, #6b826b)";
  }};
  font-size: 11px;
  font-weight: 760;
  line-height: 1.25;
  padding: 5px 7px;
`;

export const SkillRuntimeInvocationDetail = styled.span`
  min-width: 0;
  overflow: hidden;
  color: var(--lime-text, #1a3b2b);
  font-size: 11px;
  font-weight: 700;
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SkillRuntimeTimelineList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 2px 0 0;
`;

export const SkillRuntimeTimelineItem = styled.li<{
  $tone: ExpertSkillRuntimeReadinessTone;
}>`
  display: grid;
  grid-template-columns: 14px minmax(0, 1fr);
  column-gap: 8px;
  color: var(--lime-text, #1a3b2b);
  font-size: 11px;
  line-height: 1.45;

  &::before {
    content: "";
    width: 7px;
    height: 7px;
    margin-top: 5px;
    border: 1px solid
      ${({ $tone }) => {
        if ($tone === "ready") {
          return "rgba(16, 185, 129, 0.72)";
        }
        if ($tone === "warning") {
          return "rgba(217, 119, 6, 0.64)";
        }
        return "rgba(225, 29, 72, 0.58)";
      }};
    border-radius: 999px;
    background: var(--lime-surface, #ffffff);
    box-shadow: 0 0 0 3px
      ${({ $tone }) => {
        if ($tone === "ready") {
          return "rgba(16, 185, 129, 0.12)";
        }
        if ($tone === "warning") {
          return "rgba(245, 158, 11, 0.13)";
        }
        return "rgba(244, 63, 94, 0.12)";
      }};
  }

  &:not(:last-child)::after {
    content: "";
    grid-column: 1;
    width: 1px;
    height: 18px;
    margin: 1px auto;
    background: var(--lime-surface-border-strong, #c7e7d1);
  }
`;

export const SkillRuntimeTimelineText = styled.span`
  display: flex;
  min-width: 0;
  gap: 6px;
  align-items: baseline;
`;

export const SkillRuntimeTimelineLabel = styled.span`
  flex: 0 0 auto;
  color: var(--lime-text-strong, #123d2e);
  font-weight: 760;
`;

export const SkillRuntimeTimelineDetail = styled.span`
  min-width: 0;
  overflow: hidden;
  color: var(--lime-text-muted, #6b826b);
  font-weight: 650;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SkillRuntimeTimelineEmpty = styled.div`
  color: var(--lime-text-muted, #6b826b);
  font-size: 11px;
  font-weight: 680;
  line-height: 1.45;
`;

export const SkillRuntimeActionList = styled.div`
  display: flex;
  flex-direction: column;
  gap: 7px;
`;

export const SkillRuntimeActionItem = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
  border-top: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.72));
  padding-top: 7px;
`;

export const SkillRuntimeActionTitle = styled.div`
  min-width: 0;
  overflow: hidden;
  color: var(--lime-text-strong, #123d2e);
  font-size: 12px;
  font-weight: 740;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SkillRuntimeActionReason = styled.div`
  display: -webkit-box;
  margin-top: 2px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--lime-text-muted, #6b826b);
  font-size: 11px;
  line-height: 1.45;
`;

export const SkillRuntimeActionButton = styled.button`
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  border: 1px solid rgba(217, 119, 6, 0.22);
  border-radius: 999px;
  background: var(--lime-surface, #ffffff);
  color: #92400e;
  cursor: pointer;
  font-size: 11px;
  font-weight: 760;
  line-height: 1;
  padding: 5px 7px;

  &:hover {
    border-color: rgba(217, 119, 6, 0.38);
    background: #fff7ed;
  }

  &:focus-visible {
    outline: 2px solid rgba(217, 119, 6, 0.28);
    outline-offset: 2px;
  }
`;

export const ChipRemoveButton = styled.button`
  display: inline-flex;
  width: 16px;
  height: 16px;
  align-items: center;
  justify-content: center;
  border: 0;
  border-radius: 999px;
  background: var(--lime-surface, #ffffff);
  color: var(--lime-text-muted, #6b826b);
  cursor: pointer;
  padding: 0;

  &:hover {
    background: var(--lime-brand-soft, #ecfdf5);
    color: var(--lime-brand-strong, #166534);
  }
`;

export const EmptyCard = styled(Card)`
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
`;

export const WorkflowList = styled.ol`
  display: flex;
  flex-direction: column;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 2px 0 0;
`;

export const WorkflowStep = styled.li`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  column-gap: 9px;
  color: var(--lime-text, #1a3b2b);
  font-size: 12px;
  line-height: 1.5;

  &::before {
    content: "";
    width: 8px;
    height: 8px;
    margin-top: 5px;
    border: 1px solid var(--lime-brand, #10b981);
    border-radius: 999px;
    background: var(--lime-surface, #ffffff);
    box-shadow: 0 0 0 3px var(--lime-brand-soft, #ecfdf5);
  }

  &:not(:last-child)::after {
    content: "";
    grid-column: 1;
    width: 1px;
    height: 22px;
    margin: 2px auto;
    background: var(--lime-surface-border-strong, #c7e7d1);
  }
`;

export const SkillDialogBackdrop = styled.div`
  position: fixed;
  inset: 0;
  z-index: 80;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(17, 52, 38, 0.28);
  padding: 24px;
`;

export const SkillDialog = styled.div`
  display: flex;
  width: min(560px, calc(100vw - 48px));
  max-height: min(720px, calc(100vh - 48px));
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.95));
  border-radius: 24px;
  background: var(--lime-surface, #ffffff);
  box-shadow: 0 32px 90px -46px var(--lime-shadow-color, rgba(15, 23, 42, 0.32));
`;

export const SkillDialogHeader = styled.div`
  display: grid;
  grid-template-columns: minmax(0, 1fr) 32px;
  gap: 12px;
  align-items: start;
  border-bottom: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.88));
  padding: 18px 18px 14px;
`;

export const SkillDialogTitle = styled.h2`
  margin: 0;
  color: var(--lime-text-strong, #123d2e);
  font-size: 17px;
  font-weight: 780;
  line-height: 1.35;
`;

export const SkillDialogSubtitle = styled.p`
  margin: 5px 0 0;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.55;
`;

export const DialogCloseButton = styled(IconActionButton)`
  border-color: var(--lime-surface-border, rgba(226, 240, 226, 0.92));
  background: var(--lime-surface-soft, #f8fcf9);
  color: var(--lime-text-muted, #6b826b);
`;

export const SkillDialogBody = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 12px;
  padding: 14px 18px 18px;
`;

export const SkillSearchBox = styled.label`
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 8px;
  align-items: center;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.92));
  border-radius: 14px;
  background: var(--lime-surface-soft, #f8fcf9);
  color: var(--lime-text-muted, #6b826b);
  padding: 10px 12px;

  input {
    min-width: 0;
    border: 0;
    outline: none;
    background: transparent;
    color: var(--lime-text, #1a3b2b);
    font-size: 13px;
  }
`;

export const SkillCandidateList = styled.div`
  display: flex;
  min-height: 0;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  padding-right: 2px;
`;

export const SkillCandidateCard = styled.div`
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.9));
  border-radius: 16px;
  background: var(--lime-surface-soft, #f8fcf9);
  padding: 10px;
`;

export const SkillCandidateAvatar = styled.div`
  display: inline-flex;
  width: 34px;
  height: 34px;
  align-items: center;
  justify-content: center;
  border-radius: 13px;
  background: var(--lime-brand-soft, #ecfdf5);
  color: var(--lime-brand-strong, #166534);
  font-size: 13px;
  font-weight: 780;
`;

export const SkillCandidateContent = styled.div`
  min-width: 0;
`;

export const SkillCandidateTitle = styled.div`
  overflow: hidden;
  color: var(--lime-text-strong, #123d2e);
  font-size: 13px;
  font-weight: 760;
  line-height: 1.35;
  text-overflow: ellipsis;
  white-space: nowrap;
`;

export const SkillCandidateSummary = styled.div`
  display: -webkit-box;
  margin-top: 3px;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--lime-text-muted, #6b826b);
  font-size: 12px;
  line-height: 1.45;
`;

export const SkillCandidateMeta = styled.div`
  margin-top: 6px;
  color: var(--lime-brand-strong, #166534);
  font-size: 11px;
  font-weight: 700;
`;

export const CandidateAddButton = styled.button<{ $added?: boolean }>`
  display: inline-flex;
  min-width: 68px;
  align-items: center;
  justify-content: center;
  gap: 5px;
  border: 1px solid
    ${({ $added }) =>
      $added
        ? "var(--lime-surface-border, rgba(226, 240, 226, 0.92))"
        : "var(--lime-brand, #10b981)"};
  border-radius: 999px;
  background: ${({ $added }) =>
    $added
      ? "var(--lime-surface-muted, #f2f7f3)"
      : "var(--lime-brand-soft, #ecfdf5)"};
  color: ${({ $added }) =>
    $added
      ? "var(--lime-text-muted, #6b826b)"
      : "var(--lime-brand-strong, #166534)"};
  cursor: ${({ $added }) => ($added ? "default" : "pointer")};
  font-size: 12px;
  font-weight: 740;
  padding: 7px 10px;

  &:not(:disabled):hover {
    border-color: var(--lime-brand-strong, #166534);
    background: var(--lime-surface, #ffffff);
  }
`;

export const SkillEmptyState = styled(EmptyCard)`
  display: flex;
  min-height: 96px;
  align-items: center;
  justify-content: center;
  gap: 8px;
  text-align: center;
`;

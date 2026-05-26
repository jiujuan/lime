import styled from "styled-components";
import { ScrollArea } from "@/components/ui/scroll-area";
import { LIME_STAGE_SURFACE } from "../workspace/taskCenterChromeTokens";

export const Navbar = styled.div<{
  $compact?: boolean;
  $collapsed?: boolean;
  $taskCenter?: boolean;
}>`
  display: flex;
  align-items: center;
  justify-content: ${({ $collapsed }) =>
    $collapsed ? "flex-end" : "space-between"};
  gap: ${({ $compact, $collapsed, $taskCenter }) =>
    $collapsed ? "10px" : $taskCenter ? "8px" : $compact ? "8px" : "12px"};
  padding: ${({ $compact, $collapsed, $taskCenter }) =>
    $collapsed
      ? $compact
        ? "6px 8px 2px"
        : "6px 14px 2px"
      : $taskCenter
        ? $compact
          ? "1px 8px 0"
          : "1px 8px 0"
        : $compact
          ? "7px 10px 7px"
          : "12px 16px 10px"};
  min-height: ${({ $compact, $collapsed, $taskCenter }) =>
    $collapsed ? "auto" : $taskCenter ? "auto" : $compact ? "50px" : "64px"};
  border-bottom: ${({ $collapsed }) =>
    $collapsed
      ? "none"
      : "1px solid var(--lime-surface-border, rgba(226, 240, 226, 0.72))"};
  border-bottom-color: ${({ $collapsed, $taskCenter }) =>
    $collapsed
      ? "transparent"
      : $taskCenter
        ? "transparent"
        : "var(--lime-surface-border, rgba(226, 240, 226, 0.72))"};
  background: ${({ $collapsed, $taskCenter }) =>
    $collapsed
      ? "transparent"
      : $taskCenter
        ? "transparent"
        : "var(--lime-composer-surface-floating)"};
  box-shadow: ${({ $collapsed, $taskCenter }) =>
    $collapsed
      ? "none"
      : $taskCenter
        ? "none"
        : `inset 0 -1px 0 rgba(255, 255, 255, 0.74),
    0 10px 28px rgba(15, 23, 42, 0.04)`};
  backdrop-filter: ${({ $collapsed, $taskCenter }) =>
    $collapsed || $taskCenter ? "none" : "blur(18px)"};
  align-self: ${({ $collapsed }) => ($collapsed ? "flex-end" : "stretch")};
  width: ${({ $collapsed }) => ($collapsed ? "fit-content" : "auto")};
  max-width: ${({ $collapsed }) => ($collapsed ? "calc(100% - 24px)" : "100%")};
  margin-left: ${({ $collapsed }) => ($collapsed ? "auto" : "0")};
  flex-shrink: 0;
  position: relative;
  z-index: 10;
`;

export const MessageListContainer = styled(ScrollArea)<{
  $taskCenterSurface?: boolean;
}>`
  flex: 1;
  min-height: 0;
  height: 100%;
  padding: 6px 0 16px;
  overscroll-behavior: contain;
  background: ${({ $taskCenterSurface }) =>
    $taskCenterSurface
      ? LIME_STAGE_SURFACE
      : `linear-gradient(
          180deg,
          var(--lime-surface-muted, rgba(242, 247, 243, 0.66)) 0%,
          var(--lime-surface-soft, rgba(248, 252, 249, 0.26)) 22%,
          rgba(255, 255, 255, 0) 100%
        )`};
`;

export const MessageListFrame = styled.div`
  position: relative;
  display: flex;
  flex: 1;
  min-height: 0;
  height: 100%;
`;

export const MessageListJumpToLatestButton = styled.button`
  position: absolute;
  right: 22px;
  bottom: 18px;
  z-index: 20;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 32px;
  padding: 0 13px;
  border: 1px solid var(--lime-surface-border-strong, rgba(187, 247, 208, 0.9));
  border-radius: 999px;
  background: var(--lime-home-card-surface-strong, #ffffff);
  color: var(--lime-text-strong, #0f172a);
  font-size: 12px;
  font-weight: 600;
  box-shadow: 0 14px 30px -24px rgba(15, 23, 42, 0.32);
  cursor: pointer;
  transition:
    border-color 0.16s ease,
    box-shadow 0.16s ease,
    transform 0.16s ease;

  &:hover {
    border-color: var(--lime-brand-strong, #166534);
    box-shadow: 0 16px 34px -24px rgba(15, 23, 42, 0.42);
    transform: translateY(-1px);
  }

  &:focus-visible {
    outline: 2px solid rgba(34, 197, 94, 0.28);
    outline-offset: 2px;
  }
`;

// Linear Layout Wrapper: Always Row, Left Aligned
export const MessageWrapper = styled.div<{
  $isUser: boolean;
  $compactLeadingSpacing?: boolean;
}>`
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  justify-content: ${({ $isUser }) => ($isUser ? "flex-end" : "flex-start")};
  padding: ${({ $compactLeadingSpacing }) =>
    $compactLeadingSpacing ? "8px 2px" : "8px 4px"};
  gap: 0;
  width: 100%;
  max-width: none;
  margin: 0;

  &:hover .message-actions,
  &:focus-within .message-actions {
    opacity: 1;
    max-height: 48px;
    margin-top: 8px;
    transform: translateY(0);
    pointer-events: auto;
  }
`;

export const ContentColumn = styled.div<{ $isUser: boolean }>`
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0;
  align-items: ${({ $isUser }) => ($isUser ? "flex-end" : "stretch")};
`;

export const MessageBubble = styled.div<{
  $isUser: boolean;
  $bareMedia?: boolean;
}>`
  width: ${({ $isUser, $bareMedia }) =>
    $bareMedia || $isUser ? "fit-content" : "100%"};
  max-width: ${({ $isUser, $bareMedia }) =>
    $bareMedia
      ? "min(100%, 800px)"
      : $isUser
        ? "min(72%, 560px)"
        : "min(100%, 1040px)"};
  padding: ${({ $isUser, $bareMedia }) =>
    $isUser ? "12px 16px" : $bareMedia ? "0" : "0 4px"};
  display: flex;
  flex-direction: column;
  gap: ${({ $isUser, $bareMedia }) =>
    $isUser ? "8px" : $bareMedia ? "0" : "10px"};
  border-radius: ${({ $isUser, $bareMedia }) =>
    $bareMedia || !$isUser ? "0" : "18px"};
  border: ${({ $isUser, $bareMedia }) =>
    $isUser && !$bareMedia
        ? "1px solid var(--lime-surface-border-strong, rgba(187, 247, 208, 0.72))"
        : "0"};
  background: ${({ $isUser, $bareMedia }) =>
    $isUser && !$bareMedia
        ? "linear-gradient(180deg, var(--lime-surface, #ffffff) 0%, var(--lime-brand-soft, #ecfdf5) 100%)"
        : "transparent"};
  box-shadow: ${({ $isUser, $bareMedia }) =>
    $isUser && !$bareMedia
        ? "0 16px 36px -30px rgba(15, 23, 42, 0.10), inset 0 1px 0 rgba(255, 255, 255, 0.74)"
        : "none"};
  color: ${({ $isUser }) =>
    $isUser ? "rgb(30, 41, 59)" : "var(--foreground)"};
  font-size: 15px;
  line-height: 1.7;
  position: relative;

  .markdown-renderer,
  .markdown-renderer * {
    color: inherit;
  }

  &.message-bubble-user-command {
    max-width: min(72%, 560px);
    border: 1px solid rgba(226, 232, 240, 0.76);
    border-radius: 12px;
    background: #f7f7f6;
    box-shadow: none;
  }
`;

export const MessageActions = styled.div`
  display: flex;
  gap: 4px;
  align-self: flex-end;
  position: relative;
  z-index: 5;
  max-height: 48px;
  overflow: visible;
  opacity: 1;
  pointer-events: auto;
  margin-top: 8px;
  transform: translateY(0);
  transition:
    opacity 0.18s ease,
    max-height 0.18s ease,
    margin-top 0.18s ease,
    transform 0.18s ease;
  background-color: transparent;

  &.image-workbench-message-actions {
    align-self: flex-start;
    margin-top: 8px;
  }
`;

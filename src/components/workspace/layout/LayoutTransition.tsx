/**
 * @file 布局过渡组件
 * @description 处理对话和画布之间的布局切换动画
 * @module components/workspace/layout/LayoutTransition
 */

import React, {
  memo,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useTranslation } from "react-i18next";
import styled from "styled-components";
import {
  MessageSquareText,
  PanelRightClose,
  PanelRightOpen,
} from "lucide-react";
import { CompactRightDockButton } from "@/components/ui/compact-right-dock-button";
import {
  CompactRightDrawerHeader,
  CompactRightDrawerIconButton,
} from "@/components/ui/compact-right-drawer-header";
import { LayoutMode } from "@/lib/workspace/workflowTypes";
import {
  emitCompactRightPanelOpen,
  onCompactRightPanelOpen,
} from "@/lib/compactRightPanelEvents";
import { useLayoutTransition, TransitionConfig } from "./useLayoutTransition";

const COMPACT_CHAT_CANVAS_BREAKPOINT_WIDTH = 900;
const COMPACT_CHAT_CANVAS_BREAKPOINT_HEIGHT = 620;
const COMPACT_CHAT_CANVAS_DRAWER_WIDTH = "min(420px, calc(100% - 24px))";
const CHAT_CANVAS_RESIZE_MIN_CHAT_WIDTH = 360;
const CHAT_CANVAS_RESIZE_MIN_CANVAS_WIDTH = 420;

function shouldUseCompactChatCanvasOverlay(mode: LayoutMode): boolean {
  if (mode !== "chat-canvas" || typeof window === "undefined") {
    return false;
  }

  return (
    window.innerWidth <= COMPACT_CHAT_CANVAS_BREAKPOINT_WIDTH ||
    window.innerHeight <= COMPACT_CHAT_CANVAS_BREAKPOINT_HEIGHT
  );
}

const Container = styled.div<{ $compactOverlay: boolean }>`
  display: flex;
  position: relative;
  flex-direction: row;
  width: 100%;
  height: 100%;
  min-height: 0;
  overflow: hidden;
  gap: ${({ $compactOverlay }) => ($compactOverlay ? "0" : "12px")};
`;

const SplitResizeHandle = styled.div<{ $dragging: boolean }>`
  position: relative;
  z-index: 12;
  flex: 0 0 10px;
  align-self: stretch;
  margin: 0 -6px;
  cursor: col-resize;
  touch-action: none;
  user-select: none;

  &::before {
    content: "";
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    transform: translateX(-50%);
    background: ${({ $dragging }) =>
      $dragging
        ? "var(--lime-surface-border-strong, #bbf7d0)"
        : "var(--lime-surface-border, rgba(226, 240, 226, 0.94))"};
  }

  &::after {
    content: "";
    position: absolute;
    top: 50%;
    left: 50%;
    width: 4px;
    height: 52px;
    border-radius: 999px;
    transform: translate(-50%, -50%);
    background: ${({ $dragging }) =>
      $dragging ? "var(--lime-brand-soft, #ecfdf5)" : "transparent"};
  }

  &:hover::before {
    background: var(--lime-surface-border-strong, #bbf7d0);
  }

  &:hover::after {
    background: var(--lime-brand-soft, #ecfdf5);
  }
`;

const ChatPanel = styled.div<{
  $width: string;
  $duration: number;
  $minWidth: string;
  $compactOverlay: boolean;
  $compactOverlayOpen: boolean;
  $hidden: boolean;
  $chrome: "panel" | "plain";
}>`
  position: ${({ $compactOverlay }) =>
    $compactOverlay ? "absolute" : "relative"};
  top: ${({ $compactOverlay }) => ($compactOverlay ? "12px" : "auto")};
  right: ${({ $compactOverlay }) => ($compactOverlay ? "12px" : "auto")};
  bottom: ${({ $compactOverlay }) => ($compactOverlay ? "12px" : "auto")};
  z-index: ${({ $compactOverlay }) => ($compactOverlay ? 30 : "auto")};
  height: ${({ $compactOverlay, $hidden }) =>
    $hidden ? "0" : $compactOverlay ? "calc(100% - 24px)" : "100%"};
  max-height: ${({ $compactOverlay, $hidden }) =>
    $hidden ? "0" : $compactOverlay ? "calc(100% - 24px)" : "100%"};
  overflow: hidden;
  transition:
    transform ${({ $duration }) => $duration}ms ease-out,
    opacity ${({ $duration }) => $duration}ms ease-out,
    width ${({ $duration }) => $duration}ms ease-out,
    height ${({ $duration }) => $duration}ms ease-out;
  width: ${({ $compactOverlay, $width, $hidden }) =>
    $hidden
      ? "0"
      : $compactOverlay
        ? COMPACT_CHAT_CANVAS_DRAWER_WIDTH
        : $width};
  min-width: ${({ $compactOverlay, $minWidth }) =>
    $compactOverlay ? "min(320px, calc(100% - 24px))" : $minWidth};
  min-height: ${({ $compactOverlay, $hidden }) =>
    $hidden ? "0" : $compactOverlay ? "280px" : "100%"};
  flex: ${({ $compactOverlay, $hidden }) =>
    $hidden ? "0 0 0" : $compactOverlay ? "0 0 auto" : "0 0 auto"};
  will-change: width, height, transform, opacity;
  display: ${({ $hidden }) => ($hidden ? "none" : "flex")};
  flex-direction: column;
  padding: ${({ $compactOverlay, $chrome }) =>
    $compactOverlay || $chrome === "plain" ? "0" : "16px 16px 16px 0"};
  transform: ${({ $compactOverlay, $compactOverlayOpen }) =>
    $compactOverlay
      ? $compactOverlayOpen
        ? "translateX(0)"
        : "translateX(calc(100% + 24px))"
      : "translateX(0)"};
  opacity: ${({ $compactOverlay, $compactOverlayOpen }) =>
    $compactOverlay ? ($compactOverlayOpen ? 1 : 0) : 1};
  pointer-events: ${({ $compactOverlay, $compactOverlayOpen }) =>
    $compactOverlay ? ($compactOverlayOpen ? "auto" : "none") : "auto"};
  border: ${({ $compactOverlay }) =>
    $compactOverlay ? "1px solid rgba(226, 232, 240, 0.9)" : "none"};
  border-radius: ${({ $compactOverlay }) => ($compactOverlay ? "24px" : "0")};
  background: ${({ $compactOverlay }) =>
    $compactOverlay
      ? "linear-gradient(180deg, rgba(255,255,255,0.98) 0%, rgba(248,250,252,0.96) 100%)"
      : "transparent"};
  box-shadow: ${({ $compactOverlay }) =>
    $compactOverlay ? "0 24px 80px rgba(15,23,42,0.16)" : "none"};
`;

const ChatPanelInner = styled.div<{ $topInset: string }>`
  height: 100%;
  display: flex;
  flex-direction: column;
  background: hsl(var(--background));
  border-radius: 12px;
  border: 1px solid hsl(var(--border));
  overflow: hidden;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.05);
  box-sizing: border-box;
  padding-top: ${({ $topInset }) => $topInset};
`;

const PlainChatPanelInner = styled.div<{ $topInset: string }>`
  height: 100%;
  min-height: 0;
  display: flex;
  flex-direction: column;
  box-sizing: border-box;
  padding-top: ${({ $topInset }) => $topInset};
`;

const CompactChatBackdrop = styled.button<{ $visible: boolean }>`
  position: absolute;
  inset: 0;
  z-index: 20;
  border: none;
  background: rgba(15, 23, 42, 0.08);
  opacity: ${({ $visible }) => ($visible ? 1 : 0)};
  pointer-events: ${({ $visible }) => ($visible ? "auto" : "none")};
  transition: opacity 220ms ease-out;
`;

const CompactChatTriggerSlot = styled.div`
  position: absolute;
  right: 16px;
  top: 16px;
  z-index: 18;
`;

const CompactChatBody = styled.div`
  flex: 1;
  min-height: 0;
  overflow: hidden;
`;

const CanvasPanel = styled.div<{
  $visible: boolean;
  $transform: string;
  $opacity: number;
  $duration: number;
  $topInset: string;
}>`
  position: relative;
  height: 100%;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  transition:
    transform ${({ $duration }) => $duration}ms ease-out,
    opacity ${({ $duration }) => $duration}ms ease-out;
  transform: ${({ $transform }) => $transform};
  opacity: ${({ $opacity }) => $opacity};
  display: ${({ $visible }) => ($visible ? "block" : "none")};
  will-change: transform, opacity;
  box-sizing: border-box;
  padding-top: ${({ $topInset }) => $topInset};
`;

interface LayoutTransitionProps {
  /** 当前布局模式 */
  mode: LayoutMode;
  /** 对话区域内容 */
  chatContent: React.ReactNode;
  /** 画布区域内容 */
  canvasContent: React.ReactNode;
  /** 过渡配置 */
  transitionConfig?: TransitionConfig;
  /** 聊天区域是否使用额外面板壳 */
  chatPanelChrome?: "panel" | "plain";
  /** chat-canvas 模式下聊天面板宽度 */
  chatPanelWidth?: string;
  /** chat-canvas 模式下聊天面板最小宽度 */
  chatPanelMinWidth?: string;
  /** chat-canvas 模式下聊天面板顶部预留 */
  chatPanelTopInset?: string;
  /** chat-canvas 模式下画布面板顶部预留 */
  canvasPanelTopInset?: string;
  /** 紧凑抽屉态下强制展开聊天区 */
  forceOpenChatPanel?: boolean;
}

/**
 * 布局过渡组件
 *
 * 处理纯对话和对话+画布两种布局之间的平滑切换
 */
export const LayoutTransition: React.FC<LayoutTransitionProps> = memo(
  ({
    mode,
    chatContent,
    canvasContent,
    transitionConfig,
    chatPanelChrome = "panel",
    chatPanelWidth,
    chatPanelMinWidth,
    chatPanelTopInset = "0px",
    canvasPanelTopInset = "0px",
    forceOpenChatPanel = false,
  }) => {
    const { t } = useTranslation("workspace");
    const containerRef = useRef<HTMLDivElement | null>(null);
    const resizingChatPanelRef = useRef(false);
    const [resizedChatPanelWidth, setResizedChatPanelWidth] = useState<
      number | null
    >(null);
    const [resizingChatPanel, setResizingChatPanel] = useState(false);
    const hasCanvasContent = React.Children.count(canvasContent) > 0;
    const effectiveMode: LayoutMode = hasCanvasContent ? mode : "chat";
    const effectiveChatPanelWidth = useMemo(
      () =>
        resizedChatPanelWidth !== null && effectiveMode === "chat-canvas"
          ? `${resizedChatPanelWidth}px`
          : chatPanelWidth,
      [chatPanelWidth, effectiveMode, resizedChatPanelWidth],
    );
    const { isCanvasVisible, getTransitionStyles } = useLayoutTransition(
      effectiveMode,
      transitionConfig,
      {
        chatCanvasPanelWidth: effectiveChatPanelWidth,
      },
    );
    const [compactChatCanvasOverlay, setCompactChatCanvasOverlay] = useState(
      () => shouldUseCompactChatCanvasOverlay(effectiveMode),
    );
    const [compactChatPanelOpen, setCompactChatPanelOpen] = useState(false);

    const chatStyles = getTransitionStyles("chat");
    const canvasStyles = getTransitionStyles("canvas");
    const resolvedChatPanelMinWidth =
      effectiveMode === "chat-canvas" ? chatPanelMinWidth || "360px" : "0px";
    const shouldRenderCanvas = hasCanvasContent && isCanvasVisible;
    const shouldRenderCompactChatTrigger =
      compactChatCanvasOverlay &&
      effectiveMode === "chat-canvas" &&
      shouldRenderCanvas &&
      !compactChatPanelOpen;
    const shouldRenderResizeHandle =
      effectiveMode === "chat-canvas" &&
      shouldRenderCanvas &&
      !compactChatCanvasOverlay;

    const resolveConstrainedChatWidth = useCallback((clientX: number) => {
      const containerRect = containerRef.current?.getBoundingClientRect();
      if (!containerRect) {
        return null;
      }
      const maxWidth = Math.max(
        CHAT_CANVAS_RESIZE_MIN_CHAT_WIDTH,
        containerRect.width - CHAT_CANVAS_RESIZE_MIN_CANVAS_WIDTH,
      );
      return Math.min(
        Math.max(
          clientX - containerRect.left,
          CHAT_CANVAS_RESIZE_MIN_CHAT_WIDTH,
        ),
        maxWidth,
      );
    }, []);

    const handleResizePointerDown = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        const nextWidth = resolveConstrainedChatWidth(event.clientX);
        if (nextWidth === null) {
          return;
        }
        event.currentTarget.setPointerCapture(event.pointerId);
        event.preventDefault();
        resizingChatPanelRef.current = true;
        setResizingChatPanel(true);
        setResizedChatPanelWidth(nextWidth);
      },
      [resolveConstrainedChatWidth],
    );

    const handleResizePointerMove = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!resizingChatPanelRef.current) {
          return;
        }
        const nextWidth = resolveConstrainedChatWidth(event.clientX);
        if (nextWidth !== null) {
          setResizedChatPanelWidth(nextWidth);
        }
      },
      [resolveConstrainedChatWidth],
    );

    const handleResizePointerEnd = useCallback(
      (event: React.PointerEvent<HTMLDivElement>) => {
        if (!resizingChatPanelRef.current) {
          return;
        }
        if (event.currentTarget.hasPointerCapture(event.pointerId)) {
          event.currentTarget.releasePointerCapture(event.pointerId);
        }
        resizingChatPanelRef.current = false;
        setResizingChatPanel(false);
      },
      [],
    );

    useEffect(() => {
      if (effectiveMode !== "chat-canvas" || compactChatCanvasOverlay) {
        resizingChatPanelRef.current = false;
        setResizingChatPanel(false);
      }
    }, [compactChatCanvasOverlay, effectiveMode]);

    useEffect(() => {
      const updateLayout = () => {
        setCompactChatCanvasOverlay(
          shouldUseCompactChatCanvasOverlay(effectiveMode),
        );
      };

      updateLayout();
      if (typeof window === "undefined") {
        return;
      }

      window.addEventListener("resize", updateLayout);
      return () => {
        window.removeEventListener("resize", updateLayout);
      };
    }, [effectiveMode]);

    useEffect(() => {
      if (effectiveMode !== "chat-canvas" || !compactChatCanvasOverlay) {
        setCompactChatPanelOpen(false);
      }
    }, [compactChatCanvasOverlay, effectiveMode]);

    useEffect(() => {
      if (
        !forceOpenChatPanel ||
        !compactChatCanvasOverlay ||
        effectiveMode !== "chat-canvas" ||
        compactChatPanelOpen
      ) {
        return;
      }

      setCompactChatPanelOpen(true);
      emitCompactRightPanelOpen({ source: "chat" });
    }, [
      compactChatCanvasOverlay,
      compactChatPanelOpen,
      effectiveMode,
      forceOpenChatPanel,
    ]);

    useEffect(() => {
      if (!compactChatCanvasOverlay || effectiveMode !== "chat-canvas") {
        return;
      }

      return onCompactRightPanelOpen((detail) => {
        if (detail.source !== "chat") {
          setCompactChatPanelOpen(false);
        }
      });
    }, [compactChatCanvasOverlay, effectiveMode]);

    const handleOpenCompactChatPanel = () => {
      setCompactChatPanelOpen(true);
      emitCompactRightPanelOpen({ source: "chat" });
    };

    const canvasPanelNode = (
      <CanvasPanel
        $visible={shouldRenderCanvas}
        $transform={canvasStyles.transform as string}
        $opacity={canvasStyles.opacity as number}
        $topInset={canvasPanelTopInset}
        $duration={parseInt(
          canvasStyles.transition?.match(/\d+/)?.[0] || "300",
        )}
        data-top-inset={canvasPanelTopInset}
        data-testid="layout-canvas-panel"
      >
        {canvasContent}
        {shouldRenderCompactChatTrigger ? (
          <CompactChatTriggerSlot>
            <CompactRightDockButton
              icon={
                <span className="inline-flex items-center gap-1.5">
                  <PanelRightOpen size={16} />
                  <MessageSquareText size={15} />
                </span>
              }
              label={t("workspace.layout.chatOverlay.triggerLabel")}
              badgeLabel={t("workspace.layout.chatOverlay.badgeLabel")}
              ariaLabel={t("workspace.layout.chatOverlay.openAria")}
              testId="layout-chat-overlay-trigger"
              onClick={handleOpenCompactChatPanel}
            />
          </CompactChatTriggerSlot>
        ) : null}
      </CanvasPanel>
    );

    const compactBackdropNode = compactChatCanvasOverlay ? (
      <CompactChatBackdrop
        type="button"
        aria-label={t("workspace.layout.chatOverlay.backdropAria")}
        $visible={compactChatPanelOpen}
        onClick={() => setCompactChatPanelOpen(false)}
      />
    ) : null;

    const chatPanelNode = (
      <ChatPanel
        $width={chatStyles.width as string}
        $duration={parseInt(chatStyles.transition?.match(/\d+/)?.[0] || "300")}
        $minWidth={resolvedChatPanelMinWidth}
        $compactOverlay={
          compactChatCanvasOverlay && effectiveMode === "chat-canvas"
        }
        $compactOverlayOpen={compactChatPanelOpen}
        $hidden={effectiveMode === "canvas"}
        $chrome={chatPanelChrome}
        data-testid="layout-chat-panel"
        data-chat-panel-width={chatStyles.width as string}
        data-chat-panel-min-width={resolvedChatPanelMinWidth}
        data-overlay-state={
          compactChatCanvasOverlay && effectiveMode === "chat-canvas"
            ? compactChatPanelOpen
              ? "open"
              : "closed"
            : "inline"
        }
      >
        {compactChatCanvasOverlay && effectiveMode === "chat-canvas" ? (
          <>
            <CompactRightDrawerHeader
              eyebrow={t("workspace.layout.chatOverlay.eyebrow")}
              heading={t("workspace.layout.chatOverlay.heading")}
              subtitle={t("workspace.layout.chatOverlay.subtitle")}
              icon={<MessageSquareText size={14} />}
              actions={
                <CompactRightDrawerIconButton
                  aria-label={t("workspace.layout.chatOverlay.closeAria")}
                  onClick={() => setCompactChatPanelOpen(false)}
                  data-testid="layout-chat-overlay-close"
                >
                  <PanelRightClose size={16} />
                </CompactRightDrawerIconButton>
              }
              data-testid="layout-chat-drawer-header"
            />
            <CompactChatBody>
              {chatPanelChrome === "plain" ? (
                <PlainChatPanelInner
                  $topInset="0px"
                  data-top-inset="0px"
                  data-testid="layout-chat-panel-plain"
                >
                  {chatContent}
                </PlainChatPanelInner>
              ) : (
                <ChatPanelInner
                  $topInset="0px"
                  data-top-inset="0px"
                  data-testid="layout-chat-panel-inner"
                >
                  {chatContent}
                </ChatPanelInner>
              )}
            </CompactChatBody>
          </>
        ) : chatPanelChrome === "plain" ? (
          <PlainChatPanelInner
            $topInset={chatPanelTopInset}
            data-top-inset={chatPanelTopInset}
            data-testid="layout-chat-panel-plain"
          >
            {chatContent}
          </PlainChatPanelInner>
        ) : (
          <ChatPanelInner
            $topInset={chatPanelTopInset}
            data-top-inset={chatPanelTopInset}
            data-testid="layout-chat-panel-inner"
          >
            {chatContent}
          </ChatPanelInner>
        )}
      </ChatPanel>
    );

    const shouldKeepCompactOverlayLayerOrder =
      compactChatCanvasOverlay && effectiveMode === "chat-canvas";

    return (
      <Container
        ref={containerRef}
        $compactOverlay={compactChatCanvasOverlay}
        data-testid="layout-transition-root"
        data-effective-mode={effectiveMode}
        data-has-canvas={shouldRenderCanvas ? "true" : "false"}
        data-layout-axis="horizontal"
        data-chat-panel-placement={
          compactChatCanvasOverlay && effectiveMode === "chat-canvas"
            ? "overlay-right"
            : "inline"
        }
      >
        {shouldKeepCompactOverlayLayerOrder ? (
          <>
            {canvasPanelNode}
            {compactBackdropNode}
            {chatPanelNode}
          </>
        ) : (
          <>
            {chatPanelNode}
            {shouldRenderResizeHandle ? (
              <SplitResizeHandle
                role="separator"
                aria-orientation="vertical"
                aria-label={t("workspace.layout.splitter.resizeAria")}
                $dragging={resizingChatPanel}
                data-testid="layout-chat-canvas-resize-handle"
                data-dragging={resizingChatPanel ? "true" : "false"}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={handleResizePointerEnd}
                onPointerCancel={handleResizePointerEnd}
              />
            ) : null}
            {canvasPanelNode}
          </>
        )}
      </Container>
    );
  },
);

LayoutTransition.displayName = "LayoutTransition";

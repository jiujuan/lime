import React, { useCallback, useRef, useState } from "react";
import {
  ActionButtonGroup,
  Container,
  InputBarContainer,
  InputColumn,
  InputIconButton,
  InputSuggestionKeycap,
  InputSuggestionLayer,
  InputSuggestionText,
  MainRow,
  MetaSlot,
  StyledTextarea,
  BottomBar,
  LeftSection,
  TrailingSection,
  SendButton,
  SecondaryActionButton,
  DragHandle,
  ImagePreviewContainer,
  ImagePreviewItem,
  ImagePreviewImg,
  ImageRemoveButton,
  PathReferenceChip,
  PathReferenceContainer,
  PathReferenceIcon,
  PathReferenceKnowledgeButton,
  PathReferenceName,
  PathReferencePath,
  PathReferenceRemoveButton,
  PathReferenceText,
} from "../styles";
import { InputbarTools } from "./InputbarTools";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  FileText,
  Folder,
  ImagePlus,
  Plus,
  Square,
  X,
} from "lucide-react";
import { BaseComposer } from "@/components/input-kit";
import { isKnowledgeTextSourceCandidate } from "@/features/knowledge/import/knowledgeSourceSupport";
import type { MessageImage, MessagePathReference } from "../../../types";
import type { QueuedTurnSnapshot } from "@/lib/api/agentRuntime";
import { QueuedTurnsPanel } from "./QueuedTurnsPanel";
import type { InputbarCoreCopy } from "./inputbarCoreCopy";
import {
  InputbarPlusMenu,
  type InputbarPlusMenuConfig,
} from "./InputbarPlusMenu";

const INTERACTIVE_TARGET_SELECTOR =
  "button, a, input, textarea, select, option, [role='button'], [contenteditable=''], [contenteditable='true'], [contenteditable='plaintext-only']";

function shouldFocusComposerTextarea(target: EventTarget | null): boolean {
  if (!(target instanceof Element)) {
    return true;
  }
  return !target.closest(INTERACTIVE_TARGET_SELECTOR);
}

interface InputbarCoreProps {
  uiCopy: InputbarCoreCopy;
  text: string;
  setText: (text: string) => void;
  onSend: () => void;
  /** 停止生成回调 */
  onStop?: () => void;
  isLoading?: boolean;
  disabled?: boolean;
  activeTools: Record<string, boolean>;
  onToolClick: (tool: string) => void;
  pendingImages?: MessageImage[];
  onRemoveImage?: (index: number) => void;
  pathReferences?: MessagePathReference[];
  onImportPathReferenceAsKnowledge?: (reference: MessagePathReference) => void;
  onRemovePathReference?: (id: string) => void;
  onPaste?: (e: React.ClipboardEvent) => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: (e: React.DragEvent) => void;
  isFullscreen?: boolean;
  /** Textarea ref（用于 CharacterMention） */
  textareaRef?: React.RefObject<HTMLTextAreaElement>;
  /** 输入框底栏左侧扩展区域 */
  leftExtra?: React.ReactNode;
  /** 输入框底栏尾部元信息区域 */
  trailingMeta?: React.ReactNode;
  /** 输入框内部顶部扩展区域（textarea 上方） */
  topExtra?: React.ReactNode;
  /** 输入框提示文案 */
  placeholder?: string;
  /** 工具栏模式 */
  toolMode?: "default" | "attach-only";
  /** 是否显示顶部拖拽条 */
  showDragHandle?: boolean;
  /** 视觉风格 */
  visualVariant?: "default" | "floating";
  /** 下方是否连接外部上下文托盘 */
  connectedContextBar?: boolean;
  /** Enter 发送延后一帧，优先释放首页首帧渲染。 */
  deferSendOnEnter?: boolean;
  /** 当前输入所属会话，仅用于运行态可观测性与稳定回归定位。 */
  sessionId?: string | null;
  activeTheme?: string;
  queuedTurns?: QueuedTurnSnapshot[];
  onPromoteQueuedTurn?: (queuedTurnId: string) => void | Promise<boolean>;
  onRemoveQueuedTurn?: (queuedTurnId: string) => void | Promise<boolean>;
  showMetaTools?: boolean;
  plusMenu?: InputbarPlusMenuConfig;
  inputSuggestion?: {
    label: string;
    prompt: string;
    testId?: string;
  } | null;
  onAcceptInputSuggestion?: (suggestion: {
    label: string;
    prompt: string;
    testId?: string;
  }) => void;
}

export const InputbarCore: React.FC<InputbarCoreProps> = ({
  uiCopy,
  text,
  setText,
  onSend,
  onStop,
  isLoading = false,
  disabled = false,
  activeTools,
  onToolClick,
  pendingImages = [],
  onRemoveImage,
  pathReferences = [],
  onImportPathReferenceAsKnowledge,
  onRemovePathReference,
  onPaste,
  onDragOver,
  onDrop,
  isFullscreen = false,
  textareaRef: externalTextareaRef,
  leftExtra,
  trailingMeta,
  topExtra,
  placeholder,
  toolMode = "default",
  showDragHandle = true,
  visualVariant = "default",
  connectedContextBar = false,
  deferSendOnEnter = false,
  sessionId = null,
  activeTheme,
  queuedTurns = [],
  onPromoteQueuedTurn,
  onRemoveQueuedTurn,
  showMetaTools = true,
  plusMenu,
  inputSuggestion = null,
  onAcceptInputSuggestion,
}) => {
  const [isTextareaExpanded, setIsTextareaExpanded] = useState(false);
  const inputBarContainerRef = useRef<HTMLDivElement | null>(null);
  const fallbackTextareaRef = useRef<HTMLTextAreaElement>(null);
  const resolvedTextareaRef = externalTextareaRef ?? fallbackTextareaRef;
  const isFloatingVariant = visualVariant === "floating";
  const hasInlineComposerContent =
    text.trim().length > 0 ||
    pendingImages.length > 0 ||
    pathReferences.length > 0 ||
    queuedTurns.length > 0;
  const shouldCollapseFloatingTools =
    isFloatingVariant &&
    toolMode === "attach-only" &&
    !hasInlineComposerContent;
  const shouldUseCompactFloatingComposer =
    shouldCollapseFloatingTools && !topExtra && !isTextareaExpanded;
  const containerClassName = [
    isFullscreen ? "flex-1 flex flex-col" : "",
    isFloatingVariant ? "floating-composer" : "",
    connectedContextBar ? "context-connected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const inputBarClassName = [
    isFullscreen ? "flex-1 flex flex-col" : "",
    isFloatingVariant ? "floating-composer" : "",
    shouldUseCompactFloatingComposer ? "floating-collapsed" : "",
    connectedContextBar ? "context-connected" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const textareaClassName = [
    isFullscreen ? "flex-1 resize-none" : "",
    isFloatingVariant ? "floating-composer" : "",
    shouldUseCompactFloatingComposer ? "floating-collapsed" : "",
    isTextareaExpanded ? "composer-expanded" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const bottomBarClassName = [
    isFloatingVariant ? "floating-composer" : "",
    shouldUseCompactFloatingComposer ? "floating-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mainRowClassName = [
    isFloatingVariant ? "floating-composer" : "",
    shouldUseCompactFloatingComposer ? "floating-collapsed" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const leftSectionClassName = shouldCollapseFloatingTools
    ? "floating-collapsed"
    : "";
  const shouldRenderMetaBar =
    !shouldUseCompactFloatingComposer &&
    (Boolean(plusMenu) ||
      Boolean(leftExtra) ||
      Boolean(trailingMeta) ||
      (showMetaTools &&
        toolMode === "default" &&
        !shouldCollapseFloatingTools));
  const shouldShowInputSuggestion =
    Boolean(inputSuggestion) && text.trim().length === 0 && !disabled;
  const handleInputSuggestionKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (
        !inputSuggestion ||
        event.key !== "Tab" ||
        event.shiftKey ||
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        text.trim().length > 0 ||
        disabled
      ) {
        return;
      }

      const nativeEvent = event.nativeEvent as KeyboardEvent & {
        isComposing?: boolean;
      };
      if (
        nativeEvent.isComposing ||
        nativeEvent.key === "Process" ||
        nativeEvent.keyCode === 229
      ) {
        return;
      }

      event.preventDefault();
      const acceptedText = inputSuggestion.prompt;
      if (onAcceptInputSuggestion) {
        onAcceptInputSuggestion(inputSuggestion);
      } else {
        setText(acceptedText);
      }
      window.requestAnimationFrame(() => {
        const textarea = resolvedTextareaRef.current;
        textarea?.focus();
        textarea?.setSelectionRange(acceptedText.length, acceptedText.length);
      });
    },
    [
      disabled,
      inputSuggestion,
      onAcceptInputSuggestion,
      resolvedTextareaRef,
      setText,
      text,
    ],
  );

  const handleRemoveImageMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const handleRemoveImageClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, index: number) => {
      event.preventDefault();
      event.stopPropagation();
      onRemoveImage?.(index);
    },
    [onRemoveImage],
  );

  const handleRemovePathReferenceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );

  const handleRemovePathReferenceClick = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>, id: string) => {
      event.preventDefault();
      event.stopPropagation();
      onRemovePathReference?.(id);
    },
    [onRemovePathReference],
  );
  const handleImportPathReferenceMouseDown = useCallback(
    (event: React.MouseEvent<HTMLButtonElement>) => {
      event.preventDefault();
      event.stopPropagation();
    },
    [],
  );
  const handleImportPathReferenceClick = useCallback(
    (
      event: React.MouseEvent<HTMLButtonElement>,
      reference: MessagePathReference,
    ) => {
      event.preventDefault();
      event.stopPropagation();
      onImportPathReferenceAsKnowledge?.(reference);
    },
    [onImportPathReferenceAsKnowledge],
  );

  const handleToggleTextareaExpanded = useCallback(() => {
    setIsTextareaExpanded((previous) => !previous);
  }, []);

  return (
    <BaseComposer
      text={text}
      setText={setText}
      onSend={onSend}
      onStop={onStop}
      isLoading={isLoading}
      disabled={disabled}
      onPaste={onPaste}
      onKeyDown={handleInputSuggestionKeyDown}
      isFullscreen={isFullscreen}
      fillHeightWhenFullscreen
      hasAdditionalContent={
        pendingImages.length > 0 || pathReferences.length > 0
      }
      maxAutoHeight={isTextareaExpanded ? 360 : isFloatingVariant ? 240 : 120}
      textareaRef={resolvedTextareaRef}
      onEscape={() => onToolClick("fullscreen")}
      allowSendWhileLoading
      deferSendOnEnter={deferSendOnEnter}
      rows={isTextareaExpanded ? 7 : isFloatingVariant ? 3 : 1}
      placeholder={
        shouldShowInputSuggestion
          ? ""
          : placeholder ||
            (isFullscreen
              ? uiCopy.placeholder.fullscreen
              : uiCopy.placeholder.default)
      }
    >
      {({ textareaProps, textareaRef, isPrimaryDisabled, onPrimaryAction }) => {
        const loadingSecondaryActionLabel = isPrimaryDisabled
          ? uiCopy.action.running
          : uiCopy.action.defer;
        const handleContainerMouseDownCapture = (
          event: React.MouseEvent<HTMLDivElement>,
        ) => {
          if (!isFloatingVariant || toolMode !== "attach-only") {
            return;
          }
          if (!shouldFocusComposerTextarea(event.target)) {
            return;
          }
          window.requestAnimationFrame(() => {
            textareaRef.current?.focus();
          });
        };

        return (
          <Container className={containerClassName}>
            <InputBarContainer
              ref={inputBarContainerRef}
              data-testid="inputbar-core-container"
              className={inputBarClassName}
              onMouseDownCapture={handleContainerMouseDownCapture}
              onDragEnterCapture={onDragOver}
              onDragOverCapture={onDragOver}
              onDropCapture={onDrop}
            >
              {!isFullscreen && showDragHandle && <DragHandle />}

              {pendingImages.length > 0 && (
                <ImagePreviewContainer>
                  {pendingImages.map((img, index) => (
                    <ImagePreviewItem key={index}>
                      <ImagePreviewImg
                        src={`data:${img.mediaType};base64,${img.data}`}
                        alt={uiCopy.image.previewAlt(index + 1)}
                      />
                      <ImageRemoveButton
                        type="button"
                        aria-label={uiCopy.image.remove(index + 1)}
                        onMouseDown={handleRemoveImageMouseDown}
                        onClick={(event) =>
                          handleRemoveImageClick(event, index)
                        }
                      >
                        <X size={12} />
                      </ImageRemoveButton>
                    </ImagePreviewItem>
                  ))}
                </ImagePreviewContainer>
              )}

              {pathReferences.length > 0 ? (
                <PathReferenceContainer aria-label={uiCopy.path.containerLabel}>
                  {pathReferences.map((reference) => {
                    const ReferenceIcon = reference.isDir ? Folder : FileText;
                    return (
                      <PathReferenceChip
                        key={reference.id}
                        title={reference.name}
                        data-testid="inputbar-path-reference-chip"
                      >
                        <PathReferenceIcon $isDir={reference.isDir}>
                          <ReferenceIcon size={14} aria-hidden />
                        </PathReferenceIcon>
                        <PathReferenceText>
                          <PathReferenceName>
                            {reference.name}
                          </PathReferenceName>
                          <PathReferencePath>
                            {reference.isDir
                              ? uiCopy.path.localFolder
                              : uiCopy.path.localFile}
                          </PathReferencePath>
                        </PathReferenceText>
                        {onImportPathReferenceAsKnowledge &&
                        isKnowledgeTextSourceCandidate(reference) ? (
                          <PathReferenceKnowledgeButton
                            type="button"
                            aria-label={uiCopy.path.importAsKnowledge(
                              reference.name,
                            )}
                            onMouseDown={handleImportPathReferenceMouseDown}
                            onClick={(event) =>
                              handleImportPathReferenceClick(event, reference)
                            }
                          >
                            <FileText size={12} aria-hidden />
                            {uiCopy.path.importAction}
                          </PathReferenceKnowledgeButton>
                        ) : null}
                        <PathReferenceRemoveButton
                          type="button"
                          aria-label={uiCopy.path.remove(reference.name)}
                          onMouseDown={handleRemovePathReferenceMouseDown}
                          onClick={(event) =>
                            handleRemovePathReferenceClick(event, reference.id)
                          }
                        >
                          <X size={12} />
                        </PathReferenceRemoveButton>
                      </PathReferenceChip>
                    );
                  })}
                </PathReferenceContainer>
              ) : null}

              {topExtra}
              <QueuedTurnsPanel
                queuedTurns={queuedTurns}
                onPromoteQueuedTurn={onPromoteQueuedTurn}
                onRemoveQueuedTurn={onRemoveQueuedTurn}
              />

              <MainRow className={mainRowClassName}>
                <InputIconButton
                  type="button"
                  onClick={() => onToolClick("attach")}
                  aria-label={uiCopy.image.add}
                  title={uiCopy.image.add}
                >
                  <ImagePlus size={14} />
                </InputIconButton>
                <InputColumn>
                  {shouldShowInputSuggestion && inputSuggestion ? (
                    <InputSuggestionLayer
                      className={textareaClassName}
                      data-testid="home-input-tab-suggestion"
                      title={uiCopy.suggestion.acceptTitle}
                    >
                      <InputSuggestionText>
                        {inputSuggestion.label}
                      </InputSuggestionText>
                      <InputSuggestionKeycap>
                        {uiCopy.suggestion.acceptKey}
                      </InputSuggestionKeycap>
                    </InputSuggestionLayer>
                  ) : null}
                  <StyledTextarea
                    ref={textareaRef}
                    {...textareaProps}
                    data-session-id={sessionId || undefined}
                    className={textareaClassName}
                  />
                </InputColumn>
                <ActionButtonGroup>
                  <InputIconButton
                    type="button"
                    onClick={handleToggleTextareaExpanded}
                    disabled={disabled}
                    className={isTextareaExpanded ? "is-active" : ""}
                    aria-label={
                      isTextareaExpanded
                        ? uiCopy.textarea.collapse
                        : uiCopy.textarea.expand
                    }
                    title={
                      isTextareaExpanded
                        ? uiCopy.textarea.collapse
                        : uiCopy.textarea.expand
                    }
                  >
                    {isTextareaExpanded ? (
                      <ChevronDown size={14} />
                    ) : (
                      <ChevronUp size={14} />
                    )}
                  </InputIconButton>
                  {isLoading ? (
                    <SecondaryActionButton
                      type="button"
                      onClick={onPrimaryAction}
                      disabled={isPrimaryDisabled}
                      aria-label={loadingSecondaryActionLabel}
                      title={loadingSecondaryActionLabel}
                    >
                      <span>{loadingSecondaryActionLabel}</span>
                    </SecondaryActionButton>
                  ) : null}
                  {isLoading ? (
                    <InputIconButton
                      type="button"
                      onClick={onStop}
                      disabled={!onStop}
                      $destructive
                      aria-label={uiCopy.action.stop}
                      title={uiCopy.action.stop}
                    >
                      <Square size={14} fill="currentColor" />
                    </InputIconButton>
                  ) : null}
                  {!isLoading ? (
                    <SendButton
                      type="button"
                      data-testid="send-btn"
                      onClick={onPrimaryAction}
                      disabled={isPrimaryDisabled}
                      aria-label={uiCopy.action.send}
                      title={uiCopy.action.send}
                    >
                      <ArrowUp size={16} strokeWidth={2.4} />
                    </SendButton>
                  ) : null}
                </ActionButtonGroup>
              </MainRow>

              {shouldRenderMetaBar ? (
                <BottomBar className={bottomBarClassName}>
                  <LeftSection
                    className={leftSectionClassName}
                    data-testid="inputbar-meta-left"
                  >
                    {plusMenu ? (
                      <InputbarPlusMenu config={plusMenu} disabled={disabled}>
                        <InputIconButton
                          type="button"
                          aria-label={plusMenu.labels.open}
                          title={plusMenu.labels.open}
                          data-testid="inputbar-plus-trigger"
                        >
                          <Plus size={15} />
                        </InputIconButton>
                      </InputbarPlusMenu>
                    ) : null}
                    {leftExtra ? <MetaSlot>{leftExtra}</MetaSlot> : null}
                    {!shouldCollapseFloatingTools && showMetaTools ? (
                      <InputbarTools
                        onToolClick={onToolClick}
                        activeTools={activeTools}
                        toolMode={toolMode}
                        activeTheme={activeTheme}
                      />
                    ) : null}
                  </LeftSection>
                  {trailingMeta ? (
                    <TrailingSection data-testid="inputbar-meta-trailing">
                      <MetaSlot>{trailingMeta}</MetaSlot>
                    </TrailingSection>
                  ) : null}
                </BottomBar>
              ) : null}
            </InputBarContainer>
          </Container>
        );
      }}
    </BaseComposer>
  );
};

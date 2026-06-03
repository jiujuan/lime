import React from "react";
import {
  BookmarkPlus,
  Check,
  Copy,
  FileText,
  Quote,
  Sparkles,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { MessageActions } from "../styles";

interface MessageActionButtonsProps {
  actionContent: string;
  canCopyMessage: boolean;
  canQuoteMessage: boolean;
  canSaveMessageAsInspiration: boolean;
  canSaveMessageAsKnowledge: boolean;
  canSaveMessageAsSkill: boolean;
  copied: boolean;
  isImageWorkbenchMessage: boolean;
  knowledgeContent?: string;
  knowledgeDescription?: string | null;
  knowledgeSourceName?: string;
  messageId: string;
  onCopy?: (content: string, messageId: string) => void;
  onQuoteMessage?: (content: string, messageId: string) => void;
  onSaveMessageAsInspiration?: (source: {
    messageId: string;
    content: string;
  }) => void;
  onSaveMessageAsKnowledge?: (source: {
    messageId: string;
    content: string;
    sourceName?: string;
    description?: string | null;
  }) => void;
  onSaveMessageAsSkill?: (source: {
    messageId: string;
    content: string;
  }) => void;
}

export function MessageActionButtons({
  actionContent,
  canCopyMessage,
  canQuoteMessage,
  canSaveMessageAsInspiration,
  canSaveMessageAsKnowledge,
  canSaveMessageAsSkill,
  copied,
  isImageWorkbenchMessage,
  knowledgeContent,
  knowledgeDescription,
  knowledgeSourceName,
  messageId,
  onCopy,
  onQuoteMessage,
  onSaveMessageAsInspiration,
  onSaveMessageAsKnowledge,
  onSaveMessageAsSkill,
}: MessageActionButtonsProps) {
  const { t } = useTranslation("agent");

  return (
    <MessageActions
      className={[
        "message-actions",
        canSaveMessageAsKnowledge ? "message-actions-persistent" : "",
        isImageWorkbenchMessage ? "image-workbench-message-actions" : "",
      ]
        .filter(Boolean)
        .join(" ")}
      data-testid="message-actions"
    >
      {canQuoteMessage ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-slate-200/90 bg-white/92 text-slate-400 shadow-sm shadow-slate-950/5 hover:bg-slate-50 hover:text-slate-700"
          onClick={() => onQuoteMessage?.(actionContent, messageId)}
          aria-label={t("agentChat.messageList.actions.quote")}
          title={t("agentChat.messageList.actions.quote")}
        >
          <Quote size={12} />
        </Button>
      ) : null}
      {canCopyMessage ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-slate-200/90 bg-white/92 text-slate-400 shadow-sm shadow-slate-950/5 hover:bg-slate-50 hover:text-slate-700"
          onClick={() => onCopy?.(actionContent, messageId)}
          aria-label={t("agentChat.messageList.actions.copy")}
          title={t("agentChat.messageList.actions.copy")}
        >
          {copied ? (
            <Check size={12} className="text-emerald-600" />
          ) : (
            <Copy size={12} />
          )}
        </Button>
      ) : null}
      {canSaveMessageAsSkill ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-emerald-200/90 bg-emerald-50/92 text-emerald-600 shadow-sm shadow-emerald-950/5 hover:bg-emerald-100 hover:text-emerald-700"
          onClick={() =>
            onSaveMessageAsSkill?.({
              messageId,
              content: actionContent,
            })
          }
          aria-label={t("agentChat.messageList.actions.saveAsSkill")}
          title={t("agentChat.messageList.actions.saveAsSkill")}
        >
          <Sparkles size={12} />
        </Button>
      ) : null}
      {canSaveMessageAsInspiration ? (
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 rounded-full border border-amber-200/90 bg-amber-50/92 text-amber-600 shadow-sm shadow-amber-950/5 hover:bg-amber-100 hover:text-amber-700"
          onClick={() =>
            onSaveMessageAsInspiration?.({
              messageId,
              content: actionContent,
            })
          }
          aria-label={t("agentChat.messageList.actions.saveToInspiration")}
          title={t("agentChat.messageList.actions.saveToInspiration")}
        >
          <BookmarkPlus size={12} />
        </Button>
      ) : null}
      {canSaveMessageAsKnowledge ? (
        <Button
          variant="ghost"
          className="relative z-10 h-8 w-auto gap-1.5 rounded-full border border-sky-200/90 bg-sky-50/92 px-2.5 text-xs font-semibold text-sky-700 shadow-sm shadow-sky-950/5 hover:bg-sky-100 hover:text-sky-800"
          onClick={() =>
            onSaveMessageAsKnowledge?.({
              messageId,
              content: knowledgeContent || actionContent,
              sourceName: knowledgeSourceName,
              description: knowledgeDescription,
            })
          }
          aria-label={t("agentChat.messageList.actions.saveToKnowledge")}
          title={t("agentChat.messageList.actions.saveToKnowledge")}
        >
          <FileText size={12} />
          <span>{t("agentChat.messageList.actions.saveToKnowledge")}</span>
        </Button>
      ) : null}
    </MessageActions>
  );
}

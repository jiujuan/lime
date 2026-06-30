import {
  Bold,
  Heading1,
  Heading2,
  Italic,
  List as ListIcon,
  ListOrdered,
  Quote,
  Redo2,
  Undo2,
} from "lucide-react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Placeholder from "@tiptap/extension-placeholder";
import Image from "@tiptap/extension-image";
import Highlight from "@tiptap/extension-highlight";
import { Table } from "@tiptap/extension-table";
import TableRow from "@tiptap/extension-table-row";
import TableCell from "@tiptap/extension-table-cell";
import TableHeader from "@tiptap/extension-table-header";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import {
  htmlToMarkdown,
  markdownToHtml,
} from "@/components/workspace/document/editor/utils/markdown";

type WorkspaceDynamicTranslation = (
  key: string,
  options?: Record<string, unknown>,
) => string;

interface ArticleTiptapCanvasProps {
  contentKey: string;
  onEditedMarkdownChange?: (markdown: string | null) => void;
  placeholder: string;
  sourceText: string;
  testId: string;
}

export function ArticleTiptapCanvas({
  contentKey,
  onEditedMarkdownChange,
  placeholder,
  sourceText,
  testId,
}: ArticleTiptapCanvasProps) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const [isDirty, setIsDirty] = useState(false);
  const contentKeyRef = useRef(contentKey);
  const sourceTextRef = useRef(sourceText);
  const extensions = useMemo(
    () => [
      StarterKit.configure({
        heading: { levels: [1, 2, 3] },
        codeBlock: {
          HTMLAttributes: { class: "article-editor-code-block" },
        },
      }),
      Placeholder.configure({
        placeholder,
        emptyEditorClass: "is-editor-empty",
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Image.configure({ inline: false, allowBase64: true }),
      Highlight.configure({ multicolor: false }),
      Table.configure({ resizable: false }),
      TableRow,
      TableCell,
      TableHeader,
    ],
    [placeholder],
  );
  const initialContent = useMemo(
    () => markdownToHtml(sourceText),
    [sourceText],
  );
  const editor = useEditor({
    extensions,
    content: initialContent,
    editorProps: {
      attributes: {
        class: "article-editor-prosemirror",
        "data-testid": `${testId}-content`,
      },
    },
    onUpdate: ({ editor: currentEditor }) => {
      const nextMarkdown = htmlToMarkdown(currentEditor.getHTML());
      setIsDirty(true);
      onEditedMarkdownChange?.(nextMarkdown);
    },
  });

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return;
    }

    const objectChanged = contentKeyRef.current !== contentKey;
    const sourceChanged = sourceTextRef.current !== sourceText;
    if (!objectChanged && !sourceChanged) {
      return;
    }
    if (!objectChanged && isDirty) {
      sourceTextRef.current = sourceText;
      return;
    }

    editor.commands.setContent(markdownToHtml(sourceText), {
      emitUpdate: false,
    });
    contentKeyRef.current = contentKey;
    sourceTextRef.current = sourceText;
    setIsDirty(false);
    onEditedMarkdownChange?.(null);
  }, [contentKey, editor, isDirty, onEditedMarkdownChange, sourceText]);

  return (
    <div
      className="article-editor-canvas"
      data-dirty={isDirty ? "true" : "false"}
      data-testid={testId}
    >
      <ArticleEditorToolbar editor={editor} />
      <EditorContent editor={editor} />
      <div
        className="border-t border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-3 py-2 text-[11px] text-[color:var(--lime-text-muted)]"
        data-testid={`${testId}-status`}
      >
        {dynamicT(
          isDirty
            ? "workspace.articleEditor.canvas.status.edited"
            : "workspace.articleEditor.canvas.status.synced",
        )}
      </div>
    </div>
  );
}

function ArticleEditorToolbar({ editor }: { editor: Editor | null }) {
  const { t } = useTranslation("workspace");
  const dynamicT = t as WorkspaceDynamicTranslation;
  const disabled = !editor;
  return (
    <div
      className="flex min-w-0 flex-wrap items-center gap-1 border-b border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-subtle)] px-2 py-2"
      data-testid="workspace-article-editor-toolbar"
    >
      <ArticleEditorToolbarButton
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.undo")}
        onClick={() => editor?.chain().focus().undo().run()}
      >
        <Undo2 className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <ArticleEditorToolbarButton
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.redo")}
        onClick={() => editor?.chain().focus().redo().run()}
      >
        <Redo2 className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <span className="mx-1 h-5 w-px bg-[color:var(--lime-surface-border)]" />
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("bold"))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.bold")}
        onClick={() => editor?.chain().focus().toggleBold().run()}
      >
        <Bold className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("italic"))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.italic")}
        onClick={() => editor?.chain().focus().toggleItalic().run()}
      >
        <Italic className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <span className="mx-1 h-5 w-px bg-[color:var(--lime-surface-border)]" />
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("heading", { level: 1 }))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.heading1")}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 1 }).run()
        }
      >
        <Heading1 className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("heading", { level: 2 }))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.heading2")}
        onClick={() =>
          editor?.chain().focus().toggleHeading({ level: 2 }).run()
        }
      >
        <Heading2 className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <span className="mx-1 h-5 w-px bg-[color:var(--lime-surface-border)]" />
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("bulletList"))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.bulletList")}
        onClick={() => editor?.chain().focus().toggleBulletList().run()}
      >
        <ListIcon className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("orderedList"))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.orderedList")}
        onClick={() => editor?.chain().focus().toggleOrderedList().run()}
      >
        <ListOrdered className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
      <ArticleEditorToolbarButton
        active={Boolean(editor?.isActive("blockquote"))}
        disabled={disabled}
        label={dynamicT("workspace.articleEditor.toolbar.blockquote")}
        onClick={() => editor?.chain().focus().toggleBlockquote().run()}
      >
        <Quote className="h-3.5 w-3.5" />
      </ArticleEditorToolbarButton>
    </div>
  );
}

function ArticleEditorToolbarButton({
  active = false,
  children,
  disabled,
  label,
  onClick,
}: {
  active?: boolean;
  children: ReactNode;
  disabled: boolean;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border text-[color:var(--lime-text-muted)] transition disabled:cursor-not-allowed disabled:opacity-45 ${
        active
          ? "border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface)] text-[color:var(--lime-text-strong)]"
          : "border-transparent bg-transparent hover:border-[color:var(--lime-surface-border)] hover:bg-[color:var(--lime-surface)] hover:text-[color:var(--lime-text-strong)]"
      }`}
      disabled={disabled}
      onClick={onClick}
      title={label}
    >
      {children}
    </button>
  );
}

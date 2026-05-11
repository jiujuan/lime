import type { Editor, Range } from "@tiptap/core";
import i18next from "i18next";
import {
  CheckSquare,
  Code,
  Heading1,
  Heading2,
  Heading3,
  ImageIcon,
  List,
  ListOrdered,
  Minus,
  Quote,
  Table,
} from "lucide-react";
import type { ReactNode } from "react";
import { initLimeI18n } from "@/i18n/createI18n";

export type SlashCommandItemId =
  | "heading1"
  | "heading2"
  | "heading3"
  | "taskList"
  | "bulletList"
  | "orderedList"
  | "quote"
  | "codeBlock"
  | "divider"
  | "image"
  | "table";

export interface CommandItemDef {
  id: SlashCommandItemId;
  title: string;
  description: string;
  searchTerms?: string[];
  icon: ReactNode;
  command: (p: { editor: Editor; range: Range }) => void;
}

type WorkspaceTranslator = (key: string) => string;

interface SlashCommandItemTemplate {
  id: SlashCommandItemId;
  titleKey: string;
  descriptionKey: string;
  searchTerms?: string[];
  icon: ReactNode;
  command: CommandItemDef["command"];
}

const SLASH_COMMAND_I18N_PREFIX = "workspace.document.editor.slashCommand";

function getWorkspaceTranslator(): WorkspaceTranslator {
  const instance = i18next.isInitialized ? i18next : initLimeI18n();
  const t = instance.getFixedT(instance.language, "workspace");
  return (key: string) => String(t(key as never));
}

function getWorkspaceText(key: string): string {
  return getWorkspaceTranslator()(key);
}

const SLASH_ITEM_TEMPLATES: SlashCommandItemTemplate[] = [
  {
    id: "heading1",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading1.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading1.description`,
    searchTerms: ["h1", "heading"],
    icon: <Heading1 className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 1 })
        .run(),
  },
  {
    id: "heading2",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading2.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading2.description`,
    searchTerms: ["h2", "heading"],
    icon: <Heading2 className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 2 })
        .run(),
  },
  {
    id: "heading3",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading3.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.heading3.description`,
    searchTerms: ["h3", "heading"],
    icon: <Heading3 className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .setNode("heading", { level: 3 })
        .run(),
  },
  {
    id: "taskList",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.taskList.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.taskList.description`,
    searchTerms: ["todo", "task", "checkbox"],
    icon: <CheckSquare className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleTaskList().run(),
  },
  {
    id: "bulletList",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.bulletList.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.bulletList.description`,
    searchTerms: ["bullet", "unordered", "list"],
    icon: <List className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleBulletList().run(),
  },
  {
    id: "orderedList",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.orderedList.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.orderedList.description`,
    searchTerms: ["ordered", "number", "list"],
    icon: <ListOrdered className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleOrderedList().run(),
  },
  {
    id: "quote",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.quote.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.quote.description`,
    searchTerms: ["blockquote", "quote"],
    icon: <Quote className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .toggleNode("paragraph", "paragraph")
        .toggleBlockquote()
        .run(),
  },
  {
    id: "codeBlock",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.codeBlock.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.codeBlock.description`,
    searchTerms: ["code", "codeblock"],
    icon: <Code className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).toggleCodeBlock().run(),
  },
  {
    id: "divider",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.divider.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.divider.description`,
    searchTerms: ["hr", "divider", "separator"],
    icon: <Minus className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor.chain().focus().deleteRange(range).setHorizontalRule().run(),
  },
  {
    id: "image",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.image.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.image.description`,
    searchTerms: ["image", "photo", "picture"],
    icon: <ImageIcon className="w-4 h-4" />,
    command: ({ editor, range }) => {
      editor.chain().focus().deleteRange(range).run();
      const url = window.prompt(
        getWorkspaceText(`${SLASH_COMMAND_I18N_PREFIX}.prompt.imageUrl`),
      );
      if (url) editor.chain().focus().setImage({ src: url }).run();
    },
  },
  {
    id: "table",
    titleKey: `${SLASH_COMMAND_I18N_PREFIX}.items.table.title`,
    descriptionKey: `${SLASH_COMMAND_I18N_PREFIX}.items.table.description`,
    searchTerms: ["table", "grid"],
    icon: <Table className="w-4 h-4" />,
    command: ({ editor, range }) =>
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertTable({ rows: 3, cols: 3, withHeaderRow: true })
        .run(),
  },
];

export function createSlashCommandItems(
  t: WorkspaceTranslator = getWorkspaceTranslator(),
): CommandItemDef[] {
  return SLASH_ITEM_TEMPLATES.map((item) => ({
    id: item.id,
    title: t(item.titleKey),
    description: t(item.descriptionKey),
    searchTerms: item.searchTerms,
    icon: item.icon,
    command: item.command,
  }));
}

export function filterSlashCommandItems(
  query: string,
  t: WorkspaceTranslator = getWorkspaceTranslator(),
): CommandItemDef[] {
  const q = query.toLowerCase();
  return createSlashCommandItems(t).filter(
    (item) =>
      item.title.toLowerCase().includes(q) ||
      item.description.toLowerCase().includes(q) ||
      item.searchTerms?.some((term) => term.toLowerCase().includes(q)),
  );
}

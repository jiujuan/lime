import type { Range } from "@tiptap/core";
import type React from "react";
import type { CommandItemDef } from "./slashCommandItems";

export interface SlashMenuState {
  isOpen: boolean;
  items: CommandItemDef[];
  range: Range | null;
  clientRect: DOMRect | null;
}

export type SlashMenuKeyHandler = (event: KeyboardEvent) => boolean;

export interface SlashCommandOptions {
  onStateChange: (state: SlashMenuState) => void;
  onKeyDownRef: React.MutableRefObject<SlashMenuKeyHandler | null>;
}

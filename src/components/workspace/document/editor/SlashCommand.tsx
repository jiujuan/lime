import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import React, { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { Editor, Range } from "@tiptap/core";
import type { CommandItemDef } from "./slashCommandItems";
import { filterSlashCommandItems } from "./slashCommandItems";
import type {
  SlashCommandOptions,
  SlashMenuKeyHandler,
} from "./slashCommandTypes";

const slashPluginKey = new PluginKey("slashCommand");

function createSlashPlugin(editor: Editor, options: SlashCommandOptions) {
  let wasActive = false;

  return new Plugin({
    key: slashPluginKey,
    state: {
      init() {
        return {
          active: false as boolean,
          slashPos: -1,
          query: "",
          items: [] as CommandItemDef[],
        };
      },
      apply(tr, prev) {
        if (!tr.docChanged) return prev;

        const { $from } = tr.selection;
        const textBefore = $from.parent.textBetween(
          Math.max(0, $from.parentOffset - 20),
          $from.parentOffset,
          "\0",
        );

        const slashIdx = textBefore.lastIndexOf("/");
        if (slashIdx === -1) {
          return { active: false, slashPos: -1, query: "", items: [] };
        }

        const query = textBefore.slice(slashIdx + 1);
        if (query.includes(" ") || query.includes("\0")) {
          return { active: false, slashPos: -1, query: "", items: [] };
        }

        const items = filterSlashCommandItems(query);
        const docSlashPos = $from.pos - (textBefore.length - slashIdx);

        return { active: true, slashPos: docSlashPos, query, items };
      },
    },
    props: {
      handleKeyDown(view, event) {
        const state = slashPluginKey.getState(view.state);
        if (state?.active) {
          return options.onKeyDownRef.current?.(event) ?? false;
        }
        return false;
      },
    },
    view() {
      return {
        update: (view) => {
          const state = slashPluginKey.getState(view.state);
          const isActive = state?.active ?? false;

          if (isActive) {
            const { from } = view.state.selection;
            const coords = view.coordsAtPos(from);
            options.onStateChange({
              isOpen: true,
              items: state.items,
              range: { from: state.slashPos, to: from },
              clientRect: new DOMRect(
                coords.left,
                coords.top,
                0,
                coords.bottom - coords.top,
              ),
            });
            wasActive = true;
          } else if (wasActive) {
            options.onStateChange({
              isOpen: false,
              items: [],
              range: null,
              clientRect: null,
            });
            wasActive = false;
          }
        },
        destroy: () => {
          wasActive = false;
        },
      };
    },
  });
}

export const SlashCommand = Extension.create<SlashCommandOptions>({
  name: "slashCommand",

  addOptions() {
    return {
      onStateChange: () => {},
      onKeyDownRef: { current: null },
    };
  },

  addProseMirrorPlugins() {
    return [createSlashPlugin(this.editor, this.options)];
  },
});

// --- 命令列表 UI 组件 ---

interface CommandListProps {
  editor: Editor;
  items: CommandItemDef[];
  range: Range;
  clientRect: DOMRect | null;
  onKeyDownRef: React.MutableRefObject<SlashMenuKeyHandler | null>;
  onClose: () => void;
}

export const CommandList: React.FC<CommandListProps> = ({
  editor,
  items,
  range,
  clientRect,
  onKeyDownRef,
  onClose,
}) => {
  const [selectedIndex, setSelectedIndex] = useState(0);

  useEffect(() => {
    setSelectedIndex(0);
  }, [items]);

  const executeCommand = (item: CommandItemDef) => {
    item.command({ editor, range });
    onClose();
  };

  // 注册键盘处理
  useEffect(() => {
    onKeyDownRef.current = (event: KeyboardEvent) => {
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelectedIndex((i) =>
          items.length > 0 ? (i - 1 + items.length) % items.length : 0,
        );
        return true;
      }
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelectedIndex((i) =>
          items.length > 0 ? (i + 1) % items.length : 0,
        );
        return true;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        if (items[selectedIndex]) {
          executeCommand(items[selectedIndex]);
        }
        return true;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return true;
      }
      return false;
    };
    return () => {
      onKeyDownRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, selectedIndex, onClose]);

  if (items.length === 0) return null;

  const top = clientRect ? clientRect.bottom + 4 : 0;
  const left = clientRect ? clientRect.left : 0;
  const maxLeft = Math.max(window.innerWidth - 280, 8);
  const popupLeft = Math.min(Math.max(left, 8), maxLeft);

  const popup = (
    <div
      className="fixed z-[9999] w-64 max-h-72 overflow-y-auto rounded-lg border border-border shadow-lg"
      style={{
        top,
        left: popupLeft,
        background: "hsl(var(--background))",
      }}
    >
      {items.map((item, index) => (
        <button
          key={item.title}
          className={`flex items-center gap-3 w-full px-3 py-2 text-left text-sm transition-colors ${
            index === selectedIndex
              ? "bg-accent text-accent-foreground"
              : "text-foreground hover:bg-accent/50"
          }`}
          onMouseDown={(e) => {
            e.preventDefault();
            executeCommand(item);
          }}
          onMouseEnter={() => setSelectedIndex(index)}
        >
          <span
            className="flex items-center justify-center w-8 h-8 rounded-md border border-border"
            style={{ background: "hsl(var(--background))" }}
          >
            {item.icon}
          </span>
          <div>
            <div className="font-medium">{item.title}</div>
            <div className="text-xs text-muted-foreground">
              {item.description}
            </div>
          </div>
        </button>
      ))}
    </div>
  );

  return createPortal(popup, document.body);
};

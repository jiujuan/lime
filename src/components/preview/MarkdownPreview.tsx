/**
 * @file MarkdownPreview.tsx
 * @description Markdown 预览组件
 * @module components/preview/MarkdownPreview
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { oneDark } from "react-syntax-highlighter/dist/esm/styles/prism";
import {
  interceptHttpExternalLinkClick,
  resolveHttpExternalHref,
} from "@/lib/markdown/externalLinks";

/** Markdown 预览属性 */
export interface MarkdownPreviewProps {
  /** Markdown 内容 */
  content: string;
  /** 自定义类名 */
  className?: string;
}

/**
 * Markdown 预览组件
 */
export const MarkdownPreview: React.FC<MarkdownPreviewProps> = ({
  content,
  className,
}) => {
  return (
    <div className={`markdown-preview ${className ?? ""}`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a({ href, children, ...props }) {
            const { onAuxClick, onClick, rel, ...anchorProps } = props;
            const externalHref = typeof href === "string" ? href : "";
            const linkRel = resolveHttpExternalHref(externalHref)
              ? "noreferrer noopener"
              : rel;
            const handleClick = (
              event: React.MouseEvent<HTMLAnchorElement>,
            ) => {
              onClick?.(event);
              if (!event.defaultPrevented) {
                interceptHttpExternalLinkClick(event, externalHref);
              }
            };
            const handleAuxClick = (
              event: React.MouseEvent<HTMLAnchorElement>,
            ) => {
              onAuxClick?.(event);
              if (!event.defaultPrevented) {
                interceptHttpExternalLinkClick(event, externalHref);
              }
            };

            return (
              <a
                {...anchorProps}
                href={href}
                rel={linkRel}
                onClick={handleClick}
                onAuxClick={handleAuxClick}
              >
                {children}
              </a>
            );
          },
          code({ className, children, ...props }) {
            const match = /language-(\w+)/.exec(className || "");
            const isInline = !match;
            return !isInline && match ? (
              <SyntaxHighlighter
                style={oneDark as Record<string, React.CSSProperties>}
                language={match[1]}
                PreTag="div"
              >
                {String(children).replace(/\n$/, "")}
              </SyntaxHighlighter>
            ) : (
              <code className={className} {...props}>
                {children}
              </code>
            );
          },
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
};

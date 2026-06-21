import styled from "styled-components";

export const CODE_BLOCK_SURFACE = "#f7f8fa";
export const CODE_BLOCK_SURFACE_ACCENT =
  "linear-gradient(180deg, rgba(255, 255, 255, 0.96) 0%, rgba(247, 248, 250, 0.98) 100%)";
export const CODE_BLOCK_HEADER_SURFACE =
  "linear-gradient(180deg, rgba(250, 251, 252, 0.98) 0%, rgba(243, 245, 247, 0.98) 100%)";
export const CODE_BLOCK_BORDER = "rgba(188, 199, 214, 0.78)";
export const CODE_BLOCK_HEADER_BORDER = "rgba(148, 163, 184, 0.22)";
export const CODE_BLOCK_TEXT = "#0f172a";
export const CODE_BLOCK_MUTED_TEXT = "#64748b";
export const CODE_BLOCK_BUTTON_SURFACE = "rgba(255, 255, 255, 0.88)";
export const CODE_BLOCK_BUTTON_HOVER_SURFACE = "rgba(248, 250, 252, 0.98)";
export const CODE_FONT_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace';

// 收紧正文与代码块表面，让消息正文更接近单列执行流的阅读节奏。
export const MarkdownContainer = styled.div`
  font-size: inherit;
  line-height: inherit;
  color: #1f2937;
  overflow-wrap: break-word;
  word-break: break-word;
  text-wrap: pretty;

  > :first-child {
    margin-top: 0;
  }

  > :last-child {
    margin-bottom: 0;
  }

  p {
    margin: 0 0 0.95em;
    color: inherit;
    font-size: 1em;
    line-height: inherit;
    font-weight: 400;
  }

  h1,
  h2,
  h3,
  h4,
  h5,
  h6 {
    font-weight: 600;
    margin: 1.08em 0 0.5em;
    line-height: 1.42;
    letter-spacing: 0;
    color: #111827;
  }

  h1:first-child,
  h2:first-child,
  h3:first-child {
    margin-top: 0;
  }

  h1 {
    font-size: 1.14em;
  }
  h2 {
    font-size: 1.08em;
  }
  h3 {
    font-size: 1.03em;
  }
  h4 {
    font-size: 1em;
  }
  h5,
  h6 {
    font-size: 0.98em;
  }

  ul,
  ol {
    padding-left: 1.28rem;
    margin: 0 0 0.95em;
  }

  ul {
    list-style-type: disc;
  }

  ol {
    list-style-type: decimal;
  }

  li {
    margin: 0.26em 0;
    padding-left: 0.08rem;
    color: inherit;
    font-weight: 400;
  }

  li > p {
    margin-bottom: 0.42em;
  }

  li::marker {
    color: hsl(var(--muted-foreground));
  }

  ul ul,
  ul ol,
  ol ul,
  ol ol {
    margin-top: 0.35em;
    margin-bottom: 0.45em;
  }

  strong {
    font-weight: 600;
    color: #111827;
  }

  em {
    font-style: italic;
  }

  hr {
    margin: 18px 0;
    border: none;
    border-top: 1px solid hsl(var(--border));
    opacity: 0.9;
  }

  code[data-inline-code="true"] {
    font-family:
      ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono",
      "Courier New", monospace;
    font-size: 0.86em;
    line-height: 1.45;
    padding: 0.08rem 0.34rem;
    border-radius: 5px;
    border: 1px solid rgba(203, 213, 225, 0.86);
    background-color: rgba(248, 250, 252, 0.95);
    color: #0f172a;
  }

  pre {
    margin: 14px 0;
    padding: 10px 12px 12px;
    border-radius: 8px;
    overflow: auto;
    border: 1px solid hsl(var(--border));
    background: ${CODE_BLOCK_SURFACE};

    code {
      padding: 0;
      border: none;
      border-radius: 0;
      background: transparent;
      color: inherit;
    }
  }

  table {
    border-collapse: separate;
    border-spacing: 0;
    width: 100%;
    min-width: 100%;
    margin: 0;
    font-size: 0.94em;
    table-layout: auto;
  }

  th,
  td {
    border-right: 1px solid var(--lime-surface-border, hsl(var(--border)));
    border-bottom: 1px solid var(--lime-surface-border, hsl(var(--border)));
    padding: 0.45rem 0.65rem;
    vertical-align: top;
    text-align: left;
  }

  th {
    font-weight: 600;
    background: #f8fafc;
    color: #334155;
    white-space: nowrap;
  }

  tr > *:last-child {
    border-right: none;
  }

  tbody tr:last-child td {
    border-bottom: none;
  }

  tbody tr:nth-child(even) td {
    background: var(--lime-surface-soft, hsl(var(--secondary) / 0.5));
  }

  a {
    color: #2563eb;
    text-decoration: underline;
    text-underline-offset: 0.18em;
    text-decoration-color: rgba(37, 99, 235, 0.32);
    &:hover {
      text-decoration-color: currentColor;
    }
  }

  img {
    max-width: 100%;
    max-height: 512px;
    border-radius: 10px;
    object-fit: contain;
    cursor: pointer;
    border: 1px solid hsl(var(--border));
  }
`;

export const MarkdownDivider = styled.hr`
  height: 1px;
  margin: 22px 0;
  border: none;
  background: linear-gradient(
    90deg,
    transparent 0%,
    hsl(var(--border)) 16%,
    hsl(var(--border)) 84%,
    transparent 100%
  );
`;

export const MarkdownQuoteCard = styled.blockquote`
  margin: 0 0 0.95em;
  padding: 0;
  border: 1px solid var(--lime-surface-border-strong, hsl(var(--border)));
  border-radius: 20px;
  background: linear-gradient(
    180deg,
    var(--lime-surface, hsl(var(--background))) 0%,
    var(--lime-surface-soft, hsl(var(--secondary) / 0.5)) 100%
  );
  box-shadow: 0 14px 34px -30px rgba(15, 23, 42, 0.18);
  overflow: hidden;
`;

export const MarkdownQuoteInner = styled.div`
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 14px 16px;
`;

export const MarkdownQuoteIconShell = styled.span`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  flex-shrink: 0;
  border-radius: 999px;
  border: 1px solid hsl(var(--border));
  background: hsl(var(--background));
  color: hsl(var(--muted-foreground));
`;

export const MarkdownQuoteBody = styled.div`
  min-width: 0;
  color: hsl(var(--foreground));

  p {
    margin-bottom: 0.55em;
  }

  p:last-child {
    margin-bottom: 0;
  }
`;

export const CodeBlockContainer = styled.div`
  position: relative;
  margin: 10px 0;
  max-width: 100%;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid ${CODE_BLOCK_BORDER};
  background-color: ${CODE_BLOCK_SURFACE};
  background-image: ${CODE_BLOCK_SURFACE_ACCENT};
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.7),
    0 14px 28px -28px rgba(15, 23, 42, 0.32);
`;

export const CodeHeader = styled.div`
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 8px;
  min-height: 32px;
  padding: 5px 8px 5px 10px;
  background: ${CODE_BLOCK_HEADER_SURFACE};
  color: ${CODE_BLOCK_MUTED_TEXT};
  font-family: ${CODE_FONT_FAMILY};
  font-size: 11.5px;
  letter-spacing: 0;
  text-transform: none;
  border-bottom: 1px solid ${CODE_BLOCK_HEADER_BORDER};

  > span:first-child {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
`;

export const CodeHeaderInfo = styled.span`
  display: inline-flex;
  min-width: 0;
  align-items: center;
  gap: 7px;
`;

export const CodeLanguageLabel = styled.span`
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  color: ${CODE_BLOCK_TEXT};
  font-weight: 600;
`;

export const CodeLineCount = styled.span`
  flex-shrink: 0;
  color: ${CODE_BLOCK_MUTED_TEXT};
`;

export const CopyButton = styled.button`
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 2px 7px;
  border-radius: 6px;
  border: 1px solid ${CODE_BLOCK_HEADER_BORDER};
  background: ${CODE_BLOCK_BUTTON_SURFACE};
  color: ${CODE_BLOCK_TEXT};
  font-family: inherit;
  font-size: 11px;
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
  transition:
    background-color 0.18s ease,
    border-color 0.18s ease,
    color 0.18s ease;

  &:hover {
    background: ${CODE_BLOCK_BUTTON_HOVER_SURFACE};
    border-color: rgba(148, 163, 184, 0.34);
  }

  &:focus-visible {
    outline: 2px solid rgba(148, 163, 184, 0.26);
    outline-offset: 1px;
  }
`;

export const MarkdownBlockShell = styled.div`
  position: relative;

  &:hover [data-markdown-block-actions],
  &:focus-within [data-markdown-block-actions] {
    opacity: 1;
    transform: translateY(0);
    pointer-events: auto;
  }
`;

export const MarkdownBlockActions = styled.div`
  position: absolute;
  top: -10px;
  right: 2px;
  z-index: 2;
  display: flex;
  align-items: center;
  gap: 4px;
  opacity: 0;
  transform: translateY(4px);
  pointer-events: none;
  transition:
    opacity 0.16s ease,
    transform 0.16s ease;
`;

export const MarkdownBlockActionButton = styled.button`
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 999px;
  border: 1px solid rgba(203, 213, 225, 0.92);
  background: rgba(255, 255, 255, 0.96);
  color: rgb(100, 116, 139);
  box-shadow: 0 8px 22px -18px rgba(15, 23, 42, 0.3);
  cursor: pointer;
  transition:
    color 0.16s ease,
    border-color 0.16s ease,
    background-color 0.16s ease,
    box-shadow 0.16s ease;

  &:hover {
    color: rgb(15, 23, 42);
    border-color: rgba(148, 163, 184, 0.9);
    background: rgba(255, 255, 255, 1);
    box-shadow: 0 10px 24px -18px rgba(15, 23, 42, 0.34);
  }

  &:focus-visible {
    outline: 2px solid rgba(148, 163, 184, 0.56);
    outline-offset: 1px;
  }
`;

export const MarkdownTableScroll = styled.div`
  margin: 0 0 0.82em;
  overflow-x: auto;
  border: 1px solid var(--lime-surface-border-strong, hsl(var(--border)));
  border-radius: 8px;
  background: var(--lime-surface, hsl(var(--background)));
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.7);
`;

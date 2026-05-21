import type { ReactNode } from "react";

export function stripSkillFrontmatter(content: string): string {
  const normalized = content.replace(/^\uFEFF/, "");
  if (!normalized.startsWith("---")) {
    return normalized.trim();
  }

  const end = normalized.indexOf("\n---", 3);
  if (end === -1) {
    return normalized.trim();
  }

  return normalized.slice(end + 4).trim();
}

export function renderSkillMarkdown(content: string) {
  const nodes: ReactNode[] = [];
  const lines = stripSkillFrontmatter(content).split(/\r?\n/);
  let paragraph: string[] = [];
  let quote: string[] = [];
  let list: string[] = [];
  let code: string[] | null = null;

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    nodes.push(
      <p
        key={`p-${nodes.length}`}
        className="my-4 leading-7 text-[color:var(--lime-text)]"
      >
        {paragraph.join(" ")}
      </p>,
    );
    paragraph = [];
  };
  const flushQuote = () => {
    if (quote.length === 0) return;
    nodes.push(
      <blockquote
        key={`q-${nodes.length}`}
        className="my-5 border-l-2 border-[color:var(--lime-surface-border-strong)] pl-5 italic leading-7 text-[color:var(--lime-text)]"
      >
        {quote.join(" ")}
      </blockquote>,
    );
    quote = [];
  };
  const flushList = () => {
    if (list.length === 0) return;
    nodes.push(
      <ul
        key={`ul-${nodes.length}`}
        className="my-4 list-disc space-y-2 pl-6 leading-7 text-[color:var(--lime-text)]"
      >
        {list.map((item, index) => (
          <li key={`${index}-${item}`}>{item}</li>
        ))}
      </ul>,
    );
    list = [];
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      flushParagraph();
      flushQuote();
      flushList();
      if (code) {
        nodes.push(
          <pre
            key={`code-${nodes.length}`}
            className="my-5 overflow-auto rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 font-mono text-sm leading-6 text-[color:var(--lime-text-strong)]"
          >
            {code.join("\n")}
          </pre>,
        );
        code = null;
      } else {
        code = [];
      }
      continue;
    }
    if (code) {
      code.push(line);
      continue;
    }

    const trimmed = line.trim();
    if (!trimmed) {
      flushParagraph();
      flushQuote();
      flushList();
      continue;
    }
    if (trimmed === "---") {
      flushParagraph();
      flushQuote();
      flushList();
      nodes.push(
        <hr
          key={`hr-${nodes.length}`}
          className="my-8 border-[color:var(--lime-surface-border)]"
        />,
      );
      continue;
    }
    if (trimmed.startsWith(">")) {
      flushParagraph();
      flushList();
      quote.push(trimmed.replace(/^>\s?/, ""));
      continue;
    }
    const unorderedItem = /^[-*]\s+(.+)$/.exec(trimmed);
    if (unorderedItem) {
      flushParagraph();
      flushQuote();
      list.push(unorderedItem[1]);
      continue;
    }

    const heading = /^(#{1,3})\s+(.+)$/.exec(trimmed);
    if (heading) {
      flushParagraph();
      flushQuote();
      flushList();
      const level = heading[1].length;
      const text = heading[2];
      const className =
        level === 1
          ? "mb-8 mt-2 text-2xl font-semibold text-[color:var(--lime-text-strong)]"
          : level === 2
            ? "mb-4 mt-10 text-xl font-semibold text-[color:var(--lime-text-strong)]"
            : "mb-3 mt-7 text-base font-semibold text-[color:var(--lime-text-strong)]";
      if (level === 1) {
        nodes.push(
          <h1 key={`h-${nodes.length}`} className={className}>
            {text}
          </h1>,
        );
      } else if (level === 2) {
        nodes.push(
          <h2 key={`h-${nodes.length}`} className={className}>
            {text}
          </h2>,
        );
      } else {
        nodes.push(
          <h3 key={`h-${nodes.length}`} className={className}>
            {text}
          </h3>,
        );
      }
      continue;
    }

    paragraph.push(trimmed);
  }

  flushParagraph();
  flushQuote();
  flushList();
  if (code) {
    nodes.push(
      <pre
        key={`code-${nodes.length}`}
        className="my-5 overflow-auto rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 font-mono text-sm leading-6 text-[color:var(--lime-text-strong)]"
      >
        {code.join("\n")}
      </pre>,
    );
  }

  return nodes;
}

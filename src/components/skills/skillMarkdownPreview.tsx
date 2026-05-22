import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";

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

const skillMarkdownComponents: Components = {
  h1({ children }) {
    return (
      <h1 className="mb-6 mt-1 text-2xl font-semibold leading-tight text-[color:var(--lime-text-strong)]">
        {children}
      </h1>
    );
  },
  h2({ children }) {
    return (
      <h2 className="mb-4 mt-9 border-b border-[color:var(--lime-surface-border)] pb-2 text-xl font-semibold leading-tight text-[color:var(--lime-text-strong)]">
        {children}
      </h2>
    );
  },
  h3({ children }) {
    return (
      <h3 className="mb-3 mt-7 text-base font-semibold leading-6 text-[color:var(--lime-text-strong)]">
        {children}
      </h3>
    );
  },
  h4({ children }) {
    return (
      <h4 className="mb-2 mt-5 text-sm font-semibold leading-6 text-[color:var(--lime-text-strong)]">
        {children}
      </h4>
    );
  },
  p({ children }) {
    return (
      <p className="my-4 leading-7 text-[color:var(--lime-text)]">
        {children}
      </p>
    );
  },
  ul({ children }) {
    return (
      <ul className="my-4 list-disc space-y-2 pl-6 leading-7 text-[color:var(--lime-text)]">
        {children}
      </ul>
    );
  },
  ol({ children }) {
    return (
      <ol className="my-4 list-decimal space-y-2 pl-6 leading-7 text-[color:var(--lime-text)]">
        {children}
      </ol>
    );
  },
  li({ children }) {
    return <li className="pl-1">{children}</li>;
  },
  blockquote({ children }) {
    return (
      <blockquote className="my-5 border-l-2 border-[color:var(--lime-surface-border-strong)] bg-[color:var(--lime-surface-soft)] py-1 pl-5 pr-4 italic leading-7 text-[color:var(--lime-text)]">
        {children}
      </blockquote>
    );
  },
  strong({ children }) {
    return (
      <strong className="font-semibold text-[color:var(--lime-text-strong)]">
        {children}
      </strong>
    );
  },
  em({ children }) {
    return <em className="italic text-[color:var(--lime-text)]">{children}</em>;
  },
  code({ className, children }) {
    return (
      <code
        className={`rounded-md bg-[color:var(--lime-surface-soft)] px-1.5 py-0.5 font-mono text-[0.86em] text-[color:var(--lime-text-strong)] ${className ?? ""}`}
      >
        {children}
      </code>
    );
  },
  pre({ children }) {
    return (
      <pre className="my-5 overflow-auto rounded-lg border border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] p-4 font-mono text-sm leading-6 text-[color:var(--lime-text-strong)] [&_code]:bg-transparent [&_code]:p-0">
        {children}
      </pre>
    );
  },
  table({ children }) {
    return (
      <div className="my-5 overflow-x-auto rounded-lg border border-[color:var(--lime-surface-border)]">
        <table className="min-w-full border-collapse text-left text-sm leading-6 text-[color:var(--lime-text)]">
          {children}
        </table>
      </div>
    );
  },
  th({ children }) {
    return (
      <th className="border-b border-r border-[color:var(--lime-surface-border)] bg-[color:var(--lime-surface-soft)] px-3 py-2 font-semibold text-[color:var(--lime-text-strong)] last:border-r-0">
        {children}
      </th>
    );
  },
  td({ children }) {
    return (
      <td className="border-b border-r border-[color:var(--lime-surface-border)] px-3 py-2 align-top last:border-r-0">
        {children}
      </td>
    );
  },
  a({ href, children }) {
    return (
      <a
        className="font-medium text-sky-700 underline decoration-sky-200 underline-offset-4 hover:text-sky-800"
        href={href}
        rel="noreferrer"
        target="_blank"
      >
        {children}
      </a>
    );
  },
  hr() {
    return (
      <hr className="my-8 border-0 border-t border-[color:var(--lime-surface-border)]" />
    );
  },
  img({ alt, src }) {
    return (
      <img
        alt={alt ?? ""}
        className="my-5 max-w-full rounded-lg border border-[color:var(--lime-surface-border)]"
        src={src}
      />
    );
  },
};

export function renderSkillMarkdown(content: string) {
  return (
    <div
      className="skills-markdown-preview text-left"
      data-testid="skills-markdown-preview"
    >
      <ReactMarkdown
        components={skillMarkdownComponents}
        remarkPlugins={[remarkGfm]}
      >
        {stripSkillFrontmatter(content)}
      </ReactMarkdown>
    </div>
  );
}

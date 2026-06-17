import type { ReactNode } from "react";

import type {
  AgentUiMcpServerView,
  AgentUiMcpSurfaceModel,
  AgentUiMcpToolCallView,
  AgentUiToolCallView,
  AgentUiToolSurfaceModel,
} from "@limecloud/agent-ui-contracts";

import {
  defaultMcpOperationLabel,
  defaultToolFamilyLabel,
  defaultToolStatusLabel,
} from "./labels.js";
import type {
  McpServerListProps,
  McpSurfaceProps,
  McpToolListProps,
  ToolCallCardProps,
  ToolCallSurfaceProps,
} from "./types.js";

function metaParts(parts: Array<ReactNode | undefined | false>): ReactNode[] {
  return parts.filter(Boolean) as ReactNode[];
}

function renderMeta(parts: ReactNode[]): ReactNode {
  if (!parts.length) return null;
  return parts.map((part, index) => (
    <span key={index}>
      {index ? " · " : null}
      {part}
    </span>
  ));
}

function defaultToolTitle(tool: AgentUiToolCallView): ReactNode {
  return tool.displayName || tool.toolName || tool.title;
}

function defaultToolMeta(tool: AgentUiToolCallView): ReactNode {
  return renderMeta(metaParts([
    defaultToolFamilyLabel(tool.family),
    tool.operationKind,
    tool.mcpServerId,
    tool.skillSlug,
    tool.progress !== undefined && tool.total !== undefined ? `${tool.progress}/${tool.total}` : undefined,
    tool.artifactRefs.length ? `Artifacts ${tool.artifactRefs.length}` : undefined,
    tool.evidenceRefs.length ? `Evidence ${tool.evidenceRefs.length}` : undefined,
  ]));
}

function defaultToolPreview(tool: AgentUiToolCallView): ReactNode {
  return tool.errorPreview ?? tool.outputPreview ?? tool.detail ?? tool.inputPreview;
}

function defaultMcpServerTitle(server: AgentUiMcpServerView): ReactNode {
  return server.label || server.id;
}

function defaultMcpServerMeta(server: AgentUiMcpServerView): ReactNode {
  return renderMeta(metaParts([
    defaultToolStatusLabel(server.status),
    `Tools ${server.toolCount}`,
    server.activeToolCount ? `Active ${server.activeToolCount}` : undefined,
    server.failedToolCount ? `Failed ${server.failedToolCount}` : undefined,
  ]));
}

function defaultMcpToolTitle(tool: AgentUiMcpToolCallView): ReactNode {
  return tool.toolName || tool.fullName || tool.title;
}

function defaultMcpToolMeta(tool: AgentUiMcpToolCallView): ReactNode {
  return renderMeta(metaParts([
    tool.serverId,
    defaultMcpOperationLabel(tool.operationKind),
    defaultToolStatusLabel(tool.status),
    tool.artifactRefs.length ? `Artifacts ${tool.artifactRefs.length}` : undefined,
    tool.evidenceRefs.length ? `Evidence ${tool.evidenceRefs.length}` : undefined,
  ]));
}

function ToolRefChips({
  artifactRefs,
  evidenceRefs,
}: {
  artifactRefs: readonly string[];
  evidenceRefs: readonly string[];
}) {
  const refs = [
    ...artifactRefs.map((id) => ({ id, kind: "artifact" })),
    ...evidenceRefs.map((id) => ({ id, kind: "evidence" })),
  ];
  if (!refs.length) return null;
  return (
    <ul className="agent-tool-refs" aria-label="Tool refs">
      {refs.map((ref) => (
        <li
          key={`${ref.kind}:${ref.id}`}
          data-tool-ref-kind={ref.kind}
          data-tool-ref-id={ref.id}
        >
          {ref.id}
        </li>
      ))}
    </ul>
  );
}

function hasToolSurface(surface?: AgentUiToolSurfaceModel): surface is AgentUiToolSurfaceModel {
  return Boolean(surface?.calls.length);
}

function hasMcpSurface(surface?: AgentUiMcpSurfaceModel): surface is AgentUiMcpSurfaceModel {
  return Boolean(surface?.hasMcp && (surface.servers.length || surface.tools.length));
}

export function ToolCallCard({
  tool,
  toolFamilyLabel = defaultToolFamilyLabel,
  toolTitle = defaultToolTitle,
  toolMeta = defaultToolMeta,
  toolPreview = defaultToolPreview,
  statusLabel = defaultToolStatusLabel,
}: ToolCallCardProps) {
  const preview = toolPreview(tool);
  return (
    <article
      className={`agent-tool-call ${tool.status}`}
      data-tool-call-id={tool.toolCallId ?? tool.id}
      data-tool-name={tool.toolName}
      data-tool-family={tool.family}
      data-tool-status={tool.status}
      data-tool-phase={tool.phase}
      data-mcp-server={tool.mcpServerId}
      data-skill-slug={tool.skillSlug}
      data-artifact-count={tool.artifactRefs.length || undefined}
      data-evidence-count={tool.evidenceRefs.length || undefined}
    >
      <header>
        <span>{toolFamilyLabel(tool.family)}</span>
        <strong>{toolTitle(tool)}</strong>
        <em>{statusLabel(tool.status)}</em>
      </header>
      <small>{toolMeta(tool)}</small>
      {preview ? <p>{preview}</p> : null}
      <ToolRefChips artifactRefs={tool.artifactRefs} evidenceRefs={tool.evidenceRefs} />
      {tool.events.length ? (
        <ol aria-label="Tool lifecycle">
          {tool.events.map((event) => (
            <li
              key={event.id}
              data-event-id={event.eventId}
              data-event-class={event.eventClass}
              data-event-status={event.status}
            >
              <span>{event.title}</span>
              <em>{statusLabel(event.status)}</em>
            </li>
          ))}
        </ol>
      ) : null}
    </article>
  );
}

export function ToolCallSurface({
  surface,
  empty,
  ariaLabel = "Tool calls",
  toolFamilyLabel,
  toolTitle,
  toolMeta,
  toolPreview,
  toolStatusLabel,
}: ToolCallSurfaceProps) {
  if (!hasToolSurface(surface)) {
    return empty === undefined ? null : <div className="agent-tool-calls-empty">{empty}</div>;
  }
  return (
    <section
      className="agent-tool-calls"
      aria-label={ariaLabel}
      data-tool-call-count={surface.calls.length}
      data-active-tool-count={surface.activeCallIds.length}
      data-failed-tool-count={surface.failedCallIds.length}
      data-completed-tool-count={surface.completedCallIds.length}
    >
      {surface.calls.map((tool) => (
        <ToolCallCard
          key={tool.id}
          tool={tool}
          toolFamilyLabel={toolFamilyLabel}
          toolTitle={toolTitle}
          toolMeta={toolMeta}
          toolPreview={toolPreview}
          statusLabel={toolStatusLabel}
        />
      ))}
    </section>
  );
}

export function McpServerList({
  servers = [],
  empty,
  ariaLabel = "MCP servers",
  serverTitle = defaultMcpServerTitle,
  serverMeta = defaultMcpServerMeta,
  statusLabel = defaultToolStatusLabel,
}: McpServerListProps) {
  if (!servers.length) {
    return empty === undefined ? null : <div className="agent-mcp-servers-empty">{empty}</div>;
  }
  return (
    <section className="agent-mcp-servers" aria-label={ariaLabel} data-mcp-server-count={servers.length}>
      {servers.map((server) => (
        <article
          key={server.id}
          className={`agent-mcp-server ${server.status}`}
          data-mcp-server={server.id}
          data-mcp-status={server.status}
          data-mcp-tool-count={server.toolCount}
          data-mcp-active-count={server.activeToolCount}
          data-mcp-failed-count={server.failedToolCount}
        >
          <header>
            <strong>{serverTitle(server)}</strong>
            <em>{statusLabel(server.status)}</em>
          </header>
          <small>{serverMeta(server)}</small>
        </article>
      ))}
    </section>
  );
}

export function McpToolList({
  tools = [],
  empty,
  ariaLabel = "MCP tool calls",
  toolTitle = defaultMcpToolTitle,
  toolMeta = defaultMcpToolMeta,
  toolPreview,
  operationLabel = defaultMcpOperationLabel,
  statusLabel = defaultToolStatusLabel,
}: McpToolListProps) {
  if (!tools.length) {
    return empty === undefined ? null : <div className="agent-mcp-tools-empty">{empty}</div>;
  }
  return (
    <section className="agent-mcp-tools" aria-label={ariaLabel} data-mcp-tool-count={tools.length}>
      {tools.map((tool) => {
        const preview = toolPreview?.(tool) ?? tool.detail;
        return (
          <article
            key={tool.id}
            className={`agent-mcp-tool ${tool.status}`}
            data-mcp-tool-id={tool.id}
            data-mcp-server={tool.serverId}
            data-mcp-tool-name={tool.toolName}
            data-mcp-full-name={tool.fullName}
            data-mcp-operation={tool.operationKind}
            data-mcp-status={tool.status}
            data-artifact-count={tool.artifactRefs.length || undefined}
            data-evidence-count={tool.evidenceRefs.length || undefined}
          >
            <header>
              <span>{operationLabel(tool.operationKind)}</span>
              <strong>{toolTitle(tool)}</strong>
              <em>{statusLabel(tool.status)}</em>
            </header>
            <small>{toolMeta(tool)}</small>
            {preview ? <p>{preview}</p> : null}
            <ToolRefChips artifactRefs={tool.artifactRefs} evidenceRefs={tool.evidenceRefs} />
          </article>
        );
      })}
    </section>
  );
}

export function McpSurface({
  surface,
  empty,
  ariaLabel = "MCP",
  serversAriaLabel,
  toolsAriaLabel,
  serverTitle,
  serverMeta,
  toolTitle,
  toolMeta,
  toolPreview,
  operationLabel,
  statusLabel,
}: McpSurfaceProps) {
  if (!hasMcpSurface(surface)) {
    return empty === undefined ? null : <div className="agent-mcp-empty">{empty}</div>;
  }
  return (
    <section
      className="agent-mcp-surface"
      aria-label={ariaLabel}
      data-mcp-server-count={surface.servers.length}
      data-mcp-tool-count={surface.tools.length}
      data-active-mcp-tool-count={surface.activeToolIds.length}
      data-failed-mcp-tool-count={surface.failedToolIds.length}
      data-completed-mcp-tool-count={surface.completedToolIds.length}
    >
      <McpServerList
        servers={surface.servers}
        ariaLabel={serversAriaLabel}
        serverTitle={serverTitle}
        serverMeta={serverMeta}
        statusLabel={statusLabel}
      />
      <McpToolList
        tools={surface.tools}
        ariaLabel={toolsAriaLabel}
        toolTitle={toolTitle}
        toolMeta={toolMeta}
        toolPreview={toolPreview}
        operationLabel={operationLabel}
        statusLabel={statusLabel}
      />
    </section>
  );
}

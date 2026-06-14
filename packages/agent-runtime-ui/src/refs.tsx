import type { ReactNode } from "react";

import type {
  AgentUiArtifactRefView,
  AgentUiEvidenceRefView,
  AgentUiRefView,
} from "@limecloud/agent-ui-contracts";

import type {
  AgentUiRefListProps,
  ArtifactRefListProps,
  EvidenceRefListProps,
} from "./types.js";

function defaultRefTitle(ref: AgentUiRefView): ReactNode {
  return ref.title ?? ref.id;
}

function defaultRefMeta(ref: AgentUiRefView): ReactNode {
  return ref.path ?? ref.contentRef ?? ref.sourceEventId;
}

function defaultRefPreview(ref: AgentUiRefView): ReactNode {
  return ref.preview;
}

export function AgentUiRefList<TRef extends AgentUiRefView = AgentUiRefView>({
  refs = [],
  empty,
  ariaLabel = "Runtime refs",
  className = "agent-ref-list",
  refKind = "ref",
  refTitle = defaultRefTitle,
  refMeta = defaultRefMeta,
  refPreview = defaultRefPreview,
  refActionLabel,
  onSelectRef,
}: AgentUiRefListProps<TRef>) {
  if (!refs.length) return empty === undefined ? null : <div className={`${className}-empty`}>{empty}</div>;

  return (
    <div className={className} aria-label={ariaLabel} data-ref-kind={refKind}>
      {refs.map((ref) => {
        const handleSelect = () => onSelectRef?.(ref);
        const content = (
          <>
            <span className="agent-ref-card-body">
              <small>{refKind}</small>
              <strong>{refTitle(ref)}</strong>
              <em>{refMeta(ref)}</em>
            </span>
            {refPreview ? <span className="agent-ref-preview">{refPreview(ref)}</span> : null}
            {onSelectRef ? <span className="agent-ref-action">{refActionLabel ? refActionLabel(ref) : "Open"}</span> : null}
          </>
        );

        if (onSelectRef) {
          return (
            <button
              key={ref.id}
              type="button"
              className="agent-ref-card"
              data-ref-kind={refKind}
              data-ref-id={ref.id}
              data-source-event-id={ref.sourceEventId}
              data-ref-status={ref.status}
              data-content-ref={ref.contentRef}
              onClick={handleSelect}
            >
              {content}
            </button>
          );
        }

        return (
          <article
            key={ref.id}
            className="agent-ref-card"
            data-ref-kind={refKind}
            data-ref-id={ref.id}
            data-source-event-id={ref.sourceEventId}
            data-ref-status={ref.status}
            data-content-ref={ref.contentRef}
          >
            {content}
          </article>
        );
      })}
    </div>
  );
}

export function ArtifactRefList({
  ariaLabel = "Artifact refs",
  className = "agent-artifact-refs",
  refKind = "artifact",
  ...props
}: ArtifactRefListProps) {
  return (
    <AgentUiRefList<AgentUiArtifactRefView>
      {...props}
      ariaLabel={ariaLabel}
      className={className}
      refKind={refKind}
    />
  );
}

export function EvidenceRefList({
  ariaLabel = "Evidence refs",
  className = "agent-evidence-refs",
  refKind = "evidence",
  ...props
}: EvidenceRefListProps) {
  return (
    <AgentUiRefList<AgentUiEvidenceRefView>
      {...props}
      ariaLabel={ariaLabel}
      className={className}
      refKind={refKind}
    />
  );
}

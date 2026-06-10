import { defaultTimelineEntryMeta } from "./labels.js";
import type { ProcessTimelineViewProps } from "./types.js";

export function ProcessTimelineView({
  entries = [],
  empty,
  ariaLabel = "Process timeline",
  entryTitle = (entry) => entry.title,
  entryMeta = defaultTimelineEntryMeta,
}: ProcessTimelineViewProps) {
  if (!entries.length) return empty === undefined ? null : <div className="agent-process-empty">{empty}</div>;
  return (
    <ol className="agent-process-timeline" aria-label={ariaLabel}>
      {entries.map((entry) => (
        <li
          key={entry.entryId}
          className={`agent-process-entry ${entry.status}`}
          data-entry-kind={entry.kind}
          data-entry-status={entry.status}
          data-owner={entry.owner}
          data-phase={entry.phase}
        >
          <span aria-hidden="true" />
          <div>
            <small>{entryMeta(entry)}</small>
            <strong>{entryTitle(entry)}</strong>
            {entry.detail ? <p>{entry.detail}</p> : null}
          </div>
        </li>
      ))}
    </ol>
  );
}

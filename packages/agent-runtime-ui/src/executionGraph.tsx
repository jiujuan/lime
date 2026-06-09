import { defaultGraphNodeMeta } from "./labels.js";
import type { ExecutionGraphViewProps } from "./types.js";

export function ExecutionGraphView({
  nodes = [],
  empty,
  nodeTitle = (node) => node.title,
  nodeMeta = defaultGraphNodeMeta,
}: ExecutionGraphViewProps) {
  if (!nodes.length) return empty === undefined ? null : <div className="agent-execution-graph-empty">{empty}</div>;
  return (
    <div className="agent-execution-graph" aria-label="执行图">
      {nodes.map((node) => (
        <article
          key={node.nodeId}
          className={`agent-execution-node ${node.status}`}
          data-node-type={node.nodeType}
          data-node-status={node.status}
          data-parent-id={node.parentId}
        >
          <span aria-hidden="true" />
          <div>
            <small>{nodeMeta(node)}</small>
            <strong>{nodeTitle(node)}</strong>
            {node.refs.length ? <p>{node.refs.join(" / ")}</p> : null}
          </div>
        </article>
      ))}
    </div>
  );
}

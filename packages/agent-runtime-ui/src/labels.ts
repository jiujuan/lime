import type { ReactNode } from "react";

import type {
  AgentRuntimeActionProjection,
  AgentRuntimeEventProjection,
  ExecutionGraphNode,
  ProcessTimelineEntry,
  UIMessagePart,
} from "@limecloud/agent-ui-contracts";

import type { AgentMessageRole, AgentTimelineMessage } from "./types.js";

export function defaultMessageTitle(message: AgentTimelineMessage): ReactNode {
  if (message.role === "user") return "User";
  if (message.role === "assistant") return "Assistant";
  return "System";
}

export function defaultMessageMeta(message: AgentTimelineMessage): ReactNode {
  return message.createdAt ? new Date(message.createdAt).toLocaleString() : null;
}

export function defaultMessagePreview(message: AgentTimelineMessage): ReactNode {
  return message.content.trim();
}

export function roleLabel(role: AgentMessageRole): string {
  if (role === "user") return "U";
  if (role === "assistant") return "A";
  if (role === "system") return "S";
  return "M";
}

export function defaultMessagePartTitle(part: UIMessagePart): ReactNode {
  if (part.role === "user") return "User";
  if (part.role === "assistant") return "Assistant";
  if (part.type === "reasoning") return "Reasoning";
  if (part.type === "tool-preview") return "Tool";
  if (part.type === "artifact-card") return "Artifact";
  if (part.type === "evidence-citation") return "Evidence";
  if (part.type === "diagnostic-ref") return "Diagnostic";
  return "Message";
}

export function defaultMessagePartMeta(part: UIMessagePart): ReactNode {
  return part.createdAt ? new Date(part.createdAt).toLocaleString() : part.state ?? null;
}

export function defaultMessagePartPreview(part: UIMessagePart): ReactNode {
  const text = part.text?.trim();
  if (text) return text;
  if (part.refs?.length) return part.refs.join(" / ");
  return part.partId;
}

export function defaultTimelineEntryMeta(entry: ProcessTimelineEntry): ReactNode {
  if (entry.phase) return entry.phase;
  return entry.status;
}

export function defaultGraphNodeMeta(node: ExecutionGraphNode): ReactNode {
  return node.parentId ? `${node.nodeType} / ${node.parentId}` : node.nodeType;
}

export function defaultActionButtonLabel(action: AgentRuntimeActionProjection): ReactNode {
  if (action.buttonLabel) return action.buttonLabel;
  if (action.labelKey === "agent.action.addInputSource") return "Add input source";
  if (action.labelKey === "agent.action.configureTextModel") return "Open model settings";
  if (action.labelKey === "agent.action.approve" || action.decision === "approve") return "Approve";
  if (action.labelKey === "agent.action.reject" || action.decision === "reject") return "Reject";
  if (action.labelKey === "agent.action.answer" || action.decision === "answer") return "Answer";
  if (action.labelKey === "agent.action.retry" || action.decision === "retry") return "Retry";
  if (action.labelKey === "agent.action.stop" || action.decision === "stop") return "Stop";
  return "Resolve";
}

export function defaultEventStatusLabel(event: AgentRuntimeEventProjection): ReactNode {
  if (event.displayStatus) return event.displayStatus;
  if (event.displayStatusKey === "agent.status.completed") return "Completed";
  if (event.displayStatusKey === "agent.status.running") return "Running";
  if (event.displayStatusKey === "agent.status.blocked") return "Blocked";
  if (event.displayStatusKey === "agent.status.failed") return "Failed";
  if (event.displayStatusKey === "agent.status.actionRequired") return "Action required";
  if (event.displayStatusKey === "agent.status.actionResolved") return "Resolved";
  return "Pending";
}

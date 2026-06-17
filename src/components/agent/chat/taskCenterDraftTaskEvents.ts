export const TASK_CENTER_CREATE_DRAFT_TASK_EVENT =
  "lime:task-center:create-draft-task";

export type TaskCenterTaskEventSource =
  | "sidebar"
  | "sidebar_search"
  | "conversation_shelf"
  | "tab_strip";

export interface TaskCenterCreateDraftTaskDetail {
  source?: TaskCenterTaskEventSource;
  projectId?: string | null;
}

export function requestTaskCenterDraftTask(
  detail: TaskCenterCreateDraftTaskDetail = {},
): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  const event = new CustomEvent<TaskCenterCreateDraftTaskDetail>(
    TASK_CENTER_CREATE_DRAFT_TASK_EVENT,
    { cancelable: true, detail },
  );
  return !window.dispatchEvent(event);
}

export function subscribeTaskCenterDraftTaskRequests(
  handler: (detail: TaskCenterCreateDraftTaskDetail) => void,
): () => void {
  if (typeof window === "undefined") {
    return () => undefined;
  }

  const listener = (event: Event) => {
    const detail =
      event instanceof CustomEvent
        ? (event.detail as TaskCenterCreateDraftTaskDetail | undefined)
        : undefined;
    handler(detail ?? {});
    event.preventDefault();
  };

  window.addEventListener(TASK_CENTER_CREATE_DRAFT_TASK_EVENT, listener);
  return () => {
    window.removeEventListener(TASK_CENTER_CREATE_DRAFT_TASK_EVENT, listener);
  };
}

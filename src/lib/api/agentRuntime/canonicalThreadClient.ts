import {
  AppServerClient,
  type AppServerRequestResult,
  type AppServerThread,
  type AppServerThreadListParams,
  type AppServerThreadListResponse,
} from "@/lib/api/appServer";

const THREAD_PAGE_LIMIT = 500;

export type CanonicalThreadListClient = Pick<AppServerClient, "listThreads">;

interface ListCanonicalChildThreadsOptions {
  client?: CanonicalThreadListClient;
  parentThreadId: string;
}

export interface CanonicalThreadFamily {
  children: AppServerThread[];
  parentThreadId?: string;
}

interface ReadCanonicalThreadFamilyOptions {
  client?: CanonicalThreadListClient;
  threadId: string;
}

export async function listCanonicalChildThreads({
  client = new AppServerClient(),
  parentThreadId,
}: ListCanonicalChildThreadsOptions): Promise<AppServerThread[]> {
  const normalizedParentThreadId = parentThreadId.trim();
  if (!normalizedParentThreadId) {
    return [];
  }

  const threads = await listCanonicalThreads(client);
  return [...threads.values()].filter(
    (thread) => thread.parentThreadId === normalizedParentThreadId,
  );
}

export async function readCanonicalThreadFamily({
  client = new AppServerClient(),
  threadId,
}: ReadCanonicalThreadFamilyOptions): Promise<CanonicalThreadFamily> {
  const normalizedThreadId = threadId.trim();
  if (!normalizedThreadId) {
    return { children: [] };
  }

  const threads = await listCanonicalThreads(client);
  const currentThread = threads.get(normalizedThreadId);
  return {
    children: [...threads.values()].filter(
      (thread) => thread.parentThreadId === normalizedThreadId,
    ),
    ...(currentThread?.parentThreadId?.trim()
      ? { parentThreadId: currentThread.parentThreadId.trim() }
      : {}),
  };
}

async function listCanonicalThreads(
  client: CanonicalThreadListClient,
): Promise<Map<string, AppServerThread>> {
  const threads = new Map<string, AppServerThread>();
  const seenCursors = new Set<string>();
  let cursor: string | undefined;

  do {
    const params: AppServerThreadListParams = {
      archived: false,
      limit: THREAD_PAGE_LIMIT,
      ...(cursor ? { cursor } : {}),
    };
    const response: AppServerRequestResult<AppServerThreadListResponse> =
      await client.listThreads(params);
    for (const thread of response.result.data) {
      threads.set(thread.id, thread);
    }

    const nextCursor = response.result.nextCursor?.trim() || undefined;
    if (!nextCursor || seenCursors.has(nextCursor)) {
      break;
    }
    seenCursors.add(nextCursor);
    cursor = nextCursor;
  } while (cursor);

  return threads;
}

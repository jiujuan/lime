import {
  AppServerClient,
  APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
  APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CREATE,
  APP_SERVER_METHOD_PROJECT_GIT_DIFF,
  APP_SERVER_METHOD_PROJECT_GIT_STATUS,
  APP_SERVER_METHOD_PROJECT_GIT_WORKTREE_CREATE,
  type AppServerProjectGitDiffBase,
  type AppServerProjectGitBranchCheckoutResponse,
  type AppServerProjectGitBranchCreateResponse,
  type AppServerProjectGitDiffResponse,
  type AppServerProjectGitStatusResponse,
  type AppServerProjectGitWorktreeCreateResponse,
} from "@/lib/api/appServer";

export type ProjectGitStatus = AppServerProjectGitStatusResponse;
export type ProjectGitDiff = AppServerProjectGitDiffResponse;
export type ProjectGitDiffBase = AppServerProjectGitDiffBase;
export type ProjectGitWorktree = AppServerProjectGitWorktreeCreateResponse;

export type ProjectGitAppServerClient = Pick<
  AppServerClient,
  | "readProjectGitStatus"
  | "readProjectGitDiff"
  | "checkoutProjectGitBranch"
  | "createProjectGitBranch"
  | "createProjectGitWorktree"
>;

function createProjectGitAppServerClient(): ProjectGitAppServerClient {
  return new AppServerClient();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function assertProjectGitStatus(
  method: string,
  value: unknown,
): asserts value is ProjectGitStatus {
  if (
    !isRecord(value) ||
    typeof value.rootPath !== "string" ||
    typeof value.hasGitRepository !== "boolean" ||
    !Array.isArray(value.branches) ||
    !value.branches.every((branch) => typeof branch === "string") ||
    typeof value.uncommittedFileCount !== "number"
  ) {
    throw new Error(`${method} did not return project Git status`);
  }
}

function assertProjectGitDiff(
  method: string,
  value: unknown,
): asserts value is ProjectGitDiff {
  if (
    !isRecord(value) ||
    typeof value.rootPath !== "string" ||
    typeof value.hasGitRepository !== "boolean" ||
    typeof value.patch !== "string" ||
    typeof value.uncommittedFileCount !== "number"
  ) {
    throw new Error(`${method} did not return project Git diff`);
  }
}

function assertProjectGitWorktree(
  method: string,
  value: unknown,
): asserts value is ProjectGitWorktree {
  if (
    !isRecord(value) ||
    typeof value.worktreePath !== "string" ||
    typeof value.branch !== "string"
  ) {
    throw new Error(`${method} did not return project Git worktree`);
  }
  assertProjectGitStatus(method, value.status);
}

export async function readProjectGitStatus(
  rootPath: string,
  client: ProjectGitAppServerClient = createProjectGitAppServerClient(),
): Promise<ProjectGitStatus> {
  const response = await client.readProjectGitStatus({ rootPath });
  assertProjectGitStatus(APP_SERVER_METHOD_PROJECT_GIT_STATUS, response.result);
  return response.result;
}

export function readProjectGitDiff(
  rootPath: string,
  contextLines?: number,
  client?: ProjectGitAppServerClient,
): Promise<ProjectGitDiff>;
export function readProjectGitDiff(
  rootPath: string,
  contextLines: number | undefined,
  base: ProjectGitDiffBase,
  client?: ProjectGitAppServerClient,
): Promise<ProjectGitDiff>;
export async function readProjectGitDiff(
  rootPath: string,
  contextLines = 3,
  baseOrClient?: ProjectGitDiffBase | ProjectGitAppServerClient,
  maybeClient?: ProjectGitAppServerClient,
): Promise<ProjectGitDiff> {
  const base = typeof baseOrClient === "string" ? baseOrClient : undefined;
  const client =
    typeof baseOrClient === "string"
      ? maybeClient || createProjectGitAppServerClient()
      : baseOrClient || createProjectGitAppServerClient();
  const response = await client.readProjectGitDiff({
    rootPath,
    contextLines,
    ...(base ? { base } : {}),
  });
  assertProjectGitDiff(APP_SERVER_METHOD_PROJECT_GIT_DIFF, response.result);
  return response.result;
}

export async function checkoutProjectGitBranch(
  rootPath: string,
  branch: string,
  client: ProjectGitAppServerClient = createProjectGitAppServerClient(),
): Promise<AppServerProjectGitBranchCheckoutResponse> {
  const response = await client.checkoutProjectGitBranch({ rootPath, branch });
  assertProjectGitStatus(
    APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CHECKOUT,
    response.result,
  );
  return response.result;
}

export async function createProjectGitBranch(
  rootPath: string,
  branch: string,
  client: ProjectGitAppServerClient = createProjectGitAppServerClient(),
): Promise<AppServerProjectGitBranchCreateResponse> {
  const response = await client.createProjectGitBranch({ rootPath, branch });
  assertProjectGitStatus(
    APP_SERVER_METHOD_PROJECT_GIT_BRANCH_CREATE,
    response.result,
  );
  return response.result;
}

export async function createProjectGitWorktree(
  rootPath: string,
  name?: string,
  baseBranch?: string,
  client: ProjectGitAppServerClient = createProjectGitAppServerClient(),
): Promise<ProjectGitWorktree> {
  const response = await client.createProjectGitWorktree({
    rootPath,
    name,
    baseBranch,
  });
  assertProjectGitWorktree(
    APP_SERVER_METHOD_PROJECT_GIT_WORKTREE_CREATE,
    response.result,
  );
  return response.result;
}

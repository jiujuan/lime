import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  readProjectGitDiff,
  readProjectGitStatus,
  type ProjectGitAppServerClient,
} from "./projectGit";

function appServerResult<T>(result: T) {
  return {
    id: 1,
    result,
    response: { jsonrpc: "2.0" as const, id: 1, result },
    notifications: [],
    messages: [],
  };
}

const client: ProjectGitAppServerClient = {
  readProjectGitStatus: vi.fn(),
  readProjectGitDiff: vi.fn(),
  checkoutProjectGitBranch: vi.fn(),
  createProjectGitBranch: vi.fn(),
  createProjectGitWorktree: vi.fn(),
};

describe("projectGit API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("应通过 App Server current 主链读取 Git 状态", async () => {
    vi.mocked(client.readProjectGitStatus).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        currentBranch: "main",
        branches: ["main"],
        uncommittedFileCount: 1,
      }),
    );

    await expect(readProjectGitStatus("/workspace", client)).resolves.toEqual(
      expect.objectContaining({
        hasGitRepository: true,
        uncommittedFileCount: 1,
      }),
    );
    expect(client.readProjectGitStatus).toHaveBeenCalledWith({
      rootPath: "/workspace",
    });
  });

  it("应通过 App Server current 主链读取 Git diff", async () => {
    vi.mocked(client.readProjectGitDiff).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        patch: "diff --git a/README.md b/README.md\n+hello",
        uncommittedFileCount: 1,
      }),
    );

    await expect(readProjectGitDiff("/workspace", 5, client)).resolves.toEqual(
      expect.objectContaining({
        patch: expect.stringContaining("diff --git"),
        uncommittedFileCount: 1,
      }),
    );
    expect(client.readProjectGitDiff).toHaveBeenCalledWith({
      rootPath: "/workspace",
      contextLines: 5,
    });
  });

  it("Git diff 响应形状异常时应 fail closed", async () => {
    vi.mocked(client.readProjectGitDiff).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        hasGitRepository: true,
      } as unknown as Awaited<
        ReturnType<ProjectGitAppServerClient["readProjectGitDiff"]>
      >["result"]),
    );

    await expect(readProjectGitDiff("/workspace", 3, client)).rejects.toThrow(
      "projectGit/diff did not return project Git diff",
    );
  });
});

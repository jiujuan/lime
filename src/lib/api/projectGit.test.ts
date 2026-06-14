import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  listProjectGitCommits,
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
  listProjectGitCommits: vi.fn(),
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

  it("读取 Git diff 时应透传审查基准", async () => {
    vi.mocked(client.readProjectGitDiff).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        patch: "diff --git a/README.md b/README.md\n+hello",
        uncommittedFileCount: 1,
      }),
    );

    await expect(
      readProjectGitDiff("/workspace", 5, "staged", client),
    ).resolves.toEqual(
      expect.objectContaining({
        patch: expect.stringContaining("diff --git"),
      }),
    );
    expect(client.readProjectGitDiff).toHaveBeenCalledWith({
      rootPath: "/workspace",
      contextLines: 5,
      base: "staged",
    });
  });

  it("读取提交 Git diff 时应透传 commitSha", async () => {
    vi.mocked(client.readProjectGitDiff).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        patch: "diff --git a/README.md b/README.md\n+commit",
        uncommittedFileCount: 0,
      }),
    );

    await expect(
      readProjectGitDiff("/workspace", 3, "commit", "abc123", client),
    ).resolves.toEqual(
      expect.objectContaining({
        patch: expect.stringContaining("diff --git"),
      }),
    );
    expect(client.readProjectGitDiff).toHaveBeenCalledWith({
      rootPath: "/workspace",
      contextLines: 3,
      base: "commit",
      commitSha: "abc123",
    });
  });

  it("应通过 App Server current 主链读取 Git 提交列表", async () => {
    vi.mocked(client.listProjectGitCommits).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        repositoryRoot: "/workspace",
        hasGitRepository: true,
        commits: [
          {
            sha: "abc123456789",
            shortSha: "abc1234",
            subject: "demo commit",
            authorName: "Test User",
            authorEmail: "test@example.com",
            committedAt: "2026-06-14T10:00:00Z",
          },
        ],
      }),
    );

    await expect(
      listProjectGitCommits("/workspace", 20, client),
    ).resolves.toEqual(
      expect.objectContaining({
        commits: [
          expect.objectContaining({
            shortSha: "abc1234",
            subject: "demo commit",
          }),
        ],
      }),
    );
    expect(client.listProjectGitCommits).toHaveBeenCalledWith({
      rootPath: "/workspace",
      limit: 20,
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

  it("Git 提交列表响应形状异常时应 fail closed", async () => {
    vi.mocked(client.listProjectGitCommits).mockResolvedValueOnce(
      appServerResult({
        rootPath: "/workspace",
        hasGitRepository: true,
        commits: [{ sha: "abc123" }],
      } as unknown as Awaited<
        ReturnType<ProjectGitAppServerClient["listProjectGitCommits"]>
      >["result"]),
    );

    await expect(
      listProjectGitCommits("/workspace", 30, client),
    ).rejects.toThrow(
      "projectGit/commits/list did not return project Git commits",
    );
  });
});

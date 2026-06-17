import { describe, expect, it } from "vitest";
import {
  buildOpenedProjectIdOrder,
  compactOpenedProjectSummaries,
} from "./useOpenedProjectSummaries";

describe("buildOpenedProjectIdOrder", () => {
  it("应保留已打开项目顺序，点击已有项目时不重新排序", () => {
    expect(
      buildOpenedProjectIdOrder(
        ["project-a", "project-b", "project-c"],
        "project-b",
      ),
    ).toEqual(["project-a", "project-b", "project-c"]);
  });

  it("应只把未记录的当前项目追加到末尾", () => {
    expect(buildOpenedProjectIdOrder(["project-a"], "project-b")).toEqual([
      "project-a",
      "project-b",
    ]);
  });

  it("应归一化并去重项目 id", () => {
    expect(
      buildOpenedProjectIdOrder(
        [" project-a ", "", "project-b", "project-a"],
        " project-a ",
      ),
    ).toEqual(["project-a", "project-b"]);
  });
});

describe("compactOpenedProjectSummaries", () => {
  it("应过滤没有目录且名称等于 UUID 的占位项目", () => {
    const placeholderId = "240ed157-3e7a-456c-a2c2-a05d499f5991";

    expect(
      compactOpenedProjectSummaries(
        [placeholderId, "project-real"],
        {
          [placeholderId]: {
            id: placeholderId,
            name: placeholderId,
            rootPath: null,
          },
          "project-real": {
            id: "project-real",
            name: "真实项目",
            rootPath: "/workspace/real",
          },
        },
        null,
      ),
    ).toEqual([
      {
        id: "project-real",
        name: "真实项目",
        rootPath: "/workspace/real",
      },
    ]);
  });

  it("当前项目即使暂时只有 UUID 占位，也应保留用于会话范围查询", () => {
    const placeholderId = "240ed157-3e7a-456c-a2c2-a05d499f5991";

    expect(
      compactOpenedProjectSummaries(
        [placeholderId],
        {},
        {
          id: placeholderId,
          name: placeholderId,
          rootPath: null,
        },
      ),
    ).toEqual([
      {
        id: placeholderId,
        name: placeholderId,
        rootPath: null,
      },
    ]);
  });
});

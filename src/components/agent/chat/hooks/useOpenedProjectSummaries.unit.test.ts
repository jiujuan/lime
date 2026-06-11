import { describe, expect, it } from "vitest";
import { buildOpenedProjectIdOrder } from "./useOpenedProjectSummaries";

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

import { describe, expect, it } from "vitest";
import {
  addExpertSkillRef,
  dedupeExpertSkillRefs,
  removeExpertSkillRef,
  replaceExpertSkillRef,
} from "./expertSkillRefEditing";

describe("expertSkillRefEditing", () => {
  it("应去重并保留首个规范引用", () => {
    expect(
      dedupeExpertSkillRefs([" skill:docx ", "Skill:Docx", "", "skill:pdf"]),
    ).toEqual(["skill:docx", "skill:pdf"]);
  });

  it("应添加和移除专家技能引用", () => {
    expect(addExpertSkillRef(["skill:docx"], "skill:pdf")).toEqual([
      "skill:docx",
      "skill:pdf",
    ]);
    expect(removeExpertSkillRef(["skill:docx", "skill:pdf"], "SKILL:DOCX"))
      .toEqual(["skill:pdf"]);
  });

  it("应替换问题引用并对已有替代项去重", () => {
    expect(
      replaceExpertSkillRef(
        ["service-skill:daily-trend-briefing", "skill:docx"],
        "service-skill:daily-trend-briefing",
        "skill:docx",
      ),
    ).toEqual(["skill:docx"]);
    expect(
      replaceExpertSkillRef(["skill:docx"], "service-skill:missing", "skill:pdf"),
    ).toEqual(["skill:docx", "skill:pdf"]);
  });
});

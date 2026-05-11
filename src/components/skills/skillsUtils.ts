import type { Skill } from "@/lib/api/skills";

interface SkillSection {
  key: "builtin" | "local" | "remote";
  titleKey:
    | "skills.page.sections.builtin.title"
    | "skills.page.sections.local.title"
    | "skills.page.sections.remote.title";
  descriptionKey:
    | "skills.page.sections.builtin.description"
    | "skills.page.sections.local.description"
    | "skills.page.sections.remote.description";
  skills: Skill[];
}

export function filterSkillsByQueryAndStatus(
  skills: Skill[],
  searchQuery: string,
  filterStatus: "all" | "installed" | "uninstalled",
) {
  return skills.filter((skill) => {
    const q = searchQuery.toLowerCase();
    const matchesSearch =
      skill.name.toLowerCase().includes(q) ||
      skill.description.toLowerCase().includes(q) ||
      (skill.repoOwner?.toLowerCase().includes(q) ?? false) ||
      (skill.repoName?.toLowerCase().includes(q) ?? false);

    const matchesFilter =
      filterStatus === "all" ||
      (filterStatus === "installed" && skill.installed) ||
      (filterStatus === "uninstalled" && !skill.installed);

    return matchesSearch && matchesFilter;
  });
}

export function groupSkillsBySourceKind(skills: Skill[]): SkillSection[] {
  const builtinSkills: Skill[] = [];
  const localSkills: Skill[] = [];
  const remoteSkills: Skill[] = [];

  for (const skill of skills) {
    if (skill.sourceKind === "builtin") {
      builtinSkills.push(skill);
    } else if (
      skill.catalogSource === "remote" ||
      (!skill.catalogSource && skill.repoOwner && skill.repoName)
    ) {
      remoteSkills.push(skill);
    } else {
      localSkills.push(skill);
    }
  }

  return [
    {
      key: "builtin",
      titleKey: "skills.page.sections.builtin.title",
      descriptionKey: "skills.page.sections.builtin.description",
      skills: builtinSkills,
    },
    {
      key: "local",
      titleKey: "skills.page.sections.local.title",
      descriptionKey: "skills.page.sections.local.description",
      skills: localSkills,
    },
    {
      key: "remote",
      titleKey: "skills.page.sections.remote.title",
      descriptionKey: "skills.page.sections.remote.description",
      skills: remoteSkills,
    },
  ];
}

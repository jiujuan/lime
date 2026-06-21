import type { Skill } from "@/lib/api/skills";
import type { SkillMarketplaceBundle } from "@/lib/api/officialSkillMarketplace";
import {
  resolveInstalledSkillPromise,
  type InstalledSkillPresentationCopy,
} from "./installedSkillPresentation";
import type { SkillStoreItem } from "./SkillsWorkspacePageViewModel";
import { stripSkillFrontmatter } from "./skillMarkdownPreview";

export function extractSkillMarkdown(bundle: SkillMarketplaceBundle): string {
  const skillFile =
    bundle.files.find((file) => file.path === "SKILL.md") ??
    bundle.files.find((file) => file.path.endsWith("/SKILL.md"));
  return stripSkillFrontmatter(skillFile?.content ?? "");
}

export function buildFallbackSkillMarkdown(item: SkillStoreItem): string {
  return [
    `# ${item.skill.title}`,
    item.skill.summary || item.skill.bundle?.description,
    item.skill.outputHint ? `## Output\n${item.skill.outputHint}` : null,
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function buildInstalledSkillFallbackMarkdown(
  skill: Skill,
  copy: InstalledSkillPresentationCopy,
): string {
  return [
    `# ${skill.name}`,
    skill.description || resolveInstalledSkillPromise(skill, copy),
  ]
    .filter(Boolean)
    .join("\n\n");
}

export function ensureSkillPackageExtension(filePath: string): string {
  if (/\.(?:skill|skills)$/i.test(filePath)) {
    return filePath;
  }
  const normalizedBase = filePath.replace(/\.[^./\\]+$/, "");
  return `${normalizedBase}.skills`;
}

export function basenameFromPath(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

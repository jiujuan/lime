import { skillsApi, type AppType } from "@/lib/api/skills";
import type { SkillMarketplaceInstallResult } from "@/lib/api/officialSkillMarketplace";

export interface SkillInstallPromptInstruction {
  skillName: string;
  downloadUrl: string;
  source: "assignment_prompt";
}

const INSTALL_PROMPT_MARKERS = [
  "download and install a skill",
  "extract it into the agent skills directory",
  "restart or reload the agent",
  "agent skills directory",
  "下载 skill",
  "解压到 agent",
  "skills 目录",
];

function normalizeText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readPromptAssignment(text: string, key: string): string | null {
  const pattern = new RegExp(
    `(?:^|\\n)\\s*${key}\\s*=\\s*(?:"([^"]*)"|'([^']*)'|([^\\s\\n]+))`,
    "i",
  );
  const match = text.match(pattern);
  return normalizeText(match?.[1] ?? match?.[2] ?? match?.[3]) || null;
}

function looksLikeInstallPrompt(text: string): boolean {
  const normalized = text.toLowerCase();
  return INSTALL_PROMPT_MARKERS.some((marker) => normalized.includes(marker));
}

function normalizeDownloadUrl(value: string | null): string | null {
  const normalized = normalizeText(value);
  if (!normalized) {
    return null;
  }
  try {
    const url = new URL(normalized);
    if (url.protocol !== "https:") {
      return null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function normalizeOfficialSkillDetailUrl(downloadUrl: string): string {
  const url = new URL(downloadUrl);
  const hostname = url.hostname.toLowerCase();
  const segments = url.pathname.split("/").filter(Boolean);
  const skillsIndex = segments.indexOf("skills");
  if (
    (hostname === "limeai.run" || hostname === "www.limeai.run") &&
    skillsIndex >= 0
  ) {
    const skillSlug = normalizeText(segments[skillsIndex + 1]);
    if (skillSlug) {
      return `https://limeai.run/skill-packages/${skillSlug}/latest/${skillSlug}.zip`;
    }
  }
  return url.toString();
}

function inferSkillNameFromDownloadUrl(downloadUrl: string | null): string | null {
  if (!downloadUrl) {
    return null;
  }
  try {
    const url = new URL(downloadUrl);
    const segments = url.pathname.split("/").filter(Boolean);
    const skillPackageIndex = segments.indexOf("skill-packages");
    if (skillPackageIndex >= 0) {
      return normalizeText(segments[skillPackageIndex + 1]) || null;
    }
    const skillsIndex = segments.indexOf("skills");
    if (skillsIndex >= 0) {
      return normalizeText(segments[skillsIndex + 1]) || null;
    }
    const fileName = segments.at(-1) || "";
    const zipName = fileName.replace(/\.zip$/i, "").trim();
    return zipName || null;
  } catch {
    return null;
  }
}

export function parseSkillInstallPromptInstruction(
  text: string,
): SkillInstallPromptInstruction | null {
  if (!looksLikeInstallPrompt(text)) {
    return null;
  }

  const downloadUrl = normalizeDownloadUrl(
    readPromptAssignment(text, "DOWNLOAD_URL"),
  );
  if (!downloadUrl) {
    return null;
  }
  const packageDownloadUrl = normalizeOfficialSkillDetailUrl(downloadUrl);

  const skillName =
    normalizeText(readPromptAssignment(text, "SKILL_NAME")) ||
    inferSkillNameFromDownloadUrl(packageDownloadUrl);
  if (!skillName) {
    return null;
  }

  return {
    skillName,
    downloadUrl: packageDownloadUrl,
    source: "assignment_prompt",
  };
}

export async function installSkillFromPromptInstruction(
  instruction: SkillInstallPromptInstruction,
  app: AppType = "lime",
): Promise<SkillMarketplaceInstallResult> {
  return skillsApi.installFromDownloadUrl(
    {
      skillName: instruction.skillName,
      downloadUrl: instruction.downloadUrl,
    },
    app,
  );
}

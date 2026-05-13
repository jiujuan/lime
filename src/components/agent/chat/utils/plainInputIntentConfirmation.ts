import { getLimeI18n } from "@/i18n/createI18n";
import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogCommandEntries,
  listSkillCatalogEntries,
  type SkillCatalogCommandEntry,
  type SkillCatalogCommandIntentConfirmation,
  type SkillCatalogCommandTrigger,
  type SkillCatalogEntry,
} from "@/lib/api/skillCatalog";

interface LocalizedPlainIntentRules {
  includeAny: string[];
  requireAny?: string[];
  excludeAny?: string[];
}

interface PlainInputIntentConfirmationCandidate {
  command: SkillCatalogCommandEntry;
  intent: SkillCatalogCommandIntentConfirmation;
  rules: LocalizedPlainIntentRules;
}

export interface PlainInputIntentConfirmation {
  commandKey: string;
  intentId: string;
  confirmation: string;
  systemPrompt?: string;
}

function normalizeIntentText(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function translateAgentString(
  key: string,
  options?: Record<string, unknown>,
): string {
  const i18n = getLimeI18n();
  if (!i18n.exists(key, { ns: "agent" })) {
    return "";
  }
  const translate = i18n.t as unknown as (
    key: string,
    options?: Record<string, unknown>,
  ) => string;
  return translate(key, {
    ns: "agent",
    ...(options || {}),
  });
}

function parseTermList(value: string): string[] {
  return value
    .split("|")
    .map((item) => normalizeIntentText(item))
    .filter(Boolean);
}

function readLocalizedIntentRules(
  key: string,
): LocalizedPlainIntentRules | null {
  const includeAny = parseTermList(translateAgentString(`${key}.includeAny`));
  if (includeAny.length === 0) {
    return null;
  }

  const requireAny = parseTermList(translateAgentString(`${key}.requireAny`));
  const excludeAny = parseTermList(translateAgentString(`${key}.excludeAny`));

  return {
    includeAny,
    ...(requireAny.length > 0 ? { requireAny } : {}),
    ...(excludeAny.length > 0 ? { excludeAny } : {}),
  };
}

function hasLocalizedTerm(text: string, terms: readonly string[]): boolean {
  return terms.some((term) => {
    if (/^[a-z0-9][a-z0-9\s-]*$/i.test(term)) {
      return new RegExp(
        `(^|[^a-z0-9])${escapeRegex(term)}([^a-z0-9]|$)`,
        "i",
      ).test(text);
    }
    return text.includes(term);
  });
}

function collectExplicitCommandTriggers(
  entries: readonly SkillCatalogEntry[],
): SkillCatalogCommandTrigger[] {
  const triggers: SkillCatalogCommandTrigger[] = [];
  for (const entry of entries) {
    if (entry.kind === "command") {
      triggers.push(...entry.triggers);
    } else if (entry.kind === "scene") {
      triggers.push({
        mode: "slash",
        prefix: entry.commandPrefix,
      });
    }
  }
  return triggers.sort(
    (left, right) => right.prefix.length - left.prefix.length,
  );
}

function startsWithExplicitCatalogCommand(
  rawText: string,
  triggers: readonly SkillCatalogCommandTrigger[],
): boolean {
  const text = rawText.trimStart();
  if (!text) {
    return false;
  }

  for (const trigger of triggers) {
    const prefix = trigger.prefix.trim();
    if (!prefix) {
      continue;
    }
    if (text.slice(0, prefix.length).toLowerCase() !== prefix.toLowerCase()) {
      continue;
    }
    const nextChar = text.charAt(prefix.length);
    if (!nextChar || /\s/u.test(nextChar)) {
      return true;
    }
  }
  return false;
}

function listConfirmationCandidates(): PlainInputIntentConfirmationCandidate[] {
  return listSkillCatalogCommandEntries(getCurrentSkillCatalogSnapshot())
    .map((command) => {
      const intent = command.binding?.intentConfirmation;
      if (!intent) {
        return null;
      }
      const rules = readLocalizedIntentRules(intent.ruleKey);
      if (!rules) {
        return null;
      }
      return { command, intent, rules };
    })
    .filter((item): item is PlainInputIntentConfirmationCandidate =>
      Boolean(item),
    );
}

function matchesLocalizedIntentRules(
  text: string,
  rules: LocalizedPlainIntentRules,
): boolean {
  if (rules.excludeAny && hasLocalizedTerm(text, rules.excludeAny)) {
    return false;
  }

  if (!hasLocalizedTerm(text, rules.includeAny)) {
    return false;
  }

  return rules.requireAny ? hasLocalizedTerm(text, rules.requireAny) : true;
}

function buildResolvedConfirmation(
  candidate: PlainInputIntentConfirmationCandidate,
): PlainInputIntentConfirmation | null {
  const confirmation = translateAgentString(candidate.intent.confirmationKey);
  if (!confirmation) {
    return null;
  }
  const systemPrompt = candidate.intent.systemPromptKey
    ? translateAgentString(candidate.intent.systemPromptKey, {
        confirmation,
      })
    : undefined;

  return {
    commandKey: candidate.command.commandKey,
    intentId: candidate.intent.id,
    confirmation,
    ...(systemPrompt ? { systemPrompt } : {}),
  };
}

export function resolvePlainInputIntentConfirmation(
  value?: string | null,
): PlainInputIntentConfirmation | null {
  const rawText = value || "";
  const text = normalizeIntentText(rawText);
  if (!text) {
    return null;
  }

  const catalog = getCurrentSkillCatalogSnapshot();
  if (
    startsWithExplicitCatalogCommand(
      rawText,
      collectExplicitCommandTriggers(listSkillCatalogEntries(catalog)),
    )
  ) {
    return null;
  }

  const candidate = listConfirmationCandidates().find((item) =>
    matchesLocalizedIntentRules(text, item.rules),
  );
  return candidate ? buildResolvedConfirmation(candidate) : null;
}

export function resolveFirstPlainInputIntentConfirmation():
  | PlainInputIntentConfirmation
  | null {
  const candidate = listConfirmationCandidates()[0];
  return candidate ? buildResolvedConfirmation(candidate) : null;
}

export function shouldConfirmPlainInputIntent(value?: string | null): boolean {
  return Boolean(resolvePlainInputIntentConfirmation(value));
}

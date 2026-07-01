import { beforeEach, describe, expect, it } from "vitest";
import {
  changeLimeLocale,
  getLimeI18n,
  limeI18nResources,
} from "@/i18n/createI18n";
import { SUPPORTED_LOCALES, type SupportedLocale } from "@/i18n/locales";
import {
  getCurrentSkillCatalogSnapshot,
  listSkillCatalogCommandEntries,
  type SkillCatalogCommandEntry,
  type SkillCatalogCommandIntentConfirmation,
} from "@/lib/api/skillCatalog";
import {
  resolveFirstPlainInputIntentConfirmation,
  resolvePlainInputIntentConfirmation,
} from "./plainInputIntentConfirmation";

const RULE_SUFFIXES = ["includeAny", "requireAny", "excludeAny"] as const;
const LEGACY_VISUAL_BRIEF_SEGMENT = ["plain", "Visual", "Brief"].join("");
const LEGACY_VISUAL_BRIEF_ID = ["plain", "visual", "brief"].join("_");

function readAgentResource(locale: SupportedLocale, key: string): string {
  const value = limeI18nResources[locale]?.agent?.[key];
  return typeof value === "string" ? value : "";
}

function readRuleTerms(locale: SupportedLocale, key: string): string[] {
  return readAgentResource(locale, key)
    .split("|")
    .map((item) => item.trim())
    .filter(Boolean);
}

function listCommandsWithIntentConfirmation(): Array<{
  command: SkillCatalogCommandEntry;
  intent: SkillCatalogCommandIntentConfirmation;
}> {
  return listSkillCatalogCommandEntries(getCurrentSkillCatalogSnapshot())
    .map((command) => {
      const intent = command.binding?.intentConfirmation;
      return intent ? { command, intent } : null;
    })
    .filter(
      (
        item,
      ): item is {
        command: SkillCatalogCommandEntry;
        intent: SkillCatalogCommandIntentConfirmation;
      } => Boolean(item),
    );
}

function getPrimaryIntentConfirmation() {
  const primary = listCommandsWithIntentConfirmation()[0];
  if (!primary) {
    throw new Error("缺少 catalog intent confirmation fixture");
  }
  return primary;
}

function buildLocaleMatchText(
  locale: SupportedLocale,
  intent: SkillCatalogCommandIntentConfirmation,
): string {
  const include = readRuleTerms(locale, `${intent.ruleKey}.includeAny`)[0];
  const required = readRuleTerms(locale, `${intent.ruleKey}.requireAny`)[0];
  return [include, required].filter(Boolean).join(" ");
}

function buildLocaleExcludedText(
  locale: SupportedLocale,
  intent: SkillCatalogCommandIntentConfirmation,
): string {
  const include = readRuleTerms(locale, `${intent.ruleKey}.includeAny`)[0];
  const required = readRuleTerms(locale, `${intent.ruleKey}.requireAny`)[0];
  const excluded = readRuleTerms(locale, `${intent.ruleKey}.excludeAny`)[0];
  return [include, required, excluded].filter(Boolean).join(" ");
}

describe("plainInputIntentConfirmation", () => {
  beforeEach(async () => {
    await changeLimeLocale("zh-CN");
  });

  it("catalog 中声明的 plain input intent confirmation 应覆盖 current 五语言", () => {
    const entries = listCommandsWithIntentConfirmation();
    expect(entries.length).toBeGreaterThan(0);

    for (const { intent } of entries) {
      expect(intent.id).not.toContain(LEGACY_VISUAL_BRIEF_ID);
      expect(intent.ruleKey).not.toContain(LEGACY_VISUAL_BRIEF_SEGMENT);
      expect(intent.confirmationKey).not.toContain(
        LEGACY_VISUAL_BRIEF_SEGMENT,
      );
      expect(intent.systemPromptKey || "").not.toContain(
        LEGACY_VISUAL_BRIEF_SEGMENT,
      );
      for (const locale of SUPPORTED_LOCALES) {
        expect(readAgentResource(locale, intent.confirmationKey)).toBeTruthy();
        if (intent.systemPromptKey) {
          expect(readAgentResource(locale, intent.systemPromptKey)).toBeTruthy();
        }
        for (const suffix of RULE_SUFFIXES) {
          expect(
            readRuleTerms(locale, `${intent.ruleKey}.${suffix}`).length,
          ).toBeGreaterThan(0);
        }
      }
    }
  });

  it("应按当前 locale 读取 catalog 规则，不在运行时固定某一种语言", async () => {
    const { command, intent } = getPrimaryIntentConfirmation();
    const triggerPrefix = command.triggers[0]?.prefix;

    for (const locale of SUPPORTED_LOCALES) {
      await changeLimeLocale(locale);
      const matchText = buildLocaleMatchText(locale, intent);
      const translate = getLimeI18n().t as unknown as (
        key: string,
        options?: Record<string, unknown>,
      ) => string;
      const expectedConfirmation = translate(intent.confirmationKey, {
        ns: "agent",
      });

      expect(resolvePlainInputIntentConfirmation(matchText)).toMatchObject({
        commandKey: command.commandKey,
        intentId: intent.id,
        confirmation: expectedConfirmation,
      });

      if (triggerPrefix) {
        expect(
          resolvePlainInputIntentConfirmation(`${triggerPrefix} ${matchText}`),
        ).toBeNull();
      }

      expect(
        resolvePlainInputIntentConfirmation(
          buildLocaleExcludedText(locale, intent),
        ),
      ).toBeNull();
    }
  });

  it("系统提示同样来自 catalog/i18n，并复用同一条确认文案", () => {
    const resolved = resolveFirstPlainInputIntentConfirmation();
    expect(resolved?.confirmation).toBeTruthy();
    expect(resolved?.systemPrompt).toContain(resolved?.confirmation);
  });

  it("明确中文画图句式应命中图片生成意图", () => {
    expect(
      resolvePlainInputIntentConfirmation("画一张广州夏天的图"),
    ).toMatchObject({
      commandKey: "image_generate",
      intentId: "plain_image_generation",
    });
  });

  it("强浏览器后台任务不应被 plain input 本地确认拦截", () => {
    expect(
      resolvePlainInputIntentConfirmation("帮我把这篇文章发布到微信公众号后台"),
    ).toBeNull();
  });
});

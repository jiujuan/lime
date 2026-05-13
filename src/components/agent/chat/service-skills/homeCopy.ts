export type ServiceSkillHomeCopyKey =
  | "agentChat.serviceSkills.badge.recent"
  | "agentChat.serviceSkills.badge.browserAssist"
  | "agentChat.serviceSkills.badge.readyMade"
  | "agentChat.serviceSkills.badge.installed"
  | "agentChat.serviceSkills.badge.customScene"
  | "agentChat.serviceSkills.catalogSource.seeded"
  | "agentChat.serviceSkills.catalogSource.synced";

export interface ServiceSkillHomeCopy {
  badge: {
    recent: string;
    browserAssist: string;
    readyMade: string;
    installed: string;
    customScene: string;
  };
  catalogSource: {
    seeded: string;
    synced: string;
  };
}

export function buildServiceSkillHomeCopy(
  translate: (key: ServiceSkillHomeCopyKey) => string,
): ServiceSkillHomeCopy {
  return {
    badge: {
      recent: translate("agentChat.serviceSkills.badge.recent"),
      browserAssist: translate("agentChat.serviceSkills.badge.browserAssist"),
      readyMade: translate("agentChat.serviceSkills.badge.readyMade"),
      installed: translate("agentChat.serviceSkills.badge.installed"),
      customScene: translate("agentChat.serviceSkills.badge.customScene"),
    },
    catalogSource: {
      seeded: translate("agentChat.serviceSkills.catalogSource.seeded"),
      synced: translate("agentChat.serviceSkills.catalogSource.synced"),
    },
  };
}

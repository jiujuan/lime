import "i18next";

import agent from "./resources/zh-CN/agent.json";
import agentHome from "./resources/zh-CN/agentHome.json";
import agentInputbar from "./resources/zh-CN/agentInputbar.json";
import agentMessageList from "./resources/zh-CN/agentMessageList.json";
import agentRuntime from "./resources/zh-CN/agentRuntime.json";
import agentExperts from "./resources/zh-CN/agentExperts.json";
import agentSkills from "./resources/zh-CN/agentSkills.json";
import agentTeamWorkspace from "./resources/zh-CN/agentTeamWorkspace.json";
import common from "./resources/zh-CN/common.json";
import errors from "./resources/zh-CN/errors.json";
import navigation from "./resources/zh-CN/navigation.json";
import settings from "./resources/zh-CN/settings.json";
import workspace from "./resources/zh-CN/workspace.json";

type AgentResources = typeof agent &
  typeof agentHome &
  typeof agentInputbar &
  typeof agentMessageList &
  typeof agentRuntime &
  typeof agentExperts &
  typeof agentSkills &
  typeof agentTeamWorkspace;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    fallbackNS: "common";
    keySeparator: false;
    resources: {
      common: typeof common;
      navigation: typeof navigation;
      settings: typeof settings;
      workspace: typeof workspace;
      agent: AgentResources;
      errors: typeof errors;
    };
  }
}

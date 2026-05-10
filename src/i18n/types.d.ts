import "i18next";

import agent from "./resources/zh-CN/agent.json";
import common from "./resources/zh-CN/common.json";
import errors from "./resources/zh-CN/errors.json";
import navigation from "./resources/zh-CN/navigation.json";
import settings from "./resources/zh-CN/settings.json";
import workspace from "./resources/zh-CN/workspace.json";

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
      agent: typeof agent;
      errors: typeof errors;
    };
  }
}

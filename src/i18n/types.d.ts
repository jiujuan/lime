import "i18next";

import common from "./resources/zh-CN/common.json";

type ResourceTree = Record<string, string>;

declare module "i18next" {
  interface CustomTypeOptions {
    defaultNS: "common";
    fallbackNS: "common";
    keySeparator: false;
    resources: {
      common: typeof common;
      navigation: ResourceTree;
      settings: ResourceTree;
      workspace: ResourceTree;
      agent: ResourceTree;
      errors: ResourceTree;
    };
  }
}

/**
 * i18next 启动入口。
 *
 * current 主路径使用 key-based resources；DOM Patch 只保留为迁移期兼容层。
 */

import { initLimeI18n } from "./createI18n";

const i18n = initLimeI18n();

export default i18n;

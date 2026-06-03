const translations: Record<string, string> = {
  "common.cancel": "取消",
  "common.delete": "删除",
  "common.loading": "加载中...",
  "common.save": "保存",
  "common.projectSelector.action.createProject": "新建项目",
  "common.projectSelector.action.createWorkspace": "新建工作区",
  "common.projectSelector.action.deleting": "移除中...",
  "common.projectSelector.action.openExistingFolder": "打开现有文件夹",
  "common.projectSelector.action.remove": "移除",
  "common.projectSelector.action.removeEntity": "移除{{entity}}",
  "common.projectSelector.action.revealPath.default": "显示位置",
  "common.projectSelector.action.revealPath.linux": "在文件管理器中显示",
  "common.projectSelector.action.revealPath.macos": "在 Finder 中显示",
  "common.projectSelector.action.revealPath.unknown": "显示位置",
  "common.projectSelector.action.revealPath.windows": "在文件资源管理器中显示",
  "common.projectSelector.action.rename": "重命名",
  "common.projectSelector.action.saving": "保存中...",
  "common.projectSelector.action.viewContents": "查看内容",
  "common.projectSelector.badge.default": "默认",
  "common.projectSelector.current.label": "当前{{entity}}：",
  "common.projectSelector.empty": "未找到匹配项目",
  "common.projectSelector.entity.project": "项目",
  "common.projectSelector.entity.workspace": "工作区",
  "common.projectSelector.header.count": "{{count}} 个{{entity}}",
  "common.projectSelector.header.description":
    "在这里切换、搜索和管理可见{{entity}}列表。",
  "common.projectSelector.header.title": "选择{{entity}}",
  "common.projectSelector.management.defaultLocked":
    "默认{{entity}}不可重命名或移除",
  "common.projectSelector.management.description.project":
    "当前只管理可见项目，不影响本地目录与已有文件。",
  "common.projectSelector.management.description.workspace":
    "当前只管理可见工作区，不影响本地目录与已有文件。",
  "common.projectSelector.management.title.project": "项目管理",
  "common.projectSelector.management.title.workspace": "工作区管理",
  "common.projectSelector.meta.default": "默认项目",
  "common.projectSelector.meta.pending": "待选择项目",
  "common.projectSelector.path.notSet": "未设置目录",
  "common.projectSelector.placeholder.project": "选择项目",
  "common.projectSelector.placeholder.workspace": "选择工作区",
  "common.projectSelector.remove.dangerDescription":
    "只移除 Lime 中的记录，不删除本地目录和已有文件。",
  "common.projectSelector.remove.dangerTitle": "本地文件会保留",
  "common.projectSelector.remove.description": "确定要移除{{entity}}{{name}}吗？",
  "common.projectSelector.remove.title": "移除{{entity}}",
  "common.projectSelector.rename.description":
    "更新{{entity}}名称，不会修改本地目录路径。",
  "common.projectSelector.rename.placeholder": "输入新的项目名称",
  "common.projectSelector.rename.title": "重命名{{entity}}",
  "common.projectSelector.search.placeholder": "搜索{{entity}}",
  "common.projectSelector.toast.created": "{{entity}}已创建",
  "common.projectSelector.toast.nameRequired": "{{entity}}名称不能为空",
  "common.projectSelector.toast.openExistingFolderFailed":
    "打开现有文件夹失败：{{message}}",
  "common.projectSelector.toast.pathMissing": "当前没有可打开的本地目录",
  "common.projectSelector.toast.removeFailed": "移除失败：{{message}}",
  "common.projectSelector.toast.removed": "{{entity}}已移除，本地目录未删除",
  "common.projectSelector.toast.revealPathFailed": "打开位置失败：{{message}}",
  "common.projectSelector.toast.renamed": "{{entity}}名称已更新",
  "common.projectSelector.toast.renameFailed": "重命名失败：{{message}}",
  "common.projectSelector.workspaceType.blog": "博客",
  "common.projectSelector.workspaceType.general": "通用",
  "common.projectSelector.workspaceType.persistent": "持久化",
  "common.projectSelector.workspaceType.temporary": "临时",
};

export function translateProjectSelectorTestKey(
  key: string,
  options?: {
    defaultValue?: string;
    [key: string]: unknown;
  },
) {
  const template = options?.defaultValue ?? translations[key] ?? key;
  return template.replace(/{{(\w+)}}/g, (_, name: string) =>
    String(options?.[name] ?? ""),
  );
}

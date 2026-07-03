# 插件历史产物工作区

更新时间：2026-06-25  
状态：Draft

## 1. 目标

历史会话打开后，用户不只是看到聊天记录，而是看到当时的插件上下文、主产物和右侧 tab 状态。

```text
历史任务 = 对话 + 运行过程 + 插件上下文 + 产物工作区 + 下一步动作
```

## 2. 恢复数据

```ts
export interface PluginHistoryRestoreSnapshot {
  sessionId: string;
  pluginId?: string;
  activePluginId?: string;
  pluginWorkspace?: PluginSessionWorkspace;
  primaryObjectRef?: PluginObjectRef;
  selectedObjectRef?: PluginObjectRef;
  artifactRefs: string[];
  layoutState?: PluginWorkspaceLayoutState;
}
```

必须恢复：

1. `sessionId`
2. `pluginId`
3. `primaryObjectRef`
4. `selectedObjectRef`
5. `pluginWorkspace.objects[]`
6. `layoutState.activeSurfaceKind`

可降级恢复：

1. `activePluginId`
2. `openedTabs`
3. `pinnedTabs`
4. `activeTabId`

## 3. 恢复顺序

1. 读取 `PluginActivationContext`。
2. 恢复当前插件和 工作台应用 入口。
3. 恢复 `selectedObjectRef`。
4. 恢复 `openedTabs` 和布局状态。
5. 如果缺少 workspace，再回退到 artifact preview。
6. 如果 artifact 也没有，再回退到聊天历史。

## 4. 恢复内容

- 当前插件
- 当前 工作台应用
- 主产物
- 选中对象
- 右侧 tabs
- 上一次操作入口
- 历史产物的对象摘要和来源

## 5. 不恢复的内容

- 不恢复未完成的危险 action。
- 不恢复已经过期的权限状态。
- 不自动重新执行生成任务。
- 不把旧 action_required 直接当成当前可提交表单。

## 6. GUI 验收场景

| 场景 | 验收 |
| --- | --- |
| 文章历史任务 | 中间恢复该任务对话，右侧恢复文章草稿并选中上次编辑段落。 |
| 图片历史任务 | 中间恢复该任务对话，右侧恢复图片组并保持上次预览对象。 |
| 视频分镜历史任务 | 恢复 storyboard 列表，可继续改写某个镜头。 |
| 无 plugin workspace 的旧会话 | 回退 artifact preview 或聊天，不报错。 |
| 插件停用后的历史 | 只读查看可用，但继续 action 要求重新激活。 |

## 7. 实现注意事项

- 历史恢复不应抢正在运行的当前会话焦点。
- 选中对象更新要节流或按用户动作保存，避免滚动状态频繁写入。
- workspace snapshot 不保存大正文；正文、图片、分镜内容仍由 artifact / storage read model 提供。
- 恢复失败要显示用户态原因，例如“该历史任务没有可恢复产物”，不要暴露 raw JSON。

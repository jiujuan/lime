# 图片生成模块

这里现在只保留供现役链路复用的图片 Provider / 模型选择、插图浮层与测试辅助。

## 当前事实源

- `useImageGen.ts`: 图片 Provider、模型和尺寸选择 Hook；任务执行归工作台 media task runtime
- `RecentImageInsertFloating.tsx`: 最近插图浮层
- `test-utils.ts`: 相关测试辅助

## 导入约束

- 不再保留 `@/components/image-gen` 目录级 barrel 导出
- 现役代码必须直连子路径，例如 `@/components/image-gen/useImageGen`
- 测试辅助走 `@/components/image-gen/test-utils`

## 已收口的旧 surface

- 独立“插图”页面已经下线，不再作为产品入口
- 联网图片搜索已经迁到 Claw `@素材`
- 本地图片与“我的图片库”已经迁到项目资料图片视图

## 使用方式

1. 在 Claw 工作台触发 AI 生图能力
2. 由工作台 media task runtime 创建、轮询和取消任务，`useImageGen` 只提供选择状态
3. 本地图片上传与图库浏览统一走项目资料图片视图

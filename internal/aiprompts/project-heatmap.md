# 项目热力图与治理图再生成指南

## 目的

本文件用于指导后续 AI Agent 或人工维护者，稳定地重新生成 Lime 仓库的：

- **项目热力图**：看“哪里大、哪里热、什么时候热”
- **治理图**：看“哪些模块最值得优先做收口治理”

这里的“治理图”不是独立脚本，而是 `project-heatmap.mjs` 输出 HTML 报告中的 **`治理候选`** 板块。

## 适用场景

当用户出现以下意图时，优先使用本流程：

- “重新生成项目热力图”
- “看一下现在仓库哪些地方最热”
- “看一下哪些模块最该治理”
- “重新做治理图 / 治理候选榜”
- “帮我打开上次那份热力图报告”

如果用户不是要看仓库演化，而是要看 **legacy / compat / deprecated / dead** 的真实边界，请同时阅读：

- `internal/aiprompts/governance.md`

热力图负责 **发现热点和治理优先级**，治理报告负责 **确认边界分类和封老路状态**。

## 相关文件

- 脚本：`scripts/project-heatmap.mjs`
- 文件 / 页面治理图谱：`scripts/governance-graph.mjs`
- 命令入口：`npm run heatmap:project`
- 命令入口（带连线治理图谱）：`npm run governance:graph`
- 治理规则：`internal/aiprompts/governance.md`
- 治理扫描：`npm run governance:legacy-report`

## 输出物说明

每次生成都会产出两个文件：

- `index.html`：本地静态可视化报告
- `project-heatmap.json`：聚合后的结构化数据

报告中主要看三块：

1. **治理候选**：综合体量、churn、密度、分散度、持续活跃度后的治理优先级
2. **模块体量 + 热度**：Treemap，面积代表 `LOC`，颜色代表 `churn density`
3. **时间 × 模块热力矩阵**：看某模块是不是持续发热

治理图谱 2.0 另外输出：

- `governance-graph.html`：文件 / 页面级交互图谱（带连线、状态、signals、legacy overlay）
- `governance-graph.json`：治理图谱结构化数据

默认命令：

```bash
npm run governance:graph -- --output "./tmp/project-heatmap-governance"
```

补充说明：

- 图谱状态来源只认仓库内治理规则与既有治理护栏
- `dead-candidate`、`unused-file`、`zero-inbound` 只是疑似失效信号，不等于正式 `dead`
- 首期粒度是页面 / 文件，不包含函数调用图

## 标准操作流程

### 1. 先选输出目录

为了方便后续 AI、用户和不同平台复用，**优先显式传 `--output`**，不要依赖系统临时目录默认值。

推荐输出到仓库内相对目录：

```bash
npm run heatmap:project -- --output "./tmp/project-heatmap"
```

推荐原因：

- 路径稳定，方便后续 AI 继续打开
- 不依赖 macOS / Windows 的系统临时目录差异
- 更适合在对话里直接引用具体文件路径

### 2. 生成“项目热力图”

这是默认的仓库观察视角，适合先总览：

```bash
npm run heatmap:project -- --days 180 --depth 2 --top 18 --output "./tmp/project-heatmap"
```

含义：

- `--days 180`：观察最近 180 天的 Git churn
- `--depth 2`：按目录深度 2 聚合，适合总览 `src` / `lime-rs` / `docs`
- `--top 18`：矩阵中展示前 18 个热点模块

### 3. 生成“治理图”

如果目标是看 **该治理谁**，推荐使用更细一层的聚合深度：

```bash
npm run heatmap:project -- --days 30 --depth 3 --top 15 --output "./tmp/project-heatmap-governance"
```

推荐参数解释：

- `--days 30`：更适合看近期治理优先级，而不是长期历史噪音
- `--depth 3`：能把 `src/components/agent`、`lime-rs/src/commands` 这种真实模块层级打出来
- `--top 15`：矩阵和候选榜更聚焦

### 4. 配套生成治理扫描结果

只看热力图还不够。要确认哪些路径已经被收口、哪些还是 compat / deprecated，还要跑：

```bash
npm run governance:legacy-report
```

用途：

- 确认 legacy / compat / deprecated / dead 边界
- 验证旧入口是否被重新引用
- 判断是不是已经封住老路

### 5. 打开报告

#### macOS

```bash
open "./tmp/project-heatmap-governance/index.html"
```

#### Windows PowerShell

```powershell
Start-Process ".\\tmp\\project-heatmap-governance\\index.html"
```

#### 通用降级方式

如果当前 AI 环境不能直接打开 GUI：

- 返回 HTML 文件路径
- 返回 `project-heatmap.json` 路径
- 告诉用户“可直接在文件管理器中双击打开 `index.html`”

补充说明：

- 如果 AI 运行在受限沙箱或审批模式下，`open` / `Start-Process` 这类 GUI 打开动作可能需要用户批准
- 如果无法直接打开，不要卡住流程；优先把可点击文件路径返回给用户

## 推荐命令模板

### 只做总览

```bash
npm run heatmap:project -- --days 180 --depth 2 --top 18 --output "./tmp/project-heatmap"
```

### 只看治理优先级

```bash
npm run heatmap:project -- --days 30 --depth 3 --top 15 --output "./tmp/project-heatmap-governance"
npm run governance:legacy-report
```

### 同时保留两份报告

```bash
npm run heatmap:project -- --days 180 --depth 2 --top 18 --output "./tmp/project-heatmap"
npm run heatmap:project -- --days 30 --depth 3 --top 15 --output "./tmp/project-heatmap-governance"
```

## AI 执行清单

当后续 AI 被要求“重新生成热力图/治理图”时，建议严格按下面顺序执行：

### A. 先读规则

至少先读：

- `internal/aiprompts/project-heatmap.md`
- `internal/aiprompts/governance.md`

### B. 再生成

如果用户没指定参数，优先生成两份：

1. 总览热力图
2. 深度 3 的治理图

推荐命令：

```bash
npm run heatmap:project -- --days 180 --depth 2 --top 18 --output "./tmp/project-heatmap"
npm run heatmap:project -- --days 30 --depth 3 --top 15 --output "./tmp/project-heatmap-governance"
```

### C. 再补治理扫描

```bash
npm run governance:legacy-report
```

### D. 最后再总结

汇报时至少给出：

1. 哪份 HTML 是总览热力图
2. 哪份 HTML 是治理图
3. 哪些模块属于 **立即治理**
4. 哪些模块属于 **尽快治理**
5. heatmap 发现的热点，与 `governance:legacy-report` 的边界扫描是否一致

## 如何解释结果

### 1. 热力图不等于分类结果

`治理候选` 中的：

- `立即治理`
- `尽快治理`
- `持续观察`

是 **优先级启发式判断**，不是 `current / compat / deprecated / dead` 的正式分类。

正式分类必须结合：

- `internal/aiprompts/governance.md`
- `npm run governance:legacy-report`

### 2. 一个模块“很热”，不一定说明它是坏的

需要优先治理，通常要同时满足几个条件：

- 体量大
- churn 高
- 单位体量改动密
- 文件分散
- 连续多周活跃

### 3. 一个模块“很旧”，不一定值得现在下刀

如果 `governance:legacy-report` 显示：

- 已零引用
- 已删除
- 已受控 compat

那它不是第一优先级。  
优先级更高的通常是 **还在高速演进、还没收口的 current 主链路**。

## 建议默认解读方式

### 总览热力图重点看

- `src/components`
- `lime-rs/src`
- `lime-rs/crates`
- `src/lib`
- `src/features`

### 治理图重点看

深度 3 结果通常更有用，优先关注例如：

- `src/components/agent`
- `src/components/workspace`
- `src/components/settings-v2`
- `lime-rs/src/commands`
- `lime-rs/src/dev_bridge`
- `src/lib/api`
- `lime-rs/src/services`

## 建议的 AI 结论模板

生成完成后，建议按下面格式汇报：

```text
已生成两份报告：

- 总览热力图：./tmp/project-heatmap/index.html
- 治理图：./tmp/project-heatmap-governance/index.html

本轮最值得优先治理的模块：
- src/components/agent
- src/components/workspace
- lime-rs/src/commands

补充验证：
- governance:legacy-report 已运行

注意：
- 治理候选是优先级判断，不等于 compat / deprecated 正式分类
```

## 常见问题

### 1. 为什么看不到治理候选？

可能原因：

- 你打开的是旧报告
- 输出目录复用了旧文件
- 使用了过浅的 `--depth`

建议：

```bash
npm run heatmap:project -- --days 30 --depth 3 --top 15 --output "./tmp/project-heatmap-governance"
```

### 2. 为什么路径和上次不一样？

因为如果不显式传 `--output`，脚本会默认输出到系统临时目录。  
为了让 AI 会话之间稳定复用，建议始终传：

```bash
--output "./tmp/project-heatmap-governance"
```

### 3. 为什么热力图和治理扫描结论不完全一样？

这是正常的：

- 热力图：看“哪里热、哪里值得先下刀”
- 治理扫描：看“旧路有没有被封住，边界有没有违规”

两者是互补关系，不是重复关系。

## 一句话

**重新生成热力图时，默认出两份：深度 2 看全局，深度 3 看治理；再配合 `npm run governance:legacy-report` 做正式边界判断。**

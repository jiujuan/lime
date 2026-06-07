# i18n 工具链评估

> 关联 PRD：`internal/roadmap/i18n/prd.md`
> 关联进度：`internal/roadmap/i18n/implementation-progress.md`
> 评估时间：2026-05-23

## 评估目标

判断官方 `i18next-cli` 是否可以作为 Lime P3 的默认抽取 / lint / locale sync / type generation 工具链候选。

## 官方证据

以下官方资料对 `i18next-cli` 的定位一致：

- i18next Supported Frameworks：官方把 `i18next-cli` 标为推荐工具，并说明其覆盖 key extraction、code linting、locale syncing 与 type generation。
- i18next Extracting Translations：官方建议使用 `i18next-cli` 做静态抽取。
- i18next Plugins and Utils：官方继续把 `i18next-cli` 作为 extraction tool 链路的核心推荐项。

## Lime 当前事实

- 已有自研 `scripts/i18n/detect-missing-translations.ts`，负责 locale / namespace / key 结构一致性。
- 已有 `scripts/i18n/i18n-hardcoded-check.ts`，负责当前变更文件的硬编码文案扫描。
- 已有 `scripts/i18n/i18n-unused-key-check.ts`，负责 source locale unused key 候选、namespace 热点和前缀家族分桶。
- 已有 `scripts/i18n/i18n-patch-retirement-gate.mjs`，负责 legacy Patch 退出门禁。
- `scripts/local-ci.mjs` 已把 `i18n:check`、`i18n:unused --check` 和 patch retirement gate 串成统一本地校验路径；`scripts/quality-task-selector.mjs` 也会把 `i18n_unused` 作为独立任务位输出。

## 结论

`i18next-cli` 适合作为后续统一工具链候选，但当前不能直接替换 Lime 的治理脚本。

原因很直接：

1. Lime 现在不仅需要抽取和 locale sync，还需要动态前缀保护、unused key 家族分桶、legacy Patch 退出门禁。
2. 当前 custom 脚本已经和仓库里的资源结构、命名约定、progress gating 绑定，贸然替换会丢掉当前治理信号。
3. 官方 CLI 适合作为统一抽取 / lint / type 方向的主候选，而不是马上把所有自定义治理逻辑合并掉。

## Parity Benchmark

已落盘的对照证据：

- `internal/roadmap/i18n/evidence/i18next-cli-parity-benchmark.json`

这次最小 fixture 的结果说明：

- 官方 `status` 能发现缺失翻译，`lint` 能抓到硬编码 JSX 文案，`extract --dry-run --ci` 能标出会更新的 key，`types` 能生成 resources/types。
- Lime 自研 `detect-missing-translations` 在同一 fixture 上只负责资源结构一致性，不替代 extraction / lint / types。
- Lime 自研 `i18n-unused` 现在也纳入同一 benchmark：在干净 fixture 上能输出 `unusedKeyCount=1` 与 `protectedKeyCount=1`，补齐官方 CLI 当前没有直接覆盖的 unused / protected dynamic family 视角。
- 官方 CLI 当前对 temp fixture 可跑，但输出里仍出现 Node engine 警告，说明本地基线要么升级 Node，要么在正式接入前先确认运行环境。

## 下一步

1. 继续保留现有 `i18n:*` 自研治理脚本为 current。
2. 已有 parity benchmark，后续如果要推进替换，仍需让官方 CLI 对动态 key 保护、unused family 分桶和 gate 对齐达到等价覆盖，再评估最薄的 `i18n:check` 层。
3. 如果 parity 足够，再把最薄的一层 `npm run i18n:check` 逐步切到官方 CLI。

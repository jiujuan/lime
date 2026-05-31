# Translation Scripts

This directory contains utility scripts for managing i18n translations.

## Useful Scripts

### `extract_remaining_todos.py`
Extracts all `[TODO: Translate]` entries from `en.json` for manual translation.

**Usage:**
```bash
python scripts/extract_remaining_todos.py
```

**Output:** `translations-remaining.json` - Contains all untranslated entries

### `import_translations.py`
Imports translated entries from `translations-remaining.json` back into `en.json`.

**Usage:**
1. Fill in translations in `translations-remaining.json`
2. Run: `python scripts/import_translations.py`

### `translate_all.py`
Contains comprehensive translation dictionary (1200+ entries) for reference.
Can be used as a base for future translations.

## Workflow for Adding New Translations

When upstream adds new Chinese text:

1. **Extract new TODOs:**
   ```bash
   python scripts/extract_remaining_todos.py
   ```

2. **Translate entries:**
   Edit `translations-remaining.json` and add English translations

3. **Import translations:**
   ```bash
   python scripts/import_translations.py
   ```

4. **Verify:**
   Check `en.json` for any remaining `[TODO]` markers

## Translation Guidelines

- **Use full sentences/phrases** - Not word-by-word translation
- **Context-aware** - Consider where the text appears in the UI
- **Natural English** - Translate meaning, not literal words
- **Consistent terminology** - Use same terms for same concepts

## Current Status

- **Total entries:** 3,568
- **Translated:** 3,568 (100%)
- **Coverage:** 100%

## 项目热力图

可以使用下面的脚本为当前仓库生成静态项目观察报告：

```bash
npm run heatmap:project
```

常用参数：

```bash
npm run heatmap:project -- --days 90
npm run heatmap:project -- --output "./tmp/project-heatmap"
```

报告会输出：

- `index.html`：本地可直接打开的热力图报告
- `project-heatmap.json`：可复用的聚合数据

默认行为：

- 分析最近 `180` 天的 Git churn
- 以目录深度 `2` 聚合模块
- 忽略 `node_modules`、`dist`、`target`、锁文件等噪音输入

完整的 AI 操作流程、治理图生成参数、跨平台打开方式，请读：

- `internal/aiprompts/project-heatmap.md`

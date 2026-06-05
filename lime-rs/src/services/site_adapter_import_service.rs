use crate::services::site_adapter_registry::resolve_imported_adapter_dir;
use once_cell::sync::Lazy;
use regex::Regex;
use serde::{Deserialize, Serialize};
use serde_json::{Map, Number, Value};
use serde_yaml::Value as YamlValue;
use std::collections::{BTreeMap, BTreeSet};
use std::fs;
use std::path::Path;

const IMPORTED_REGISTRY_VERSION: u32 = 1;

static IMPORTED_TEMPLATE_TOKEN_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"\$\{\{\s*([\s\S]*?)\s*\}\}")
        .expect("imported yaml template token regex should compile")
});

static IMPORTED_ARGS_ENTRY_EXPR_REGEX: Lazy<Regex> = Lazy::new(|| {
    Regex::new(r"^args\.([a-zA-Z0-9_]+)(?:\s*\|\s*(urlencode))?$")
        .expect("imported yaml args entry expr regex should compile")
});

#[derive(Debug, Clone)]
pub struct ImportedYamlCompileOptions {
    pub read_only: bool,
    pub source_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompiledImportedSiteAdapter {
    pub name: String,
    pub domain: String,
    pub description: String,
    pub read_only: bool,
    pub capabilities: Vec<String>,
    pub args: Vec<CompiledImportedSiteAdapterArg>,
    pub example: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub auth_hint: Option<String>,
    pub entry: CompiledImportedSiteAdapterEntry,
    pub script: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub source_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct CompiledImportedSiteAdapterArg {
    pub name: String,
    pub description: String,
    pub required: bool,
    pub arg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub example: Option<Value>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum CompiledImportedSiteAdapterEntry {
    FixedUrl { url: String },
    UrlTemplate { template: String },
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
pub struct PersistImportedCatalogResult {
    pub directory: String,
    pub adapter_count: usize,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub catalog_version: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ImportedYamlAdapterDocument {
    site: String,
    name: String,
    #[serde(default)]
    description: Option<String>,
    domain: String,
    #[serde(default)]
    strategy: Option<String>,
    #[serde(default)]
    browser: bool,
    #[serde(default)]
    args: BTreeMap<String, ImportedYamlAdapterArgDocument>,
    #[serde(default)]
    columns: Vec<String>,
    #[serde(default)]
    pipeline: Vec<YamlValue>,
}

#[derive(Debug, Deserialize)]
struct ImportedYamlAdapterArgDocument {
    #[serde(rename = "type")]
    arg_type: String,
    #[serde(default)]
    default: Option<YamlValue>,
    #[serde(default)]
    description: Option<String>,
}

#[derive(Debug, Clone)]
enum ImportedYamlPipelineStep {
    Navigate(String),
    Evaluate(String),
    Map(BTreeMap<String, YamlValue>),
    Filter(YamlValue),
    Limit(YamlValue),
    Sort {
        by: YamlValue,
        order: ImportedYamlSortOrder,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ImportedYamlSortOrder {
    Asc,
    Desc,
}

#[derive(Debug, Clone, Serialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum JsValueResolverConfig {
    Literal { value: Value },
    Expr { source: String },
    Template { source: String },
}

#[derive(Debug, Clone, Serialize)]
struct PersistedImportedCatalogDocument {
    registry_version: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    catalog_version: Option<String>,
    adapters: Vec<PersistedImportedCatalogEntry>,
}

#[derive(Debug, Clone, Serialize)]
struct PersistedImportedCatalogEntry {
    name: String,
    domain: String,
    description: String,
    read_only: bool,
    capabilities: Vec<String>,
    args: Vec<PersistedImportedCatalogArg>,
    example: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    auth_hint: Option<String>,
    entry: CompiledImportedSiteAdapterEntry,
    script_file: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    source_version: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
struct PersistedImportedCatalogArg {
    name: String,
    description: String,
    required: bool,
    arg_type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    example: Option<Value>,
}

const IMPORTER_RUNTIME_SCRIPT: &str = r#"
const __lime = (() => {
  const splitTopLevel = (source, separator) => {
    const segments = [];
    let current = "";
    let depth = 0;
    let quote = null;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      if (escaped) {
        current += char;
        escaped = false;
        continue;
      }
      if (quote) {
        current += char;
        if (char === "\\") {
          escaped = true;
        } else if (char === quote) {
          quote = null;
        }
        continue;
      }
      if (char === "'" || char === "\"" || char === "`") {
        quote = char;
        current += char;
        continue;
      }
      if (char === "(" || char === "[" || char === "{") {
        depth += 1;
        current += char;
        continue;
      }
      if (char === ")" || char === "]" || char === "}") {
        depth = Math.max(0, depth - 1);
        current += char;
        continue;
      }
      if (char === separator && depth === 0) {
        if (separator === "|" && (source[index - 1] === "|" || source[index + 1] === "|")) {
          current += char;
          continue;
        }
        segments.push(current.trim());
        current = "";
        continue;
      }
      current += char;
    }

    if (current.trim()) {
      segments.push(current.trim());
    }
    return segments;
  };

  const stripExprWrapper = (source) => {
    if (typeof source !== "string") {
      return source;
    }
    const trimmed = source.trim();
    if (trimmed.startsWith("${{") && trimmed.endsWith("}}")) {
      return trimmed.slice(3, -2).trim();
    }
    return trimmed;
  };

  const evalBase = (expression, ctx) =>
    Function("ctx", `with (ctx) { return (${expression}); }`)(ctx);

  const filters = {
    default: (value, fallbackValue) =>
      value === undefined || value === null || value === "" ? fallbackValue : value,
    json: (value) => JSON.stringify(value),
    urlencode: (value) => encodeURIComponent(value === undefined || value === null ? "" : String(value)),
    join: (value, separator = ", ") => (Array.isArray(value) ? value.join(separator) : String(value ?? "")),
    upper: (value) => String(value ?? "").toUpperCase(),
    lower: (value) => String(value ?? "").toLowerCase(),
    trim: (value) => String(value ?? "").trim(),
    truncate: (value, size = 30) => {
      const text = String(value ?? "");
      const limit = Number(size);
      if (!Number.isFinite(limit) || limit < 0) {
        return text;
      }
      return text.length > limit ? text.slice(0, limit) : text;
    },
    replace: (value, searchValue, replaceValue = "") =>
      String(value ?? "").split(String(searchValue ?? "")).join(String(replaceValue ?? "")),
    keys: (value) => (value && typeof value === "object" ? Object.keys(value) : []),
    length: (value) => {
      if (Array.isArray(value) || typeof value === "string") {
        return value.length;
      }
      if (value && typeof value === "object") {
        return Object.keys(value).length;
      }
      return 0;
    },
    first: (value) => (Array.isArray(value) ? value[0] : null),
    last: (value) => (Array.isArray(value) ? value[value.length - 1] : null),
    slugify: (value) =>
      String(value ?? "")
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, "-")
        .replace(/^-+|-+$/g, ""),
    sanitize: (value) => String(value ?? "").replace(/[<>]/g, ""),
    ext: (value) => {
      const raw = String(value ?? "");
      const lastDot = raw.lastIndexOf(".");
      return lastDot >= 0 ? raw.slice(lastDot + 1) : "";
    },
    basename: (value) => {
      const normalized = String(value ?? "").replace(/\\/g, "/");
      const parts = normalized.split("/");
      return parts[parts.length - 1] || "";
    },
  };

  const evaluateFilterArgs = (source, ctx) => {
    const trimmed = source.trim();
    if (!trimmed) {
      return { name: "", args: [] };
    }
    const openIndex = trimmed.indexOf("(");
    if (openIndex < 0 || !trimmed.endsWith(")")) {
      return { name: trimmed, args: [] };
    }
    const name = trimmed.slice(0, openIndex).trim();
    const argsSource = trimmed.slice(openIndex + 1, -1);
    const args = splitTopLevel(argsSource, ",").map((segment) => evalBase(segment, ctx));
    return { name, args };
  };

  const expr = (source, ctx) => {
    const normalized = stripExprWrapper(source);
    if (!normalized) {
      return null;
    }
    const segments = splitTopLevel(normalized, "|");
    let value = evalBase(segments[0], ctx);
    for (const segment of segments.slice(1)) {
      const { name, args } = evaluateFilterArgs(segment, ctx);
      const filter = filters[name];
      if (!filter) {
        throw new Error(`不支持的来源 filter: ${name}`);
      }
      value = filter(value, ...args);
    }
    return value;
  };

  const stringify = (value) => {
    if (value === undefined || value === null) {
      return "";
    }
    if (typeof value === "string") {
      return value;
    }
    if (typeof value === "object") {
      return JSON.stringify(value);
    }
    return String(value);
  };

  const interpolate = (source, ctx) =>
    String(source).replace(/\$\{\{\s*([\s\S]*?)\s*\}\}/g, (_, inner) => stringify(expr(inner, ctx)));

  const resolve = (config, ctx) => {
    if (!config || typeof config !== "object") {
      return null;
    }
    switch (config.kind) {
      case "literal":
        return config.value;
      case "expr":
        return expr(config.source, ctx);
      case "template":
        return interpolate(config.source, ctx);
      default:
        throw new Error(`未知的 resolver kind: ${String(config.kind)}`);
    }
  };

  const compare = (left, right) => {
    if (left === right) {
      return 0;
    }
    if (left === undefined || left === null) {
      return -1;
    }
    if (right === undefined || right === null) {
      return 1;
    }
    if (typeof left === "number" && typeof right === "number") {
      return left - right;
    }
    return String(left).localeCompare(String(right), "zh-CN");
  };

  const makeContext = (items, item, index) => ({
    args,
    helpers,
    state: items,
    data: items,
    item,
    index,
    Math,
    JSON,
    Number,
    String,
    Boolean,
    Date,
    URL,
    location,
    document,
    window,
  });

  const sortItems = (items, config) => {
    const order = config?.order === "desc" ? -1 : 1;
    const copied = Array.isArray(items) ? [...items] : [];
    copied.sort((left, right) => {
      const leftKey = resolve(config.by, makeContext(copied, left, 0));
      const rightKey = resolve(config.by, makeContext(copied, right, 0));
      return compare(leftKey, rightKey) * order;
    });
    return copied;
  };

  return {
    interpolate,
    makeContext,
    resolve,
    sortItems,
  };
})();
"#;

pub fn compile_imported_yaml_adapter(
    yaml: &str,
    options: &ImportedYamlCompileOptions,
) -> Result<CompiledImportedSiteAdapter, String> {
    let document: ImportedYamlAdapterDocument = serde_yaml::from_str(yaml)
        .map_err(|error| format!("解析导入型 YAML 适配器失败: {error}"))?;
    compile_imported_yaml_adapter_document(document, options)
}

pub fn compile_imported_yaml_adapter_bundle(
    yaml_bundle: &str,
    options: &ImportedYamlCompileOptions,
) -> Result<Vec<CompiledImportedSiteAdapter>, String> {
    let mut adapters = Vec::new();
    let mut seen_names = BTreeSet::new();

    for (index, deserializer) in serde_yaml::Deserializer::from_str(yaml_bundle).enumerate() {
        let document = ImportedYamlAdapterDocument::deserialize(deserializer)
            .map_err(|error| format!("解析第 {} 个导入型 YAML 适配器失败: {error}", index + 1))?;
        let adapter = compile_imported_yaml_adapter_document(document, options)
            .map_err(|error| format!("编译第 {} 个导入型 YAML 适配器失败: {error}", index + 1))?;
        let normalized_name = adapter.name.trim().to_ascii_lowercase();
        if !seen_names.insert(normalized_name) {
            return Err(format!("导入内容中存在重复适配器: {}", adapter.name));
        }
        adapters.push(adapter);
    }

    if adapters.is_empty() {
        return Err("导入内容中未找到任何 YAML 适配器文档".to_string());
    }

    Ok(adapters)
}

pub fn compile_imported_yaml_adapter_file(
    path: &Path,
    options: &ImportedYamlCompileOptions,
) -> Result<CompiledImportedSiteAdapter, String> {
    let yaml = fs::read_to_string(path)
        .map_err(|error| format!("读取导入型 YAML 适配器文件失败 {}: {error}", path.display()))?;
    compile_imported_yaml_adapter(&yaml, options)
}

pub fn persist_compiled_imported_adapters(
    dir: &Path,
    adapters: &[CompiledImportedSiteAdapter],
    catalog_version: Option<String>,
) -> Result<PersistImportedCatalogResult, String> {
    if dir.exists() {
        fs::remove_dir_all(dir)
            .map_err(|error| format!("清理 imported 适配器目录失败 {}: {error}", dir.display()))?;
    }
    fs::create_dir_all(dir.join("scripts"))
        .map_err(|error| format!("创建 imported 适配器目录失败 {}: {error}", dir.display()))?;

    let mut manifest_entries = Vec::with_capacity(adapters.len());
    let mut seen_names = BTreeSet::new();
    for adapter in adapters {
        if !seen_names.insert(adapter.name.to_ascii_lowercase()) {
            return Err(format!("重复的 imported adapter: {}", adapter.name));
        }
        let script_file = build_imported_script_file(&adapter.name);
        let script_path = dir.join(&script_file);
        if let Some(parent) = script_path.parent() {
            fs::create_dir_all(parent).map_err(|error| {
                format!(
                    "创建 imported 适配器脚本目录失败 {}: {error}",
                    parent.display()
                )
            })?;
        }
        fs::write(&script_path, &adapter.script).map_err(|error| {
            format!(
                "写入 imported 适配器脚本失败 {}: {error}",
                script_path.display()
            )
        })?;

        manifest_entries.push(PersistedImportedCatalogEntry {
            name: adapter.name.clone(),
            domain: adapter.domain.clone(),
            description: adapter.description.clone(),
            read_only: adapter.read_only,
            capabilities: adapter.capabilities.clone(),
            args: adapter
                .args
                .iter()
                .map(|arg| PersistedImportedCatalogArg {
                    name: arg.name.clone(),
                    description: arg.description.clone(),
                    required: arg.required,
                    arg_type: arg.arg_type.clone(),
                    example: arg.example.clone(),
                })
                .collect(),
            example: adapter.example.clone(),
            auth_hint: adapter.auth_hint.clone(),
            entry: adapter.entry.clone(),
            script_file,
            source_version: adapter.source_version.clone(),
        });
    }

    let document = PersistedImportedCatalogDocument {
        registry_version: IMPORTED_REGISTRY_VERSION,
        catalog_version: normalize_optional_text(catalog_version),
        adapters: manifest_entries,
    };
    let index_path = dir.join("index.json");
    let content = serde_json::to_string_pretty(&document)
        .map_err(|error| format!("序列化 imported 适配器目录失败: {error}"))?;
    fs::write(&index_path, content).map_err(|error| {
        format!(
            "写入 imported 适配器索引失败 {}: {error}",
            index_path.display()
        )
    })?;

    Ok(PersistImportedCatalogResult {
        directory: dir.display().to_string(),
        adapter_count: adapters.len(),
        catalog_version: document.catalog_version,
    })
}

pub fn persist_compiled_imported_adapters_to_default_dir(
    adapters: &[CompiledImportedSiteAdapter],
    catalog_version: Option<String>,
) -> Result<PersistImportedCatalogResult, String> {
    let dir =
        resolve_imported_adapter_dir().ok_or_else(|| "无法解析 imported 适配器目录".to_string())?;
    persist_compiled_imported_adapters(&dir, adapters, catalog_version)
}

pub fn import_imported_yaml_adapter_bundle_to_default_dir(
    yaml_bundle: &str,
    options: &ImportedYamlCompileOptions,
    catalog_version: Option<String>,
) -> Result<PersistImportedCatalogResult, String> {
    let adapters = compile_imported_yaml_adapter_bundle(yaml_bundle, options)?;
    persist_compiled_imported_adapters_to_default_dir(&adapters, catalog_version)
}

fn compile_imported_yaml_adapter_document(
    document: ImportedYamlAdapterDocument,
    options: &ImportedYamlCompileOptions,
) -> Result<CompiledImportedSiteAdapter, String> {
    let site = normalize_required_text(&document.site, "site")?;
    let command_name = normalize_required_text(&document.name, "name")?;
    let adapter_name = format!("{site}/{command_name}");
    let description = document
        .description
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("从外部来源导入的站点适配器")
        .to_string();
    let domain = normalize_required_text(&document.domain, "domain")?;

    let args = document
        .args
        .into_iter()
        .map(|(name, arg)| compile_imported_yaml_arg(name, arg))
        .collect::<Result<Vec<_>, _>>()?;
    let steps = document
        .pipeline
        .into_iter()
        .map(parse_pipeline_step)
        .collect::<Result<Vec<_>, _>>()?;
    let entry = compile_pipeline_entry(&domain, &steps)?;
    let script = compile_pipeline_script(&adapter_name, &document.columns, &steps)?;

    Ok(CompiledImportedSiteAdapter {
        name: adapter_name.clone(),
        domain,
        description,
        read_only: options.read_only,
        capabilities: derive_capabilities(&adapter_name),
        args: args.clone(),
        example: build_example(&adapter_name, &args),
        auth_hint: derive_auth_hint(document.strategy.as_deref(), document.browser),
        entry,
        script,
        source_version: normalize_optional_text(options.source_version.clone()),
    })
}

fn compile_imported_yaml_arg(
    name: String,
    arg: ImportedYamlAdapterArgDocument,
) -> Result<CompiledImportedSiteAdapterArg, String> {
    let normalized_name = normalize_required_text(&name, "arg.name")?;
    let normalized_arg_type = arg.arg_type.trim().to_ascii_lowercase();
    let arg_type = match normalized_arg_type.as_str() {
        "str" | "string" => "string",
        "int" | "integer" => "integer",
        other => return Err(format!("暂不支持的导入型 YAML 参数类型: {other}")),
    }
    .to_string();
    let example = arg
        .default
        .as_ref()
        .map(yaml_to_json_value)
        .transpose()?
        .or_else(|| default_arg_example(&arg_type));

    Ok(CompiledImportedSiteAdapterArg {
        name: normalized_name,
        description: arg
            .description
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .unwrap_or("从外部来源导入的参数")
            .to_string(),
        required: arg.default.is_none(),
        arg_type,
        example,
    })
}

fn parse_pipeline_step(value: YamlValue) -> Result<ImportedYamlPipelineStep, String> {
    let Some(mapping) = value.as_mapping() else {
        return Err("导入型 YAML pipeline step 必须是对象".to_string());
    };
    if mapping.len() != 1 {
        return Err("导入型 YAML pipeline step 只能包含一个操作".to_string());
    }

    let Some((raw_key, raw_value)) = mapping.iter().next() else {
        return Err("导入型 YAML pipeline step 不能为空".to_string());
    };
    let Some(key) = raw_key.as_str() else {
        return Err("导入型 YAML pipeline step key 必须是字符串".to_string());
    };

    match key {
        "navigate" => Ok(ImportedYamlPipelineStep::Navigate(yaml_value_to_string(
            raw_value, key,
        )?)),
        "evaluate" => Ok(ImportedYamlPipelineStep::Evaluate(yaml_value_to_string(
            raw_value, key,
        )?)),
        "map" => Ok(ImportedYamlPipelineStep::Map(parse_map_step(raw_value)?)),
        "filter" => Ok(ImportedYamlPipelineStep::Filter(raw_value.clone())),
        "limit" => Ok(ImportedYamlPipelineStep::Limit(raw_value.clone())),
        "sort" => parse_sort_step(raw_value),
        unsupported => Err(format!(
            "当前 Lime 外部适配器导入层暂不支持 pipeline step: {unsupported}"
        )),
    }
}

fn parse_map_step(value: &YamlValue) -> Result<BTreeMap<String, YamlValue>, String> {
    let Some(mapping) = value.as_mapping() else {
        return Err("导入型 YAML map step 必须是对象".to_string());
    };

    let mut result = BTreeMap::new();
    for (raw_key, raw_value) in mapping {
        let Some(key) = raw_key.as_str() else {
            return Err("导入型 YAML map 字段名必须是字符串".to_string());
        };
        result.insert(key.trim().to_string(), raw_value.clone());
    }
    Ok(result)
}

fn parse_sort_step(value: &YamlValue) -> Result<ImportedYamlPipelineStep, String> {
    let Some(mapping) = value.as_mapping() else {
        return Err("导入型 YAML sort step 必须是对象".to_string());
    };
    let by = mapping
        .get(&YamlValue::String("by".to_string()))
        .cloned()
        .ok_or_else(|| "导入型 YAML sort step 缺少 by".to_string())?;
    let order = match mapping
        .get(&YamlValue::String("order".to_string()))
        .and_then(YamlValue::as_str)
        .unwrap_or("asc")
        .trim()
    {
        "asc" => ImportedYamlSortOrder::Asc,
        "desc" => ImportedYamlSortOrder::Desc,
        other => {
            return Err(format!(
                "导入型 YAML sort.order 仅支持 asc / desc，当前为 {other}"
            ))
        }
    };

    Ok(ImportedYamlPipelineStep::Sort { by, order })
}

fn compile_pipeline_entry(
    domain: &str,
    steps: &[ImportedYamlPipelineStep],
) -> Result<CompiledImportedSiteAdapterEntry, String> {
    let navigate = steps.iter().find_map(|step| match step {
        ImportedYamlPipelineStep::Navigate(url) => Some(url.as_str()),
        _ => None,
    });

    if let Some(url) = navigate {
        compile_navigate_entry(url)
    } else {
        Ok(CompiledImportedSiteAdapterEntry::FixedUrl {
            url: default_domain_entry_url(domain),
        })
    }
}

fn compile_navigate_entry(url: &str) -> Result<CompiledImportedSiteAdapterEntry, String> {
    let trimmed = normalize_required_text(url, "pipeline.navigate")?;
    if !trimmed.contains("${{") {
        return Ok(CompiledImportedSiteAdapterEntry::FixedUrl { url: trimmed });
    }

    let mut unsupported_expr = None::<String>;
    let converted =
        IMPORTED_TEMPLATE_TOKEN_REGEX.replace_all(&trimmed, |captures: &regex::Captures<'_>| {
            let expr = captures
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default()
                .trim();
            let Some(arg_capture) = IMPORTED_ARGS_ENTRY_EXPR_REGEX.captures(expr) else {
                unsupported_expr = Some(expr.to_string());
                return String::new();
            };

            let arg_name = arg_capture
                .get(1)
                .map(|value| value.as_str())
                .unwrap_or_default();
            let filter = arg_capture.get(2).map(|value| value.as_str());
            match filter {
                Some("urlencode") => format!("{{{{{arg_name}|urlencode}}}}"),
                _ => format!("{{{{{arg_name}}}}}"),
            }
        });
    if let Some(expr) = unsupported_expr {
        return Err(format!(
            "当前仅支持 args.* 形式的 navigate 模板，暂不支持: {expr}"
        ));
    }

    Ok(CompiledImportedSiteAdapterEntry::UrlTemplate {
        template: converted.into_owned(),
    })
}

fn compile_pipeline_script(
    adapter_name: &str,
    columns: &[String],
    steps: &[ImportedYamlPipelineStep],
) -> Result<String, String> {
    if steps.is_empty() {
        return Err(format!("来源适配器 {adapter_name} 缺少 pipeline"));
    }

    let mut statements = Vec::new();
    let mut saw_evaluate = false;
    let mut saw_non_navigate = false;
    for (index, step) in steps.iter().enumerate() {
        match step {
            ImportedYamlPipelineStep::Navigate(_) => {
                if index != 0 || saw_non_navigate {
                    return Err(format!("来源适配器 {adapter_name} 仅支持第一步为 navigate"));
                }
            }
            ImportedYamlPipelineStep::Evaluate(source) => {
                saw_non_navigate = true;
                saw_evaluate = true;
                statements.push(build_evaluate_statement(index, source)?);
            }
            ImportedYamlPipelineStep::Map(fields) => {
                saw_non_navigate = true;
                statements.push(build_map_statement(index, fields)?);
            }
            ImportedYamlPipelineStep::Filter(condition) => {
                saw_non_navigate = true;
                statements.push(build_filter_statement(index, condition)?);
            }
            ImportedYamlPipelineStep::Limit(limit) => {
                saw_non_navigate = true;
                statements.push(build_limit_statement(index, limit)?);
            }
            ImportedYamlPipelineStep::Sort { by, order } => {
                saw_non_navigate = true;
                statements.push(build_sort_statement(index, by, *order)?);
            }
        }
    }

    if !saw_evaluate {
        return Err(format!(
            "来源适配器 {adapter_name} 当前至少需要一个 evaluate step 才能导入"
        ));
    }

    let columns_literal = serde_json::to_string(columns)
        .map_err(|error| format!("编码来源适配器 columns 失败: {error}"))?;

    Ok(format!(
        r#"async (args, helpers) => {{
{runtime}
  let __state = null;
{statements}
  const __data = Array.isArray(__state)
    ? {{
        items: __state,
        count: __state.length,
        columns: {columns_literal},
      }}
    : __state;
  return {{
    ok: true,
    data: __data,
    source_url: location.href,
  }};
}}"#,
        runtime = IMPORTER_RUNTIME_SCRIPT,
        statements = indent_lines(&statements.join("\n"), 2),
        columns_literal = columns_literal,
    ))
}

fn build_evaluate_statement(index: usize, source: &str) -> Result<String, String> {
    let source_literal = serde_json::to_string(source)
        .map_err(|error| format!("编码 evaluate step 失败: {error}"))?;
    Ok(format!(
        r#"const __ctx_{index} = __lime.makeContext(__state, null, 0);
const __eval_source_{index} = __lime.interpolate({source_literal}, __ctx_{index});
__state = await (0, eval)(__eval_source_{index});"#,
        index = index,
        source_literal = source_literal,
    ))
}

fn build_map_statement(
    index: usize,
    fields: &BTreeMap<String, YamlValue>,
) -> Result<String, String> {
    let mut compiled_fields = BTreeMap::new();
    for (key, value) in fields {
        compiled_fields.insert(key.clone(), compile_value_resolver_config(value)?);
    }
    let config_literal = serde_json::to_string(&compiled_fields)
        .map_err(|error| format!("编码 map step 失败: {error}"))?;

    Ok(format!(
        r#"const __map_config_{index} = {config_literal};
const __map_items_{index} = Array.isArray(__state) ? __state : [];
__state = __map_items_{index}.map((item, index) => {{
  const __ctx = __lime.makeContext(__map_items_{index}, item, index);
  const __next = {{}};
  for (const [field, config] of Object.entries(__map_config_{index})) {{
    __next[field] = __lime.resolve(config, __ctx);
  }}
  return __next;
}});"#,
        index = index,
        config_literal = config_literal,
    ))
}

fn build_filter_statement(index: usize, condition: &YamlValue) -> Result<String, String> {
    let config = compile_value_resolver_config(condition)?;
    let config_literal = serde_json::to_string(&config)
        .map_err(|error| format!("编码 filter step 失败: {error}"))?;

    Ok(format!(
        r#"const __filter_config_{index} = {config_literal};
const __filter_items_{index} = Array.isArray(__state) ? __state : [];
__state = __filter_items_{index}.filter((item, index) => {{
  const __ctx = __lime.makeContext(__filter_items_{index}, item, index);
  return Boolean(__lime.resolve(__filter_config_{index}, __ctx));
}});"#,
        index = index,
        config_literal = config_literal,
    ))
}

fn build_limit_statement(index: usize, limit: &YamlValue) -> Result<String, String> {
    let config = compile_value_resolver_config(limit)?;
    let config_literal =
        serde_json::to_string(&config).map_err(|error| format!("编码 limit step 失败: {error}"))?;

    Ok(format!(
        r#"const __limit_config_{index} = {config_literal};
const __limit_items_{index} = Array.isArray(__state) ? __state : [];
const __limit_ctx_{index} = __lime.makeContext(__limit_items_{index}, null, 0);
const __limit_raw_{index} = __lime.resolve(__limit_config_{index}, __limit_ctx_{index});
const __limit_value_{index} = Number(__limit_raw_{index});
if (Array.isArray(__state) && Number.isFinite(__limit_value_{index})) {{
  __state = __limit_items_{index}.slice(0, Math.max(0, __limit_value_{index}));
}}"#,
        index = index,
        config_literal = config_literal,
    ))
}

fn build_sort_statement(
    index: usize,
    by: &YamlValue,
    order: ImportedYamlSortOrder,
) -> Result<String, String> {
    let config = compile_sort_resolver_config(by)?;
    let order_literal = match order {
        ImportedYamlSortOrder::Asc => "asc",
        ImportedYamlSortOrder::Desc => "desc",
    };
    let sort_literal = serde_json::to_string(&serde_json::json!({
        "by": config,
        "order": order_literal,
    }))
    .map_err(|error| format!("编码 sort step 失败: {error}"))?;

    Ok(format!(
        r#"const __sort_config_{index} = {sort_literal};
const __sort_items_{index} = Array.isArray(__state) ? __state : [];
__state = __lime.sortItems(__sort_items_{index}, __sort_config_{index});"#,
        index = index,
        sort_literal = sort_literal,
    ))
}

fn compile_sort_resolver_config(value: &YamlValue) -> Result<JsValueResolverConfig, String> {
    if let Some(raw) = value.as_str() {
        let trimmed = raw.trim();
        if is_imported_expr_wrapper(trimmed) || trimmed.contains("${{") {
            return compile_value_resolver_config(value);
        }
        if is_simple_identifier(trimmed) {
            return Ok(JsValueResolverConfig::Expr {
                source: format!(
                    "item?.[{}]",
                    serde_json::to_string(trimmed).unwrap_or_default()
                ),
            });
        }
    }
    compile_value_resolver_config(value)
}

fn compile_value_resolver_config(value: &YamlValue) -> Result<JsValueResolverConfig, String> {
    if let Some(raw) = value.as_str() {
        let trimmed = raw.trim();
        if is_imported_expr_wrapper(trimmed) {
            return Ok(JsValueResolverConfig::Expr {
                source: strip_imported_expr_wrapper(trimmed).to_string(),
            });
        }
        if trimmed.contains("${{") {
            return Ok(JsValueResolverConfig::Template {
                source: trimmed.to_string(),
            });
        }
        return Ok(JsValueResolverConfig::Literal {
            value: Value::String(trimmed.to_string()),
        });
    }

    Ok(JsValueResolverConfig::Literal {
        value: yaml_to_json_value(value)?,
    })
}

fn derive_capabilities(adapter_name: &str) -> Vec<String> {
    let Some(command_name) = adapter_name.split('/').next_back() else {
        return vec!["research".to_string()];
    };

    let mut capabilities = BTreeSet::new();
    capabilities.insert("research".to_string());
    for token in command_name
        .split(|ch: char| matches!(ch, '-' | '_' | '/' | ' '))
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        match token {
            "search" | "hot" | "top" | "best" | "new" | "latest" | "feed" | "quote" | "issues"
            | "issue" | "question" | "topic" | "topics" | "profile" | "user" | "read"
            | "ranking" | "news" | "nodes" | "categories" | "category" => {
                capabilities.insert(token.to_string());
            }
            _ => {}
        }
    }
    capabilities.into_iter().collect()
}

fn derive_auth_hint(strategy: Option<&str>, browser: bool) -> Option<String> {
    let normalized_strategy = strategy
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or_default();
    if browser || matches!(normalized_strategy, "cookie" | "intercept") {
        Some("该适配器依赖已有浏览器上下文，必要时请先在目标站点完成登录。".to_string())
    } else {
        None
    }
}

fn build_example(adapter_name: &str, args: &[CompiledImportedSiteAdapterArg]) -> String {
    let mut payload = Map::new();
    for arg in args {
        let value = arg
            .example
            .clone()
            .unwrap_or_else(|| match arg.arg_type.as_str() {
                "integer" => Value::Number(Number::from(1)),
                _ => Value::String("示例".to_string()),
            });
        payload.insert(arg.name.clone(), value);
    }
    format!("{adapter_name} {}", Value::Object(payload))
}

fn yaml_value_to_string(value: &YamlValue, field: &str) -> Result<String, String> {
    value
        .as_str()
        .map(str::trim)
        .filter(|raw| !raw.is_empty())
        .map(ToString::to_string)
        .ok_or_else(|| format!("导入型 YAML {field} 必须是非空字符串"))
}

fn yaml_to_json_value(value: &YamlValue) -> Result<Value, String> {
    match value {
        YamlValue::Null => Ok(Value::Null),
        YamlValue::Bool(raw) => Ok(Value::Bool(*raw)),
        YamlValue::Number(raw) => {
            if let Some(number) = raw.as_i64() {
                Ok(Value::Number(Number::from(number)))
            } else if let Some(number) = raw.as_u64() {
                Ok(Value::Number(Number::from(number)))
            } else if let Some(number) = raw.as_f64() {
                Number::from_f64(number)
                    .map(Value::Number)
                    .ok_or_else(|| "导入型 YAML 浮点参数超出范围".to_string())
            } else {
                Err("无法解析导入型 YAML number".to_string())
            }
        }
        YamlValue::String(raw) => Ok(Value::String(raw.clone())),
        YamlValue::Sequence(items) => items
            .iter()
            .map(yaml_to_json_value)
            .collect::<Result<Vec<_>, _>>()
            .map(Value::Array),
        YamlValue::Mapping(mapping) => {
            let mut object = Map::new();
            for (raw_key, raw_value) in mapping {
                let Some(key) = raw_key.as_str() else {
                    return Err("导入型 YAML object key 必须是字符串".to_string());
                };
                object.insert(key.to_string(), yaml_to_json_value(raw_value)?);
            }
            Ok(Value::Object(object))
        }
        YamlValue::Tagged(tagged) => yaml_to_json_value(&tagged.value),
    }
}

fn default_arg_example(arg_type: &str) -> Option<Value> {
    match arg_type {
        "integer" => Some(Value::Number(Number::from(5))),
        "string" => Some(Value::String("示例".to_string())),
        _ => None,
    }
}

fn default_domain_entry_url(domain: &str) -> String {
    if domain.starts_with("http://") || domain.starts_with("https://") {
        domain.to_string()
    } else {
        format!("https://{domain}")
    }
}

fn is_imported_expr_wrapper(value: &str) -> bool {
    let trimmed = value.trim();
    trimmed.starts_with("${{") && trimmed.ends_with("}}")
}

fn strip_imported_expr_wrapper(value: &str) -> &str {
    let trimmed = value.trim();
    trimmed
        .strip_prefix("${{")
        .and_then(|raw| raw.strip_suffix("}}"))
        .map(str::trim)
        .unwrap_or(trimmed)
}

fn is_simple_identifier(value: &str) -> bool {
    let mut chars = value.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    if !(first.is_ascii_alphabetic() || first == '_') {
        return false;
    }
    chars.all(|ch| ch.is_ascii_alphanumeric() || ch == '_')
}

fn build_imported_script_file(adapter_name: &str) -> String {
    format!("scripts/{}.js", sanitize_path_segment(adapter_name))
}

fn sanitize_path_segment(value: &str) -> String {
    let mut sanitized = String::with_capacity(value.len());
    let mut last_was_dash = false;

    for ch in value.chars() {
        let normalized = if ch.is_ascii_alphanumeric() {
            Some(ch.to_ascii_lowercase())
        } else if matches!(ch, '/' | '\\' | '-' | '_' | ' ') {
            Some('-')
        } else {
            None
        };

        let Some(next_char) = normalized else {
            continue;
        };
        if next_char == '-' {
            if last_was_dash {
                continue;
            }
            last_was_dash = true;
            sanitized.push(next_char);
            continue;
        }

        last_was_dash = false;
        sanitized.push(next_char);
    }

    let trimmed = sanitized.trim_matches('-');
    if trimmed.is_empty() {
        "adapter".to_string()
    } else {
        trimmed.to_string()
    }
}

fn normalize_required_text(value: &str, field: &str) -> Result<String, String> {
    let normalized = value.trim();
    if normalized.is_empty() {
        return Err(format!("{field} 不能为空"));
    }
    Ok(normalized.to_string())
}

fn normalize_optional_text(value: Option<String>) -> Option<String> {
    value.and_then(|item| {
        let normalized = item.trim();
        if normalized.is_empty() {
            None
        } else {
            Some(normalized.to_string())
        }
    })
}

fn indent_lines(source: &str, spaces: usize) -> String {
    let prefix = " ".repeat(spaces);
    source
        .lines()
        .map(|line| {
            if line.is_empty() {
                String::new()
            } else {
                format!("{prefix}{line}")
            }
        })
        .collect::<Vec<_>>()
        .join("\n")
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::tempdir;

    const REAL_WORLD_IMPORTED_ADAPTER_BUNDLE_FIXTURE: &str =
        include_str!("../../tests/fixtures/site-adapters/imported-real-world-bundle.yaml");

    #[test]
    fn should_compile_imported_yaml_reddit_hot_adapter_into_lime_script() {
        let adapter = compile_imported_yaml_adapter(
            r#"
site: reddit
name: hot
description: Reddit 热门帖子
domain: www.reddit.com
args:
  subreddit:
    type: str
    default: ""
    description: Subreddit name
  limit:
    type: int
    default: 20
    description: Number of posts
pipeline:
  - navigate: https://www.reddit.com
  - evaluate: |
      (async () => {
        const sub = ${{ args.subreddit | json }};
        const path = sub ? '/r/' + sub + '/hot.json' : '/hot.json';
        const limit = ${{ args.limit }};
        const res = await fetch(path + '?limit=' + limit, { credentials: 'include' });
        const d = await res.json();
        return (d?.data?.children || []).map(c => ({
          title: c.data.title,
          subreddit: c.data.subreddit_name_prefixed,
          score: c.data.score,
          comments: c.data.num_comments,
        }));
      })()
  - map:
      rank: ${{ index + 1 }}
      title: ${{ item.title }}
      subreddit: ${{ item.subreddit }}
      score: ${{ item.score }}
  - limit: ${{ args.limit }}
columns: [rank, title, subreddit, score]
"#,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: Some("imported-test".to_string()),
            },
        )
        .expect("adapter should compile");

        assert_eq!(adapter.name, "reddit/hot");
        assert!(matches!(
            adapter.entry,
            CompiledImportedSiteAdapterEntry::FixedUrl { ref url }
                if url == "https://www.reddit.com"
        ));
        assert_eq!(adapter.source_version.as_deref(), Some("imported-test"));
        assert!(adapter.capabilities.contains(&"hot".to_string()));
        assert!(adapter.script.contains("__lime"));
        assert!(adapter.script.contains("columns"));
    }

    #[test]
    fn should_convert_imported_yaml_navigate_template_to_lime_url_template() {
        let adapter = compile_imported_yaml_adapter(
            r#"
site: yahoo-finance
name: quote
description: Yahoo quote
domain: finance.yahoo.com
args:
  symbol:
    type: str
    description: 股票代码
pipeline:
  - navigate: https://finance.yahoo.com/quote/${{ args.symbol | urlencode }}/
  - evaluate: |
      (() => ({ title: document.title }))()
"#,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: None,
            },
        )
        .expect("adapter should compile");

        assert!(matches!(
            adapter.entry,
            CompiledImportedSiteAdapterEntry::UrlTemplate { ref template }
                if template == "https://finance.yahoo.com/quote/{{symbol|urlencode}}/"
        ));
    }

    #[test]
    fn should_reject_unsupported_imported_yaml_pipeline_step() {
        let error = compile_imported_yaml_adapter(
            r#"
site: xiaohongshu
name: feed
description: 小红书 feed
domain: www.xiaohongshu.com
pipeline:
  - navigate: https://www.xiaohongshu.com/explore
  - tap:
      store: feed
      action: fetchFeeds
"#,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: None,
            },
        )
        .expect_err("tap should be rejected");

        assert!(error.contains("tap"));
    }

    #[test]
    fn should_compile_imported_yaml_bundle_into_multiple_adapters() {
        let adapters = compile_imported_yaml_adapter_bundle(
            r#"
site: reddit
name: hot
description: Reddit 热门
domain: www.reddit.com
pipeline:
  - navigate: https://www.reddit.com
  - evaluate: |
      (() => [])()
---
site: zhihu
name: hot
description: 知乎热榜
domain: www.zhihu.com
pipeline:
  - navigate: https://www.zhihu.com
  - evaluate: |
      (() => [])()
"#,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: Some("bundle-test".to_string()),
            },
        )
        .expect("bundle should compile");

        assert_eq!(adapters.len(), 2);
        assert_eq!(adapters[0].name, "reddit/hot");
        assert_eq!(adapters[1].name, "zhihu/hot");
        assert_eq!(adapters[0].source_version.as_deref(), Some("bundle-test"));
        assert_eq!(adapters[1].source_version.as_deref(), Some("bundle-test"));
    }

    #[test]
    fn should_compile_real_world_imported_yaml_bundle_fixture() {
        let adapters = compile_imported_yaml_adapter_bundle(
            REAL_WORLD_IMPORTED_ADAPTER_BUNDLE_FIXTURE,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: Some("fixture-real-world".to_string()),
            },
        )
        .expect("real world bundle should compile");

        let adapter_names = adapters
            .iter()
            .map(|adapter| adapter.name.as_str())
            .collect::<Vec<_>>();
        assert_eq!(
            adapter_names,
            vec![
                "zhihu/hot",
                "zhihu/search",
                "linux-do/hot",
                "yahoo-finance/quote",
                "smzdm/search",
            ]
        );

        let yahoo_quote = adapters
            .iter()
            .find(|adapter| adapter.name == "yahoo-finance/quote")
            .expect("yahoo-finance/quote should exist");
        assert_eq!(
            yahoo_quote.args.first().map(|arg| arg.arg_type.as_str()),
            Some("string")
        );
        assert_eq!(
            yahoo_quote.source_version.as_deref(),
            Some("fixture-real-world")
        );
        assert!(matches!(
            yahoo_quote.entry,
            CompiledImportedSiteAdapterEntry::UrlTemplate { ref template }
                if template == "https://finance.yahoo.com/quote/{{symbol|urlencode}}/"
        ));
        assert_eq!(
            yahoo_quote.auth_hint.as_deref(),
            Some("该适配器依赖已有浏览器上下文，必要时请先在目标站点完成登录。")
        );

        let smzdm_search = adapters
            .iter()
            .find(|adapter| adapter.name == "smzdm/search")
            .expect("smzdm/search should exist");
        assert!(matches!(
            smzdm_search.entry,
            CompiledImportedSiteAdapterEntry::UrlTemplate { ref template }
                if template == "https://search.smzdm.com/?c=home&s={{query|urlencode}}&v=b"
        ));
        assert!(smzdm_search.capabilities.contains(&"search".to_string()));
    }

    #[test]
    fn should_persist_compiled_imported_catalog() {
        let temp_dir = tempdir().expect("temp dir should exist");
        let adapter = compile_imported_yaml_adapter(
            r#"
site: zhihu
name: hot
description: 知乎热榜
domain: www.zhihu.com
args:
  limit:
    type: int
    default: 5
    description: 数量
pipeline:
  - navigate: https://www.zhihu.com
  - evaluate: |
      (() => ([{ title: "A" }, { title: "B" }]))()
  - map:
      title: ${{ item.title }}
  - limit: ${{ args.limit }}
"#,
            &ImportedYamlCompileOptions {
                read_only: true,
                source_version: Some("imported-test".to_string()),
            },
        )
        .expect("adapter should compile");

        let result = persist_compiled_imported_adapters(
            temp_dir.path(),
            &[adapter],
            Some("imported-catalog-test".to_string()),
        )
        .expect("catalog should persist");

        assert_eq!(result.adapter_count, 1);
        let index_content = fs::read_to_string(temp_dir.path().join("index.json"))
            .expect("index.json should exist");
        assert!(index_content.contains("\"catalog_version\": \"imported-catalog-test\""));
        assert!(index_content.contains("\"name\": \"zhihu/hot\""));
        let script_content = fs::read_to_string(temp_dir.path().join("scripts/zhihu-hot.js"))
            .expect("script should exist");
        assert!(script_content.contains("__lime"));
    }
}

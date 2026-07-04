use scraper::{Html, Selector};

const DEFAULT_WEB_FETCH_MAX_CHARS: usize = 20_000;
const DEFAULT_DYNAMIC_FILTER_MAX_CHARS: usize = 12_000;
const DEFAULT_DYNAMIC_FILTER_MAX_CHUNKS: usize = 8;

#[derive(Debug, Clone, Copy)]
pub(crate) struct WebFetchContentOptions<'a> {
    pub(crate) prompt: &'a str,
    pub(crate) focus_query: Option<&'a str>,
    pub(crate) dynamic_filter: bool,
    pub(crate) max_chars: Option<usize>,
    pub(crate) max_chunks: Option<usize>,
}

/// HTML 转 Markdown 风格纯文本。
pub(crate) fn html_to_markdown(html: &str) -> String {
    let cleaned_html = remove_non_content_html_blocks(html);
    let cleaned_html = remove_html_noise_attributes(&cleaned_html);
    html_to_text(&cleaned_html)
}

pub(crate) fn prepare_response_content(
    content: &str,
    options: WebFetchContentOptions<'_>,
) -> (String, bool) {
    let default_max_chars = if options.dynamic_filter || options.focus_query.is_some() {
        DEFAULT_DYNAMIC_FILTER_MAX_CHARS
    } else {
        DEFAULT_WEB_FETCH_MAX_CHARS
    };
    let max_chars = options.max_chars.unwrap_or(default_max_chars);
    let max_chars = max_chars.clamp(500, DEFAULT_WEB_FETCH_MAX_CHARS);

    let query = options
        .focus_query
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or(options.prompt);

    let max_chunks = options
        .max_chunks
        .unwrap_or(DEFAULT_DYNAMIC_FILTER_MAX_CHUNKS);
    if let Some(filtered) = dynamic_filter_content(content, query, max_chars, max_chunks) {
        return (filtered, true);
    }

    (truncate_chars(content, max_chars), false)
}

fn remove_non_content_html_blocks(html: &str) -> String {
    let block_re = regex::Regex::new(
        r"(?is)<(?:script|style|noscript|iframe|object|embed|svg|head|template)\b[^>]*>.*?</(?:script|style|noscript|iframe|object|embed|svg|head|template)>",
    )
    .unwrap();
    let standalone_re = regex::Regex::new(r"(?is)<(?:meta|link|base)\b[^>]*(?:/?>)").unwrap();
    let comment_re = regex::Regex::new(r"(?is)<!--.*?-->").unwrap();
    let without_blocks = block_re.replace_all(html, " ");
    let without_standalone = standalone_re.replace_all(without_blocks.as_ref(), " ");
    comment_re
        .replace_all(without_standalone.as_ref(), " ")
        .into_owned()
}

fn remove_html_noise_attributes(html: &str) -> String {
    let attr_re = regex::Regex::new(
        r#"(?is)\s(?:style|class|id|role|tabindex|aria-[\w:-]+|data-[\w:-]+|on[a-z][\w:-]*)\s*=\s*(?:"[^"]*"|'[^']*'|[^\s"'=<>`]+)"#,
    )
    .unwrap();
    attr_re.replace_all(html, " ").into_owned()
}

/// HTML 转纯文本。
fn html_to_text(html: &str) -> String {
    let document = Html::parse_document(html);
    let body_selector = Selector::parse("body").unwrap();
    let mut text_parts = document
        .select(&body_selector)
        .flat_map(|body| body.text())
        .map(str::trim)
        .filter(|text| !text.is_empty())
        .collect::<Vec<_>>();

    if text_parts.is_empty() {
        text_parts = document
            .root_element()
            .text()
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .collect::<Vec<_>>();
    }

    let re_whitespace = regex::Regex::new(r"\s+").unwrap();
    let joined = text_parts.join(" ");
    let cleaned = re_whitespace.replace_all(&joined, " ");

    cleaned
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#x27;", "'")
        .trim()
        .to_string()
}

fn truncate_chars(text: &str, max_chars: usize) -> String {
    if text.chars().count() <= max_chars {
        return text.to_string();
    }
    let truncated = text.chars().take(max_chars).collect::<String>();
    format!("{}...\n\n[内容已截断]", truncated)
}

fn split_into_chunks(content: &str, max_chunk_chars: usize) -> Vec<String> {
    let mut chunks = Vec::new();

    for paragraph in content.split("\n\n") {
        let paragraph = paragraph.trim();
        if paragraph.is_empty() {
            continue;
        }

        if paragraph.chars().count() <= max_chunk_chars {
            chunks.push(paragraph.to_string());
            continue;
        }

        let mut current = String::new();
        for ch in paragraph.chars() {
            current.push(ch);
            if current.chars().count() >= max_chunk_chars {
                chunks.push(current.clone());
                current.clear();
            }
        }
        if !current.is_empty() {
            chunks.push(current);
        }
    }

    if chunks.is_empty() {
        chunks.push(content.to_string());
    }

    chunks
}

fn dynamic_filter_content(
    content: &str,
    query: &str,
    max_chars: usize,
    max_chunks: usize,
) -> Option<String> {
    let terms: Vec<String> = query
        .split_whitespace()
        .map(|term| term.trim().to_lowercase())
        .filter(|term| term.len() >= 2)
        .collect();

    if terms.is_empty() {
        return None;
    }

    let chunks = split_into_chunks(content, 1_500);
    let mut scored: Vec<(usize, usize)> = chunks
        .iter()
        .enumerate()
        .filter_map(|(idx, chunk)| {
            let lower = chunk.to_lowercase();
            let score = terms
                .iter()
                .map(|term| lower.matches(term).count())
                .sum::<usize>();
            (score > 0).then_some((idx, score))
        })
        .collect();

    if scored.is_empty() {
        return None;
    }

    scored.sort_by(|a, b| b.1.cmp(&a.1).then_with(|| a.0.cmp(&b.0)));
    let mut selected_indices: Vec<usize> = scored
        .into_iter()
        .take(max_chunks.max(1))
        .map(|(idx, _)| idx)
        .collect();
    selected_indices.sort_unstable();

    let selected = selected_indices
        .into_iter()
        .filter_map(|idx| chunks.get(idx))
        .cloned()
        .collect::<Vec<String>>()
        .join("\n\n");

    Some(truncate_chars(&selected, max_chars))
}

#[cfg(test)]
mod tests {
    use super::{html_to_markdown, prepare_response_content, WebFetchContentOptions};

    #[test]
    fn dynamic_filter_content_prefers_relevant_chunks() {
        let content = "Football match report and scores.\n\nRust ownership and borrow checker explanation.\n\nTravel tips and hotel recommendations.";
        let (filtered, used_dynamic_filter) = prepare_response_content(
            content,
            WebFetchContentOptions {
                prompt: "总结 Rust 所有权",
                focus_query: Some("Rust ownership borrow checker"),
                dynamic_filter: true,
                max_chars: Some(3000),
                max_chunks: Some(2),
            },
        );

        assert!(used_dynamic_filter);
        assert!(filtered.contains("Rust ownership"));
        assert!(!filtered.contains("Football match report"));
    }

    #[test]
    fn default_mode_prefers_relevant_chunks() {
        let content = "Football match report and scores.\n\nRust ownership and borrow checker explanation.\n\nTravel tips and hotel recommendations.";
        let (result, used_dynamic_filter) = prepare_response_content(
            content,
            WebFetchContentOptions {
                prompt: "总结 Rust 所有权",
                focus_query: None,
                dynamic_filter: false,
                max_chars: Some(3000),
                max_chunks: None,
            },
        );

        assert!(used_dynamic_filter);
        assert!(result.contains("Rust ownership"));
        assert!(!result.contains("Football match report"));
    }

    #[test]
    fn html_text_removes_scripts_and_styles() {
        let html = r#"
            <html>
              <head>
                <style>.Modal-modalBackground{background:#000}</style>
                <script>alert('x')</script>
                <meta name="description" content="noise">
              </head>
              <body>Hello <b>world</b></body>
            </html>
        "#;

        let text = html_to_markdown(html);
        assert_eq!(text, "Hello world");
        assert!(!text.contains("Modal-modalBackground"));
        assert!(!text.contains("alert"));
    }

    #[test]
    fn html_text_removes_inline_style_attribute_noise() {
        let html = r#"
            <html>
              <body>
                <main>
                  <h1 class="wp-block-heading"
                      style="mask-image:url('data:image/svg+xml;utf8,<svg></svg>');mask-mode:alpha;-webkit-mask-position:center">
                    Promoting Advanced Artificial Intelligence Innovation and Security
                  </h1>
                  <p data-wp-interactive="core/image" aria-label="Share Icon">Confirmed policy detail.</p>
                </main>
              </body>
            </html>
        "#;

        let text = html_to_markdown(html);
        assert!(text.contains("Promoting Advanced Artificial Intelligence Innovation and Security"));
        assert!(text.contains("Confirmed policy detail."));
        assert!(!text.contains("mask-image"));
        assert!(!text.contains("wp-block"));
        assert!(!text.contains("data:image"));
        assert!(!text.contains("aria-label"));
    }
}

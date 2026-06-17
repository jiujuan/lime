//! 文档预览抽取工具。

use std::fs;
use std::io::{self, Cursor, Read};
use std::path::Path;

use zip::ZipArchive;

const DOCX_TEXT_ENTRIES: &[&str] = &[
    "word/document.xml",
    "word/footnotes.xml",
    "word/endnotes.xml",
    "word/comments.xml",
];

const DOCX_TEXT_PREFIXES: &[&str] = &["word/header", "word/footer"];

#[derive(Debug)]
pub enum DocumentPreviewError {
    Io(io::Error),
    Zip(zip::result::ZipError),
    UnsupportedFormat,
    MissingDocumentXml,
    EmptyText,
}

impl std::fmt::Display for DocumentPreviewError {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Io(error) => write!(formatter, "读取文档失败: {error}"),
            Self::Zip(error) => write!(formatter, "解析 DOCX 压缩包失败: {error}"),
            Self::UnsupportedFormat => write!(formatter, "不支持的文档格式"),
            Self::MissingDocumentXml => write!(formatter, "DOCX 缺少 word/document.xml"),
            Self::EmptyText => write!(formatter, "DOCX 未抽取到可预览文本"),
        }
    }
}

impl std::error::Error for DocumentPreviewError {}

impl From<io::Error> for DocumentPreviewError {
    fn from(error: io::Error) -> Self {
        Self::Io(error)
    }
}

impl From<zip::result::ZipError> for DocumentPreviewError {
    fn from(error: zip::result::ZipError) -> Self {
        Self::Zip(error)
    }
}

pub fn is_supported_document(path: &Path) -> bool {
    extension_is(path, "docx")
}

pub fn extract_document_text_from_path(
    path: &Path,
    max_size: Option<usize>,
) -> Result<String, DocumentPreviewError> {
    if !extension_is(path, "docx") {
        return Err(DocumentPreviewError::UnsupportedFormat);
    }

    let bytes = fs::read(path)?;
    extract_docx_text(&bytes, max_size)
}

pub fn extract_docx_text(
    bytes: &[u8],
    max_size: Option<usize>,
) -> Result<String, DocumentPreviewError> {
    let cursor = Cursor::new(bytes);
    let mut archive = ZipArchive::new(cursor)?;
    let mut fragments = Vec::new();
    let mut saw_document_xml = false;

    for index in 0..archive.len() {
        let mut file = archive.by_index(index)?;
        let name = file.name().to_string();
        if !is_docx_text_entry(&name) {
            continue;
        }
        if name == "word/document.xml" {
            saw_document_xml = true;
        }

        let mut xml = String::new();
        file.read_to_string(&mut xml)?;
        let text = extract_text_from_word_xml(&xml);
        if !text.trim().is_empty() {
            fragments.push(text);
        }
    }

    if !saw_document_xml {
        return Err(DocumentPreviewError::MissingDocumentXml);
    }

    let text = normalize_plain_text(&fragments.join("\n\n"));
    if text.is_empty() {
        return Err(DocumentPreviewError::EmptyText);
    }

    Ok(truncate_to_char_boundary(&text, max_size.unwrap_or(usize::MAX)).to_string())
}

fn extension_is(path: &Path, expected: &str) -> bool {
    path.extension()
        .and_then(|extension| extension.to_str())
        .map(|extension| extension.eq_ignore_ascii_case(expected))
        .unwrap_or(false)
}

fn is_docx_text_entry(name: &str) -> bool {
    DOCX_TEXT_ENTRIES.contains(&name)
        || DOCX_TEXT_PREFIXES
            .iter()
            .any(|prefix| name.starts_with(prefix) && name.ends_with(".xml"))
}

fn extract_text_from_word_xml(xml: &str) -> String {
    let mut output = String::new();
    let mut text_node = String::new();
    let mut in_text = false;
    let mut in_tag = false;
    let mut tag = String::new();
    let mut entity = String::new();
    let mut in_entity = false;

    for character in xml.chars() {
        if in_tag {
            if character == '>' {
                handle_docx_tag(&tag, &mut output, &mut text_node, &mut in_text);
                tag.clear();
                in_tag = false;
            } else {
                tag.push(character);
            }
            continue;
        }

        if character == '<' {
            if in_text {
                output.push_str(&text_node);
                text_node.clear();
            }
            in_tag = true;
            continue;
        }

        if !in_text {
            continue;
        }

        if in_entity {
            if character == ';' {
                text_node.push_str(&decode_xml_entity(&entity));
                entity.clear();
                in_entity = false;
            } else {
                entity.push(character);
            }
            continue;
        }

        if character == '&' {
            in_entity = true;
        } else {
            text_node.push(character);
        }
    }

    if in_text {
        output.push_str(&text_node);
    }

    normalize_plain_text(&output)
}

fn handle_docx_tag(tag: &str, output: &mut String, text_node: &mut String, in_text: &mut bool) {
    let trimmed = tag.trim();
    let name = trimmed
        .trim_start_matches('/')
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_end_matches('/');

    match name {
        "w:t" => {
            if trimmed.starts_with('/') {
                output.push_str(text_node);
                text_node.clear();
                *in_text = false;
            } else {
                *in_text = true;
            }
        }
        "w:tab" => output.push('\t'),
        "w:br" | "w:cr" => output.push('\n'),
        "w:p" if trimmed.starts_with('/') => {
            trim_trailing_inline_space(output);
            output.push('\n');
        }
        "w:tr" if trimmed.starts_with('/') => output.push('\n'),
        "w:tc" if trimmed.starts_with('/') => output.push('\t'),
        _ => {}
    }
}

fn trim_trailing_inline_space(output: &mut String) {
    while matches!(output.chars().last(), Some(' ' | '\t')) {
        output.pop();
    }
}

fn decode_xml_entity(entity: &str) -> String {
    match entity {
        "amp" => "&".to_string(),
        "lt" => "<".to_string(),
        "gt" => ">".to_string(),
        "quot" => "\"".to_string(),
        "apos" => "'".to_string(),
        value if value.starts_with("#x") => u32::from_str_radix(&value[2..], 16)
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_else(|| format!("&{entity};")),
        value if value.starts_with('#') => value[1..]
            .parse::<u32>()
            .ok()
            .and_then(char::from_u32)
            .map(|character| character.to_string())
            .unwrap_or_else(|| format!("&{entity};")),
        _ => format!("&{entity};"),
    }
}

fn normalize_plain_text(input: &str) -> String {
    let mut normalized_lines = Vec::new();
    let mut previous_blank = true;

    for line in input.lines() {
        let mut normalized_line = String::new();
        let mut previous_space = false;

        for character in line.chars() {
            if character.is_whitespace() && character != '\t' {
                if !previous_space {
                    normalized_line.push(' ');
                }
                previous_space = true;
            } else {
                normalized_line.push(character);
                previous_space = false;
            }
        }

        let line = normalized_line.trim();
        if line.is_empty() {
            if !previous_blank {
                normalized_lines.push(String::new());
            }
            previous_blank = true;
        } else {
            normalized_lines.push(line.to_string());
            previous_blank = false;
        }
    }

    while normalized_lines
        .last()
        .map(|line| line.is_empty())
        .unwrap_or(false)
    {
        normalized_lines.pop();
    }

    normalized_lines.join("\n")
}

fn truncate_to_char_boundary(input: &str, max_size: usize) -> &str {
    if input.len() <= max_size {
        return input;
    }

    let mut end = max_size;
    while end > 0 && !input.is_char_boundary(end) {
        end -= 1;
    }
    &input[..end]
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    fn build_docx(entries: &[(&str, &str)]) -> Vec<u8> {
        let mut buffer = Cursor::new(Vec::new());
        {
            let mut writer = zip::ZipWriter::new(&mut buffer);
            let options = zip::write::FileOptions::default();
            for (name, content) in entries {
                writer.start_file(*name, options).expect("应创建 zip entry");
                writer
                    .write_all(content.as_bytes())
                    .expect("应写入 zip entry");
            }
            writer.finish().expect("应完成 zip");
        }
        buffer.into_inner()
    }

    #[test]
    fn extracts_docx_word_text_without_zip_noise() {
        let bytes = build_docx(&[(
            "word/document.xml",
            r#"<w:document><w:body><w:p><w:r><w:t>第一段 &amp; Alpha</w:t></w:r></w:p><w:p><w:r><w:t>第二段</w:t></w:r></w:p></w:body></w:document>"#,
        )]);

        let text = extract_docx_text(&bytes, None).expect("应抽取 docx 文本");

        assert!(text.contains("第一段 & Alpha"));
        assert!(text.contains("第二段"));
        assert!(!text.contains("PK"));
        assert!(!text.contains("word/document.xml"));
    }

    #[test]
    fn extracts_docx_tabs_breaks_and_header_footer() {
        let bytes = build_docx(&[
            (
                "word/header1.xml",
                r#"<w:hdr><w:p><w:r><w:t>页眉</w:t></w:r></w:p></w:hdr>"#,
            ),
            (
                "word/document.xml",
                r#"<w:document><w:body><w:p><w:r><w:t>A</w:t></w:r><w:tab/><w:r><w:t>B</w:t></w:r><w:br/><w:r><w:t>C</w:t></w:r></w:p></w:body></w:document>"#,
            ),
            (
                "word/footer1.xml",
                r#"<w:ftr><w:p><w:r><w:t>页脚</w:t></w:r></w:p></w:ftr>"#,
            ),
        ]);

        let text = extract_docx_text(&bytes, None).expect("应抽取 docx 文本");

        assert!(text.contains("页眉"));
        assert!(text.contains("A\tB\nC"));
        assert!(text.contains("页脚"));
    }

    #[test]
    fn truncates_at_utf8_boundary() {
        let bytes = build_docx(&[(
            "word/document.xml",
            r#"<w:document><w:body><w:p><w:r><w:t>你好世界</w:t></w:r></w:p></w:body></w:document>"#,
        )]);

        let text = extract_docx_text(&bytes, Some(5)).expect("应抽取 docx 文本");

        assert_eq!(text, "你");
    }
}

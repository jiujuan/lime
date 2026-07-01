use base64::{engine::general_purpose::STANDARD as BASE64_STANDARD, Engine as _};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder, ImageFormat};
use serde_json::{json, Map, Value};

pub(super) const PNG_DATA_URL_MIME: &str = "image/png";
const CHROMA_KEY_DISTANCE_THRESHOLD: i16 = 32;
const IMAGE_TASK_POSTPROCESS_MAX_IMAGE_BYTES: u64 = 20 * 1024 * 1024;

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct PreparedImageTaskPostprocessPlan {
    pub(super) strategy: String,
    pub(super) chroma_key_color: String,
    pub(super) document_id: Option<String>,
    pub(super) layer_id: Option<String>,
    pub(super) asset_id: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(super) struct ImagePostprocessOutcome {
    pub(super) status: &'static str,
    pub(super) reason: Option<String>,
    pub(super) output_url: Option<String>,
    pub(super) removed_pixel_count: Option<u64>,
    pub(super) total_pixel_count: Option<u64>,
    pub(super) output_mime: Option<&'static str>,
    pub(super) input_source: Option<&'static str>,
}

impl ImagePostprocessOutcome {
    fn succeeded(
        output_url: String,
        removed_pixel_count: u64,
        total_pixel_count: u64,
        input_source: &'static str,
    ) -> Self {
        Self {
            status: "succeeded",
            reason: None,
            output_url: Some(output_url),
            removed_pixel_count: Some(removed_pixel_count),
            total_pixel_count: Some(total_pixel_count),
            output_mime: Some(PNG_DATA_URL_MIME),
            input_source: Some(input_source),
        }
    }

    fn skipped(reason: impl Into<String>) -> Self {
        Self {
            status: "skipped_unsupported_source",
            reason: Some(reason.into()),
            output_url: None,
            removed_pixel_count: None,
            total_pixel_count: None,
            output_mime: None,
            input_source: None,
        }
    }

    pub(super) fn failed(reason: impl Into<String>) -> Self {
        Self {
            status: "failed",
            reason: Some(reason.into()),
            output_url: None,
            removed_pixel_count: None,
            total_pixel_count: None,
            output_mime: None,
            input_source: None,
        }
    }
}

pub(super) fn read_layered_design_chroma_key_postprocess_plan(
    payload: &Value,
) -> Option<PreparedImageTaskPostprocessPlan> {
    let runtime_contract = read_object_field(payload, &["runtime_contract", "runtimeContract"])?;
    let layered_design = read_object_field(runtime_contract, &["layered_design", "layeredDesign"])?;
    let alpha = read_object_field(layered_design, &["alpha"])?;
    let strategy = read_nested_string(alpha, &["strategy"])?;
    if strategy != "chroma_key_postprocess" {
        return None;
    }

    let postprocess_required =
        read_nested_bool(alpha, &["postprocess_required", "postprocessRequired"]).unwrap_or(true);
    if !postprocess_required {
        return None;
    }

    Some(PreparedImageTaskPostprocessPlan {
        strategy,
        chroma_key_color: read_nested_string(alpha, &["chroma_key_color", "chromaKeyColor"])
            .unwrap_or_else(|| "#00ff00".to_string()),
        document_id: read_nested_string(layered_design, &["document_id", "documentId"]),
        layer_id: read_nested_string(layered_design, &["layer_id", "layerId"]),
        asset_id: read_nested_string(layered_design, &["asset_id", "assetId"]),
    })
}

pub(super) fn apply_image_postprocess_prompt_hint(
    prompt: &str,
    plan: Option<&PreparedImageTaskPostprocessPlan>,
) -> String {
    let Some(plan) = plan else {
        return prompt.to_string();
    };

    format!(
        "{prompt}\n\nLayered design alpha requirement: create the foreground subject on a flat chroma-key background ({}) so Lime can remove that key color after generation; avoid using that key color inside the subject.",
        plan.chroma_key_color
    )
}

pub(super) fn build_image_postprocess_value(
    plan: &PreparedImageTaskPostprocessPlan,
    outcome: Option<&ImagePostprocessOutcome>,
) -> Value {
    let mut record = build_image_postprocess_record(
        plan,
        outcome
            .map(|item| item.status)
            .unwrap_or("pending_chroma_key_processor"),
    );
    if let Some(outcome) = outcome {
        if let Some(reason) = outcome.reason.as_ref() {
            record.insert("reason".to_string(), json!(reason));
        }
        if let Some(removed_pixel_count) = outcome.removed_pixel_count {
            record.insert(
                "removed_pixel_count".to_string(),
                json!(removed_pixel_count),
            );
        }
        if let Some(total_pixel_count) = outcome.total_pixel_count {
            record.insert("total_pixel_count".to_string(), json!(total_pixel_count));
        }
        if let Some(output_mime) = outcome.output_mime {
            record.insert("output_mime".to_string(), json!(output_mime));
            record.insert(
                "transparent".to_string(),
                json!(outcome.status == "succeeded"),
            );
        }
        if let Some(input_source) = outcome.input_source {
            record.insert("input_source".to_string(), json!(input_source));
        }
    }
    Value::Object(record)
}

pub(super) fn build_image_result_postprocess_value(
    plan: &PreparedImageTaskPostprocessPlan,
    requested_count: u32,
    images: &[Value],
) -> Value {
    let mut succeeded_count = 0u64;
    let mut skipped_count = 0u64;
    let mut failed_count = 0u64;
    let mut removed_pixel_count = 0u64;
    let mut total_pixel_count = 0u64;

    for postprocess in images
        .iter()
        .filter_map(|image| image.get("postprocess").and_then(Value::as_object))
    {
        match postprocess.get("status").and_then(Value::as_str) {
            Some("succeeded") => succeeded_count += 1,
            Some("skipped_unsupported_source") => skipped_count += 1,
            Some("failed") => failed_count += 1,
            _ => {}
        }
        removed_pixel_count += read_postprocess_u64(postprocess, "removed_pixel_count");
        total_pixel_count += read_postprocess_u64(postprocess, "total_pixel_count");
    }

    let processed_count = succeeded_count + skipped_count + failed_count;
    let status = if processed_count == 0 {
        "pending_chroma_key_processor"
    } else if failed_count > 0 && succeeded_count == 0 && skipped_count == 0 {
        "failed"
    } else if failed_count > 0 {
        "completed_with_postprocess_warnings"
    } else if skipped_count > 0 && succeeded_count == 0 {
        "skipped_unsupported_source"
    } else if skipped_count > 0 {
        "completed_with_skips"
    } else {
        "succeeded"
    };

    let mut record = build_image_postprocess_record(plan, status);
    record.insert("requested_count".to_string(), json!(requested_count));
    record.insert("processed_count".to_string(), json!(processed_count));
    record.insert("succeeded_count".to_string(), json!(succeeded_count));
    record.insert("skipped_count".to_string(), json!(skipped_count));
    record.insert("failed_count".to_string(), json!(failed_count));
    if removed_pixel_count > 0 || total_pixel_count > 0 {
        record.insert(
            "removed_pixel_count".to_string(),
            json!(removed_pixel_count),
        );
        record.insert("total_pixel_count".to_string(), json!(total_pixel_count));
        record.insert("output_mime".to_string(), json!(PNG_DATA_URL_MIME));
        record.insert("transparent".to_string(), json!(succeeded_count > 0));
    }
    Value::Object(record)
}

#[cfg(test)]
pub(super) fn infer_sync_image_postprocess_outcome(
    image: &Value,
    plan: &PreparedImageTaskPostprocessPlan,
) -> ImagePostprocessOutcome {
    image
        .get("url")
        .and_then(Value::as_str)
        .map(|image_url| apply_chroma_key_postprocess_to_data_url(image_url, plan))
        .unwrap_or_else(|| ImagePostprocessOutcome::failed("图片结果缺少 url，无法后处理"))
}

pub(super) async fn infer_image_postprocess_outcome(
    client: &reqwest::Client,
    image: &Value,
    plan: &PreparedImageTaskPostprocessPlan,
) -> ImagePostprocessOutcome {
    let Some(image_url) = image.get("url").and_then(Value::as_str) else {
        return ImagePostprocessOutcome::failed("图片结果缺少 url，无法后处理");
    };

    apply_chroma_key_postprocess_to_image_url(client, image_url, plan).await
}

fn read_object_field<'a>(value: &'a Value, keys: &[&str]) -> Option<&'a Value> {
    keys.iter().find_map(|key| value.get(*key))
}

fn read_nested_string(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|item| !item.is_empty())
            .map(ToOwned::to_owned)
    })
}

fn read_nested_bool(value: &Value, keys: &[&str]) -> Option<bool> {
    keys.iter()
        .find_map(|key| value.get(*key).and_then(Value::as_bool))
}

fn parse_hex_rgb(value: &str) -> Option<[u8; 3]> {
    let hex = value.trim().trim_start_matches('#');
    if hex.len() == 3 {
        let mut color = [0u8; 3];
        for (index, item) in hex.as_bytes().iter().enumerate() {
            let digit = (*item as char).to_digit(16)? as u8;
            color[index] = digit * 17;
        }
        return Some(color);
    }

    if hex.len() != 6 {
        return None;
    }

    Some([
        u8::from_str_radix(&hex[0..2], 16).ok()?,
        u8::from_str_radix(&hex[2..4], 16).ok()?,
        u8::from_str_radix(&hex[4..6], 16).ok()?,
    ])
}

pub(super) fn decode_png_data_url_bytes(image_url: &str) -> Result<Option<Vec<u8>>, String> {
    let trimmed = image_url.trim();
    let Some((header, payload)) = trimmed.split_once(',') else {
        return Ok(None);
    };
    let header = header.trim().to_ascii_lowercase();
    if !header.starts_with("data:") {
        return Ok(None);
    }
    if !header.starts_with("data:image/png")
        || !header.split(';').any(|part| part.trim() == "base64")
    {
        return Ok(None);
    }

    BASE64_STANDARD
        .decode(payload.trim())
        .map(Some)
        .map_err(|error| format!("无法解码 PNG data URL: {error}"))
}

pub(super) fn encode_png_data_url(bytes: &[u8]) -> String {
    format!(
        "data:{PNG_DATA_URL_MIME};base64,{}",
        BASE64_STANDARD.encode(bytes)
    )
}

fn apply_chroma_key_postprocess_to_png_bytes(
    source_bytes: &[u8],
    plan: &PreparedImageTaskPostprocessPlan,
    input_source: &'static str,
) -> ImagePostprocessOutcome {
    let Some(chroma_key) = parse_hex_rgb(&plan.chroma_key_color) else {
        return ImagePostprocessOutcome::failed(format!(
            "无效 chroma-key 颜色: {}",
            plan.chroma_key_color
        ));
    };

    let decoded = match image::load_from_memory_with_format(source_bytes, ImageFormat::Png) {
        Ok(decoded) => decoded,
        Err(error) => {
            return ImagePostprocessOutcome::failed(format!("无法读取 PNG 像素: {error}"));
        }
    };

    let mut rgba = decoded.to_rgba8();
    let (width, height) = rgba.dimensions();
    let threshold_squared =
        i32::from(CHROMA_KEY_DISTANCE_THRESHOLD) * i32::from(CHROMA_KEY_DISTANCE_THRESHOLD);
    let mut removed_pixel_count = 0u64;
    for pixel in rgba.pixels_mut() {
        let red_delta = i16::from(pixel[0]) - i16::from(chroma_key[0]);
        let green_delta = i16::from(pixel[1]) - i16::from(chroma_key[1]);
        let blue_delta = i16::from(pixel[2]) - i16::from(chroma_key[2]);
        let distance_squared = i32::from(red_delta) * i32::from(red_delta)
            + i32::from(green_delta) * i32::from(green_delta)
            + i32::from(blue_delta) * i32::from(blue_delta);
        if distance_squared <= threshold_squared {
            pixel[3] = 0;
            removed_pixel_count += 1;
        }
    }

    let mut output_bytes = Vec::new();
    let encoder = PngEncoder::new(&mut output_bytes);
    if let Err(error) = encoder.write_image(rgba.as_raw(), width, height, ColorType::Rgba8.into()) {
        return ImagePostprocessOutcome::failed(format!("无法写出透明 PNG: {error}"));
    }

    ImagePostprocessOutcome::succeeded(
        encode_png_data_url(&output_bytes),
        removed_pixel_count,
        u64::from(width) * u64::from(height),
        input_source,
    )
}

#[cfg(test)]
fn apply_chroma_key_postprocess_to_data_url(
    image_url: &str,
    plan: &PreparedImageTaskPostprocessPlan,
) -> ImagePostprocessOutcome {
    match decode_png_data_url_bytes(image_url) {
        Ok(Some(bytes)) => apply_chroma_key_postprocess_to_png_bytes(&bytes, plan, "data_url"),
        Ok(None) => ImagePostprocessOutcome::skipped("当前源图不是 PNG data URL"),
        Err(message) => ImagePostprocessOutcome::failed(message),
    }
}

async fn download_remote_image_bytes_for_postprocess(
    client: &reqwest::Client,
    image_url: &str,
) -> Result<Vec<u8>, ImagePostprocessOutcome> {
    let parsed_url = reqwest::Url::parse(image_url)
        .map_err(|_| ImagePostprocessOutcome::skipped("当前源图不是可下载的 http/https URL"))?;
    if !matches!(parsed_url.scheme(), "http" | "https") {
        return Err(ImagePostprocessOutcome::skipped(
            "当前仅支持 http/https 远程图片后处理",
        ));
    }

    let response =
        client.get(parsed_url).send().await.map_err(|error| {
            ImagePostprocessOutcome::failed(format!("下载远程图片失败: {error}"))
        })?;
    let status = response.status();
    if !status.is_success() {
        return Err(ImagePostprocessOutcome::failed(format!(
            "下载远程图片返回非成功状态: {status}"
        )));
    }
    if response
        .content_length()
        .is_some_and(|length| length > IMAGE_TASK_POSTPROCESS_MAX_IMAGE_BYTES)
    {
        return Err(ImagePostprocessOutcome::failed(format!(
            "远程图片超过后处理大小上限: {} bytes",
            IMAGE_TASK_POSTPROCESS_MAX_IMAGE_BYTES
        )));
    }

    let bytes = response
        .bytes()
        .await
        .map_err(|error| ImagePostprocessOutcome::failed(format!("读取远程图片失败: {error}")))?;
    if bytes.len() as u64 > IMAGE_TASK_POSTPROCESS_MAX_IMAGE_BYTES {
        return Err(ImagePostprocessOutcome::failed(format!(
            "远程图片超过后处理大小上限: {} bytes",
            IMAGE_TASK_POSTPROCESS_MAX_IMAGE_BYTES
        )));
    }

    Ok(bytes.to_vec())
}

async fn apply_chroma_key_postprocess_to_image_url(
    client: &reqwest::Client,
    image_url: &str,
    plan: &PreparedImageTaskPostprocessPlan,
) -> ImagePostprocessOutcome {
    match decode_png_data_url_bytes(image_url) {
        Ok(Some(bytes)) => {
            return apply_chroma_key_postprocess_to_png_bytes(&bytes, plan, "data_url");
        }
        Err(message) => return ImagePostprocessOutcome::failed(message),
        Ok(None) => {}
    }

    match download_remote_image_bytes_for_postprocess(client, image_url).await {
        Ok(bytes) => apply_chroma_key_postprocess_to_png_bytes(&bytes, plan, "remote_url"),
        Err(outcome) => outcome,
    }
}

fn build_image_postprocess_record(
    plan: &PreparedImageTaskPostprocessPlan,
    status: &str,
) -> Map<String, Value> {
    let mut record = Map::new();
    record.insert("strategy".to_string(), json!(plan.strategy));
    record.insert("status".to_string(), json!(status));
    record.insert("chroma_key_color".to_string(), json!(plan.chroma_key_color));
    record.insert("postprocess_required".to_string(), json!(true));
    record.insert(
        "source".to_string(),
        json!("runtime_contract.layered_design.alpha"),
    );
    record.insert("document_id".to_string(), json!(plan.document_id));
    record.insert("layer_id".to_string(), json!(plan.layer_id));
    record.insert("asset_id".to_string(), json!(plan.asset_id));
    record
}

fn read_postprocess_u64(record: &Map<String, Value>, key: &str) -> u64 {
    record.get(key).and_then(Value::as_u64).unwrap_or_default()
}

use super::*;
use crate::image_postprocess::{
    decode_png_data_url_bytes, encode_png_data_url, PreparedImageTaskPostprocessPlan,
    PNG_DATA_URL_MIME,
};
use crate::image_request::{
    build_responses_image_generation_endpoint, IMAGE_EXECUTOR_MODE_DASHSCOPE_IMAGES,
    IMAGE_EXECUTOR_MODE_IMAGES_API, IMAGE_EXECUTOR_MODE_RESPONSES_IMAGE_GENERATION,
    IMAGE_EXECUTOR_MODE_ZHIPU_IMAGES,
};
use crate::image_task_input::{prepare_image_task_input, PreparedImageTaskSlot};
use crate::image_worker::{
    build_image_task_result_value, decorate_generated_image_with_slot,
    image_task_runner_timeout_secs, AGNES_IMAGE_TASK_RUNNER_TIMEOUT_SECS,
    IMAGE_TASK_RUNNER_TIMEOUT_SECS,
};
use std::sync::{
    atomic::{AtomicUsize, Ordering},
    Arc, Mutex,
};
use std::time::Duration;

use axum::{
    extract::Json,
    http::{HeaderMap, StatusCode},
    routing::{get, post},
    Router,
};
use image::{codecs::png::PngEncoder, ColorType, ImageEncoder, ImageFormat};
use serde_json::{json, Value};
use tokio::net::TcpListener;

fn build_test_png_bytes(width: u32, height: u32, pixels: &[[u8; 4]]) -> Vec<u8> {
    let raw = pixels
        .iter()
        .flat_map(|pixel| pixel.iter().copied())
        .collect::<Vec<_>>();
    let mut output_bytes = Vec::new();
    PngEncoder::new(&mut output_bytes)
        .write_image(&raw, width, height, ColorType::Rgba8.into())
        .expect("write test png");
    output_bytes
}

fn build_test_png_data_url(width: u32, height: u32, pixels: &[[u8; 4]]) -> String {
    let output_bytes = build_test_png_bytes(width, height, pixels);
    encode_png_data_url(&output_bytes)
}

fn read_test_png_alpha(data_url: &str, x: u32, y: u32) -> u8 {
    let bytes = decode_png_data_url_bytes(data_url)
        .expect("decode data url")
        .expect("png bytes");
    image::load_from_memory_with_format(&bytes, ImageFormat::Png)
        .expect("decode png")
        .to_rgba8()
        .get_pixel(x, y)[3]
}

fn test_chroma_key_plan() -> PreparedImageTaskPostprocessPlan {
    PreparedImageTaskPostprocessPlan {
        strategy: "chroma_key_postprocess".to_string(),
        chroma_key_color: "#00ff00".to_string(),
        document_id: Some("design-1".to_string()),
        layer_id: Some("subject".to_string()),
        asset_id: Some("asset-subject".to_string()),
    }
}

fn test_image_slot() -> PreparedImageTaskSlot {
    PreparedImageTaskSlot {
        slot_index: 1,
        slot_id: "image-slot-1".to_string(),
        label: None,
        prompt: "生成透明角色层".to_string(),
        shot_type: None,
    }
}

mod image_postprocess;
mod image_worker;
mod image_worker_dashscope;
mod image_worker_gemini;
mod image_worker_responses;
mod image_worker_zhipu;
mod task_artifact;
mod video_worker;

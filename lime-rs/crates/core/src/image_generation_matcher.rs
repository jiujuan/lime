use regex::Regex;
use std::sync::OnceLock;

const IMAGE_GENERATION_MODEL_PATTERN: &str = r"(gpt[-_ ]?images?|imagen|dall-e|dalle|nano[-_ ]?banana|banana|flux|seedream|kontext|recraft|ideogram|sdxl|sd3|stable[-_ ]?diffusion|cogview|glm[-_ ]?image|wanx|midjourney|(?:^|[^a-z0-9])mj(?:$|[^a-z0-9])|(?:^|[^a-z0-9])image[-_ ]?(?:\d|generation|gen|preview|model)(?:$|[^a-z0-9])|text[-_ ]?to[-_ ]?image|picture|drawing|绘图|图像生成|生图)";
const RESPONSES_IMAGE_MODEL_PATTERN: &str = r"(?:^|[^a-z0-9])gpt-images?-2(?:$|[^a-z0-9])";

fn normalize_text(value: &str) -> String {
    value.trim().to_ascii_lowercase()
}

fn image_generation_model_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();

    PATTERN.get_or_init(|| {
        Regex::new(IMAGE_GENERATION_MODEL_PATTERN)
            .expect("image generation model matcher should be valid")
    })
}

fn responses_image_model_pattern() -> &'static Regex {
    static PATTERN: OnceLock<Regex> = OnceLock::new();

    PATTERN.get_or_init(|| {
        Regex::new(RESPONSES_IMAGE_MODEL_PATTERN).expect("responses image matcher should be valid")
    })
}

pub fn is_responses_image_generation_model_id(model_id: &str) -> bool {
    let normalized = normalize_text(model_id);
    if normalized.is_empty() {
        return false;
    }

    responses_image_model_pattern().is_match(&normalized)
}

pub fn is_likely_image_generation_model_id(model_id: &str) -> bool {
    let normalized = normalize_text(model_id);
    if normalized.is_empty() {
        return false;
    }

    is_responses_image_generation_model_id(&normalized)
        || image_generation_model_pattern().is_match(&normalized)
}

pub fn is_likely_image_generation_search_text(value: &str) -> bool {
    is_likely_image_generation_model_id(value)
}

pub fn is_likely_fal_image_model_id(model_id: &str) -> bool {
    let normalized = normalize_text(model_id);
    if normalized.is_empty() {
        return false;
    }

    normalized.starts_with("fal-ai/")
        || normalized.contains("nano-banana")
        || normalized.contains("flux")
        || normalized.contains("seedream")
        || normalized.contains("recraft")
        || normalized.contains("ideogram")
        || normalized.contains("fal")
}

#[cfg(test)]
mod tests {
    use super::{
        is_likely_fal_image_model_id, is_likely_image_generation_model_id,
        is_likely_image_generation_search_text, is_responses_image_generation_model_id,
    };

    #[test]
    fn responses_image_models_should_match_only_responses_shape() {
        assert!(is_responses_image_generation_model_id("gpt-images-2"));
        assert!(is_responses_image_generation_model_id("openai/gpt-image-2"));
        assert!(is_responses_image_generation_model_id("relay-gpt-images-2"));
        assert!(!is_responses_image_generation_model_id("gpt-image-1"));
        assert!(!is_responses_image_generation_model_id("gpt-5.2-pro"));
    }

    #[test]
    fn likely_image_generation_models_should_match_known_families() {
        assert!(is_likely_image_generation_model_id("agnes-image-2.1-flash"));
        assert!(is_likely_image_generation_model_id("gpt-images-2"));
        assert!(is_likely_image_generation_model_id("doubao-seedream-4-0"));
        assert!(is_likely_image_generation_model_id("midjourney-v7"));
        assert!(is_likely_image_generation_model_id("glm-image"));
        assert!(is_likely_image_generation_model_id("中文生图模型"));
        assert!(!is_likely_image_generation_model_id("gpt-5.2-pro"));
    }

    #[test]
    fn likely_image_generation_search_text_should_ignore_vision_input_signals() {
        assert!(is_likely_image_generation_search_text(
            "OpenAI image generation model"
        ));
        assert!(is_likely_image_generation_search_text("gpt image 2"));
        assert!(!is_likely_image_generation_search_text(
            "image-input chat model"
        ));
        assert!(!is_likely_image_generation_model_id(
            "provider-image-input-chat"
        ));
    }

    #[test]
    fn likely_fal_image_models_should_match_fal_families() {
        assert!(is_likely_fal_image_model_id("fal-ai/nano-banana-pro"));
        assert!(is_likely_fal_image_model_id(
            "fal-ai/bytedance/seedream/v4/text-to-image"
        ));
        assert!(is_likely_fal_image_model_id(
            "black-forest-labs/FLUX.1-schnell"
        ));
        assert!(!is_likely_fal_image_model_id("gpt-5.2-pro"));
    }
}

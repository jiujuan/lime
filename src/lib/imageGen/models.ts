/**
 * 图片生成模型数据（从 components/image-gen/types 提取到 lib 层）
 *
 * 纯数据，无 UI 依赖。详见 internal/refactor/progressive-refactor-plan.md R-31。
 */

export interface ImageGenModel {
  id: string;
  name: string;
  supportedSizes: string[];
}

const OPENAI_IMAGE_MODELS: ImageGenModel[] = [
  {
    id: "gpt-image-1",
    name: "GPT Image 1",
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
  },
  {
    id: "gpt-images-2",
    name: "GPT Images 2",
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
  },
  {
    id: "dall-e-3",
    name: "DALL-E 3",
    supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
  },
];

/** 图片生成模型映射（根据 Provider ID 或类型） */
export const IMAGE_GEN_MODELS: Record<string, ImageGenModel[]> = {
  openai: OPENAI_IMAGE_MODELS,
  "openai-response": OPENAI_IMAGE_MODELS,
  // 智谱 AI
  zhipuai: [
    {
      id: "cogview-3-flash",
      name: "CogView-3-Flash",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
    {
      id: "cogview-4-250304",
      name: "CogView-4-250304",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
  ],
  zhipu: [
    {
      id: "cogview-3-flash",
      name: "CogView-3-Flash",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
    {
      id: "cogview-4-250304",
      name: "CogView-4-250304",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
  ],
  // AiHubMix
  aihubmix: [
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    },
  ],
  // 硅基流动
  siliconflow: [
    {
      id: "black-forest-labs/FLUX.1-schnell",
      name: "FLUX.1-schnell",
      supportedSizes: [
        "1024x1024",
        "512x1024",
        "768x512",
        "768x1024",
        "1024x576",
        "576x1024",
      ],
    },
    {
      id: "stabilityai/stable-diffusion-3-5-large",
      name: "SD 3.5 Large",
      supportedSizes: ["1024x1024", "512x1024", "768x512", "768x1024"],
    },
  ],
  "siliconflow-cn": [
    {
      id: "black-forest-labs/FLUX.1-schnell",
      name: "FLUX.1-schnell",
      supportedSizes: [
        "1024x1024",
        "512x1024",
        "768x512",
        "768x1024",
        "1024x576",
        "576x1024",
      ],
    },
    {
      id: "stabilityai/stable-diffusion-3-5-large",
      name: "SD 3.5 Large",
      supportedSizes: ["1024x1024", "512x1024", "768x512", "768x1024"],
    },
  ],
  // DMXAPI
  dmxapi: [
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    },
  ],
  // TokenFlux
  tokenflux: [
    {
      id: "dall-e-3",
      name: "DALL-E 3",
      supportedSizes: ["1024x1024", "1792x1024", "1024x1792"],
    },
  ],
  // New API
  "new-api": OPENAI_IMAGE_MODELS,
  // Fal
  fal: [
    {
      id: "fal-ai/nano-banana-pro",
      name: "Nano Banana Pro",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
    {
      id: "fal-ai/nano-banana",
      name: "Nano Banana",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
    {
      id: "fal-ai/flux/schnell",
      name: "FLUX.1 Schnell",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
    {
      id: "fal-ai/flux-kontext/dev",
      name: "FLUX.1 Kontext Dev",
      supportedSizes: [
        "1024x1024",
        "768x1344",
        "864x1152",
        "1344x768",
        "1152x864",
        "1440x720",
        "720x1440",
      ],
    },
  ],
};

export const IMAGE_GEN_PROVIDER_IDS = [
  ...Object.keys(IMAGE_GEN_MODELS),
  // 兼容不同大小写的 type 值
  "NewApi",
];

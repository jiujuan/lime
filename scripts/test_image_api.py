#!/usr/bin/env python3
from __future__ import annotations

"""
OpenAI 兼容图像生成 API 测试脚本

使用 OpenAI Python SDK 测试 Antigravity 图像生成 API。

使用方法:
    # 安装依赖
    pip install openai

    # 默认 dry run，不调用真实图片 Provider
    python scripts/test_image_api.py

    # 显式允许真实 API 测试
    python scripts/test_image_api.py --allow-live-provider --base-url http://localhost:8999 --api-key your-key

环境变量:
    LIME_BASE_URL: API 服务器地址（默认: http://localhost:8999）
    LIME_API_KEY: API 密钥
    LIME_ALLOW_LIVE_PROVIDER_SMOKE / LIME_REAL_API_TEST: 设为 1/true/yes/on 时允许真实 API 测试
"""

import argparse
import base64
import os
import sys
from datetime import datetime

try:
    from openai import OpenAI
except ImportError:
    OpenAI = None


LIVE_PROVIDER_SMOKE_ENV = "LIME_ALLOW_LIVE_PROVIDER_SMOKE"
REAL_API_TEST_ENV = "LIME_REAL_API_TEST"
DEFAULT_API_KEY = "test-key"


def is_truthy_env(value: str | None) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def live_provider_allowed() -> bool:
    return is_truthy_env(os.environ.get(LIVE_PROVIDER_SMOKE_ENV)) or is_truthy_env(
        os.environ.get(REAL_API_TEST_ENV)
    )


def test_image_generation_url(client: OpenAI, prompt: str) -> bool:
    """
    测试 URL 响应格式的图像生成
    
    Args:
        client: OpenAI 客户端
        prompt: 图像生成提示词
        
    Returns:
        测试是否通过
    """
    print("\n" + "=" * 60)
    print("测试 1: URL 响应格式")
    print("=" * 60)
    print(f"提示词: {prompt}")
    
    try:
        response = client.images.generate(
            model="dall-e-3",  # 会被映射到 gemini-3-pro-image
            prompt=prompt,
            n=1,
            size="1024x1024",
            response_format="url"
        )
        
        # 验证响应结构
        print(f"\n响应时间戳: {response.created}")
        print(f"生成图片数量: {len(response.data)}")
        
        if len(response.data) == 0:
            print("❌ 错误: 没有生成图片")
            return False
            
        image = response.data[0]
        
        # 验证 URL 格式
        if image.url:
            print(f"URL 长度: {len(image.url)} 字符")
            if image.url.startswith("data:image/"):
                print("✅ URL 格式正确 (data URL)")
            else:
                print(f"⚠️ URL 格式: {image.url[:50]}...")
        else:
            print("❌ 错误: URL 为空")
            return False
            
        # 验证 revised_prompt
        if image.revised_prompt:
            print(f"修订提示词: {image.revised_prompt[:100]}...")
        else:
            print("ℹ️ 没有修订提示词")
            
        print("\n✅ 测试 1 通过")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试 1 失败: {e}")
        return False


def test_image_generation_b64(client: OpenAI, prompt: str) -> bool:
    """
    测试 b64_json 响应格式的图像生成
    
    Args:
        client: OpenAI 客户端
        prompt: 图像生成提示词
        
    Returns:
        测试是否通过
    """
    print("\n" + "=" * 60)
    print("测试 2: b64_json 响应格式")
    print("=" * 60)
    print(f"提示词: {prompt}")
    
    try:
        response = client.images.generate(
            model="gemini-3-pro-image-preview",  # 直接使用 Gemini 模型名
            prompt=prompt,
            n=1,
            response_format="b64_json"
        )
        
        # 验证响应结构
        print(f"\n响应时间戳: {response.created}")
        print(f"生成图片数量: {len(response.data)}")
        
        if len(response.data) == 0:
            print("❌ 错误: 没有生成图片")
            return False
            
        image = response.data[0]
        
        # 验证 b64_json 格式
        if image.b64_json:
            print(f"Base64 数据长度: {len(image.b64_json)} 字符")
            
            # 尝试解码验证
            try:
                decoded = base64.b64decode(image.b64_json)
                print(f"解码后大小: {len(decoded)} 字节")
                
                # 检查图片魔数
                if decoded[:8] == b'\x89PNG\r\n\x1a\n':
                    print("✅ 图片格式: PNG")
                elif decoded[:2] == b'\xff\xd8':
                    print("✅ 图片格式: JPEG")
                elif decoded[:4] == b'GIF8':
                    print("✅ 图片格式: GIF")
                elif decoded[:4] == b'RIFF':
                    print("✅ 图片格式: WebP")
                else:
                    print(f"⚠️ 未知图片格式: {decoded[:8].hex()}")
                    
            except Exception as e:
                print(f"⚠️ Base64 解码失败: {e}")
        else:
            print("❌ 错误: b64_json 为空")
            return False
            
        # 验证 revised_prompt
        if image.revised_prompt:
            print(f"修订提示词: {image.revised_prompt[:100]}...")
        else:
            print("ℹ️ 没有修订提示词")
            
        print("\n✅ 测试 2 通过")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试 2 失败: {e}")
        return False


def test_error_handling(client: OpenAI) -> bool:
    """
    测试错误处理
    
    Args:
        client: OpenAI 客户端
        
    Returns:
        测试是否通过
    """
    print("\n" + "=" * 60)
    print("测试 3: 错误处理")
    print("=" * 60)
    
    try:
        # 测试空提示词
        print("测试空提示词...")
        try:
            response = client.images.generate(
                model="dall-e-3",
                prompt="",  # 空提示词
                n=1
            )
            print("❌ 错误: 应该拒绝空提示词")
            return False
        except Exception as e:
            error_msg = str(e).lower()
            if "prompt" in error_msg or "empty" in error_msg or "required" in error_msg:
                print(f"✅ 正确拒绝空提示词: {e}")
            else:
                print(f"⚠️ 收到错误但消息不明确: {e}")
                
        print("\n✅ 测试 3 通过")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试 3 失败: {e}")
        return False


def test_response_structure(client: OpenAI, prompt: str) -> bool:
    """
    测试响应结构符合 OpenAI 规范
    
    Args:
        client: OpenAI 客户端
        prompt: 图像生成提示词
        
    Returns:
        测试是否通过
    """
    print("\n" + "=" * 60)
    print("测试 4: 响应结构验证")
    print("=" * 60)
    print(f"提示词: {prompt}")
    
    try:
        response = client.images.generate(
            model="dall-e-3",
            prompt=prompt,
            n=1,
            response_format="url"
        )
        
        # 验证 created 字段
        if response.created:
            print(f"✅ created 字段存在: {response.created}")
            # 验证是有效的 Unix 时间戳
            if response.created > 0:
                dt = datetime.fromtimestamp(response.created)
                print(f"   时间: {dt}")
            else:
                print("❌ created 不是有效时间戳")
                return False
        else:
            print("❌ created 字段缺失")
            return False
            
        # 验证 data 字段
        if response.data is not None:
            print(f"✅ data 字段存在: {len(response.data)} 项")
            if len(response.data) > 0:
                print("✅ data 数组非空")
            else:
                print("❌ data 数组为空")
                return False
        else:
            print("❌ data 字段缺失")
            return False
            
        # 验证每个图片项
        for i, image in enumerate(response.data):
            print(f"\n图片 {i + 1}:")
            has_url = image.url is not None
            has_b64 = image.b64_json is not None
            
            if has_url:
                print(f"  ✅ url 字段存在")
            if has_b64:
                print(f"  ✅ b64_json 字段存在")
                
            if not has_url and not has_b64:
                print(f"  ❌ 缺少 url 和 b64_json")
                return False
                
            if image.revised_prompt:
                print(f"  ✅ revised_prompt 字段存在")
            else:
                print(f"  ℹ️ revised_prompt 字段为空")
                
        print("\n✅ 测试 4 通过")
        return True
        
    except Exception as e:
        print(f"\n❌ 测试 4 失败: {e}")
        return False


def main():
    parser = argparse.ArgumentParser(
        description="测试 OpenAI 兼容图像生成 API"
    )
    parser.add_argument(
        "--base-url",
        default=os.environ.get("LIME_BASE_URL")
        or os.environ.get("PROXYCAST_BASE_URL", "http://localhost:8999"),
        help="API 服务器地址"
    )
    parser.add_argument(
        "--api-key",
        default=os.environ.get("LIME_API_KEY")
        or os.environ.get("PROXYCAST_API_KEY", DEFAULT_API_KEY),
        help="API 密钥"
    )
    parser.add_argument(
        "--prompt",
        default="A cute fluffy cat sitting on a windowsill, looking at the sunset",
        help="测试用的图像生成提示词"
    )
    parser.add_argument(
        "--skip-generation",
        action="store_true",
        help="跳过实际图像生成测试；需要 live 授权时才会执行错误处理请求"
    )
    parser.add_argument(
        "--allow-live-provider",
        action="store_true",
        help="确认允许调用真实图片 Provider；默认不发送任何 API 请求"
    )
    
    args = parser.parse_args()
    allow_live_provider = args.allow_live_provider or live_provider_allowed()
    
    print("=" * 60)
    print("OpenAI 兼容图像生成 API 测试")
    print("=" * 60)
    print(f"API 地址: {args.base_url}")
    print(f"API 密钥: {args.api_key[:8]}...")
    print(f"测试提示词: {args.prompt[:50]}...")

    if not allow_live_provider:
        print(
            "\n默认 dry run：未发送任何 API 请求，避免消耗真实图片 Provider 额度。"
        )
        print(
            f"如需真实测试，请传入 --allow-live-provider，或设置 {LIVE_PROVIDER_SMOKE_ENV}=1 / {REAL_API_TEST_ENV}=1。"
        )
        sys.exit(0)

    if OpenAI is None:
        print("错误: 请先安装 openai 库")
        print("运行: pip install openai")
        sys.exit(1)
    
    # 创建 OpenAI 客户端
    client = OpenAI(
        base_url=f"{args.base_url}/v1",
        api_key=args.api_key
    )
    
    results = []
    
    if not args.skip_generation:
        # 测试 1: URL 响应格式
        results.append(("URL 响应格式", test_image_generation_url(client, args.prompt)))
        
        # 测试 2: b64_json 响应格式
        results.append(("b64_json 响应格式", test_image_generation_b64(client, args.prompt)))
        
        # 测试 4: 响应结构验证
        results.append(("响应结构验证", test_response_structure(client, args.prompt)))
    
    # 测试 3: 错误处理
    results.append(("错误处理", test_error_handling(client)))
    
    # 打印总结
    print("\n" + "=" * 60)
    print("测试总结")
    print("=" * 60)
    
    passed = 0
    failed = 0
    for name, result in results:
        status = "✅ 通过" if result else "❌ 失败"
        print(f"  {name}: {status}")
        if result:
            passed += 1
        else:
            failed += 1
            
    print(f"\n总计: {passed} 通过, {failed} 失败")
    
    if failed > 0:
        sys.exit(1)
    else:
        print("\n🎉 所有测试通过!")
        sys.exit(0)


if __name__ == "__main__":
    main()

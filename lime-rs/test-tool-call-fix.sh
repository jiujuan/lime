#!/bin/bash
# 测试工具调用修复

set -e

echo "========================================"
echo "测试 OpenAI 格式工具调用修复"
echo "========================================"
echo ""

echo "1. 运行 openai 格式相关的单元测试..."
cd crates/agent-rust/crates/agent
cargo test --lib providers::formats::openai::tests -- --nocapture

echo ""
echo "2. 运行工具参数解析测试..."
cargo test --lib providers::utils::tests::test_parse_tool_arguments -- --nocapture

echo ""
echo "========================================"
echo "所有测试通过！"
echo "========================================"

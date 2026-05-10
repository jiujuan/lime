# AI Agent 测试指南

> 基于 Anthropic 评估理论与实践经验的 AI Agent 测试策略

## 一、为什么 AI Agent 需要专门的测试策略？

AI Agent 与传统软件的关键区别：

| 特性 | 传统软件 | AI Agent |
|------|----------|----------|
| 输出确定性 | 给定输入，输出固定 | 输出可能变化 |
| 执行路径 | 可预测 | 自主决策，路径不确定 |
| 错误传播 | 局部影响 | 可能累积和放大 |
| 成功标准 | 明确的对错 | 可能有多个有效解 |

**核心挑战**：如何测试一个"可能找到比你预期更好的解决方案"的系统？

---

## 二、测试金字塔

```
                    ┌─────────┐
                    │  E2E    │  ← 少量：完整 Agent 流程
                    │  Tests  │
                   ─┴─────────┴─
                  ┌─────────────┐
                  │ Integration │  ← 中等：组件交互
                  │   Tests     │
                 ─┴─────────────┴─
                ┌─────────────────┐
                │   Unit Tests    │  ← 大量：单个函数
                │                 │
               ─┴─────────────────┴─
```

### 2.1 单元测试（70%）

测试独立的、确定性的组件：

```rust
// src-tauri/src/agent/tests/message_tests.rs

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_message_serialization() {
        let msg = Message::User {
            content: vec![ContentBlock::Text { 
                text: "Hello".to_string() 
            }],
        };
        
        let json = serde_json::to_string(&msg).unwrap();
        let parsed: Message = serde_json::from_str(&json).unwrap();
        
        assert_eq!(msg, parsed);
    }
    
    #[test]
    fn test_tool_call_parsing() {
        let input = r#"{"name": "read_file", "input": {"path": "/test.txt"}}"#;
        let tool_call: ToolCall = serde_json::from_str(input).unwrap();
        
        assert_eq!(tool_call.name, "read_file");
        assert_eq!(tool_call.input["path"], "/test.txt");
    }
}
```

### 2.2 集成测试（20%）

测试组件之间的交互：

```rust
// src-tauri/src/agent/tests/tool_integration_tests.rs

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    
    #[tokio::test]
    async fn test_read_write_file_integration() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        
        // 写入文件
        let write_tool = WriteFileTool::new();
        let write_result = write_tool.execute(ToolInput {
            name: "write_file".to_string(),
            input: json!({
                "path": file_path.to_str().unwrap(),
                "content": "Hello, World!"
            }),
        }).await.unwrap();
        
        assert!(write_result.success);
        
        // 读取文件
        let read_tool = ReadFileTool::new();
        let read_result = read_tool.execute(ToolInput {
            name: "read_file".to_string(),
            input: json!({
                "path": file_path.to_str().unwrap()
            }),
        }).await.unwrap();
        
        assert_eq!(read_result.content, "Hello, World!");
    }
}
```

### 2.3 端到端测试（10%）

测试完整的 Agent 流程：

```rust
// src-tauri/src/agent/tests/e2e_tests.rs

#[cfg(test)]
mod tests {
    use super::*;
    
    #[tokio::test]
    async fn test_agent_simple_task() {
        // 创建 Mock Provider
        let mock_provider = MockProvider::new()
            .with_response("I'll read the file for you.")
            .with_tool_call("read_file", json!({"path": "/test.txt"}))
            .with_response("The file contains: Hello!");
        
        // 创建 Agent
        let agent = AgentRuntime::new(
            test_agent_definition(),
            Box::new(mock_provider),
        );
        
        // 运行 Agent
        let result = agent.run("Read the file /test.txt").await.unwrap();
        
        // 验证结果
        assert!(result.content.contains("Hello"));
        assert_eq!(agent.state.tool_call_count, 1);
    }
}
```


---

## 三、三种评分器类型

### 3.1 代码评分器（确定性验证）

适用于有明确对错的场景：

```rust
// src-tauri/src/agent/tests/graders/code_grader.rs

/// 代码评分器
pub struct CodeGrader;

impl CodeGrader {
    /// 验证文件是否存在
    pub fn file_exists(path: &Path) -> bool {
        path.exists()
    }
    
    /// 验证文件内容包含指定字符串
    pub fn file_contains(path: &Path, expected: &str) -> bool {
        if let Ok(content) = std::fs::read_to_string(path) {
            content.contains(expected)
        } else {
            false
        }
    }
    
    /// 验证 JSON 结构
    pub fn json_matches_schema(json: &str, schema: &str) -> bool {
        // 使用 JSON Schema 验证
        todo!()
    }
    
    /// 验证工具调用次数
    pub fn tool_call_count(state: &AgentState, expected: u32) -> bool {
        state.tool_call_count == expected
    }
}
```

### 3.2 模型评分器（灵活判断）

适用于开放式任务：

```rust
// src-tauri/src/agent/tests/graders/model_grader.rs

/// 模型评分器
pub struct ModelGrader {
    provider: Box<dyn ProviderClient>,
}

impl ModelGrader {
    /// 使用 LLM 评估响应质量
    pub async fn evaluate_response(
        &self,
        task: &str,
        response: &str,
        rubric: &str,
    ) -> GradeResult {
        let prompt = format!(
            r#"你是一个评估 AI Agent 响应质量的评分器。

任务描述：
{task}

Agent 响应：
{response}

评分标准：
{rubric}

请根据评分标准，给出 1-5 分的评分，并说明理由。
输出格式：
{{"score": <1-5>, "reason": "<理由>"}}
"#
        );
        
        let result = self.provider.chat(&[Message::user(&prompt)]).await?;
        // 解析评分结果
        todo!()
    }
}

/// 评分结果
pub struct GradeResult {
    pub score: u8,      // 1-5
    pub reason: String,
    pub passed: bool,   // score >= 3
}
```

### 3.3 人工评分器（金标准）

用于校准模型评分器：

```rust
// src-tauri/src/agent/tests/graders/human_grader.rs

/// 人工评分记录
pub struct HumanGrade {
    pub task_id: String,
    pub response: String,
    pub score: u8,
    pub feedback: String,
    pub grader_id: String,
    pub timestamp: DateTime<Utc>,
}

/// 人工评分收集器
pub struct HumanGradeCollector {
    grades: Vec<HumanGrade>,
}

impl HumanGradeCollector {
    /// 计算评分者一致性
    pub fn inter_rater_agreement(&self) -> f64 {
        // 计算 Cohen's Kappa 或 Fleiss' Kappa
        todo!()
    }
    
    /// 导出用于校准模型评分器
    pub fn export_for_calibration(&self) -> Vec<CalibrationSample> {
        self.grades.iter().map(|g| CalibrationSample {
            task: g.task_id.clone(),
            response: g.response.clone(),
            human_score: g.score,
        }).collect()
    }
}
```

---

## 四、测试场景设计

### 4.1 能力测试（Capability Evals）

测试 Agent 能做什么：

```rust
// src-tauri/src/agent/tests/capability_tests.rs

/// 文件操作能力测试
mod file_operations {
    #[tokio::test]
    async fn test_create_file() {
        // 任务：创建一个包含特定内容的文件
        // 预期通过率：低（给团队爬坡空间）
    }
    
    #[tokio::test]
    async fn test_modify_file() {
        // 任务：修改现有文件的特定部分
    }
    
    #[tokio::test]
    async fn test_search_and_replace() {
        // 任务：在多个文件中搜索并替换
    }
}

/// 代码理解能力测试
mod code_understanding {
    #[tokio::test]
    async fn test_explain_function() {
        // 任务：解释一个函数的作用
    }
    
    #[tokio::test]
    async fn test_find_bug() {
        // 任务：找出代码中的 bug
    }
}
```

### 4.2 回归测试（Regression Evals）

确保 Agent 不退化：

```rust
// src-tauri/src/agent/tests/regression_tests.rs

/// 回归测试套件
/// 预期通过率：接近 100%
mod regression {
    #[tokio::test]
    async fn test_basic_file_read() {
        // 基础功能：读取文件
        // 这个测试必须始终通过
    }
    
    #[tokio::test]
    async fn test_basic_file_write() {
        // 基础功能：写入文件
    }
    
    #[tokio::test]
    async fn test_basic_shell_command() {
        // 基础功能：执行简单命令
    }
}
```

### 4.3 边界测试（Edge Cases）

测试异常情况：

```rust
// src-tauri/src/agent/tests/edge_case_tests.rs

mod edge_cases {
    #[tokio::test]
    async fn test_file_not_found() {
        // 读取不存在的文件
        // Agent 应该优雅处理，而不是崩溃
    }
    
    #[tokio::test]
    async fn test_permission_denied() {
        // 写入没有权限的目录
    }
    
    #[tokio::test]
    async fn test_timeout() {
        // 长时间运行的命令
        // Agent 应该在超时后停止
    }
    
    #[tokio::test]
    async fn test_max_tool_calls() {
        // 达到最大工具调用次数
        // Agent 应该停止并返回部分结果
    }
}
```


---

## 五、处理非确定性

### 5.1 pass@k 与 pass^k

```rust
// src-tauri/src/agent/tests/metrics.rs

/// 计算 pass@k：至少一次成功的概率
pub fn pass_at_k(success_rate: f64, k: u32) -> f64 {
    1.0 - (1.0 - success_rate).powi(k as i32)
}

/// 计算 pass^k：全部成功的概率
pub fn pass_power_k(success_rate: f64, k: u32) -> f64 {
    success_rate.powi(k as i32)
}

#[cfg(test)]
mod tests {
    use super::*;
    
    #[test]
    fn test_metrics() {
        let p = 0.75;  // 单次成功率 75%
        
        // k=1 时两者相等
        assert!((pass_at_k(p, 1) - pass_power_k(p, 1)).abs() < 0.001);
        
        // k=3 时
        assert!((pass_at_k(p, 3) - 0.984).abs() < 0.01);   // 98.4%
        assert!((pass_power_k(p, 3) - 0.422).abs() < 0.01); // 42.2%
    }
}
```

### 5.2 多次试验

```rust
// src-tauri/src/agent/tests/trial_runner.rs

/// 试验运行器
pub struct TrialRunner {
    agent: AgentRuntime,
    trials: u32,
}

impl TrialRunner {
    /// 运行多次试验
    pub async fn run_trials(&self, task: &str) -> TrialResults {
        let mut results = Vec::new();
        
        for i in 0..self.trials {
            let result = self.agent.run(task).await;
            results.push(TrialResult {
                trial_id: i,
                success: result.is_ok(),
                response: result.ok(),
                error: result.err(),
            });
        }
        
        TrialResults::from(results)
    }
}

/// 试验结果统计
pub struct TrialResults {
    pub total: u32,
    pub successes: u32,
    pub failures: u32,
    pub success_rate: f64,
    pub pass_at_1: f64,
    pub pass_at_3: f64,
    pub pass_power_3: f64,
}
```

---

## 六、Mock 与测试替身

### 6.1 Mock Provider

```rust
// src-tauri/src/agent/tests/mocks/mock_provider.rs

/// Mock Provider 用于测试
pub struct MockProvider {
    responses: VecDeque<MockResponse>,
}

enum MockResponse {
    Text(String),
    ToolCall { name: String, input: serde_json::Value },
    Error(String),
}

impl MockProvider {
    pub fn new() -> Self {
        Self { responses: VecDeque::new() }
    }
    
    pub fn with_response(mut self, text: &str) -> Self {
        self.responses.push_back(MockResponse::Text(text.to_string()));
        self
    }
    
    pub fn with_tool_call(mut self, name: &str, input: serde_json::Value) -> Self {
        self.responses.push_back(MockResponse::ToolCall {
            name: name.to_string(),
            input,
        });
        self
    }
    
    pub fn with_error(mut self, error: &str) -> Self {
        self.responses.push_back(MockResponse::Error(error.to_string()));
        self
    }
}

#[async_trait]
impl ProviderClient for MockProvider {
    async fn chat(&self, messages: &[Message]) -> Result<Response, ProviderError> {
        match self.responses.pop_front() {
            Some(MockResponse::Text(text)) => Ok(Response::text(text)),
            Some(MockResponse::ToolCall { name, input }) => {
                Ok(Response::tool_call(name, input))
            }
            Some(MockResponse::Error(e)) => Err(ProviderError::Api(e)),
            None => Err(ProviderError::Api("No more mock responses".to_string())),
        }
    }
}
```

### 6.2 Mock 文件系统

```rust
// src-tauri/src/agent/tests/mocks/mock_fs.rs

/// Mock 文件系统
pub struct MockFileSystem {
    files: HashMap<PathBuf, String>,
}

impl MockFileSystem {
    pub fn new() -> Self {
        Self { files: HashMap::new() }
    }
    
    pub fn with_file(mut self, path: &str, content: &str) -> Self {
        self.files.insert(PathBuf::from(path), content.to_string());
        self
    }
    
    pub fn read(&self, path: &Path) -> Result<String, std::io::Error> {
        self.files.get(path)
            .cloned()
            .ok_or_else(|| std::io::Error::new(
                std::io::ErrorKind::NotFound,
                "File not found"
            ))
    }
    
    pub fn write(&mut self, path: &Path, content: &str) -> Result<(), std::io::Error> {
        self.files.insert(path.to_path_buf(), content.to_string());
        Ok(())
    }
}
```

---

## 七、测试组织

### 7.1 目录结构

```
src-tauri/
├── src/
│   └── agent/
│       ├── mod.rs
│       ├── runtime.rs
│       ├── tools/
│       └── tests/           # 单元测试
│           ├── mod.rs
│           ├── message_tests.rs
│           ├── tool_tests.rs
│           └── mocks/
│               ├── mod.rs
│               ├── mock_provider.rs
│               └── mock_fs.rs
└── tests/                   # 集成测试
    ├── agent_integration.rs
    ├── e2e_tests.rs
    └── fixtures/
        ├── test_files/
        └── test_agents/
```

### 7.2 测试命令

```bash
# 运行所有测试
cargo test

# 运行特定模块测试
cargo test agent::tests

# 运行集成测试
cargo test --test agent_integration

# 运行并显示输出
cargo test -- --nocapture

# 运行特定测试
cargo test test_read_file
```

### 7.3 CI 配置

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Install Rust
        uses: dtolnay/rust-action@stable
      
      - name: Run unit tests
        run: cd src-tauri && cargo test
      
      - name: Run integration tests
        run: cd src-tauri && cargo test --test '*'
      
      - name: Run clippy
        run: cd src-tauri && cargo clippy -- -D warnings
```


---

## 八、测试最佳实践

### 8.1 评估结果，而非路径

```rust
// ❌ 错误：检查具体的工具调用顺序
#[tokio::test]
async fn test_bad_check_path() {
    let result = agent.run("Create a file").await.unwrap();
    
    // 过于严格：Agent 可能找到更好的方法
    assert_eq!(result.tool_calls[0].name, "check_directory");
    assert_eq!(result.tool_calls[1].name, "write_file");
}

// ✅ 正确：检查最终结果
#[tokio::test]
async fn test_good_check_outcome() {
    let temp_dir = TempDir::new().unwrap();
    let file_path = temp_dir.path().join("output.txt");
    
    agent.run(&format!("Create a file at {}", file_path.display())).await.unwrap();
    
    // 只检查文件是否被创建
    assert!(file_path.exists());
    
    // 检查内容是否合理
    let content = std::fs::read_to_string(&file_path).unwrap();
    assert!(!content.is_empty());
}
```

### 8.2 平衡的问题集

```rust
// 测试"应该做"和"不应该做"

mod security_tests {
    // 应该允许的操作
    #[tokio::test]
    async fn test_should_allow_read_in_workspace() {
        let result = agent.run("Read /workspace/file.txt").await;
        assert!(result.is_ok());
    }
    
    // 不应该允许的操作
    #[tokio::test]
    async fn test_should_block_read_outside_workspace() {
        let result = agent.run("Read /etc/passwd").await;
        assert!(result.is_err());
    }
    
    // 应该允许的命令
    #[tokio::test]
    async fn test_should_allow_safe_commands() {
        let result = agent.run("Run: ls -la").await;
        assert!(result.is_ok());
    }
    
    // 不应该允许的命令
    #[tokio::test]
    async fn test_should_block_dangerous_commands() {
        let result = agent.run("Run: rm -rf /").await;
        assert!(result.is_err());
    }
}
```

### 8.3 测试隔离

```rust
// 每个测试使用独立的环境

#[tokio::test]
async fn test_isolated_environment() {
    // 创建临时目录
    let temp_dir = TempDir::new().unwrap();
    
    // 创建独立的 Agent 实例
    let agent = AgentRuntime::new(
        test_agent_definition(),
        Box::new(MockProvider::new()),
    ).with_working_dir(temp_dir.path());
    
    // 运行测试
    agent.run("Create some files").await.unwrap();
    
    // temp_dir 在测试结束时自动清理
}
```

### 8.4 阅读 Transcript

```rust
// 记录完整的执行过程用于调试

#[tokio::test]
async fn test_with_transcript() {
    let mut agent = AgentRuntime::new(...);
    agent.enable_transcript();
    
    let result = agent.run("Complex task").await;
    
    // 如果失败，打印完整的执行记录
    if result.is_err() {
        println!("=== Transcript ===");
        for entry in agent.transcript() {
            println!("{:?}", entry);
        }
        println!("==================");
    }
    
    assert!(result.is_ok());
}
```

---

## 九、总结

### 核心要点

1. **分层测试**：单元测试（70%）+ 集成测试（20%）+ E2E 测试（10%）
2. **三种评分器**：代码评分器（确定性）、模型评分器（灵活）、人工评分器（校准）
3. **处理非确定性**：使用 pass@k 和 pass^k 指标，运行多次试验
4. **评估结果而非路径**：Agent 可能找到更好的方法
5. **平衡问题集**：测试"应该做"和"不应该做"
6. **测试隔离**：每个测试使用独立环境
7. **阅读 Transcript**：理解 Agent 行为的最佳方式

### 立即行动

- [ ] 为现有工具添加单元测试
- [ ] 创建 Mock Provider 用于测试
- [ ] 设计 3-5 个核心能力测试
- [ ] 设置 CI 自动运行测试
- [ ] 建立 Transcript 审查习惯

---

## 参考资料

- [Anthropic: Demystifying evals for AI agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)
- [Rust Testing Guide](https://doc.rust-lang.org/book/ch11-00-testing.html)
- [Tokio Testing](https://tokio.rs/tokio/topics/testing)

---

*本文档定义 AI Agent 功能的通用测试策略；具体产品可以在此基础上追加项目级场景、Evidence Pack 和发布门禁。*

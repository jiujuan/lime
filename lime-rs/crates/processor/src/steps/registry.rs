//! 动态 Pipeline 步骤注册表
//!
//! 允许在运行时注册、移除自定义 Pipeline 步骤，并按阶段和优先级排序。

use super::traits::PipelineStep;

/// Pipeline 阶段
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum PipelinePhase {
    /// 在指定步骤之前执行
    Before(String),
    /// 在指定步骤之后执行
    After(String),
    /// 替换指定步骤
    Replace(String),
    /// 在所有步骤之前
    First,
    /// 在所有步骤之后
    Last,
}

/// 注册的步骤条目
struct RegisteredStep {
    step: Box<dyn PipelineStep>,
    phase: PipelinePhase,
    priority: i32,
}

/// Pipeline 步骤注册表
pub struct StepRegistry {
    core_steps: Vec<Box<dyn PipelineStep>>,
    dynamic_steps: Vec<RegisteredStep>,
}

impl StepRegistry {
    pub fn new(core_steps: Vec<Box<dyn PipelineStep>>) -> Self {
        Self {
            core_steps,
            dynamic_steps: Vec::new(),
        }
    }

    /// 运行时注册自定义步骤
    pub fn register(&mut self, step: Box<dyn PipelineStep>, phase: PipelinePhase, priority: i32) {
        self.dynamic_steps.push(RegisteredStep {
            step,
            phase,
            priority,
        });
    }

    /// 移除动态注册的步骤
    pub fn unregister(&mut self, step_name: &str) -> bool {
        let before = self.dynamic_steps.len();
        self.dynamic_steps.retain(|s| s.step.name() != step_name);
        self.dynamic_steps.len() < before
    }

    /// 按正确顺序返回所有步骤的引用
    pub fn ordered_steps(&self) -> Vec<&dyn PipelineStep> {
        // 收集被替换的核心步骤名
        let replaced: std::collections::HashSet<&str> = self
            .dynamic_steps
            .iter()
            .filter_map(|s| match &s.phase {
                PipelinePhase::Replace(name) => Some(name.as_str()),
                _ => None,
            })
            .collect();

        let mut result: Vec<&dyn PipelineStep> = Vec::new();

        // First 阶段（按 priority 排序）
        let mut firsts: Vec<&RegisteredStep> = self
            .dynamic_steps
            .iter()
            .filter(|s| s.phase == PipelinePhase::First)
            .collect();
        firsts.sort_by_key(|s| s.priority);
        result.extend(firsts.iter().map(|s| s.step.as_ref()));

        // 核心步骤 + Before/After/Replace
        for core in &self.core_steps {
            let core_name = core.name();

            // Before 此核心步骤的动态步骤
            let mut befores: Vec<&RegisteredStep> = self
                .dynamic_steps
                .iter()
                .filter(|s| matches!(&s.phase, PipelinePhase::Before(n) if n == core_name))
                .collect();
            befores.sort_by_key(|s| s.priority);
            result.extend(befores.iter().map(|s| s.step.as_ref()));

            if replaced.contains(core_name) {
                // 用替换步骤代替核心步骤
                let mut replacements: Vec<&RegisteredStep> = self
                    .dynamic_steps
                    .iter()
                    .filter(|s| matches!(&s.phase, PipelinePhase::Replace(n) if n == core_name))
                    .collect();
                replacements.sort_by_key(|s| s.priority);
                result.extend(replacements.iter().map(|s| s.step.as_ref()));
            } else {
                result.push(core.as_ref());
            }

            // After 此核心步骤的动态步骤
            let mut afters: Vec<&RegisteredStep> = self
                .dynamic_steps
                .iter()
                .filter(|s| matches!(&s.phase, PipelinePhase::After(n) if n == core_name))
                .collect();
            afters.sort_by_key(|s| s.priority);
            result.extend(afters.iter().map(|s| s.step.as_ref()));
        }

        // Last 阶段
        let mut lasts: Vec<&RegisteredStep> = self
            .dynamic_steps
            .iter()
            .filter(|s| s.phase == PipelinePhase::Last)
            .collect();
        lasts.sort_by_key(|s| s.priority);
        result.extend(lasts.iter().map(|s| s.step.as_ref()));

        result
    }
}

#[cfg(test)]
mod tests {
    use super::super::traits::StepError;
    use super::*;
    use async_trait::async_trait;
    use lime_core::processor::RequestContext;

    struct DummyStep {
        name: String,
    }

    impl DummyStep {
        fn new(name: &str) -> Self {
            Self {
                name: name.to_string(),
            }
        }

        fn boxed(name: &str) -> Box<dyn PipelineStep> {
            Box::new(Self::new(name))
        }
    }

    #[async_trait]
    impl PipelineStep for DummyStep {
        async fn execute(
            &self,
            _ctx: &mut RequestContext,
            _payload: &mut serde_json::Value,
        ) -> Result<(), StepError> {
            Ok(())
        }

        fn name(&self) -> &str {
            &self.name
        }
    }

    fn step_names(registry: &StepRegistry) -> Vec<String> {
        registry
            .ordered_steps()
            .iter()
            .map(|s| s.name().to_string())
            .collect()
    }

    #[test]
    fn test_core_steps_only() {
        let registry = StepRegistry::new(vec![
            DummyStep::boxed("auth"),
            DummyStep::boxed("routing"),
            DummyStep::boxed("provider"),
        ]);
        assert_eq!(step_names(&registry), vec!["auth", "routing", "provider"]);
    }

    #[test]
    fn test_first_and_last() {
        let mut registry = StepRegistry::new(vec![DummyStep::boxed("core")]);
        registry.register(DummyStep::boxed("first_step"), PipelinePhase::First, 0);
        registry.register(DummyStep::boxed("last_step"), PipelinePhase::Last, 0);
        assert_eq!(
            step_names(&registry),
            vec!["first_step", "core", "last_step"]
        );
    }

    #[test]
    fn test_before_and_after() {
        let mut registry =
            StepRegistry::new(vec![DummyStep::boxed("auth"), DummyStep::boxed("provider")]);
        registry.register(
            DummyStep::boxed("pre_auth"),
            PipelinePhase::Before("auth".to_string()),
            0,
        );
        registry.register(
            DummyStep::boxed("post_auth"),
            PipelinePhase::After("auth".to_string()),
            0,
        );
        assert_eq!(
            step_names(&registry),
            vec!["pre_auth", "auth", "post_auth", "provider"]
        );
    }

    #[test]
    fn test_replace() {
        let mut registry =
            StepRegistry::new(vec![DummyStep::boxed("auth"), DummyStep::boxed("provider")]);
        registry.register(
            DummyStep::boxed("custom_auth"),
            PipelinePhase::Replace("auth".to_string()),
            0,
        );
        assert_eq!(step_names(&registry), vec!["custom_auth", "provider"]);
    }

    #[test]
    fn test_unregister() {
        let mut registry = StepRegistry::new(vec![DummyStep::boxed("core")]);
        registry.register(DummyStep::boxed("extra"), PipelinePhase::Last, 0);
        assert_eq!(step_names(&registry), vec!["core", "extra"]);

        assert!(registry.unregister("extra"));
        assert_eq!(step_names(&registry), vec!["core"]);

        // 移除不存在的步骤返回 false
        assert!(!registry.unregister("nonexistent"));
    }

    #[test]
    fn test_priority_ordering() {
        let mut registry = StepRegistry::new(vec![DummyStep::boxed("core")]);
        registry.register(DummyStep::boxed("low"), PipelinePhase::First, 10);
        registry.register(DummyStep::boxed("high"), PipelinePhase::First, 1);
        // priority 小的排前面
        assert_eq!(step_names(&registry), vec!["high", "low", "core"]);
    }

    #[test]
    fn test_complex_pipeline() {
        let mut registry = StepRegistry::new(vec![
            DummyStep::boxed("auth"),
            DummyStep::boxed("routing"),
            DummyStep::boxed("provider"),
        ]);
        registry.register(DummyStep::boxed("init"), PipelinePhase::First, 0);
        registry.register(
            DummyStep::boxed("rate_limit"),
            PipelinePhase::Before("auth".to_string()),
            0,
        );
        registry.register(
            DummyStep::boxed("log_auth"),
            PipelinePhase::After("auth".to_string()),
            0,
        );
        registry.register(
            DummyStep::boxed("custom_routing"),
            PipelinePhase::Replace("routing".to_string()),
            0,
        );
        registry.register(DummyStep::boxed("telemetry"), PipelinePhase::Last, 0);

        assert_eq!(
            step_names(&registry),
            vec![
                "init",
                "rate_limit",
                "auth",
                "log_auth",
                "custom_routing",
                "provider",
                "telemetry"
            ]
        );
    }
}

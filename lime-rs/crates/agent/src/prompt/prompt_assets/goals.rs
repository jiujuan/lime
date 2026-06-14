use super::template::{escape_xml_text, render_template};

const GOAL_CONTINUATION_TEMPLATE: &str =
    include_str!("../templates_upstream/goals/continuation.md");
const GOAL_BUDGET_LIMIT_TEMPLATE: &str =
    include_str!("../templates_upstream/goals/budget_limit.md");
const GOAL_OBJECTIVE_UPDATED_TEMPLATE: &str =
    include_str!("../templates_upstream/goals/objective_updated.md");

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ThreadGoalPromptInput {
    pub objective: String,
    pub tokens_used: i64,
    pub token_budget: Option<i64>,
    pub time_used_seconds: Option<i64>,
}

pub fn continuation_prompt(goal: &ThreadGoalPromptInput) -> String {
    render_goal_template(GOAL_CONTINUATION_TEMPLATE, goal)
}

pub fn budget_limit_prompt(goal: &ThreadGoalPromptInput) -> String {
    render_goal_template(GOAL_BUDGET_LIMIT_TEMPLATE, goal)
}

pub fn objective_updated_prompt(goal: &ThreadGoalPromptInput) -> String {
    render_goal_template(GOAL_OBJECTIVE_UPDATED_TEMPLATE, goal)
}

fn render_goal_template(template: &str, goal: &ThreadGoalPromptInput) -> String {
    let token_budget = goal
        .token_budget
        .map(|budget| budget.to_string())
        .unwrap_or_else(|| "none".to_string());
    let remaining_tokens = goal
        .token_budget
        .map(|budget| budget.saturating_sub(goal.tokens_used).max(0).to_string())
        .unwrap_or_else(|| "unbounded".to_string());
    let tokens_used = goal.tokens_used.to_string();
    let time_used_seconds = goal.time_used_seconds.unwrap_or_default().to_string();
    let objective = escape_xml_text(&goal.objective);

    render_template(
        template,
        &[
            ("objective", objective.as_str()),
            ("tokens_used", tokens_used.as_str()),
            ("time_used_seconds", time_used_seconds.as_str()),
            ("token_budget", token_budget.as_str()),
            ("remaining_tokens", remaining_tokens.as_str()),
        ],
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_goal_prompts_with_escaped_objective() {
        let goal = ThreadGoalPromptInput {
            objective: "修复 <build> & 测试".to_string(),
            tokens_used: 40,
            token_budget: Some(100),
            time_used_seconds: Some(12),
        };

        let prompt = continuation_prompt(&goal);

        assert!(prompt.contains("修复 &lt;build&gt; &amp; 测试"));
        assert!(prompt.contains("Tokens remaining: 60"));
    }
}

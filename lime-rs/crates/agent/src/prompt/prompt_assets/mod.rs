//! 运行时 prompt 资产与渲染工具。
//!
//! 这些模板来自参考实现的 `prompts` 资产，并在本仓库中去品牌化后作为 Lime
//! Agent 的 current prompt 事实源。业务代码不要散落手写同类 prompt。

mod agents;
mod apply_patch;
mod compact;
mod goals;
mod permissions;
mod realtime;
mod review_exit;
mod review_request;
mod template;

pub use agents::HIERARCHICAL_AGENTS_MESSAGE;
pub use apply_patch::APPLY_PATCH_TOOL_INSTRUCTIONS;
pub use compact::{SUMMARIZATION_PROMPT, SUMMARY_PREFIX};
pub use goals::{
    budget_limit_prompt, continuation_prompt, objective_updated_prompt, ThreadGoalPromptInput,
};
pub use permissions::{
    permissions_instructions, PermissionsPromptInput, PromptApprovalPolicy, PromptNetworkAccess,
    PromptSandboxMode,
};
pub use realtime::{
    REALTIME_BACKEND_PROMPT, REALTIME_END_INSTRUCTIONS, REALTIME_START_INSTRUCTIONS,
};
pub use review_exit::{render_review_exit_interrupted, render_review_exit_success};
pub use review_request::{
    resolve_review_prompt, review_prompt, ResolvedReviewPrompt, ReviewPromptTarget, REVIEW_PROMPT,
};

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn exports_all_reference_prompt_assets_without_reference_branding() {
        let assets = [
            HIERARCHICAL_AGENTS_MESSAGE,
            APPLY_PATCH_TOOL_INSTRUCTIONS,
            SUMMARIZATION_PROMPT,
            SUMMARY_PREFIX,
            REALTIME_BACKEND_PROMPT,
            REALTIME_START_INSTRUCTIONS,
            REALTIME_END_INSTRUCTIONS,
            REVIEW_PROMPT,
        ];
        let forbidden_upper = ["Co", "dex"].concat();
        let forbidden_lower = ["co", "dex"].concat();

        for asset in assets {
            assert!(!asset.contains(&forbidden_upper));
            assert!(!asset.contains(&forbidden_lower));
            assert!(!asset.trim().is_empty());
        }
    }
}

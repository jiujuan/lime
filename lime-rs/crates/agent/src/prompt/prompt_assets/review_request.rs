pub const REVIEW_PROMPT: &str = include_str!("../templates_upstream/review/rubric.md");

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ReviewPromptTarget {
    UncommittedChanges,
    BaseBranch {
        branch: String,
        merge_base_sha: Option<String>,
    },
    Commit {
        sha: String,
        title: Option<String>,
    },
    Custom {
        instructions: String,
    },
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedReviewPrompt {
    pub prompt: String,
    pub user_facing_hint: String,
}

pub fn resolve_review_prompt(target: ReviewPromptTarget) -> Result<ResolvedReviewPrompt, String> {
    let prompt = review_prompt(&target)?;
    let user_facing_hint = review_user_facing_hint(&target);
    Ok(ResolvedReviewPrompt {
        prompt,
        user_facing_hint,
    })
}

pub fn review_prompt(target: &ReviewPromptTarget) -> Result<String, String> {
    match target {
        ReviewPromptTarget::UncommittedChanges => Ok("Review the current code changes (staged, unstaged, and untracked files) and provide prioritized findings.".to_string()),
        ReviewPromptTarget::BaseBranch {
            branch,
            merge_base_sha,
        } => review_base_branch_prompt(branch, merge_base_sha.as_deref()),
        ReviewPromptTarget::Commit { sha, title } => review_commit_prompt(sha, title.as_deref()),
        ReviewPromptTarget::Custom { instructions } => {
            let prompt = instructions.trim();
            if prompt.is_empty() {
                return Err("review prompt cannot be empty".to_string());
            }
            Ok(prompt.to_string())
        }
    }
}

fn review_base_branch_prompt(branch: &str, merge_base_sha: Option<&str>) -> Result<String, String> {
    let branch = branch.trim();
    if branch.is_empty() {
        return Err("review base branch cannot be empty".to_string());
    }
    if let Some(merge_base_sha) = merge_base_sha
        .map(str::trim)
        .filter(|value| !value.is_empty())
    {
        Ok(format!(
            "Review the code changes against the base branch '{branch}'. The merge base commit for this comparison is {merge_base_sha}. Run `git diff {merge_base_sha}` to inspect the changes relative to {branch}. Provide prioritized, actionable findings."
        ))
    } else {
        Ok(format!(
            "Review the code changes against the base branch '{branch}'. Start by finding the merge diff between the current branch and {branch}'s upstream e.g. (`git merge-base HEAD \"$(git rev-parse --abbrev-ref \"{branch}@{{upstream}}\")\"`), then run `git diff` against that SHA to see what changes we would merge into the {branch} branch. Provide prioritized, actionable findings."
        ))
    }
}

fn review_commit_prompt(sha: &str, title: Option<&str>) -> Result<String, String> {
    let sha = sha.trim();
    if sha.is_empty() {
        return Err("review commit sha cannot be empty".to_string());
    }
    if let Some(title) = title.map(str::trim).filter(|value| !value.is_empty()) {
        Ok(format!(
            "Review the code changes introduced by commit {sha} (\"{title}\"). Provide prioritized, actionable findings."
        ))
    } else {
        Ok(format!(
            "Review the code changes introduced by commit {sha}. Provide prioritized, actionable findings."
        ))
    }
}

fn review_user_facing_hint(target: &ReviewPromptTarget) -> String {
    match target {
        ReviewPromptTarget::UncommittedChanges => "current changes".to_string(),
        ReviewPromptTarget::BaseBranch { branch, .. } => {
            format!("changes against '{}'", branch.trim())
        }
        ReviewPromptTarget::Commit { sha, title } => {
            let short_sha: String = sha.trim().chars().take(7).collect();
            if let Some(title) = title
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
            {
                format!("commit {short_sha}: {title}")
            } else {
                format!("commit {short_sha}")
            }
        }
        ReviewPromptTarget::Custom { instructions } => instructions.trim().to_string(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_review_prompt_targets() {
        let resolved = resolve_review_prompt(ReviewPromptTarget::BaseBranch {
            branch: "main".to_string(),
            merge_base_sha: Some("abc123".to_string()),
        })
        .expect("review prompt");

        assert!(resolved.prompt.contains("git diff abc123"));
        assert_eq!(resolved.user_facing_hint, "changes against 'main'");
    }
}

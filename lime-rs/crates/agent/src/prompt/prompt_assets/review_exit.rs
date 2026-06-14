use super::template::{normalize_line_endings, render_template};

const REVIEW_EXIT_SUCCESS_TEMPLATE: &str =
    include_str!("../templates_upstream/review/exit_success.xml");
const REVIEW_EXIT_INTERRUPTED_TEMPLATE: &str =
    include_str!("../templates_upstream/review/exit_interrupted.xml");

pub fn render_review_exit_success(results: &str) -> String {
    render_template(REVIEW_EXIT_SUCCESS_TEMPLATE, &[("results", results)])
}

pub fn render_review_exit_interrupted() -> String {
    normalize_line_endings(REVIEW_EXIT_INTERRUPTED_TEMPLATE)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn renders_review_exit_success() {
        let prompt = render_review_exit_success("[]");

        assert!(prompt.contains("<action>review</action>"));
        assert!(prompt.contains("[]"));
    }
}

//! Property-based tests for BashTool
//!
//! Permission rules live in `tool-runtime::shell_permission`; this vendor test
//! only covers BashTool behavior that still belongs to the Aster adapter.

#[allow(unused_imports)]
use aster::tools::BashTool;
use proptest::prelude::*;

// ============================================================================
// Arbitrary Generators
// ============================================================================

/// Generate arbitrary output strings of various lengths
fn arb_output(max_len: usize) -> impl Strategy<Value = String> {
    prop::collection::vec(any::<char>(), 0..max_len).prop_map(|chars| chars.into_iter().collect())
}

// ============================================================================
// Output Truncation Property Tests
// ============================================================================

proptest! {
    #![proptest_config(ProptestConfig::with_cases(100))]

    /// **Property: Output Truncation Preserves Length Limit**
    /// *For any* output string, truncation SHALL ensure the result does not
    /// exceed MAX_OUTPUT_LENGTH (plus truncation message overhead).
    ///
    /// **Validates: Requirements 3.9**
    /// **Feature: tool-alignment, Property 4: Safety Check Enforcement**
    #[test]
    fn prop_truncation_respects_max_length(output in arb_output(200_000)) {
        let tool = BashTool::new();
        let truncated = tool.truncate_output(&output);

        // Property: Truncated output should not exceed max length + overhead
        let max_with_overhead = aster::tools::MAX_OUTPUT_LENGTH + 100;
        prop_assert!(
            truncated.len() <= max_with_overhead,
            "Truncated output length {} exceeds max {} for input length {}",
            truncated.len(),
            max_with_overhead,
            output.len()
        );
    }

    /// **Property: Short Output Is Not Truncated**
    /// *For any* output shorter than MAX_OUTPUT_LENGTH, truncation SHALL
    /// return the original output unchanged.
    ///
    /// **Validates: Requirements 3.9**
    /// **Feature: tool-alignment, Property 4: Safety Check Enforcement**
    #[test]
    fn prop_short_output_unchanged(output in arb_output(1000)) {
        let tool = BashTool::new();
        let truncated = tool.truncate_output(&output);

        // Property: Short output should be unchanged
        if output.len() <= aster::tools::MAX_OUTPUT_LENGTH {
            prop_assert_eq!(
                truncated,
                output,
                "Short output was modified during truncation"
            );
        }
    }

    /// **Property: Truncated Output Contains Indicator**
    /// *For any* output longer than MAX_OUTPUT_LENGTH, truncation SHALL
    /// include a truncation indicator message.
    ///
    /// **Validates: Requirements 3.9**
    /// **Feature: tool-alignment, Property 4: Safety Check Enforcement**
    #[test]
    fn prop_long_output_has_indicator(output in arb_output(200_000)) {
        let tool = BashTool::new();

        if output.len() > aster::tools::MAX_OUTPUT_LENGTH {
            let truncated = tool.truncate_output(&output);

            // Property: Truncated output should contain indicator
            prop_assert!(
                truncated.contains("[Output truncated"),
                "Long output truncation missing indicator for input length {}",
                output.len()
            );
        }
    }
}

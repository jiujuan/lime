use serde::{Deserialize, Serialize};
use std::ops::{Add, AddAssign};

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderTokenUsage {
    pub input_tokens: Option<i32>,
    pub output_tokens: Option<i32>,
    pub total_tokens: Option<i32>,
    pub cached_input_tokens: Option<i32>,
    pub cache_creation_input_tokens: Option<i32>,
}

impl RuntimeReplyProviderTokenUsage {
    pub fn new(
        input_tokens: Option<i32>,
        output_tokens: Option<i32>,
        total_tokens: Option<i32>,
    ) -> Self {
        let calculated_total = total_tokens.or_else(|| match (input_tokens, output_tokens) {
            (Some(input), Some(output)) => Some(input + output),
            (Some(input), None) => Some(input),
            (None, Some(output)) => Some(output),
            (None, None) => None,
        });

        Self {
            input_tokens,
            output_tokens,
            total_tokens: calculated_total,
            cached_input_tokens: None,
            cache_creation_input_tokens: None,
        }
    }

    pub fn with_cached_input_tokens(mut self, cached_input_tokens: Option<i32>) -> Self {
        self.cached_input_tokens = cached_input_tokens;
        self
    }

    pub fn with_cache_creation_input_tokens(
        mut self,
        cache_creation_input_tokens: Option<i32>,
    ) -> Self {
        self.cache_creation_input_tokens = cache_creation_input_tokens;
        self
    }
}

impl Add for RuntimeReplyProviderTokenUsage {
    type Output = Self;

    fn add(self, other: Self) -> Self {
        Self::new(
            sum_optional_tokens(self.input_tokens, other.input_tokens),
            sum_optional_tokens(self.output_tokens, other.output_tokens),
            sum_optional_tokens(self.total_tokens, other.total_tokens),
        )
        .with_cached_input_tokens(sum_optional_tokens(
            self.cached_input_tokens,
            other.cached_input_tokens,
        ))
        .with_cache_creation_input_tokens(sum_optional_tokens(
            self.cache_creation_input_tokens,
            other.cache_creation_input_tokens,
        ))
    }
}

impl AddAssign for RuntimeReplyProviderTokenUsage {
    fn add_assign(&mut self, rhs: Self) {
        *self = *self + rhs;
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct RuntimeReplyProviderUsage {
    pub model: String,
    pub usage: RuntimeReplyProviderTokenUsage,
}

impl RuntimeReplyProviderUsage {
    pub fn new(model: String, usage: RuntimeReplyProviderTokenUsage) -> Self {
        Self { model, usage }
    }

    pub fn combine_with(&self, other: &RuntimeReplyProviderUsage) -> RuntimeReplyProviderUsage {
        RuntimeReplyProviderUsage {
            model: self.model.clone(),
            usage: self.usage + other.usage,
        }
    }
}

fn sum_optional_tokens(a: Option<i32>, b: Option<i32>) -> Option<i32> {
    match (a, b) {
        (Some(x), Some(y)) => Some(x + y),
        (Some(x), None) => Some(x),
        (None, Some(y)) => Some(y),
        (None, None) => None,
    }
}

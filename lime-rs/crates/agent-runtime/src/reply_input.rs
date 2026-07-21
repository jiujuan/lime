//! Reply input 的 current contract。
//!
//! 这里定义 Lime runtime 主链可传递的 reply input / action response input。
//! 具体后端需要的消息格式由对应 adapter 在边界转换。

use agent_protocol::action_required::ActionRequiredScope;
use model_provider::provider_stream::RuntimeReplyInputKind;
use serde::Serialize;
use serde_json::Value;
use std::fmt;

pub use agent_protocol::input::{
    AgentInput as RuntimeUserInput, AgentInputError as RuntimeUserInputError, ByteRange,
    ImageDetail, TextElement,
};

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RuntimeReplyInputImage {
    pub uri: String,
    pub media_type: String,
    pub provider_data: Option<String>,
    pub detail: Option<ImageDetail>,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub enum RuntimeReplyInputPart {
    Text {
        text: String,
        text_elements: Vec<TextElement>,
    },
    Image(RuntimeReplyInputImage),
    Skill {
        name: String,
        path: String,
    },
    Mention {
        name: String,
        path: String,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeReplyInputMedia {
    Image {
        uri: String,
        detail: Option<ImageDetail>,
    },
    LocalImage {
        path: String,
        detail: Option<ImageDetail>,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum RuntimeReplyInputBuildError<E> {
    EmptyUserInput,
    InvalidUserInput(RuntimeUserInputError),
    Media(E),
}

impl<E: fmt::Display> fmt::Display for RuntimeReplyInputBuildError<E> {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            Self::EmptyUserInput => formatter.write_str("runtime user input must not be empty"),
            Self::InvalidUserInput(error) => error.fmt(formatter),
            Self::Media(error) => error.fmt(formatter),
        }
    }
}

impl<E> std::error::Error for RuntimeReplyInputBuildError<E> where E: std::error::Error + 'static {}

#[derive(Clone, Debug, PartialEq, Eq, Serialize)]
pub struct RuntimeReplyInput {
    pub parts: Vec<RuntimeReplyInputPart>,
    pub agent_only: bool,
}

impl RuntimeReplyInput {
    pub fn text(text: impl Into<String>) -> Self {
        Self {
            parts: vec![RuntimeReplyInputPart::Text {
                text: text.into(),
                text_elements: Vec::new(),
            }],
            agent_only: false,
        }
    }

    pub fn agent_only_text(text: impl Into<String>) -> Self {
        Self {
            parts: vec![RuntimeReplyInputPart::Text {
                text: text.into(),
                text_elements: Vec::new(),
            }],
            agent_only: true,
        }
    }

    pub fn from_parts(parts: Vec<RuntimeReplyInputPart>) -> Self {
        Self {
            parts,
            agent_only: false,
        }
    }

    pub fn try_from_user_parts<E>(
        inputs: Vec<RuntimeUserInput>,
        mut resolve_media: impl FnMut(RuntimeReplyInputMedia) -> Result<RuntimeReplyInputImage, E>,
    ) -> Result<Self, RuntimeReplyInputBuildError<E>> {
        if inputs.is_empty() {
            return Err(RuntimeReplyInputBuildError::EmptyUserInput);
        }
        let mut parts = Vec::with_capacity(inputs.len());
        for input in inputs {
            input
                .validate()
                .map_err(RuntimeReplyInputBuildError::InvalidUserInput)?;
            let part = match input {
                RuntimeUserInput::Text {
                    text,
                    text_elements,
                } => RuntimeReplyInputPart::Text {
                    text,
                    text_elements,
                },
                RuntimeUserInput::Image { uri, detail } => RuntimeReplyInputPart::Image(
                    resolve_media(RuntimeReplyInputMedia::Image { uri, detail })
                        .map_err(RuntimeReplyInputBuildError::Media)?,
                ),
                RuntimeUserInput::LocalImage { path, detail } => RuntimeReplyInputPart::Image(
                    resolve_media(RuntimeReplyInputMedia::LocalImage { path, detail })
                        .map_err(RuntimeReplyInputBuildError::Media)?,
                ),
                RuntimeUserInput::Skill { name, path } => {
                    RuntimeReplyInputPart::Skill { name, path }
                }
                RuntimeUserInput::Mention { name, path } => {
                    RuntimeReplyInputPart::Mention { name, path }
                }
            };
            parts.push(part);
        }
        Ok(Self::from_parts(parts))
    }

    pub fn concat_text(&self) -> String {
        self.parts
            .iter()
            .filter_map(|part| match part {
                RuntimeReplyInputPart::Text { text, .. } => Some(text.as_str()),
                RuntimeReplyInputPart::Image(_)
                | RuntimeReplyInputPart::Skill { .. }
                | RuntimeReplyInputPart::Mention { .. } => None,
            })
            .collect()
    }

    pub fn has_images(&self) -> bool {
        self.parts
            .iter()
            .any(|part| matches!(part, RuntimeReplyInputPart::Image(_)))
    }

    pub fn images(&self) -> impl Iterator<Item = &RuntimeReplyInputImage> {
        self.parts.iter().filter_map(|part| match part {
            RuntimeReplyInputPart::Image(image) => Some(image),
            RuntimeReplyInputPart::Text { .. }
            | RuntimeReplyInputPart::Skill { .. }
            | RuntimeReplyInputPart::Mention { .. } => None,
        })
    }

    pub fn push_image(&mut self, image: RuntimeReplyInputImage) {
        self.parts.push(RuntimeReplyInputPart::Image(image));
    }
}

#[derive(Clone, Debug)]
pub struct RuntimeActionRequiredResponseInput {
    pub request_id: String,
    pub user_data: Value,
    pub scope: Option<ActionRequiredScope>,
}

impl RuntimeActionRequiredResponseInput {
    pub fn new(
        request_id: impl Into<String>,
        user_data: Value,
        scope: Option<ActionRequiredScope>,
    ) -> Self {
        Self {
            request_id: request_id.into(),
            user_data,
            scope,
        }
    }
}

#[derive(Clone, Debug)]
pub enum RuntimeReplyAttemptInput {
    Current(RuntimeReplyInput),
    ActionRequiredResponse(RuntimeActionRequiredResponseInput),
}

impl RuntimeReplyAttemptInput {
    pub fn as_concat_text(&self) -> String {
        match self {
            Self::Current(input) => input.concat_text(),
            Self::ActionRequiredResponse(_) => String::new(),
        }
    }

    pub fn runtime_input_kind(&self) -> RuntimeReplyInputKind {
        match self {
            Self::Current(_) => RuntimeReplyInputKind::UserMessage,
            Self::ActionRequiredResponse(_) => RuntimeReplyInputKind::ActionRequiredResponse,
        }
    }
}

impl From<RuntimeReplyInput> for RuntimeReplyAttemptInput {
    fn from(input: RuntimeReplyInput) -> Self {
        Self::Current(input)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use std::convert::Infallible;

    #[test]
    fn reply_input_builds_user_and_agent_only_messages() {
        let user = RuntimeReplyInput::text("hello");
        let agent_only = RuntimeReplyInput::agent_only_text("continue");

        assert_eq!(user.concat_text(), "hello");
        assert!(!user.agent_only);
        assert_eq!(agent_only.concat_text(), "continue");
        assert!(agent_only.agent_only);
    }

    #[test]
    fn reply_input_preserves_order_and_structured_non_provider_parts() {
        let input = RuntimeReplyInput::from_parts(vec![
            RuntimeReplyInputPart::Text {
                text: "before".to_string(),
                text_elements: vec![TextElement::new(0..6, None)],
            },
            RuntimeReplyInputPart::Skill {
                name: "review".to_string(),
                path: "/skills/review/SKILL.md".to_string(),
            },
            RuntimeReplyInputPart::Image(RuntimeReplyInputImage {
                uri: "sidecar://image-1".to_string(),
                media_type: "image/png".to_string(),
                provider_data: Some("data:image/png;base64,abc".to_string()),
                detail: Some(ImageDetail::High),
            }),
            RuntimeReplyInputPart::Mention {
                name: "docs".to_string(),
                path: "app://docs".to_string(),
            },
            RuntimeReplyInputPart::Text {
                text: "after".to_string(),
                text_elements: Vec::new(),
            },
        ]);

        assert_eq!(input.concat_text(), "beforeafter");
        assert_eq!(input.images().count(), 1);
        assert!(input.has_images());
        assert!(matches!(
            input.parts.as_slice(),
            [
                RuntimeReplyInputPart::Text { .. },
                RuntimeReplyInputPart::Skill { .. },
                RuntimeReplyInputPart::Image(RuntimeReplyInputImage {
                    detail: Some(ImageDetail::High),
                    ..
                }),
                RuntimeReplyInputPart::Mention { .. },
                RuntimeReplyInputPart::Text { .. },
            ]
        ));
    }

    #[test]
    fn typed_user_parts_delegate_media_and_preserve_order() {
        let mut resolved = Vec::new();
        let input = RuntimeReplyInput::try_from_user_parts(
            vec![
                RuntimeUserInput::Text {
                    text: "before".to_string(),
                    text_elements: vec![TextElement::new(0..6, None)],
                },
                RuntimeUserInput::Skill {
                    name: "review".to_string(),
                    path: "/skills/review/SKILL.md".to_string(),
                },
                RuntimeUserInput::Image {
                    uri: "https://example.com/image.png".to_string(),
                    detail: Some(ImageDetail::High),
                },
                RuntimeUserInput::LocalImage {
                    path: "/workspace/image.png".to_string(),
                    detail: Some(ImageDetail::Original),
                },
                RuntimeUserInput::Mention {
                    name: "docs".to_string(),
                    path: "app://docs".to_string(),
                },
            ],
            |media| -> Result<RuntimeReplyInputImage, Infallible> {
                resolved.push(media.clone());
                let (uri, detail) = match media {
                    RuntimeReplyInputMedia::Image { uri, detail } => (uri, detail),
                    RuntimeReplyInputMedia::LocalImage { path, detail } => {
                        (format!("sidecar://{path}"), detail)
                    }
                };
                Ok(RuntimeReplyInputImage {
                    uri,
                    media_type: "image/png".to_string(),
                    provider_data: None,
                    detail,
                })
            },
        )
        .expect("typed input");

        assert_eq!(resolved.len(), 2);
        assert!(matches!(
            resolved.as_slice(),
            [
                RuntimeReplyInputMedia::Image {
                    detail: Some(ImageDetail::High),
                    ..
                },
                RuntimeReplyInputMedia::LocalImage {
                    detail: Some(ImageDetail::Original),
                    ..
                },
            ]
        ));
        assert!(matches!(
            input.parts.as_slice(),
            [
                RuntimeReplyInputPart::Text { .. },
                RuntimeReplyInputPart::Skill { .. },
                RuntimeReplyInputPart::Image(RuntimeReplyInputImage {
                    detail: Some(ImageDetail::High),
                    ..
                }),
                RuntimeReplyInputPart::Image(RuntimeReplyInputImage {
                    detail: Some(ImageDetail::Original),
                    ..
                }),
                RuntimeReplyInputPart::Mention { .. },
            ]
        ));
    }

    #[test]
    fn typed_user_parts_fail_before_or_at_media_owner() {
        let empty = RuntimeReplyInput::try_from_user_parts(
            Vec::new(),
            |_| -> Result<RuntimeReplyInputImage, Infallible> {
                panic!("empty input must fail before media resolution")
            },
        );
        assert_eq!(empty, Err(RuntimeReplyInputBuildError::EmptyUserInput));

        let invalid = RuntimeReplyInput::try_from_user_parts(
            vec![RuntimeUserInput::Text {
                text: "a世界".to_string(),
                text_elements: vec![TextElement::new(2..7, None)],
            }],
            |_| -> Result<RuntimeReplyInputImage, Infallible> {
                panic!("invalid text must fail before media resolution")
            },
        );
        assert!(matches!(
            invalid,
            Err(RuntimeReplyInputBuildError::InvalidUserInput(
                RuntimeUserInputError::InvalidTextElement { .. }
            ))
        ));

        let media_error = RuntimeReplyInput::try_from_user_parts(
            vec![RuntimeUserInput::LocalImage {
                path: "/workspace/missing.png".to_string(),
                detail: None,
            }],
            |_| Err("local image is unreadable"),
        );
        assert_eq!(
            media_error,
            Err(RuntimeReplyInputBuildError::Media(
                "local image is unreadable"
            ))
        );
    }

    #[test]
    fn reply_attempt_input_reports_kind_without_backend_message() {
        let user = RuntimeReplyAttemptInput::from(RuntimeReplyInput::text("hello"));
        let action = RuntimeReplyAttemptInput::ActionRequiredResponse(
            RuntimeActionRequiredResponseInput::new("request-1", json!({"answer": "ok"}), None),
        );

        assert_eq!(user.as_concat_text(), "hello");
        assert_eq!(
            user.runtime_input_kind(),
            RuntimeReplyInputKind::UserMessage
        );
        assert_eq!(
            action.runtime_input_kind(),
            RuntimeReplyInputKind::ActionRequiredResponse
        );
    }
}

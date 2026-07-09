use agent_protocol::action_required::ActionRequiredScope;
use futures::future::BoxFuture;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::fmt;
use std::time::Duration;

pub const ASK_USER_QUESTIONS_SCHEMA_KEY: &str = "x-lime-ask-user-questions";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AskQuestion {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub id: Option<String>,
    pub question: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub header: Option<String>,
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub options: Vec<AskOption>,
    #[serde(default, alias = "multi_select")]
    pub multi_select: bool,
}

impl AskQuestion {
    pub fn new(question: impl Into<String>) -> Self {
        Self {
            id: None,
            question: question.into(),
            header: None,
            options: Vec::new(),
            multi_select: false,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AskOption {
    pub value: String,
    pub label: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub description: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
}

impl AskOption {
    pub fn with_label(value: impl Into<String>, label: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            label: Some(label.into()),
            description: None,
            preview: None,
        }
    }

    pub fn display(&self) -> &str {
        self.label.as_deref().unwrap_or(&self.value)
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct AskRequest {
    pub questions: Vec<AskQuestion>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct RequestUserInputRunRequest {
    pub request: AskRequest,
    pub scope: Option<ActionRequiredScope>,
    pub timeout: Duration,
}

impl RequestUserInputRunRequest {
    pub fn new(request: AskRequest, scope: Option<ActionRequiredScope>, timeout: Duration) -> Self {
        Self {
            request,
            scope,
            timeout,
        }
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RequestUserInputAction {
    pub prompt: String,
    pub requested_schema: Value,
    pub scope: Option<ActionRequiredScope>,
    pub timeout: Duration,
}

pub trait RequestUserInputGateway: Send + Sync {
    fn request_user_input<'a>(
        &'a self,
        action: RequestUserInputAction,
    ) -> BoxFuture<'a, anyhow::Result<Value>>;
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestUserInputError {
    prompt: String,
    message: String,
}

impl RequestUserInputError {
    pub fn new(prompt: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            prompt: prompt.into(),
            message: message.into(),
        }
    }

    pub fn prompt(&self) -> &str {
        &self.prompt
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for RequestUserInputError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for RequestUserInputError {}

pub fn resolve_request_prompt(request: &AskRequest) -> String {
    request
        .questions
        .first()
        .map(|question| question.question.trim().to_string())
        .filter(|question| !question.is_empty())
        .unwrap_or_else(|| "请提供继续执行所需信息".to_string())
}

fn question_field_key(question: &AskQuestion, index: usize, total: usize) -> String {
    if total == 1 {
        return "answer".to_string();
    }

    if let Some(header) = question.header.as_deref() {
        let normalized = header
            .trim()
            .to_lowercase()
            .chars()
            .map(|ch| {
                if ch.is_ascii_alphanumeric() || ch == '_' || ch == '-' {
                    ch
                } else {
                    '_'
                }
            })
            .collect::<String>()
            .trim_matches('_')
            .to_string();

        if !normalized.is_empty() {
            return normalized;
        }
    }

    format!("question_{}", index + 1)
}

fn build_question_schema(question: &AskQuestion, index: usize, total: usize) -> (String, Value) {
    let field_key = question_field_key(question, index, total);
    let option_labels = question
        .options
        .iter()
        .map(|option| option.display().to_string())
        .collect::<Vec<_>>();

    let mut property = json!({
        "title": question.header.clone().unwrap_or_else(|| question.question.clone()),
        "description": question.question,
    });

    if let Some(object) = property.as_object_mut() {
        if question.multi_select {
            object.insert("type".to_string(), json!("array"));
            object.insert(
                "items".to_string(),
                json!({
                    "type": "string",
                    "enum": option_labels,
                }),
            );
        } else {
            object.insert("type".to_string(), json!("string"));
            if !option_labels.is_empty() {
                object.insert("enum".to_string(), json!(option_labels));
            }
        }
    }

    (field_key, property)
}

pub fn build_requested_schema(request: &AskRequest) -> Value {
    let total = request.questions.len();
    let mut properties = serde_json::Map::new();
    let mut required = Vec::new();

    for (index, question) in request.questions.iter().enumerate() {
        let (field_key, property) = build_question_schema(question, index, total);
        properties.insert(field_key.clone(), property);
        required.push(field_key);
    }

    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        ASK_USER_QUESTIONS_SCHEMA_KEY: request.questions,
    })
}

pub async fn run_request_user_input<G>(
    gateway: &G,
    run_request: RequestUserInputRunRequest,
) -> Result<Option<Value>, RequestUserInputError>
where
    G: RequestUserInputGateway + ?Sized,
{
    let prompt = resolve_request_prompt(&run_request.request);
    let action = RequestUserInputAction {
        prompt: prompt.clone(),
        requested_schema: build_requested_schema(&run_request.request),
        scope: run_request.scope,
        timeout: run_request.timeout,
    };
    let user_data = gateway
        .request_user_input(action)
        .await
        .map_err(|err| RequestUserInputError::new(prompt, err.to_string()))?;

    Ok(extract_response(&run_request.request, &user_data))
}

fn normalize_answer_value(question: &AskQuestion, value: &Value) -> Option<String> {
    let raw_values = match value {
        Value::String(text) => {
            let trimmed = text.trim();
            if trimmed.is_empty() {
                return None;
            }
            vec![trimmed.to_string()]
        }
        Value::Array(items) => items
            .iter()
            .filter_map(|item| match item {
                Value::String(text) => {
                    let trimmed = text.trim();
                    if trimmed.is_empty() {
                        None
                    } else {
                        Some(trimmed.to_string())
                    }
                }
                _ => None,
            })
            .collect::<Vec<_>>(),
        Value::Number(number) => vec![number.to_string()],
        Value::Bool(value) => vec![value.to_string()],
        _ => return None,
    };

    if raw_values.is_empty() {
        return None;
    }

    let normalized = raw_values
        .into_iter()
        .map(|raw| {
            question
                .options
                .iter()
                .find(|option| raw == option.display() || raw == option.value)
                .map(|option| option.value.clone())
                .unwrap_or(raw)
        })
        .collect::<Vec<_>>();

    Some(normalized.join(", "))
}

fn collect_answers(request: &AskRequest, user_data: &Value) -> serde_json::Map<String, Value> {
    let mut answers = serde_json::Map::new();
    let total = request.questions.len();

    match user_data {
        Value::String(_) | Value::Array(_) | Value::Number(_) | Value::Bool(_) => {
            if let Some(question) = request.questions.first() {
                if let Some(answer) = normalize_answer_value(question, user_data) {
                    answers.insert(question.question.clone(), json!(answer));
                }
            }
            return answers;
        }
        Value::Object(map) => {
            if let Some(Value::Object(existing_answers)) = map.get("answers") {
                for question in &request.questions {
                    if let Some(value) = existing_answers.get(&question.question) {
                        if let Some(answer) = normalize_answer_value(question, value) {
                            answers.insert(question.question.clone(), json!(answer));
                        }
                    }
                }
            }

            for (index, question) in request.questions.iter().enumerate() {
                if answers.contains_key(&question.question) {
                    continue;
                }

                for key in [
                    question.question.clone(),
                    question.header.clone().unwrap_or_default(),
                    question_field_key(question, index, total),
                ] {
                    if key.is_empty() {
                        continue;
                    }

                    if let Some(value) = map.get(&key) {
                        if let Some(answer) = normalize_answer_value(question, value) {
                            answers.insert(question.question.clone(), json!(answer));
                            break;
                        }
                    }
                }
            }

            if answers.is_empty() && total == 1 {
                let candidate = map.get("other").or_else(|| map.get("answer"));
                if let (Some(question), Some(value)) = (request.questions.first(), candidate) {
                    if let Some(answer) = normalize_answer_value(question, value) {
                        answers.insert(question.question.clone(), json!(answer));
                    }
                }
            }
        }
        _ => {}
    }

    answers
}

pub fn extract_response(request: &AskRequest, user_data: &Value) -> Option<Value> {
    let answers = collect_answers(request, user_data);
    if answers.is_empty() {
        return None;
    }

    if request.questions.len() == 1 {
        let question_text = request.questions[0].question.clone();
        let answer = answers.get(&question_text)?.clone();
        return Some(json!({
            "answer": answer,
            "answers": {
                question_text: answer,
            }
        }));
    }

    Some(json!({ "answers": answers }))
}

#[cfg(test)]
mod tests {
    use super::{
        build_requested_schema, extract_response, run_request_user_input, AskOption, AskQuestion,
        AskRequest, RequestUserInputAction, RequestUserInputGateway, RequestUserInputRunRequest,
        ASK_USER_QUESTIONS_SCHEMA_KEY,
    };
    use agent_protocol::action_required::ActionRequiredScope;
    use futures::future::BoxFuture;
    use std::sync::{Arc, Mutex};
    use std::time::Duration;

    #[derive(Clone)]
    struct CapturingGateway {
        actions: Arc<Mutex<Vec<RequestUserInputAction>>>,
        response: serde_json::Value,
    }

    impl RequestUserInputGateway for CapturingGateway {
        fn request_user_input<'a>(
            &'a self,
            action: RequestUserInputAction,
        ) -> BoxFuture<'a, anyhow::Result<serde_json::Value>> {
            Box::pin(async move {
                self.actions.lock().expect("actions lock").push(action);
                Ok(self.response.clone())
            })
        }
    }

    #[test]
    fn build_requested_schema_embeds_questions_extension() {
        let request = AskRequest {
            questions: vec![AskQuestion {
                id: Some("primary_color".to_string()),
                question: "你希望主色调是什么？".to_string(),
                header: Some("主色调".to_string()),
                options: vec![
                    AskOption {
                        value: "blue-purple".to_string(),
                        label: Some("蓝紫".to_string()),
                        description: Some("冷色科技感".to_string()),
                        preview: None,
                    },
                    AskOption {
                        value: "cyber-green".to_string(),
                        label: Some("赛博绿".to_string()),
                        description: Some("高亮未来感".to_string()),
                        preview: None,
                    },
                ],
                multi_select: false,
            }],
        };

        let schema = build_requested_schema(&request);
        assert_eq!(
            schema
                .get(ASK_USER_QUESTIONS_SCHEMA_KEY)
                .and_then(|value| value.as_array())
                .map(|value| value.len()),
            Some(1)
        );
        assert_eq!(
            schema["properties"]["answer"]["enum"],
            serde_json::json!(["蓝紫", "赛博绿"])
        );
    }

    #[test]
    fn extract_response_normalizes_question_answers() {
        let request = AskRequest {
            questions: vec![
                AskQuestion::new("第一问"),
                AskQuestion {
                    id: Some("mode".to_string()),
                    question: "第二问".to_string(),
                    header: Some("mode".to_string()),
                    options: vec![
                        AskOption::with_label("auto", "自动执行"),
                        AskOption::with_label("confirm", "确认后执行"),
                    ],
                    multi_select: false,
                },
            ],
        };

        let response = extract_response(
            &request,
            &serde_json::json!({
                "question_1": "先看结构",
                "mode": "确认后执行"
            }),
        )
        .expect("expected normalized response");

        assert_eq!(
            response,
            serde_json::json!({
                "answers": {
                    "第一问": "先看结构",
                    "第二问": "confirm"
                }
            })
        );
    }

    #[test]
    fn extract_response_normalizes_multi_select_answers() {
        let request = AskRequest {
            questions: vec![AskQuestion {
                id: Some("skills".to_string()),
                question: "请选择能力".to_string(),
                header: Some("skills".to_string()),
                options: vec![
                    AskOption::with_label("analysis", "分析"),
                    AskOption::with_label("coding", "编码"),
                ],
                multi_select: true,
            }],
        };

        let response = extract_response(
            &request,
            &serde_json::json!({
                "answer": ["分析", "编码"]
            }),
        )
        .expect("expected normalized response");

        assert_eq!(
            response,
            serde_json::json!({
                "answer": "analysis, coding",
                "answers": {
                    "请选择能力": "analysis, coding"
                }
            })
        );
    }

    #[test]
    fn run_request_user_input_builds_action_and_normalizes_response() {
        let actions = Arc::new(Mutex::new(Vec::new()));
        let gateway = CapturingGateway {
            actions: Arc::clone(&actions),
            response: serde_json::json!({
                "answer": "确认后执行"
            }),
        };
        let request = AskRequest {
            questions: vec![AskQuestion {
                id: Some("mode".to_string()),
                question: "请选择执行模式".to_string(),
                header: Some("mode".to_string()),
                options: vec![
                    AskOption::with_label("auto", "自动执行"),
                    AskOption::with_label("confirm", "确认后执行"),
                ],
                multi_select: false,
            }],
        };
        let scope = Some(ActionRequiredScope {
            session_id: Some("session-1".to_string()),
            thread_id: Some("thread-1".to_string()),
            turn_id: Some("turn-1".to_string()),
        });

        let response = futures::executor::block_on(run_request_user_input(
            &gateway,
            RequestUserInputRunRequest::new(request, scope.clone(), Duration::from_secs(5)),
        ))
        .expect("request should run")
        .expect("response should normalize");

        assert_eq!(
            response,
            serde_json::json!({
                "answer": "confirm",
                "answers": {
                    "请选择执行模式": "confirm"
                }
            })
        );

        let actions = actions.lock().expect("actions lock");
        assert_eq!(actions.len(), 1);
        assert_eq!(actions[0].prompt, "请选择执行模式");
        assert_eq!(actions[0].scope, scope);
        assert_eq!(actions[0].timeout, Duration::from_secs(5));
        assert_eq!(
            actions[0].requested_schema["properties"]["answer"]["enum"],
            serde_json::json!(["自动执行", "确认后执行"])
        );
    }
}

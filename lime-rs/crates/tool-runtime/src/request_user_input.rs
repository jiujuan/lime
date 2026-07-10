use serde::{Deserialize, Deserializer, Serialize};
use serde_json::{json, Map, Value};
use std::collections::{BTreeMap, BTreeSet};
use std::fmt;

pub const DEFAULT_REQUEST_USER_INPUT_TIMEOUT_SECS: u64 = 300;
pub const REQUEST_USER_INPUT_TOOL_NAME: &str = "request_user_input";
pub const REQUEST_USER_INPUT_HEADER_WIDTH: usize = 12;
pub const ASK_USER_QUESTIONS_SCHEMA_KEY: &str = "x-lime-ask-user-questions";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RequestUserInputSurfaceErrorKind {
    InvalidParams,
    ExecutionFailed,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct RequestUserInputSurfaceError {
    kind: RequestUserInputSurfaceErrorKind,
    message: String,
}

impl RequestUserInputSurfaceError {
    pub fn invalid_params(message: impl Into<String>) -> Self {
        Self {
            kind: RequestUserInputSurfaceErrorKind::InvalidParams,
            message: message.into(),
        }
    }

    pub fn execution_failed(message: impl Into<String>) -> Self {
        Self {
            kind: RequestUserInputSurfaceErrorKind::ExecutionFailed,
            message: message.into(),
        }
    }

    pub fn kind(&self) -> RequestUserInputSurfaceErrorKind {
        self.kind
    }

    pub fn message(&self) -> &str {
        &self.message
    }
}

impl fmt::Display for RequestUserInputSurfaceError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(formatter, "{}", self.message)
    }
}

impl std::error::Error for RequestUserInputSurfaceError {}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
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

    pub fn with_options(question: impl Into<String>, options: Vec<AskOption>) -> Self {
        Self {
            id: None,
            question: question.into(),
            header: None,
            options,
            multi_select: false,
        }
    }

    fn validate(&self) -> Result<(), RequestUserInputSurfaceError> {
        if self.question.trim().is_empty() {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "Question text cannot be empty",
            ));
        }

        if self.options.len() > 4 {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "Question options cannot exceed 4 choices",
            ));
        }

        for option in &self.options {
            option.validate()?;
        }

        Ok(())
    }

    fn validate_current_surface(&self) -> Result<(), RequestUserInputSurfaceError> {
        let id = self
            .id
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                RequestUserInputSurfaceError::invalid_params(
                    "request_user_input.questions[].id is required",
                )
            })?;

        if !id.chars().all(|character| {
            character.is_ascii_lowercase() || character == '_' || character.is_ascii_digit()
        }) {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "request_user_input.questions[].id must be snake_case",
            ));
        }

        let header = self
            .header
            .as_deref()
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .ok_or_else(|| {
                RequestUserInputSurfaceError::invalid_params(
                    "Question header is required for request_user_input",
                )
            })?;

        if header.chars().count() > REQUEST_USER_INPUT_HEADER_WIDTH {
            return Err(RequestUserInputSurfaceError::invalid_params(format!(
                "Question header cannot exceed {REQUEST_USER_INPUT_HEADER_WIDTH} characters"
            )));
        }

        if self.options.len() < 2 || self.options.len() > 3 {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "Each request_user_input question must provide 2-3 options",
            ));
        }

        let mut labels = BTreeSet::new();
        for option in &self.options {
            let label = option.display().trim();
            if !labels.insert(label.to_string()) {
                return Err(RequestUserInputSurfaceError::invalid_params(
                    "Option labels must be unique within each question",
                ));
            }
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct AskRequest {
    pub questions: Vec<AskQuestion>,
}

impl AskRequest {
    pub fn from_legacy(question: impl Into<String>, options: Vec<AskOption>) -> Self {
        Self {
            questions: vec![AskQuestion::with_options(question, options)],
        }
    }

    fn validate(&self) -> Result<(), RequestUserInputSurfaceError> {
        if self.questions.is_empty() {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "At least one question is required",
            ));
        }

        if self.questions.len() > 3 {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "request_user_input questions cannot exceed 3 entries",
            ));
        }

        for question in &self.questions {
            question.validate()?;
        }

        Ok(())
    }

    fn validate_current_surface(&self) -> Result<(), RequestUserInputSurfaceError> {
        self.validate()?;

        let mut question_texts = BTreeSet::new();
        let mut headers = BTreeSet::new();
        for question in &self.questions {
            if !question_texts.insert(question.question.trim().to_string()) {
                return Err(RequestUserInputSurfaceError::invalid_params(
                    "Question texts must be unique",
                ));
            }
            question.validate_current_surface()?;
            if let Some(header) = question.header.as_deref().map(str::trim) {
                if !headers.insert(header.to_string()) {
                    return Err(RequestUserInputSurfaceError::invalid_params(
                        "Question headers must be unique",
                    ));
                }
            }
        }

        Ok(())
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
    pub fn new(value: impl Into<String>) -> Self {
        Self {
            value: value.into(),
            label: None,
            description: None,
            preview: None,
        }
    }

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

    fn validate(&self) -> Result<(), RequestUserInputSurfaceError> {
        if self.value.trim().is_empty() && self.display().trim().is_empty() {
            return Err(RequestUserInputSurfaceError::invalid_params(
                "Option value/label cannot both be empty",
            ));
        }

        Ok(())
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq, Default)]
#[serde(rename_all = "camelCase")]
pub struct AskAnnotation {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub preview: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub notes: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AskResult {
    pub response: Value,
    pub answers: BTreeMap<String, String>,
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub annotations: BTreeMap<String, AskAnnotation>,
    pub from_option: bool,
    pub option_index: Option<usize>,
}

impl AskResult {
    fn new(
        response: Value,
        answers: BTreeMap<String, String>,
        annotations: BTreeMap<String, AskAnnotation>,
        from_option: bool,
        option_index: Option<usize>,
    ) -> Self {
        Self {
            response,
            answers,
            annotations,
            from_option,
            option_index,
        }
    }

    pub fn primary_response(&self) -> Option<&str> {
        self.answers.values().next().map(String::as_str)
    }
}

#[derive(Debug, Clone, PartialEq)]
pub struct RequestUserInputProjection {
    pub output: String,
    pub metadata: BTreeMap<String, Value>,
}

pub fn project_request_user_input_result(
    request: &AskRequest,
    result: &AskResult,
) -> RequestUserInputProjection {
    let answers_text = result
        .answers
        .iter()
        .map(|(question, answer)| {
            let mut parts = vec![format!("\"{question}\"=\"{answer}\"")];
            if let Some(annotation) = result.annotations.get(question) {
                if let Some(preview) = annotation.preview.as_deref() {
                    parts.push(format!("selected preview:\n{preview}"));
                }
                if let Some(notes) = annotation.notes.as_deref() {
                    parts.push(format!("user notes: {notes}"));
                }
            }
            parts.join(" ")
        })
        .collect::<Vec<_>>()
        .join(", ");
    let output = format!(
        "User has answered your questions: {answers_text}. You can now continue with the user's answers in mind."
    );

    let mut metadata = BTreeMap::new();
    metadata.insert("questions".to_string(), json!(request.questions));
    metadata.insert("answers".to_string(), json!(result.answers));
    metadata.insert("raw_response".to_string(), result.response.clone());
    if !result.annotations.is_empty() {
        metadata.insert("annotations".to_string(), json!(result.annotations));
    }

    RequestUserInputProjection { output, metadata }
}

#[derive(Debug, Clone)]
enum AskOptionInput {
    String(String),
    Object(AskOptionObject),
}

impl<'de> Deserialize<'de> for AskOptionInput {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        let value = Value::deserialize(deserializer)?;
        match value {
            Value::String(value) => Ok(Self::String(value)),
            Value::Object(_) => serde_json::from_value::<AskOptionObject>(value)
                .map(Self::Object)
                .map_err(serde::de::Error::custom),
            _ => Err(serde::de::Error::custom(
                "ask option must be a string or object",
            )),
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AskOptionObject {
    value: Option<String>,
    label: Option<String>,
    description: Option<String>,
    preview: Option<String>,
}

impl TryFrom<AskOptionInput> for AskOption {
    type Error = RequestUserInputSurfaceError;

    fn try_from(value: AskOptionInput) -> Result<Self, Self::Error> {
        match value {
            AskOptionInput::String(value) => {
                let option = AskOption::new(value);
                option.validate()?;
                Ok(option)
            }
            AskOptionInput::Object(object) => {
                let value = object
                    .value
                    .or_else(|| object.label.clone())
                    .unwrap_or_default();
                let option = AskOption {
                    value,
                    label: object.label,
                    description: object.description,
                    preview: object.preview,
                };
                option.validate()?;
                Ok(option)
            }
        }
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct AskQuestionInput {
    id: Option<String>,
    question: String,
    header: Option<String>,
    options: Option<Vec<AskOptionInput>>,
    #[serde(default, alias = "multi_select")]
    multi_select: bool,
}

impl TryFrom<AskQuestionInput> for AskQuestion {
    type Error = RequestUserInputSurfaceError;

    fn try_from(value: AskQuestionInput) -> Result<Self, Self::Error> {
        let options = value
            .options
            .unwrap_or_default()
            .into_iter()
            .map(AskOption::try_from)
            .collect::<Result<Vec<_>, _>>()?;

        let question = AskQuestion {
            id: value.id,
            question: value.question,
            header: value.header,
            options,
            multi_select: value.multi_select,
        };
        question.validate()?;
        Ok(question)
    }
}

#[derive(Debug, Clone, Deserialize)]
#[serde(deny_unknown_fields, rename_all = "camelCase")]
struct RequestUserInputToolInput {
    questions: Option<Vec<AskQuestionInput>>,
    #[serde(default, alias = "auto_resolution_ms")]
    auto_resolution_ms: Option<u64>,
}

pub fn parse_request_user_input_tool_input(
    params: Value,
) -> Result<AskRequest, RequestUserInputSurfaceError> {
    let input: RequestUserInputToolInput = serde_json::from_value(params).map_err(|error| {
        RequestUserInputSurfaceError::invalid_params(format!(
            "Failed to parse request_user_input input: {error}"
        ))
    })?;

    let _auto_resolution_ms = input.auto_resolution_ms;
    let questions = input.questions.ok_or_else(|| {
        RequestUserInputSurfaceError::invalid_params("Missing required parameter: questions")
    })?;
    let request = AskRequest {
        questions: questions
            .into_iter()
            .map(AskQuestion::try_from)
            .collect::<Result<Vec<_>, _>>()?,
    };

    request.validate_current_surface()?;
    Ok(request)
}

pub fn request_user_input_tool_input_schema() -> Value {
    json!({
        "type": "object",
        "additionalProperties": false,
        "properties": {
            "questions": {
                "type": "array",
                "description": "Questions to show the user. Prefer 1 and do not exceed 3",
                "minItems": 1,
                "maxItems": 3,
                "items": {
                    "type": "object",
                    "additionalProperties": false,
                    "properties": {
                        "id": {
                            "type": "string",
                            "description": "Stable identifier for mapping answers (snake_case)."
                        },
                        "header": {
                            "type": "string",
                            "description": "Short header label shown in the UI (12 or fewer chars)."
                        },
                        "question": {
                            "type": "string",
                            "description": "Single-sentence prompt shown to the user."
                        },
                        "options": {
                            "type": "array",
                            "description": "Provide 2-3 mutually exclusive choices. Put the recommended option first and suffix its label with \"(Recommended)\". Do not include an \"Other\" option in this list; the client will add a free-form \"Other\" option automatically.",
                            "minItems": 2,
                            "maxItems": 3,
                            "items": {
                                "type": "object",
                                "additionalProperties": false,
                                "properties": {
                                    "label": {
                                        "type": "string",
                                        "description": "User-facing label (1-5 words)."
                                    },
                                    "description": {
                                        "type": "string",
                                        "description": "One short sentence explaining impact/tradeoff if selected."
                                    }
                                },
                                "required": ["label", "description"]
                            }
                        }
                    },
                    "required": ["id", "header", "question", "options"]
                }
            },
            "autoResolutionMs": {
                "type": "number",
                "minimum": 60000,
                "maximum": 240000,
                "description": "Optional auto-resolution window in milliseconds, from 60000 to 240000. Include this only when the question is useful but non-blocking and continuing with best judgment is acceptable if the user does not answer; omit it when explicit user input is required before continuing."
            }
        },
        "required": ["questions"]
    })
}

pub fn resolve_request_prompt(request: &AskRequest) -> String {
    request
        .questions
        .first()
        .map(|question| question.question.trim().to_string())
        .filter(|question| !question.is_empty())
        .unwrap_or_else(|| "请提供继续执行所需信息".to_string())
}

fn requested_schema_field_key(question: &AskQuestion, index: usize, total: usize) -> String {
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

fn elicitation_field_key(question: &AskQuestion, index: usize, total: usize) -> String {
    if total == 1 {
        if let Some(header) = question.header.as_deref() {
            let trimmed = header.trim();
            if !trimmed.is_empty() {
                return trimmed.to_string();
            }
        }
        return "answer".to_string();
    }

    if let Some(header) = question.header.as_deref() {
        let normalized = header.trim().to_string();
        if !normalized.is_empty() {
            return normalized;
        }
    }

    format!("question_{}", index + 1)
}

fn build_question_schema(question: &AskQuestion, index: usize, total: usize) -> (String, Value) {
    let field_key = requested_schema_field_key(question, index, total);
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
                Value::Number(number) => Some(number.to_string()),
                Value::Bool(value) => Some(value.to_string()),
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

fn answer_candidate_keys(question: &AskQuestion, index: usize, total: usize) -> Vec<String> {
    let mut keys = vec![
        question.question.clone(),
        question.header.clone().unwrap_or_default(),
        requested_schema_field_key(question, index, total),
        elicitation_field_key(question, index, total),
    ];
    if total == 1 {
        keys.push("answer".to_string());
        keys.push("other".to_string());
    }
    keys
}

fn collect_answers(request: &AskRequest, user_data: &Value) -> BTreeMap<String, String> {
    let mut answers = BTreeMap::new();
    let total = request.questions.len();

    match user_data {
        Value::String(_) | Value::Array(_) | Value::Number(_) | Value::Bool(_) => {
            if let Some(question) = request.questions.first() {
                if let Some(answer) = normalize_answer_value(question, user_data) {
                    answers.insert(question.question.clone(), answer);
                }
            }
            return answers;
        }
        Value::Object(map) => {
            if let Some(Value::Object(existing_answers)) = map.get("answers") {
                for question in &request.questions {
                    if let Some(value) = existing_answers.get(&question.question) {
                        if let Some(answer) = normalize_answer_value(question, value) {
                            answers.insert(question.question.clone(), answer);
                        }
                    }
                }
            }

            for (index, question) in request.questions.iter().enumerate() {
                if answers.contains_key(&question.question) {
                    continue;
                }

                for key in answer_candidate_keys(question, index, total) {
                    if key.is_empty() {
                        continue;
                    }

                    if let Some(value) = map.get(&key) {
                        if let Some(answer) = normalize_answer_value(question, value) {
                            answers.insert(question.question.clone(), answer);
                            break;
                        }
                    }
                }
            }
        }
        _ => {}
    }

    answers
}

fn collect_annotations(request: &AskRequest, response: &Value) -> BTreeMap<String, AskAnnotation> {
    let Some(map) = response.as_object() else {
        return BTreeMap::new();
    };
    let Some(Value::Object(annotation_map)) = map.get("annotations") else {
        return BTreeMap::new();
    };

    let total = request.questions.len();
    let mut annotations = BTreeMap::new();
    for (index, question) in request.questions.iter().enumerate() {
        for key in answer_candidate_keys(question, index, total) {
            if key.is_empty() {
                continue;
            }
            let Some(Value::Object(entry)) = annotation_map.get(&key) else {
                continue;
            };
            let preview = entry
                .get("preview")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            let notes = entry
                .get("notes")
                .and_then(Value::as_str)
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_string);
            if preview.is_some() || notes.is_some() {
                annotations.insert(question.question.clone(), AskAnnotation { preview, notes });
                break;
            }
        }
    }

    annotations
}

fn resolve_option_match(question: &AskQuestion, answer: Option<&str>) -> (bool, Option<usize>) {
    let Some(answer) = answer.map(str::trim).filter(|value| !value.is_empty()) else {
        return (false, None);
    };

    for (index, option) in question.options.iter().enumerate() {
        if answer == option.value || answer == option.display() {
            return (true, Some(index));
        }
    }

    (false, None)
}

pub fn normalize_request_user_input_result(
    request: &AskRequest,
    response: Value,
) -> Result<AskResult, RequestUserInputSurfaceError> {
    let mut answers = collect_answers(request, &response);
    let annotations = collect_annotations(request, &response);
    if answers.is_empty() {
        return Err(RequestUserInputSurfaceError::execution_failed(
            "User response was empty or could not be normalized",
        ));
    }

    let (from_option, option_index) = if request.questions.len() == 1 {
        let question = &request.questions[0];
        let answer = answers.get(&question.question).map(String::as_str);
        let (from_option, option_index) = resolve_option_match(question, answer);
        if let Some(index) = option_index {
            if let Some(option) = question.options.get(index) {
                answers.insert(question.question.clone(), option.value.clone());
            }
        }
        (from_option, option_index)
    } else {
        (false, None)
    };

    Ok(AskResult::new(
        response,
        answers,
        annotations,
        from_option,
        option_index,
    ))
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

pub fn build_elicitation_message(request: &AskRequest) -> String {
    if request.questions.len() == 1 {
        return request.questions[0].question.trim().to_string();
    }

    let question_list = request
        .questions
        .iter()
        .enumerate()
        .map(|(index, question)| format!("{}. {}", index + 1, question.question.trim()))
        .collect::<Vec<_>>()
        .join("\n");
    format!("Please answer the following questions:\n{question_list}")
}

pub fn build_elicitation_schema(request: &AskRequest) -> Value {
    let total = request.questions.len();
    let mut properties = Map::new();
    let mut required = Vec::with_capacity(total);

    for (index, question) in request.questions.iter().enumerate() {
        let field_key = elicitation_field_key(question, index, total);
        required.push(field_key.clone());

        let description = if question.multi_select {
            let choices = question
                .options
                .iter()
                .map(|option| option.display().to_string())
                .collect::<Vec<_>>()
                .join(", ");
            if choices.is_empty() {
                format!(
                    "{} Separate multiple selections with commas.",
                    question.question
                )
            } else {
                format!(
                    "{} Separate multiple selections with commas. Available choices: {}.",
                    question.question, choices
                )
            }
        } else {
            question.question.clone()
        };

        let mut property = json!({
            "type": "string",
            "description": description,
            "minLength": 1
        });

        if !question.multi_select {
            let labels = question
                .options
                .iter()
                .map(|option| option.display().to_string())
                .collect::<Vec<_>>();
            if !labels.is_empty() {
                property["enum"] = json!(labels);
            }
        }

        properties.insert(field_key, property);
    }

    Value::Object(
        [
            ("type".to_string(), Value::String("object".to_string())),
            (
                "title".to_string(),
                Value::String("User input required".to_string()),
            ),
            (
                "description".to_string(),
                Value::String(
                    "Provide the requested answers so the agent can continue.".to_string(),
                ),
            ),
            ("properties".to_string(), Value::Object(properties)),
            ("required".to_string(), json!(required)),
        ]
        .into_iter()
        .collect(),
    )
}

#[cfg(test)]
mod tests;

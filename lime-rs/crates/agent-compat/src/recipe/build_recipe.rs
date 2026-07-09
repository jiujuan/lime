//! Recipe build compatibility helpers kept only while Aster recipe callers exit.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::Path;

use crate::recipe::template_recipe::{parse_recipe_content, render_recipe_content_with_params};
use crate::recipe::{Recipe, BUILT_IN_RECIPE_DIR_PARAM};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum RecipeError {
    MissingParams { parameters: Vec<String> },
    BuildFailed(String),
}

impl std::fmt::Display for RecipeError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            RecipeError::MissingParams { parameters } => {
                write!(f, "Missing parameters: {}", parameters.join(", "))
            }
            RecipeError::BuildFailed(message) => write!(f, "{message}"),
        }
    }
}

impl std::error::Error for RecipeError {}

pub fn build_recipe_from_template(
    template: impl AsRef<str>,
    recipe_dir: impl AsRef<Path>,
    params: Vec<(String, String)>,
    _file_loader: Option<impl Fn(&str, &str) -> anyhow::Result<String>>,
) -> Result<Recipe, RecipeError> {
    build_recipe(template.as_ref(), recipe_dir.as_ref(), params)
}

pub fn build_recipe_from_template_with_positional_params(
    template: impl AsRef<str>,
    recipe_dir: impl AsRef<Path>,
    positional_params: Vec<String>,
    _file_loader: Option<impl Fn(&str, &str) -> anyhow::Result<String>>,
) -> Result<Recipe, RecipeError> {
    let recipe_dir = recipe_dir.as_ref();
    let (recipe, variables) =
        parse_recipe_content(template.as_ref(), Some(recipe_dir.display().to_string()))
            .map_err(|error| RecipeError::BuildFailed(error.to_string()))?;

    let required_params = recipe
        .parameters
        .as_ref()
        .map(|parameters| {
            parameters
                .iter()
                .filter(|parameter| parameter.default.is_none())
                .map(|parameter| parameter.key.clone())
                .collect::<Vec<_>>()
        })
        .unwrap_or_default();

    if positional_params.len() < required_params.len() {
        return Err(RecipeError::MissingParams {
            parameters: required_params[positional_params.len()..].to_vec(),
        });
    }

    let mut params = HashMap::new();
    for (name, value) in required_params.into_iter().zip(positional_params) {
        params.insert(name, value);
    }
    for variable in variables {
        params.entry(variable).or_default();
    }

    build_recipe_from_params(template.as_ref(), recipe_dir, params)
}

fn build_recipe(
    template: &str,
    recipe_dir: &Path,
    params: Vec<(String, String)>,
) -> Result<Recipe, RecipeError> {
    build_recipe_from_params(template, recipe_dir, params.into_iter().collect())
}

fn build_recipe_from_params(
    template: &str,
    recipe_dir: &Path,
    mut params: HashMap<String, String>,
) -> Result<Recipe, RecipeError> {
    params.insert(
        BUILT_IN_RECIPE_DIR_PARAM.to_string(),
        recipe_dir.display().to_string(),
    );
    let rendered = render_recipe_content_with_params(template, &params)
        .map_err(|error| RecipeError::BuildFailed(error.to_string()))?;
    Recipe::from_content(&rendered).map_err(|error| RecipeError::BuildFailed(error.to_string()))
}

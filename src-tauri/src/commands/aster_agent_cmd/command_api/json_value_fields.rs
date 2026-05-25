use serde_json::Value;

pub(crate) fn json_nested_object<'a>(
    value: &'a Value,
    path: &[&str],
) -> Option<&'a serde_json::Map<String, Value>> {
    let mut current = value;
    for key in path {
        current = current.get(*key)?;
    }
    current.as_object()
}

pub(crate) fn json_string_field(value: &Value, keys: &[&str]) -> Option<String> {
    keys.iter().find_map(|key| {
        value
            .get(*key)
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
    })
}

pub(crate) fn json_string_vec_field(value: &Value, keys: &[&str]) -> Option<Vec<String>> {
    keys.iter().find_map(|key| {
        let values = value.get(*key)?.as_array()?;
        let values = values
            .iter()
            .filter_map(Value::as_str)
            .map(str::trim)
            .filter(|text| !text.is_empty())
            .map(str::to_string)
            .collect::<Vec<_>>();
        (!values.is_empty()).then_some(values)
    })
}

pub(crate) fn json_u64_field(value: &Value, keys: &[&str]) -> Option<u64> {
    keys.iter().find_map(|key| {
        let field = value.get(*key)?;
        field
            .as_u64()
            .or_else(|| field.as_i64().and_then(|number| u64::try_from(number).ok()))
    })
}

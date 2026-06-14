use std::collections::HashMap;

pub(super) fn render_template(template: &str, variables: &[(&str, &str)]) -> String {
    let variables = variables.iter().copied().collect::<HashMap<_, _>>();
    let mut rendered = normalize_line_endings(template);
    for (key, value) in variables {
        rendered = rendered.replace(&format!("{{{{ {key} }}}}"), value);
        rendered = rendered.replace(&format!("{{{{{key}}}}}"), value);
    }
    rendered
}

pub(super) fn normalize_line_endings(template: &str) -> String {
    template.replace("\r\n", "\n").replace('\r', "\n")
}

pub(super) fn escape_xml_text(input: &str) -> String {
    input
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

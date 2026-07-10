pub(crate) fn sanitize_tags(text: &str) -> String {
    text.replace('\u{E000}', "").replace('\u{E001}', "")
}

pub(crate) fn contains_tags(text: &str) -> bool {
    text.contains('\u{E000}') || text.contains('\u{E001}')
}

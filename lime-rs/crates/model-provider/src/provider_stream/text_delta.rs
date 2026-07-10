pub fn provider_stream_first_text_delta_chars<'a>(
    text_deltas: impl IntoIterator<Item = &'a str>,
) -> Option<usize> {
    text_deltas.into_iter().find_map(|text| {
        let trimmed = text.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.chars().count())
        }
    })
}

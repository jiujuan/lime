pub fn seek_sequence(
    lines: &[String],
    pattern: &[String],
    start: usize,
    eof: bool,
) -> Option<usize> {
    if pattern.is_empty() {
        return Some(start);
    }

    if pattern.len() > lines.len() {
        return None;
    }
    let search_start = if eof && lines.len() >= pattern.len() {
        lines.len() - pattern.len()
    } else {
        start
    };

    for i in search_start..=lines.len().saturating_sub(pattern.len()) {
        if lines[i..i + pattern.len()] == *pattern {
            return Some(i);
        }
    }
    for i in search_start..=lines.len().saturating_sub(pattern.len()) {
        let mut ok = true;
        for (pattern_index, pattern_line) in pattern.iter().enumerate() {
            if lines[i + pattern_index].trim_end() != pattern_line.trim_end() {
                ok = false;
                break;
            }
        }
        if ok {
            return Some(i);
        }
    }
    for i in search_start..=lines.len().saturating_sub(pattern.len()) {
        let mut ok = true;
        for (pattern_index, pattern_line) in pattern.iter().enumerate() {
            if lines[i + pattern_index].trim() != pattern_line.trim() {
                ok = false;
                break;
            }
        }
        if ok {
            return Some(i);
        }
    }

    for i in search_start..=lines.len().saturating_sub(pattern.len()) {
        let mut ok = true;
        for (pattern_index, pattern_line) in pattern.iter().enumerate() {
            if normalise(&lines[i + pattern_index]) != normalise(pattern_line) {
                ok = false;
                break;
            }
        }
        if ok {
            return Some(i);
        }
    }

    None
}

fn normalise(value: &str) -> String {
    value
        .trim()
        .chars()
        .map(|character| match character {
            '\u{2010}' | '\u{2011}' | '\u{2012}' | '\u{2013}' | '\u{2014}' | '\u{2015}'
            | '\u{2212}' => '-',
            '\u{2018}' | '\u{2019}' | '\u{201A}' | '\u{201B}' => '\'',
            '\u{201C}' | '\u{201D}' | '\u{201E}' | '\u{201F}' => '"',
            '\u{00A0}' | '\u{2002}' | '\u{2003}' | '\u{2004}' | '\u{2005}' | '\u{2006}'
            | '\u{2007}' | '\u{2008}' | '\u{2009}' | '\u{200A}' | '\u{202F}' | '\u{205F}'
            | '\u{3000}' => ' ',
            other => other,
        })
        .collect::<String>()
}

#[cfg(test)]
mod tests {
    use super::seek_sequence;

    fn to_vec(strings: &[&str]) -> Vec<String> {
        strings.iter().map(ToString::to_string).collect()
    }

    #[test]
    fn finds_sequence_with_decreasing_strictness() {
        assert_eq!(
            seek_sequence(
                &to_vec(&["foo", "bar", "baz"]),
                &to_vec(&["bar", "baz"]),
                0,
                false
            ),
            Some(1)
        );
        assert_eq!(
            seek_sequence(
                &to_vec(&["foo   ", "bar\t\t"]),
                &to_vec(&["foo", "bar"]),
                0,
                false
            ),
            Some(0)
        );
        assert_eq!(
            seek_sequence(
                &to_vec(&["    foo   ", "   bar\t"]),
                &to_vec(&["foo", "bar"]),
                0,
                false
            ),
            Some(0)
        );
    }

    #[test]
    fn normalises_unicode_punctuation() {
        assert_eq!(
            seek_sequence(
                &to_vec(&["use “quoted” value", "alpha—beta"]),
                &to_vec(&["use \"quoted\" value", "alpha-beta"]),
                0,
                false
            ),
            Some(0)
        );
    }

    #[test]
    fn pattern_longer_than_input_returns_none() {
        assert_eq!(
            seek_sequence(
                &to_vec(&["just one line"]),
                &to_vec(&["too", "many", "lines"]),
                0,
                false
            ),
            None
        );
    }
}

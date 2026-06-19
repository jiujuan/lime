pub(super) fn matches(cwd: &str, project_path: &str) -> bool {
    let cwd = normalize(cwd);
    let project_path = normalize(project_path);
    if cwd.is_empty() || project_path.is_empty() {
        return false;
    }
    if cwd == project_path {
        return true;
    }
    if cwd.starts_with(project_path.as_str())
        && cwd.as_bytes().get(project_path.len()) == Some(&b'/')
    {
        return true;
    }
    contains_path_segment(&cwd, &project_path)
}

fn normalize(path: &str) -> String {
    path.trim()
        .replace('\\', "/")
        .trim_end_matches('/')
        .to_string()
}

fn contains_path_segment(cwd: &str, project_path: &str) -> bool {
    let mut start = 0;
    while let Some(index) = cwd[start..].find(project_path) {
        let index = start + index;
        let after_index = index + project_path.len();
        let before_ok = index == 0 || cwd.as_bytes().get(index - 1) == Some(&b'/');
        let after_ok = after_index == cwd.len() || cwd.as_bytes().get(after_index) == Some(&b'/');
        if before_ok && after_ok {
            return true;
        }
        start = index + 1;
    }
    false
}

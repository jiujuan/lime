use std::collections::{HashMap, VecDeque};

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SubagentSessionTreeNode {
    pub session_id: String,
    pub parent_session_id: String,
}

pub fn collect_subagent_cascade_session_ids(
    session_id: &str,
    sessions: &[SubagentSessionTreeNode],
) -> Vec<String> {
    let mut children_by_parent: HashMap<&str, Vec<&str>> = HashMap::new();
    for session in sessions {
        children_by_parent
            .entry(session.parent_session_id.as_str())
            .or_default()
            .push(session.session_id.as_str());
    }

    let mut ordered = vec![session_id.to_string()];
    let mut queue = VecDeque::from([session_id.to_string()]);
    while let Some(parent_id) = queue.pop_front() {
        let Some(children) = children_by_parent.get(parent_id.as_str()) else {
            continue;
        };
        for child_id in children {
            ordered.push((*child_id).to_string());
            queue.push_back((*child_id).to_string());
        }
    }
    ordered
}

#[cfg(test)]
mod tests {
    use super::{collect_subagent_cascade_session_ids, SubagentSessionTreeNode};

    fn node(session_id: &str, parent_session_id: &str) -> SubagentSessionTreeNode {
        SubagentSessionTreeNode {
            session_id: session_id.to_string(),
            parent_session_id: parent_session_id.to_string(),
        }
    }

    #[test]
    fn collect_subagent_cascade_session_ids_returns_breadth_first_tree() {
        let sessions = vec![
            node("child-a", "root"),
            node("child-b", "root"),
            node("grandchild", "child-a"),
        ];

        let ids = collect_subagent_cascade_session_ids("root", &sessions);

        assert_eq!(ids, vec!["root", "child-a", "child-b", "grandchild"]);
    }

    #[test]
    fn collect_subagent_cascade_session_ids_preserves_input_order_for_siblings() {
        let sessions = vec![
            node("child-new", "root"),
            node("child-old", "root"),
            node("grandchild", "child-old"),
        ];

        let ids = collect_subagent_cascade_session_ids("root", &sessions);

        assert_eq!(ids, vec!["root", "child-new", "child-old", "grandchild"]);
    }

    #[test]
    fn collect_subagent_cascade_session_ids_ignores_unreachable_sessions() {
        let sessions = vec![node("child-a", "root"), node("orphan", "missing-parent")];

        let ids = collect_subagent_cascade_session_ids("root", &sessions);

        assert_eq!(ids, vec!["root", "child-a"]);
    }
}

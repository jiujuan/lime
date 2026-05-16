//! Agent App Runtime capability catalog.
//!
//! 这里不启动新运行时，只把 App 侧 capability hint 映射到既有 Claw skill launch metadata。

#[derive(Debug, Clone, Copy)]
pub struct AgentAppRuntimeCapabilityDescriptor {
    pub capability_id: &'static str,
    pub aliases: &'static [&'static str],
    pub launch_key: &'static str,
    pub context_key: &'static str,
    pub default_kind: &'static str,
    pub skill_name: &'static str,
}

const AGENT_APP_RUNTIME_CAPABILITY_DESCRIPTORS: &[AgentAppRuntimeCapabilityDescriptor] = &[
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.image.generate",
        aliases: &[
            "lime.capability.image.generate",
            "image.generate",
            "image_generation",
            "image",
            "asset.generate",
        ],
        launch_key: "image_skill_launch",
        context_key: "image_task",
        default_kind: "image_task",
        skill_name: "image_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.cover.generate",
        aliases: &[
            "lime.capability.cover.generate",
            "cover.generate",
            "cover_generation",
            "cover",
        ],
        launch_key: "cover_skill_launch",
        context_key: "cover_task",
        default_kind: "cover_task",
        skill_name: "cover_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.research.search",
        aliases: &[
            "lime.capability.research.search",
            "research.search",
            "research",
            "web_search",
            "search",
        ],
        launch_key: "research_skill_launch",
        context_key: "research_request",
        default_kind: "research_request",
        skill_name: "research",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.report.generate",
        aliases: &[
            "lime.capability.report.generate",
            "report.generate",
            "report",
            "competitor_report",
        ],
        launch_key: "report_skill_launch",
        context_key: "report_request",
        default_kind: "report_request",
        skill_name: "report_generate",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.pdf.read",
        aliases: &["lime.capability.pdf.read", "pdf.read", "pdf_extract", "pdf"],
        launch_key: "pdf_read_skill_launch",
        context_key: "pdf_read_request",
        default_kind: "pdf_read_request",
        skill_name: "pdf_read",
    },
    AgentAppRuntimeCapabilityDescriptor {
        capability_id: "lime.capability.summary.generate",
        aliases: &[
            "lime.capability.summary.generate",
            "summary.generate",
            "summary",
            "text_summary",
        ],
        launch_key: "summary_skill_launch",
        context_key: "summary_request",
        default_kind: "summary_request",
        skill_name: "summary",
    },
];

fn capability_match_token(value: &str) -> String {
    value
        .trim()
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .flat_map(char::to_lowercase)
        .collect()
}

fn descriptor_matches_capability(
    descriptor: &AgentAppRuntimeCapabilityDescriptor,
    value: &str,
) -> bool {
    let token = capability_match_token(value);
    if token.is_empty() {
        return false;
    }

    descriptor
        .aliases
        .iter()
        .any(|alias| capability_match_token(alias) == token)
}

pub fn resolve_primary_capability_descriptor<'a, I>(
    values: I,
) -> Option<AgentAppRuntimeCapabilityDescriptor>
where
    I: IntoIterator<Item = &'a str>,
{
    resolve_capability_descriptors(values).into_iter().next()
}

pub fn resolve_capability_descriptors<'a, I>(values: I) -> Vec<AgentAppRuntimeCapabilityDescriptor>
where
    I: IntoIterator<Item = &'a str>,
{
    let mut descriptors = Vec::new();

    for value in values {
        let Some(descriptor) = AGENT_APP_RUNTIME_CAPABILITY_DESCRIPTORS
            .iter()
            .copied()
            .find(|descriptor| descriptor_matches_capability(descriptor, value))
        else {
            continue;
        };
        if descriptors
            .iter()
            .any(|existing: &AgentAppRuntimeCapabilityDescriptor| {
                existing.capability_id == descriptor.capability_id
            })
        {
            continue;
        }
        descriptors.push(descriptor);
    }

    descriptors
}

pub fn supported_capability_ids() -> Vec<&'static str> {
    AGENT_APP_RUNTIME_CAPABILITY_DESCRIPTORS
        .iter()
        .map(|descriptor| descriptor.capability_id)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn resolves_capability_aliases_to_claw_launch_descriptor() {
        let descriptor =
            resolve_primary_capability_descriptor(["text_generation", "research.search"])
                .expect("research descriptor");

        assert_eq!(descriptor.capability_id, "lime.capability.research.search");
        assert_eq!(descriptor.launch_key, "research_skill_launch");
        assert_eq!(descriptor.skill_name, "research");
    }

    #[test]
    fn returns_none_for_unknown_capability_without_fake_launch() {
        assert!(resolve_primary_capability_descriptor(["text_generation"]).is_none());
    }

    #[test]
    fn resolves_multiple_capabilities_without_duplicates() {
        let descriptors = resolve_capability_descriptors([
            "research.search",
            "image_generation",
            "lime.capability.research.search",
        ]);

        assert_eq!(
            descriptors
                .iter()
                .map(|descriptor| descriptor.capability_id)
                .collect::<Vec<_>>(),
            vec![
                "lime.capability.research.search",
                "lime.capability.image.generate",
            ]
        );
    }
}

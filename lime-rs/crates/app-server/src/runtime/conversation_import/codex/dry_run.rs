use app_server_protocol::{
    AgentAttachment, ConversationImportPreviewDryRun, ConversationImportPreviewSummary,
};

use super::ImportedTimelineItem;

pub(super) fn apply_summary(
    summary: &mut ConversationImportPreviewSummary,
    timeline: &[ImportedTimelineItem],
) {
    let mut message_count = 0;
    let impact = import_impact(timeline);

    for item in timeline {
        if matches!(item, ImportedTimelineItem::Message(_)) {
            message_count += 1;
        }
    }

    summary.message_count = message_count;
    summary.fidelity.messages = message_count;
    summary.fidelity.attachments = impact.attachments;
    summary.fidelity.unsupported = summary.unsupported_count;
    summary.dry_run = ConversationImportPreviewDryRun {
        will_create_session: impact.turns > 0,
        will_append_to_existing_session: false,
        will_import_messages: impact.messages,
        will_import_turns: impact.turns,
        will_import_timeline_items: impact.timeline_items,
        will_import_attachments: impact.attachments,
        unsupported_items: summary.unsupported_count,
    };
}

struct ImportImpact {
    messages: usize,
    turns: usize,
    timeline_items: usize,
    attachments: usize,
}

fn import_impact(timeline: &[ImportedTimelineItem]) -> ImportImpact {
    let mut impact = ImportImpact {
        messages: 0,
        turns: 0,
        timeline_items: 0,
        attachments: 0,
    };
    let mut pending_user: Option<(String, Vec<AgentAttachment>, Option<String>)> = None;
    let mut pending_assistant = String::new();

    for item in timeline {
        impact.timeline_items += 1;
        let ImportedTimelineItem::Message(message) = item else {
            continue;
        };

        match message.role.as_str() {
            "user" => {
                if pending_user
                    .as_mut()
                    .is_some_and(|(text, attachments, source_type)| {
                        if text.trim() != message.text.trim()
                            || message.source_type.as_deref() != Some("response_item")
                            || source_type.as_deref() != Some("event_msg")
                        {
                            return false;
                        }
                        merge_agent_attachments(attachments, &message.attachments);
                        true
                    })
                {
                    continue;
                }
                flush_turn(&mut impact, &mut pending_user, &mut pending_assistant);
                pending_user = Some((
                    message.text.clone(),
                    message.attachments.clone(),
                    message.source_type.clone(),
                ));
            }
            "assistant" => {
                if pending_user.is_some() {
                    if !pending_assistant.is_empty() {
                        pending_assistant.push_str("\n\n");
                    }
                    pending_assistant.push_str(&message.text);
                }
            }
            _ => {}
        }
    }

    flush_turn(&mut impact, &mut pending_user, &mut pending_assistant);
    impact
}

fn flush_turn(
    impact: &mut ImportImpact,
    pending_user: &mut Option<(String, Vec<AgentAttachment>, Option<String>)>,
    pending_assistant: &mut String,
) {
    let Some((_user_text, user_attachments, _source_type)) = pending_user.take() else {
        pending_assistant.clear();
        return;
    };
    impact.turns += 1;
    impact.messages += 1;
    impact.attachments += user_attachments.len();
    if !pending_assistant.trim().is_empty() {
        impact.messages += 1;
    }
    pending_assistant.clear();
}

fn merge_agent_attachments(target: &mut Vec<AgentAttachment>, source: &[AgentAttachment]) {
    for attachment in source {
        let already_present = target
            .iter()
            .any(|existing| existing.kind == attachment.kind && existing.uri == attachment.uri);
        if !already_present {
            target.push(attachment.clone());
        }
    }
}

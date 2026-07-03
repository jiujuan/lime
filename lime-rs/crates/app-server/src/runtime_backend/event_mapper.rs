use super::coding_events;
use super::proposed_plan_parser;
use super::reasoning_events;
use super::tool_events;
use crate::RuntimeCoreError;
use crate::RuntimeEventSink;
use lime_agent::AgentEvent as RuntimeAgentEvent;

#[cfg(test)]
pub(super) fn emit_runtime_agent_event_with_coding_mirror(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
    coding_event_mirror: &mut coding_events::CodingEventMirror,
) -> Result<(), RuntimeCoreError> {
    let mut proposed_plan_parser = proposed_plan_parser::ProposedPlanParser::default();
    let mut reasoning_event_state = reasoning_events::ReasoningEventState::default();
    emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
        event,
        sink,
        coding_event_mirror,
        &mut proposed_plan_parser,
        &mut reasoning_event_state,
    )
}

pub(super) fn emit_runtime_agent_event_with_coding_mirror_and_plan_parser(
    event: &RuntimeAgentEvent,
    sink: &mut dyn RuntimeEventSink,
    coding_event_mirror: &mut coding_events::CodingEventMirror,
    proposed_plan_parser: &mut proposed_plan_parser::ProposedPlanParser,
    reasoning_event_state: &mut reasoning_events::ReasoningEventState,
) -> Result<(), RuntimeCoreError> {
    let coding_events = coding_event_mirror.process_event(event);
    for event in coding_events.before_raw {
        sink.emit(event)?;
    }
    if let RuntimeAgentEvent::ThinkingDelta { text } = event {
        for event in reasoning_event_state.observe_delta(text) {
            sink.emit(event)?;
        }
    }
    for event in tool_events::runtime_events_from_agent_event(event)? {
        for event in proposed_plan_parser::split_runtime_event(event, proposed_plan_parser) {
            sink.emit(event)?;
        }
    }
    for event in coding_events.after_raw {
        sink.emit(event)?;
    }
    Ok(())
}

pub(super) fn emit_reasoning_finish(
    reasoning_event_state: &mut reasoning_events::ReasoningEventState,
    status: &str,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    for event in reasoning_event_state.finish(status) {
        sink.emit(event)?;
    }
    Ok(())
}

pub(super) fn emit_proposed_plan_parser_flush(
    proposed_plan_parser: &mut proposed_plan_parser::ProposedPlanParser,
    sink: &mut dyn RuntimeEventSink,
) -> Result<(), RuntimeCoreError> {
    for event in proposed_plan_parser::finish_runtime_events(proposed_plan_parser) {
        sink.emit(event)?;
    }
    Ok(())
}

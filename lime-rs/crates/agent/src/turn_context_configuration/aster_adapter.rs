use super::AgentTurnContext;
use agent_protocol::turn_context::TurnOutputSchemaSource;

pub(crate) fn to_aster_turn_context(
    context: AgentTurnContext,
) -> aster::session::TurnContextOverride {
    aster::session::TurnContextOverride {
        cwd: context.cwd,
        model: context.model,
        effort: context.effort,
        approval_policy: context.approval_policy,
        sandbox_policy: context.sandbox_policy,
        collaboration_mode: context.collaboration_mode,
        user_visible_input_text: context.user_visible_input_text,
        output_schema: context.output_schema,
        output_schema_source: context.output_schema_source.map(|source| match source {
            TurnOutputSchemaSource::Session => aster::session::TurnOutputSchemaSource::Session,
            TurnOutputSchemaSource::Turn => aster::session::TurnOutputSchemaSource::Turn,
        }),
        metadata: context.metadata,
    }
}

pub(crate) fn to_agent_turn_context(
    context: aster::session::TurnContextOverride,
) -> AgentTurnContext {
    AgentTurnContext {
        cwd: context.cwd,
        model: context.model,
        effort: context.effort,
        approval_policy: context.approval_policy,
        sandbox_policy: context.sandbox_policy,
        collaboration_mode: context.collaboration_mode,
        user_visible_input_text: context.user_visible_input_text,
        output_schema: context.output_schema,
        output_schema_source: context.output_schema_source.map(|source| match source {
            aster::session::TurnOutputSchemaSource::Session => TurnOutputSchemaSource::Session,
            aster::session::TurnOutputSchemaSource::Turn => TurnOutputSchemaSource::Turn,
        }),
        metadata: context.metadata,
    }
}

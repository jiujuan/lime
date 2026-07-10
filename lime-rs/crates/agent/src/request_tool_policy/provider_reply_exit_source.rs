use super::aster_reply_message_adapter::lower_aster_reply_message;
use super::aster_reply_stream_adapter::project_aster_reply_stream;
use crate::credential_bridge::ConfiguredReplyProvider;
use crate::protocol::AgentEvent as RuntimeAgentEvent;
use crate::session_config_adapter::to_aster_session_config;
use agent_runtime::reply_backend::{
    run_default_provider_source_backend, run_provider_source_backend, RuntimeReplyProviderCall,
    RuntimeReplyProviderSourceExecution, RuntimeReplySource, RuntimeReplySourceExecutor,
    RuntimeReplySourceRun,
};
use agent_runtime::reply_host::RuntimeReplyStream;
use agent_runtime::reply_message::RuntimeReplyMessage;
use agent_runtime::session_config::AgentSessionConfig;
use aster::{Agent, Provider};
use futures::future::BoxFuture;
use model_provider::provider_stream::{
    RuntimeReplyProviderExecutionRunner, RuntimeReplyProviderExecutionSource,
    RuntimeReplyProviderSourceFuture,
};
use std::sync::Arc;

pub(super) struct ReplyExitSource<'a> {
    agent: &'a Agent,
    provider: Option<&'a ConfiguredReplyProvider>,
}

impl<'a> ReplyExitSource<'a> {
    pub(super) fn new(agent: &'a Agent, provider: Option<&'a ConfiguredReplyProvider>) -> Self {
        Self { agent, provider }
    }
}

impl<'source> RuntimeReplySource for ReplyExitSource<'source> {
    type Stream<'run>
        = RuntimeReplyStream<'run, RuntimeAgentEvent>
    where
        Self: 'run;
    type Error = anyhow::Error;

    fn run<'run>(
        self,
        call: RuntimeReplySourceRun,
    ) -> BoxFuture<'run, Result<Self::Stream<'run>, Self::Error>>
    where
        Self: 'run,
    {
        Box::pin(async move {
            call.run_with(ReplyExitSourceExecutor::new(self.agent, self.provider))
                .await
        })
    }
}

struct ReplyExitSourceExecutor<'a> {
    agent: &'a Agent,
    provider: Option<&'a ConfiguredReplyProvider>,
}

impl<'a> ReplyExitSourceExecutor<'a> {
    fn new(agent: &'a Agent, provider: Option<&'a ConfiguredReplyProvider>) -> Self {
        Self { agent, provider }
    }
}

impl<'source> RuntimeReplySourceExecutor<RuntimeReplyMessage, AgentSessionConfig>
    for ReplyExitSourceExecutor<'source>
{
    type Stream<'run>
        = RuntimeReplyStream<'run, RuntimeAgentEvent>
    where
        Self: 'run;
    type Error = anyhow::Error;

    fn run_default<'run>(
        self,
        call: agent_runtime::reply_backend::RuntimeReplyDefaultCall<
            RuntimeReplyMessage,
            AgentSessionConfig,
        >,
    ) -> BoxFuture<'run, Result<Self::Stream<'run>, Self::Error>>
    where
        Self: 'run,
    {
        Box::pin(async move {
            let provider = self.agent.provider().await?;
            run_default_provider_source_backend(call, provider, |provider| {
                provider_reply_exit_source(self.agent, provider)
            })
            .await
        })
    }

    fn run_provider<'run>(
        self,
        call: RuntimeReplyProviderCall<RuntimeReplyMessage, AgentSessionConfig>,
    ) -> BoxFuture<'run, Result<Self::Stream<'run>, Self::Error>>
    where
        Self: 'run,
    {
        Box::pin(async move {
            run_provider_source_backend(call, self.provider, |provider| {
                provider_reply_exit_source(self.agent, provider.into_compat_provider())
            })
            .await
            .map_err(anyhow::Error::msg)
        })
    }
}

struct ProviderReplyExitRunner<'a> {
    agent: &'a Agent,
    provider: Arc<dyn Provider>,
}

type ProviderReplyExitSource<'a> = RuntimeReplyProviderExecutionSource<ProviderReplyExitRunner<'a>>;

impl<'a> ProviderReplyExitRunner<'a> {
    fn new(agent: &'a Agent, provider: Arc<dyn Provider>) -> Self {
        Self { agent, provider }
    }
}

fn provider_reply_exit_source<'a>(
    agent: &'a Agent,
    provider: Arc<dyn Provider>,
) -> ProviderReplyExitSource<'a> {
    RuntimeReplyProviderExecutionSource::new(ProviderReplyExitRunner::new(agent, provider))
}

impl<'source> RuntimeReplyProviderExecutionRunner<RuntimeReplyProviderSourceExecution>
    for ProviderReplyExitRunner<'source>
{
    type Stream<'run>
        = RuntimeReplyStream<'run, RuntimeAgentEvent>
    where
        Self: 'run,
        RuntimeReplyProviderSourceExecution: 'run;
    type Error = anyhow::Error;

    fn run_execution<'run>(
        self,
        execution: RuntimeReplyProviderSourceExecution,
    ) -> RuntimeReplyProviderSourceFuture<'run, Self::Stream<'run>, Self::Error>
    where
        Self: Sized + Send + 'run,
        RuntimeReplyProviderSourceExecution: Send + 'run,
    {
        run_provider_reply_exit_source(self.agent, self.provider, execution)
    }
}

fn run_provider_reply_exit_source<'run>(
    agent: &'run Agent,
    provider: Arc<dyn Provider>,
    execution: RuntimeReplyProviderSourceExecution,
) -> RuntimeReplyProviderSourceFuture<
    'run,
    RuntimeReplyStream<'run, RuntimeAgentEvent>,
    anyhow::Error,
> {
    Box::pin(async move {
        let (message, stream_request, session_config, cancel_token) = execution.into_parts();
        let user_message = lower_aster_reply_message(message);
        let aster_session_config = to_aster_session_config(session_config);
        let stream = agent
            .reply_with_provider(user_message, aster_session_config, cancel_token, provider)
            .await?;

        Ok(project_aster_reply_stream(stream, stream_request))
    })
}

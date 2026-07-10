use std::future::Future;
use std::pin::Pin;

pub type RuntimeReplyProviderSourceFuture<'a, S, E> =
    Pin<Box<dyn Future<Output = Result<S, E>> + Send + 'a>>;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RuntimeReplyProviderSourceBackendCall<R> {
    source_request: R,
}

#[derive(Debug)]
pub struct RuntimeReplyProviderExecutionSource<R> {
    runner: R,
}

impl<R> RuntimeReplyProviderSourceBackendCall<R> {
    pub fn new(source_request: R) -> Self {
        Self { source_request }
    }

    pub fn source_request(&self) -> &R {
        &self.source_request
    }

    pub fn into_source_request(self) -> R {
        self.source_request
    }
}

pub trait RuntimeReplyProviderSourceBackend<R>: Send + Sync {
    type Stream<'a>
    where
        Self: 'a,
        R: 'a;
    type Error: std::fmt::Display;

    fn stream_reply<'a>(
        self,
        call: RuntimeReplyProviderSourceBackendCall<R>,
    ) -> RuntimeReplyProviderSourceFuture<'a, Self::Stream<'a>, Self::Error>
    where
        Self: Sized + Send + 'a,
        R: Send + 'a;
}

pub trait RuntimeReplyProviderExecutionRunner<R> {
    type Stream<'a>
    where
        Self: 'a,
        R: 'a;
    type Error: std::fmt::Display;

    fn run_execution<'a>(
        self,
        request: R,
    ) -> RuntimeReplyProviderSourceFuture<'a, Self::Stream<'a>, Self::Error>
    where
        Self: Sized + Send + 'a,
        R: Send + 'a;
}

impl<R> RuntimeReplyProviderExecutionSource<R> {
    pub fn new(runner: R) -> Self {
        Self { runner }
    }

    pub fn into_runner(self) -> R {
        self.runner
    }
}

pub fn run_provider_source_execution<'a, R, X>(
    call: RuntimeReplyProviderSourceBackendCall<R>,
    runner: X,
) -> RuntimeReplyProviderSourceFuture<'a, X::Stream<'a>, X::Error>
where
    R: Send + 'a,
    X: RuntimeReplyProviderExecutionRunner<R> + Send + 'a,
{
    runner.run_execution(call.into_source_request())
}

impl<R, X> RuntimeReplyProviderSourceBackend<R> for RuntimeReplyProviderExecutionSource<X>
where
    X: RuntimeReplyProviderExecutionRunner<R> + Send + Sync,
{
    type Stream<'a>
        = X::Stream<'a>
    where
        Self: 'a,
        R: 'a;
    type Error = X::Error;

    fn stream_reply<'a>(
        self,
        call: RuntimeReplyProviderSourceBackendCall<R>,
    ) -> RuntimeReplyProviderSourceFuture<'a, Self::Stream<'a>, Self::Error>
    where
        Self: Sized + Send + 'a,
        R: Send + 'a,
    {
        run_provider_source_execution(call, self.into_runner())
    }
}

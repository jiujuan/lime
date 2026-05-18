use chrono::Local;
use lime_core::app_paths;
use std::env;
use std::io::{self, Write};
use std::path::PathBuf;
use tracing::Subscriber;
use tracing_subscriber::fmt::MakeWriter;
use tracing_subscriber::layer::Layer;
use tracing_subscriber::prelude::*;
use tracing_subscriber::registry::LookupSpan;
use tracing_subscriber::{fmt, util::SubscriberInitExt, EnvFilter};

#[cfg(feature = "dev-profiling")]
use std::fs::{self, File};

#[cfg(feature = "dev-profiling")]
type TraceFlushGuard = tracing_chrome::FlushGuard;
#[cfg(not(feature = "dev-profiling"))]
type TraceFlushGuard = ();

#[derive(Clone, Copy, Debug, Default)]
struct NonPanickingStderr;

struct IgnoreBrokenPipeWriter<W> {
    inner: W,
}

impl<W> IgnoreBrokenPipeWriter<W> {
    fn new(inner: W) -> Self {
        Self { inner }
    }
}

impl<W: Write> Write for IgnoreBrokenPipeWriter<W> {
    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        match self.inner.write(buf) {
            Ok(written) => Ok(written),
            Err(error) if error.kind() == io::ErrorKind::BrokenPipe => Ok(buf.len()),
            Err(error) => Err(error),
        }
    }

    fn flush(&mut self) -> io::Result<()> {
        match self.inner.flush() {
            Ok(()) => Ok(()),
            Err(error) if error.kind() == io::ErrorKind::BrokenPipe => Ok(()),
            Err(error) => Err(error),
        }
    }
}

impl<'writer> MakeWriter<'writer> for NonPanickingStderr {
    type Writer = IgnoreBrokenPipeWriter<io::Stderr>;

    fn make_writer(&'writer self) -> Self::Writer {
        IgnoreBrokenPipeWriter::new(io::stderr())
    }
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq)]
struct ProfileModes {
    trace: bool,
    tokio_console: bool,
}

impl ProfileModes {
    fn from_env() -> Self {
        let mut modes = Self::default();
        let raw = env::var("LIME_PROFILE").unwrap_or_default();

        for token in raw
            .split(|ch: char| matches!(ch, ',' | '+' | '|' | ';' | ' '))
            .map(str::trim)
            .filter(|value| !value.is_empty())
        {
            match token.to_ascii_lowercase().as_str() {
                "trace" | "chrome" | "perfetto" => modes.trace = true,
                "console" | "tokio-console" | "tokio_console" => modes.tokio_console = true,
                "all" => {
                    modes.trace = true;
                    modes.tokio_console = true;
                }
                _ => {}
            }
        }

        modes
    }

    fn as_str(self) -> &'static str {
        match (self.trace, self.tokio_console) {
            (false, false) => "disabled",
            (true, false) => "trace",
            (false, true) => "console",
            (true, true) => "trace+console",
        }
    }
}

#[derive(Debug, Clone)]
struct ProfilingConfig {
    requested_modes: ProfileModes,
    enabled_modes: ProfileModes,
    profiling_supported_build: bool,
    trace_path: Option<PathBuf>,
    tokio_console_bind: Option<String>,
}

impl ProfilingConfig {
    fn from_env() -> Self {
        let requested_modes = ProfileModes::from_env();
        let profiling_supported_build = is_profiling_supported_build();
        let enabled_modes = if profiling_supported_build {
            ProfileModes {
                trace: requested_modes.trace && is_trace_feature_enabled(),
                tokio_console: requested_modes.tokio_console && is_tokio_console_feature_enabled(),
            }
        } else {
            ProfileModes::default()
        };
        let trace_path = enabled_modes.trace.then(resolve_trace_path);
        let tokio_console_bind = enabled_modes.tokio_console.then(resolve_tokio_console_bind);

        Self {
            requested_modes,
            enabled_modes,
            profiling_supported_build,
            trace_path,
            tokio_console_bind,
        }
    }
}

#[derive(Default)]
pub struct ProfilingGuard {
    #[cfg_attr(not(feature = "dev-profiling"), allow(dead_code))]
    chrome_guard: Option<TraceFlushGuard>,
    trace_path: Option<PathBuf>,
}

impl ProfilingGuard {
    fn trace_path(&self) -> Option<&PathBuf> {
        self.trace_path.as_ref()
    }
}

impl Drop for ProfilingGuard {
    fn drop(&mut self) {
        #[cfg(feature = "dev-profiling")]
        if let Some(guard) = &self.chrome_guard {
            guard.flush();
        }
    }
}

pub fn init() -> ProfilingGuard {
    let config = ProfilingConfig::from_env();

    match try_init(&config) {
        Ok(guard) => {
            match (guard.trace_path(), config.tokio_console_bind.as_deref()) {
                (Some(path), Some(bind)) => {
                    tracing::info!(
                        trace_path = %path.display(),
                        tokio_console_bind = %bind,
                        profile_mode = %config.enabled_modes.as_str(),
                        "[Profiling] 已启用 trace 导出与 Tokio Console"
                    );
                }
                (Some(path), None) => {
                    tracing::info!(
                        trace_path = %path.display(),
                        profile_mode = %config.enabled_modes.as_str(),
                        "[Profiling] 已启用 trace 导出，可用 Perfetto 打开"
                    );
                }
                (None, Some(bind)) => {
                    tracing::info!(
                        tokio_console_bind = %bind,
                        profile_mode = %config.enabled_modes.as_str(),
                        "[Profiling] 已启用 Tokio Console 遥测"
                    );
                }
                (None, None) => {
                    tracing::debug!(
                        profile_mode = %config.enabled_modes.as_str(),
                        "[Profiling] tracing subscriber 已初始化"
                    );
                }
            }

            if !config.profiling_supported_build
                && config.requested_modes != ProfileModes::default()
            {
                tracing::warn!(
                    requested_profile_mode = %config.requested_modes.as_str(),
                    "[Profiling] 当前是 release/生产构建，已忽略开发环境 profiling 配置"
                );
            }

            if config.profiling_supported_build
                && config.requested_modes.trace
                && !config.enabled_modes.trace
            {
                tracing::warn!(
                    requested_profile_mode = %config.requested_modes.as_str(),
                    "[Profiling] 已请求 trace 导出，但当前构建未启用 dev-profiling feature；请使用性能启动脚本"
                );
            }

            if config.profiling_supported_build
                && config.requested_modes.tokio_console
                && !config.enabled_modes.tokio_console
            {
                tracing::warn!(
                    requested_profile_mode = %config.requested_modes.as_str(),
                    "[Profiling] 已请求 Tokio Console，但当前构建未启用 tokio-console feature；请使用性能启动脚本"
                );
            }
            guard
        }
        Err(error) => {
            let _ = writeln!(
                IgnoreBrokenPipeWriter::new(io::stderr()),
                "[Profiling] 初始化失败: {error}"
            );
            ProfilingGuard::default()
        }
    }
}

fn try_init(config: &ProfilingConfig) -> Result<ProfilingGuard, String> {
    let filter_layer = EnvFilter::try_from_default_env()
        .or_else(|_| EnvFilter::try_new("info"))
        .map_err(|error| format!("创建 EnvFilter 失败: {error}"))?;

    let fmt_layer = fmt::layer()
        .compact()
        .with_target(true)
        .with_thread_ids(true)
        .with_thread_names(true)
        .with_file(true)
        .with_line_number(true)
        .with_writer(NonPanickingStderr);

    let subscriber = tracing_subscriber::registry()
        .with(filter_layer)
        .with(fmt_layer);
    let chrome_guard = if let Some(tokio_console_layer) = build_tokio_console_layer::<_>(config) {
        init_subscriber_with_optional_chrome(subscriber.with(tokio_console_layer), config)?
    } else {
        init_subscriber_with_optional_chrome(subscriber, config)?
    };

    Ok(ProfilingGuard {
        chrome_guard,
        trace_path: config.trace_path.clone(),
    })
}

fn init_subscriber_with_optional_chrome<S>(
    subscriber: S,
    config: &ProfilingConfig,
) -> Result<Option<TraceFlushGuard>, String>
where
    S: Subscriber + for<'span> LookupSpan<'span> + Send + Sync + 'static,
{
    #[cfg(feature = "dev-profiling")]
    if let Some((chrome_layer, chrome_guard)) = build_chrome_layer(&subscriber, config)? {
        subscriber
            .with(chrome_layer)
            .try_init()
            .map_err(|error| format!("注册 tracing subscriber 失败: {error}"))?;
        return Ok(Some(chrome_guard));
    }

    #[cfg(feature = "dev-profiling")]
    {
        subscriber
            .try_init()
            .map_err(|error| format!("注册 tracing subscriber 失败: {error}"))?;
        Ok(None)
    }

    #[cfg(not(feature = "dev-profiling"))]
    {
        let _ = config;
        subscriber
            .try_init()
            .map_err(|error| format!("注册 tracing subscriber 失败: {error}"))?;
        Ok(None)
    }
}

#[cfg(feature = "dev-profiling")]
fn build_chrome_layer<S>(
    _subscriber: &S,
    config: &ProfilingConfig,
) -> Result<Option<(tracing_chrome::ChromeLayer<S>, TraceFlushGuard)>, String>
where
    S: Subscriber + for<'span> LookupSpan<'span> + Send + Sync,
{
    let Some(trace_path) = config.trace_path.as_ref() else {
        return Ok(None);
    };

    if let Some(parent) = trace_path.parent() {
        fs::create_dir_all(parent)
            .map_err(|error| format!("创建 profiling 目录失败（{}）: {error}", parent.display()))?;
    }

    let file = File::create(trace_path)
        .map_err(|error| format!("创建 trace 文件失败（{}）: {error}", trace_path.display()))?;

    let (layer, guard) = tracing_chrome::ChromeLayerBuilder::new()
        .writer(file)
        .include_args(false)
        .include_locations(true)
        .build();

    Ok(Some((layer, guard)))
}

fn build_tokio_console_layer<S>(
    config: &ProfilingConfig,
) -> Option<Box<dyn Layer<S> + Send + Sync + 'static>>
where
    S: Subscriber + for<'span> LookupSpan<'span> + Send + Sync + 'static,
{
    if !config.enabled_modes.tokio_console {
        return None;
    }

    #[cfg(feature = "tokio-console")]
    {
        return Some(console_subscriber::ConsoleLayer::builder().spawn().boxed());
    }

    #[cfg(not(feature = "tokio-console"))]
    {
        None
    }
}

fn is_tokio_console_feature_enabled() -> bool {
    cfg!(feature = "tokio-console")
}

fn is_trace_feature_enabled() -> bool {
    cfg!(feature = "dev-profiling")
}

fn is_profiling_supported_build() -> bool {
    cfg!(debug_assertions)
}

fn resolve_trace_path() -> PathBuf {
    if let Some(custom_path) = env::var("LIME_PROFILE_TRACE_PATH")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
    {
        return PathBuf::from(custom_path);
    }

    let directory = app_paths::best_effort_runtime_subdir("profiles");
    let file_name = format!(
        "lime-trace-{}-pid{}.json",
        Local::now().format("%Y%m%d-%H%M%S"),
        std::process::id()
    );
    directory.join(file_name)
}

fn resolve_tokio_console_bind() -> String {
    env::var("TOKIO_CONSOLE_BIND")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| "127.0.0.1:6669".to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    struct AlwaysBrokenPipe;

    impl Write for AlwaysBrokenPipe {
        fn write(&mut self, _buf: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed stderr"))
        }

        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::new(io::ErrorKind::BrokenPipe, "closed stderr"))
        }
    }

    struct AlwaysOtherError;

    impl Write for AlwaysOtherError {
        fn write(&mut self, _buf: &[u8]) -> io::Result<usize> {
            Err(io::Error::new(io::ErrorKind::Other, "disk full"))
        }

        fn flush(&mut self) -> io::Result<()> {
            Err(io::Error::new(io::ErrorKind::Other, "disk full"))
        }
    }

    #[test]
    fn tracing_writer_ignores_broken_pipe() {
        let mut writer = IgnoreBrokenPipeWriter::new(AlwaysBrokenPipe);

        assert_eq!(writer.write(b"hello").unwrap(), 5);
        assert!(writer.flush().is_ok());
    }

    #[test]
    fn tracing_writer_keeps_non_pipe_errors_visible() {
        let mut writer = IgnoreBrokenPipeWriter::new(AlwaysOtherError);

        assert_eq!(
            writer.write(b"hello").unwrap_err().kind(),
            io::ErrorKind::Other
        );
        assert_eq!(writer.flush().unwrap_err().kind(), io::ErrorKind::Other);
    }
}

use std::collections::VecDeque;
use std::fmt;
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};

/// Provider 传输健康熔断策略。
///
/// 窗口有明确上限；只有积累足够观测后才统计失败率，避免单次瞬态错误
/// 压制原本健康的 route。
#[derive(Clone, Copy, Debug, PartialEq)]
pub(crate) struct HealthConfig {
    pub(crate) window_duration: Duration,
    pub(crate) min_samples: usize,
    pub(crate) error_rate_threshold: f64,
    pub(crate) open_duration: Duration,
}

const MAX_OUTCOMES: usize = 10_000;

impl Default for HealthConfig {
    fn default() -> Self {
        Self {
            window_duration: Duration::from_secs(60),
            min_samples: 10,
            error_rate_threshold: 0.5,
            open_duration: Duration::from_secs(10),
        }
    }
}

impl HealthConfig {
    fn normalized(self) -> Self {
        let window_duration = self.window_duration.max(Duration::from_millis(1));
        Self {
            window_duration,
            min_samples: self.min_samples.max(1),
            error_rate_threshold: if self.error_rate_threshold.is_finite() {
                self.error_rate_threshold.clamp(0.01, 1.0)
            } else {
                0.5
            },
            open_duration: self.open_duration,
        }
    }
}

#[derive(Clone, Copy, Debug)]
struct Outcome {
    at: Instant,
    failed: bool,
}

#[derive(Debug)]
enum State {
    Closed { outcomes: VecDeque<Outcome> },
    Open { opened_at: Instant },
    HalfOpen { probe_in_flight: bool },
}

#[derive(Debug)]
struct Inner {
    config: HealthConfig,
    state: State,
}

/// 共享 provider 健康熔断器。
pub(crate) struct CircuitBreaker {
    inner: Mutex<Inner>,
}

impl CircuitBreaker {
    pub(crate) fn new(config: HealthConfig) -> Self {
        let config = config.normalized();
        Self {
            inner: Mutex::new(Inner {
                config,
                state: State::Closed {
                    outcomes: VecDeque::new(),
                },
            }),
        }
    }

    pub(crate) fn acquire(self: &Arc<Self>) -> Result<CircuitPermit, CircuitOpen> {
        let mut inner = self
            .inner
            .lock()
            .expect("provider health circuit mutex poisoned");
        let window_duration = inner.config.window_duration;
        if let State::Closed { outcomes } = &mut inner.state {
            prune_outcomes(outcomes, window_duration, Instant::now());
        }
        match &mut inner.state {
            State::Closed { .. } => Ok(CircuitPermit {
                breaker: Arc::clone(self),
                mode: PermitMode::Closed,
                settled: false,
            }),
            State::Open { opened_at } => {
                let elapsed = opened_at.elapsed();
                if elapsed < inner.config.open_duration {
                    return Err(CircuitOpen {
                        retry_after: inner.config.open_duration.saturating_sub(elapsed),
                    });
                }
                inner.state = State::HalfOpen {
                    probe_in_flight: true,
                };
                Ok(CircuitPermit {
                    breaker: Arc::clone(self),
                    mode: PermitMode::Probe,
                    settled: false,
                })
            }
            State::HalfOpen { probe_in_flight } => {
                if *probe_in_flight {
                    return Err(CircuitOpen {
                        retry_after: inner.config.open_duration,
                    });
                }
                *probe_in_flight = true;
                Ok(CircuitPermit {
                    breaker: Arc::clone(self),
                    mode: PermitMode::Probe,
                    settled: false,
                })
            }
        }
    }

    fn record(&self, mode: PermitMode, success: bool) {
        let mut inner = self
            .inner
            .lock()
            .expect("provider health circuit mutex poisoned");
        let config = inner.config;
        match (&mut inner.state, mode) {
            (State::Closed { outcomes }, PermitMode::Closed) => {
                let now = Instant::now();
                outcomes.push_back(Outcome {
                    at: now,
                    failed: !success,
                });
                while outcomes.len() > MAX_OUTCOMES {
                    outcomes.pop_front();
                }
                prune_outcomes(outcomes, config.window_duration, now);
                let failures = outcomes.iter().filter(|outcome| outcome.failed).count();
                let error_rate = failures as f64 / outcomes.len().max(1) as f64;
                if outcomes.len() >= config.min_samples && error_rate >= config.error_rate_threshold
                {
                    inner.state = State::Open {
                        opened_at: Instant::now(),
                    };
                }
            }
            (State::HalfOpen { .. }, PermitMode::Probe) if success => {
                inner.state = State::Closed {
                    outcomes: VecDeque::new(),
                };
            }
            (State::HalfOpen { .. }, PermitMode::Probe) => {
                inner.state = State::Open {
                    opened_at: Instant::now(),
                };
            }
            // 较早开始的 closed 请求可能晚于新请求完成；不能因此关闭或覆盖
            // half-open probe 状态。
            _ => {}
        }
    }

    fn release_probe(&self, mode: PermitMode) {
        if mode != PermitMode::Probe {
            return;
        }
        let mut inner = self
            .inner
            .lock()
            .expect("provider health circuit mutex poisoned");
        if let State::HalfOpen { probe_in_flight } = &mut inner.state {
            *probe_in_flight = false;
        }
    }
}

fn prune_outcomes(outcomes: &mut VecDeque<Outcome>, window: Duration, now: Instant) {
    while outcomes
        .front()
        .is_some_and(|outcome| now.duration_since(outcome.at) > window)
    {
        outcomes.pop_front();
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum PermitMode {
    Closed,
    Probe,
}

pub(crate) struct CircuitPermit {
    breaker: Arc<CircuitBreaker>,
    mode: PermitMode,
    settled: bool,
}

impl CircuitPermit {
    pub(crate) fn success(&mut self) {
        self.settle(true);
    }

    pub(crate) fn failure(&mut self) {
        self.settle(false);
    }

    pub(crate) fn ignore(&mut self) {
        if !self.settled {
            self.breaker.release_probe(self.mode);
        }
        self.settled = true;
    }

    fn settle(&mut self, success: bool) {
        if self.settled {
            return;
        }
        self.settled = true;
        self.breaker.record(self.mode, success);
    }
}

impl Drop for CircuitPermit {
    fn drop(&mut self) {
        if !self.settled {
            self.breaker.release_probe(self.mode);
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub(crate) struct CircuitOpen {
    retry_after: Duration,
}

impl CircuitOpen {
    #[cfg(test)]
    pub(crate) fn retry_after(self) -> Duration {
        self.retry_after
    }
}

impl fmt::Display for CircuitOpen {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            formatter,
            "provider health circuit is open; retry after {} ms",
            self.retry_after.as_millis()
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::thread;

    fn breaker(config: HealthConfig) -> Arc<CircuitBreaker> {
        Arc::new(CircuitBreaker::new(config))
    }

    fn fail(breaker: &Arc<CircuitBreaker>) {
        let mut permit = breaker.acquire().expect("circuit permit");
        permit.failure();
    }

    fn succeed(breaker: &Arc<CircuitBreaker>) {
        let mut permit = breaker.acquire().expect("circuit permit");
        permit.success();
    }

    #[test]
    fn bounded_window_opens_after_threshold() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_secs(60),
            min_samples: 3,
            error_rate_threshold: 0.5,
            open_duration: Duration::from_secs(60),
        });
        fail(&breaker);
        succeed(&breaker);
        fail(&breaker);

        let error = match breaker.acquire() {
            Err(error) => error,
            Ok(_) => panic!("threshold should open circuit"),
        };
        assert!(error.retry_after() <= Duration::from_secs(60));
    }

    #[test]
    fn half_open_allows_one_probe_and_success_closes() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_secs(60),
            min_samples: 1,
            error_rate_threshold: 1.0,
            open_duration: Duration::ZERO,
        });
        fail(&breaker);

        let mut probe = breaker.acquire().expect("half-open probe");
        assert!(
            breaker.acquire().is_err(),
            "only one probe may be in flight"
        );
        probe.success();
        assert!(breaker.acquire().is_ok(), "successful probe closes circuit");
    }

    #[test]
    fn dropped_probe_releases_slot_without_recording_outcome() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_secs(60),
            min_samples: 1,
            error_rate_threshold: 1.0,
            open_duration: Duration::ZERO,
        });
        fail(&breaker);
        let probe = breaker.acquire().expect("half-open probe");
        drop(probe);
        let _probe = breaker
            .acquire()
            .expect("dropped probe should not leave half-open circuit wedged");
    }

    #[test]
    fn ignored_probe_releases_half_open_slot_without_closing_circuit() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_secs(60),
            min_samples: 1,
            error_rate_threshold: 1.0,
            open_duration: Duration::ZERO,
        });
        fail(&breaker);
        let mut probe = breaker.acquire().expect("half-open probe");
        probe.ignore();
        assert!(
            breaker.acquire().is_ok(),
            "ignored probe should release slot"
        );
    }

    #[test]
    fn old_closed_request_cannot_close_new_half_open_probe() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_secs(60),
            min_samples: 1,
            error_rate_threshold: 1.0,
            open_duration: Duration::from_secs(60),
        });
        let mut old_request = breaker.acquire().expect("closed request");
        let mut trigger = breaker.acquire().expect("second closed request");
        trigger.failure();
        old_request.success();
        assert!(breaker.acquire().is_err());
    }

    #[test]
    fn normalized_config_is_finite_and_usable() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::ZERO,
            min_samples: 0,
            error_rate_threshold: f64::NAN,
            open_duration: Duration::ZERO,
        });
        fail(&breaker);
        let _ = breaker.acquire().expect("normalized one-entry circuit");
        let _ = thread::yield_now();
    }

    #[test]
    fn outcomes_expire_from_time_window() {
        let breaker = breaker(HealthConfig {
            window_duration: Duration::from_millis(5),
            min_samples: 2,
            error_rate_threshold: 1.0,
            open_duration: Duration::from_secs(60),
        });
        fail(&breaker);
        thread::sleep(Duration::from_millis(10));
        succeed(&breaker);
        assert!(
            breaker.acquire().is_ok(),
            "expired failure must leave window"
        );
    }
}

use super::{commit, import_status};
use crate::runtime::{new_id, timestamp};
use crate::{RuntimeCore, RuntimeCoreError};
use app_server_protocol::{
    ConversationImportJob, ConversationImportJobPhase, ConversationImportJobProgress,
    ConversationImportJobReadParams, ConversationImportJobReadResponse,
    ConversationImportJobStatus, ConversationImportSourceClient,
    ConversationImportThreadCommitParams, ConversationImportThreadCommitStartResponse,
};

#[derive(Debug, Clone)]
pub(in crate::runtime) struct ImportJobRecord {
    pub job: ConversationImportJob,
    source_key: String,
}

pub(super) fn start_import_job(
    core: &RuntimeCore,
    params: ConversationImportThreadCommitParams,
) -> Result<ConversationImportThreadCommitStartResponse, RuntimeCoreError> {
    if !params.confirmed {
        return Err(RuntimeCoreError::Backend(
            "conversation import commit requires explicit user confirmation".to_string(),
        ));
    }

    let source_client = params.source_client.unwrap_or_default();
    let source_thread_id = normalized(params.source_thread_id.as_deref());
    let source_key = import_source_key(source_client, &params);
    let now = timestamp();
    let job = {
        let mut state = core
            .state
            .lock()
            .expect("runtime core state mutex poisoned");
        if let Some(existing) = state
            .import_jobs
            .values()
            .find(|record| record.source_key == source_key && !is_terminal(record.job.status))
        {
            return Ok(ConversationImportThreadCommitStartResponse {
                job: existing.job.clone(),
            });
        }

        let job = ConversationImportJob {
            job_id: new_id("import"),
            source_client,
            source_thread_id,
            status: ConversationImportJobStatus::Queued,
            progress: ConversationImportJobProgress::default(),
            result: None,
            error: None,
            created_at: now.clone(),
            updated_at: now,
        };
        state.import_jobs.insert(
            job.job_id.clone(),
            ImportJobRecord {
                job: job.clone(),
                source_key,
            },
        );
        job
    };

    let worker_core = core.clone();
    let job_id = job.job_id.clone();
    tokio::task::spawn_blocking(move || run_import_job(worker_core, job_id, params));

    Ok(ConversationImportThreadCommitStartResponse { job })
}

pub(super) fn read_import_job(
    core: &RuntimeCore,
    params: ConversationImportJobReadParams,
) -> Result<ConversationImportJobReadResponse, RuntimeCoreError> {
    let job_id = params.job_id.trim();
    if job_id.is_empty() {
        return Err(RuntimeCoreError::Backend(
            "conversation import job read requires jobId".to_string(),
        ));
    }
    let state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    let record = state.import_jobs.get(job_id).ok_or_else(|| {
        RuntimeCoreError::Backend(format!("conversation import job not found: {job_id}"))
    })?;
    Ok(ConversationImportJobReadResponse {
        job: record.job.clone(),
    })
}

pub(super) fn active_job_for_thread(
    core: &RuntimeCore,
    source_client: ConversationImportSourceClient,
    source_thread_id: &str,
) -> Option<ConversationImportJob> {
    let source_thread_id = source_thread_id.trim();
    if source_thread_id.is_empty() {
        return None;
    }
    let state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    state
        .import_jobs
        .values()
        .filter(|record| {
            record.job.source_client == source_client
                && record.job.source_thread_id.as_deref() == Some(source_thread_id)
                && !is_terminal(record.job.status)
        })
        .map(|record| record.job.clone())
        .max_by(|left, right| {
            left.updated_at
                .cmp(&right.updated_at)
                .then_with(|| left.job_id.cmp(&right.job_id))
        })
}

fn run_import_job(core: RuntimeCore, job_id: String, params: ConversationImportThreadCommitParams) {
    update_job(&core, &job_id, |job| {
        job.status = ConversationImportJobStatus::Running;
        job.progress.phase = ConversationImportJobPhase::ReadingSource;
    });

    let result =
        commit::commit_conversation_import_thread_with_progress(&core, params, &mut |progress| {
            update_job(&core, &job_id, |job| {
                job.status = ConversationImportJobStatus::Running;
                job.progress = progress.clone();
            });
            Ok(())
        });

    match result {
        Ok(result) => update_job(&core, &job_id, |job| {
            job.source_thread_id = Some(result.thread.source_thread_id.clone());
            job.status = ConversationImportJobStatus::Completed;
            job.progress.phase = ConversationImportJobPhase::Completed;
            job.progress.completed_items = job.progress.total_items;
            job.progress.completed_turns = job.progress.total_turns;
            job.result = Some(result.clone());
            job.error = None;
        }),
        Err(error) => update_job(&core, &job_id, |job| {
            job.status = ConversationImportJobStatus::Failed;
            job.progress.phase = ConversationImportJobPhase::Failed;
            job.error = Some(error.to_string());
            job.result = None;
        }),
    }
}

fn update_job(core: &RuntimeCore, job_id: &str, update: impl FnOnce(&mut ConversationImportJob)) {
    let mut state = core
        .state
        .lock()
        .expect("runtime core state mutex poisoned");
    let Some(record) = state.import_jobs.get_mut(job_id) else {
        return;
    };
    update(&mut record.job);
    record.job.updated_at = timestamp();
}

fn import_source_key(
    source_client: ConversationImportSourceClient,
    params: &ConversationImportThreadCommitParams,
) -> String {
    let source = normalized(params.source_thread_id.as_deref())
        .or_else(|| normalized(params.source_path.as_deref()))
        .unwrap_or_else(|| "unresolved".to_string());
    let root = normalized(params.source_root.as_deref()).unwrap_or_default();
    format!(
        "{}:{root}:{source}",
        import_status::source_client_value(source_client)
    )
}

fn normalized(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
}

fn is_terminal(status: ConversationImportJobStatus) -> bool {
    matches!(
        status,
        ConversationImportJobStatus::Completed | ConversationImportJobStatus::Failed
    )
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::fs;
    use std::time::Duration;

    #[tokio::test(flavor = "multi_thread", worker_threads = 2)]
    async fn background_import_job_reaches_terminal_canonical_result() {
        let temp = tempfile::tempdir().expect("tempdir");
        let rollout_path = temp.path().join("rollout-background-import.jsonl");
        fs::write(
            &rollout_path,
            [
                serde_json::json!({
                    "timestamp": "2026-07-17T00:00:00.000Z",
                    "type": "session_meta",
                    "payload": {
                        "id": "thread-background-import",
                        "cwd": "/workspace/app",
                        "source": "cli",
                        "model_provider": "openai"
                    }
                }),
                serde_json::json!({
                    "timestamp": "2026-07-17T00:00:01.000Z",
                    "type": "event_msg",
                    "payload": {
                        "type": "user_message",
                        "message": "## My request for Codex: import this history"
                    }
                }),
                serde_json::json!({
                    "timestamp": "2026-07-17T00:00:02.000Z",
                    "type": "event_msg",
                    "payload": {
                        "type": "agent_message",
                        "message": "Imported in the background."
                    }
                }),
            ]
            .into_iter()
            .map(|value| value.to_string())
            .collect::<Vec<_>>()
            .join("\n"),
        )
        .expect("write rollout");
        let core = RuntimeCore::default();

        let started = start_import_job(
            &core,
            ConversationImportThreadCommitParams {
                source_root: Some(temp.path().to_string_lossy().into_owned()),
                source_thread_id: Some("thread-background-import".to_string()),
                source_path: Some(rollout_path.to_string_lossy().into_owned()),
                confirmed: true,
                ..Default::default()
            },
        )
        .expect("start background import");
        assert_eq!(started.job.status, ConversationImportJobStatus::Queued);

        let terminal = tokio::time::timeout(Duration::from_secs(10), async {
            loop {
                let current = read_import_job(
                    &core,
                    ConversationImportJobReadParams {
                        job_id: started.job.job_id.clone(),
                    },
                )
                .expect("read import job")
                .job;
                if is_terminal(current.status) {
                    break current;
                }
                tokio::task::yield_now().await;
            }
        })
        .await
        .expect("background import terminal timeout");

        assert_eq!(terminal.status, ConversationImportJobStatus::Completed);
        assert_eq!(
            terminal.progress.phase,
            ConversationImportJobPhase::Completed
        );
        assert_eq!(
            terminal.progress.completed_items,
            terminal.progress.total_items
        );
        assert_eq!(
            terminal.progress.completed_turns,
            terminal.progress.total_turns
        );
        let result = terminal.result.expect("canonical commit result");
        assert_eq!(result.thread.source_thread_id, "thread-background-import");
        assert_eq!(result.imported_turns, 1);
        assert!(result.can_continue);
    }

    #[tokio::test]
    async fn background_import_requires_explicit_confirmation_before_spawning() {
        let error = start_import_job(
            &RuntimeCore::default(),
            ConversationImportThreadCommitParams::default(),
        )
        .expect_err("unconfirmed import must fail closed");
        assert!(error
            .to_string()
            .contains("requires explicit user confirmation"));
    }
}

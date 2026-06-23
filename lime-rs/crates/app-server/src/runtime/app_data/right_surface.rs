use super::NoopAppDataSource;
use super::RuntimeCoreError;
use app_server_protocol::WorkspaceRightSurfacePendingListParams;
use app_server_protocol::WorkspaceRightSurfacePendingRequest;
use async_trait::async_trait;

#[derive(Debug, Clone, Default, PartialEq)]
pub struct WorkspaceObjectCanvasSnapshot {
    pub snapshot_id: String,
    pub request_id: String,
    pub workspace_id: Option<String>,
    pub workspace_root: Option<String>,
    pub session_id: Option<String>,
    pub board_id: String,
    pub revision: u64,
    pub persistence_key: String,
    pub candidate_id: Option<String>,
    pub object_id: Option<String>,
    pub object_kind: Option<String>,
    pub snapshot_json: serde_json::Value,
    pub created_at: String,
}

#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct WorkspaceObjectCanvasSnapshotListParams {
    pub workspace_id: Option<String>,
    pub workspace_root: Option<String>,
    pub session_id: Option<String>,
    pub board_id: Option<String>,
    pub persistence_key: Option<String>,
    pub limit: Option<u64>,
}

#[async_trait]
pub trait RightSurfaceAppDataSource: Send + Sync {
    fn workspace_right_surface_pending_persistence_enabled(&self) -> bool {
        false
    }

    async fn save_workspace_right_surface_pending(
        &self,
        _request: WorkspaceRightSurfacePendingRequest,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn list_workspace_right_surface_pending(
        &self,
        _params: WorkspaceRightSurfacePendingListParams,
    ) -> Result<Vec<WorkspaceRightSurfacePendingRequest>, RuntimeCoreError> {
        Ok(Vec::new())
    }

    async fn delete_workspace_right_surface_pending(
        &self,
        _request_ids: Vec<String>,
    ) -> Result<Vec<String>, RuntimeCoreError> {
        Ok(Vec::new())
    }

    async fn save_workspace_object_canvas_snapshot(
        &self,
        _snapshot: WorkspaceObjectCanvasSnapshot,
    ) -> Result<(), RuntimeCoreError> {
        Ok(())
    }

    async fn list_workspace_object_canvas_snapshots(
        &self,
        _params: WorkspaceObjectCanvasSnapshotListParams,
    ) -> Result<Vec<WorkspaceObjectCanvasSnapshot>, RuntimeCoreError> {
        Ok(Vec::new())
    }
}

impl RightSurfaceAppDataSource for NoopAppDataSource {}

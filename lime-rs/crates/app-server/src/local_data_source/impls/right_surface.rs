use super::super::*;
use crate::WorkspaceObjectCanvasSnapshot;
use crate::WorkspaceObjectCanvasSnapshotListParams;
use async_trait::async_trait;

#[async_trait]
impl RightSurfaceAppDataSource for LocalAppDataSource {
    fn workspace_right_surface_pending_persistence_enabled(&self) -> bool {
        true
    }

    async fn save_workspace_right_surface_pending(
        &self,
        request: WorkspaceRightSurfacePendingRequest,
    ) -> Result<(), RuntimeCoreError> {
        right_surface::save_pending_request(&self.db, request)
    }

    async fn list_workspace_right_surface_pending(
        &self,
        params: WorkspaceRightSurfacePendingListParams,
    ) -> Result<Vec<WorkspaceRightSurfacePendingRequest>, RuntimeCoreError> {
        right_surface::list_pending_requests(&self.db, params)
    }

    async fn delete_workspace_right_surface_pending(
        &self,
        request_ids: Vec<String>,
    ) -> Result<Vec<String>, RuntimeCoreError> {
        right_surface::delete_pending_requests(&self.db, request_ids)
    }

    async fn save_workspace_object_canvas_snapshot(
        &self,
        snapshot: WorkspaceObjectCanvasSnapshot,
    ) -> Result<(), RuntimeCoreError> {
        right_surface::save_object_canvas_snapshot(&self.db, snapshot)
    }

    async fn list_workspace_object_canvas_snapshots(
        &self,
        params: WorkspaceObjectCanvasSnapshotListParams,
    ) -> Result<Vec<WorkspaceObjectCanvasSnapshot>, RuntimeCoreError> {
        right_surface::list_object_canvas_snapshots(&self.db, params)
    }
}

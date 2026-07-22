use std::fs;
use std::path::Path;

use super::RolloutStore;

impl RolloutStore {
    pub(in crate::runtime) fn delete(
        &self,
        relative_path: &Path,
        session_id: &str,
        thread_id: &str,
        archived: bool,
    ) -> Result<bool, String> {
        let path = if archived {
            self.resolve_archived(relative_path)?
        } else {
            self.resolve_active(relative_path)?
        };
        if !path
            .try_exists()
            .map_err(|error| format!("failed to inspect rollout {}: {error}", path.display()))?
        {
            return Ok(false);
        }
        self.verify_location(relative_path, session_id, thread_id, archived)?;
        fs::remove_file(&path)
            .map_err(|error| format!("failed to delete rollout {}: {error}", path.display()))?;
        Ok(true)
    }
}

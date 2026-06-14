use super::super::*;
use async_trait::async_trait;

#[async_trait]
impl WorkspaceSkillBindingAppDataSource for LocalAppDataSource {
    async fn list_workspace_skill_bindings(
        &self,
        params: WorkspaceSkillBindingsListParams,
    ) -> Result<WorkspaceSkillBindingsListResponse, RuntimeCoreError> {
        Ok(WorkspaceSkillBindingsListResponse {
            bindings: skills::workspace::list_workspace_skill_bindings_value(params)
                .map_err(data_error)?,
        })
    }

    async fn list_workspace_registered_skills(
        &self,
        params: WorkspaceRegisteredSkillsListParams,
    ) -> Result<WorkspaceRegisteredSkillsListResponse, RuntimeCoreError> {
        Ok(WorkspaceRegisteredSkillsListResponse {
            skills: skills::workspace::list_workspace_registered_skills_value(params)
                .map_err(data_error)?,
        })
    }
}

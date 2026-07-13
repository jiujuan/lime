use super::common::parse_skill_package_app;
use super::common::skill_package_app_to_core_app;
use super::common::skill_state_key;
use super::common::validate_skill_package_directory;
use super::common::SkillPackageApp;
use app_server_protocol::SkillManagementInstallParams;
use app_server_protocol::SkillManagementListParams;
use app_server_protocol::SkillManagementListResponse;
use app_server_protocol::SkillManagementUninstallParams;
use app_server_protocol::SkillManagementWriteResponse;
use app_server_protocol::SkillRepositoryDeleteParams;
use app_server_protocol::SkillRepositoryEntry;
use app_server_protocol::SkillRepositoryListResponse;
use app_server_protocol::SkillRepositorySaveParams;
use chrono::Utc;
use lime_core::database::dao::skills::SkillDao;
use lime_core::database::DbConnection;
use lime_core::models::skill_model::SkillCatalogSource;
use lime_core::models::skill_model::SkillRepo;
use lime_core::models::skill_model::SkillState;
use lime_services::skill_service::LocalSkillCatalogScope;
use lime_services::skill_service::SkillService;

fn parse_skill_list_scope(scope: Option<&str>) -> Result<LocalSkillCatalogScope, String> {
    match scope.unwrap_or("all").trim().to_ascii_lowercase().as_str() {
        "" | "all" | "local" => Ok(LocalSkillCatalogScope::All),
        "user" => Ok(LocalSkillCatalogScope::User),
        value => Err(format!("Unsupported skill list scope: {value}")),
    }
}

pub(crate) async fn list_management_skills(
    db: DbConnection,
    params: SkillManagementListParams,
) -> Result<SkillManagementListResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    let app_type = skill_package_app_to_core_app(app);
    let scope = parse_skill_list_scope(params.scope.as_deref())?;
    let (repos, installed_states) = {
        let conn = db.lock().map_err(|error| error.to_string())?;
        let repos = SkillDao::get_skill_repos(&conn).map_err(|error| error.to_string())?;
        let installed_states = SkillDao::get_skills(&conn).map_err(|error| error.to_string())?;
        (repos, installed_states)
    };
    let service = SkillService::new().map_err(|error| error.to_string())?;
    let skills = if params.refresh_remote {
        service
            .list_skills(&app_type, &repos, &installed_states)
            .await
            .map_err(|error| error.to_string())?
    } else {
        service
            .list_local_skills_with_scope(&app_type, &installed_states, scope)
            .map_err(|error| error.to_string())?
    };

    {
        let conn = db.lock().map_err(|error| error.to_string())?;
        let existing_states = SkillDao::get_skills(&conn).map_err(|error| error.to_string())?;
        for skill in &skills {
            if skill.installed && skill.catalog_source != SkillCatalogSource::Project {
                let key = skill_state_key(app, &skill.directory);
                if !existing_states.contains_key(&key) {
                    SkillDao::update_skill_state(
                        &conn,
                        &key,
                        &SkillState {
                            installed: true,
                            installed_at: Utc::now(),
                        },
                    )
                    .map_err(|error| error.to_string())?;
                }
            }
        }
    }

    Ok(SkillManagementListResponse {
        skills: skills
            .into_iter()
            .map(serde_json::to_value)
            .collect::<Result<Vec<_>, _>>()
            .map_err(|error| format!("Failed to serialize skill list: {error}"))?,
    })
}

pub(crate) async fn install_management_skill(
    db: DbConnection,
    params: SkillManagementInstallParams,
) -> Result<SkillManagementWriteResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    validate_skill_package_directory(&params.directory)?;
    let app_type = skill_package_app_to_core_app(app);
    let (repos, installed_states) = {
        let conn = db.lock().map_err(|error| error.to_string())?;
        let repos = SkillDao::get_skill_repos(&conn).map_err(|error| error.to_string())?;
        let installed_states = SkillDao::get_skills(&conn).map_err(|error| error.to_string())?;
        (repos, installed_states)
    };
    let service = SkillService::new().map_err(|error| error.to_string())?;
    let skills = service
        .list_skills(&app_type, &repos, &installed_states)
        .await
        .map_err(|error| error.to_string())?;
    let skill = skills
        .iter()
        .find(|skill| skill.directory == params.directory)
        .ok_or_else(|| format!("Skill not found: {}", params.directory))?;
    let repo_owner = skill
        .repo_owner
        .as_deref()
        .ok_or_else(|| "Missing repo owner".to_string())?;
    let repo_name = skill
        .repo_name
        .as_deref()
        .ok_or_else(|| "Missing repo name".to_string())?;
    let repo_branch = skill
        .repo_branch
        .as_deref()
        .ok_or_else(|| "Missing repo branch".to_string())?;
    service
        .install_skill(
            &app_type,
            repo_owner,
            repo_name,
            repo_branch,
            &params.directory,
        )
        .await
        .map_err(|error| error.to_string())?;

    let key = skill_state_key(app, &params.directory);
    {
        let conn = db.lock().map_err(|error| error.to_string())?;
        SkillDao::update_skill_state(
            &conn,
            &key,
            &SkillState {
                installed: true,
                installed_at: Utc::now(),
            },
        )
        .map_err(|error| error.to_string())?;
    }
    if matches!(app, SkillPackageApp::Lime) {
        crate::skill_registry::reload_lime_skill_registry();
    }
    Ok(SkillManagementWriteResponse { success: true })
}

pub(crate) fn uninstall_management_skill(
    db: DbConnection,
    params: SkillManagementUninstallParams,
) -> Result<SkillManagementWriteResponse, String> {
    let app = parse_skill_package_app(&params.app)?;
    validate_skill_package_directory(&params.directory)?;
    let app_type = skill_package_app_to_core_app(app);
    SkillService::uninstall_skill(&app_type, &params.directory)
        .map_err(|error| error.to_string())?;
    let key = skill_state_key(app, &params.directory);
    let conn = db.lock().map_err(|error| error.to_string())?;
    SkillDao::update_skill_state(
        &conn,
        &key,
        &SkillState {
            installed: false,
            installed_at: Utc::now(),
        },
    )
    .map_err(|error| error.to_string())?;
    if matches!(app, SkillPackageApp::Lime) {
        crate::skill_registry::reload_lime_skill_registry();
    }
    Ok(SkillManagementWriteResponse { success: true })
}

pub(crate) fn list_skill_repositories(
    db: DbConnection,
) -> Result<SkillRepositoryListResponse, String> {
    let conn = db.lock().map_err(|error| error.to_string())?;
    let repos = SkillDao::get_skill_repos(&conn).map_err(|error| error.to_string())?;
    Ok(SkillRepositoryListResponse {
        repos: repos
            .into_iter()
            .map(|repo| SkillRepositoryEntry {
                owner: repo.owner,
                name: repo.name,
                branch: repo.branch,
                enabled: repo.enabled,
            })
            .collect(),
    })
}

pub(crate) fn save_skill_repository(
    db: DbConnection,
    params: SkillRepositorySaveParams,
) -> Result<SkillManagementWriteResponse, String> {
    let repo = params.repo;
    let conn = db.lock().map_err(|error| error.to_string())?;
    SkillDao::save_skill_repo(
        &conn,
        &SkillRepo {
            owner: repo.owner,
            name: repo.name,
            branch: repo.branch,
            enabled: repo.enabled,
        },
    )
    .map_err(|error| error.to_string())?;
    Ok(SkillManagementWriteResponse { success: true })
}

pub(crate) fn delete_skill_repository(
    db: DbConnection,
    params: SkillRepositoryDeleteParams,
) -> Result<SkillManagementWriteResponse, String> {
    let conn = db.lock().map_err(|error| error.to_string())?;
    SkillDao::delete_skill_repo(&conn, &params.owner, &params.name)
        .map_err(|error| error.to_string())?;
    Ok(SkillManagementWriteResponse { success: true })
}

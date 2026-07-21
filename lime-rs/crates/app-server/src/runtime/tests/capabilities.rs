use super::support::*;
use super::*;

#[test]
fn runtime_core_uses_injected_capability_source() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(TestCapabilitySource),
    );

    let response = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: Some("workspace-main".to_string()),
            session_id: None,
            cursor: None,
            limit: None,
        })
        .expect("capability list");

    assert_eq!(response.capabilities.len(), 1);
    assert_eq!(
        response.capabilities[0].id,
        "test.capability.content-studio.workspace-main"
    );
    assert_eq!(
        response.capabilities[0].title,
        "Test Capability for content-studio"
    );
    assert_eq!(response.capabilities[0].methods, vec!["test/method"]);
    assert_eq!(response.next_cursor, None);
    let manifest = response
        .runtime_capability_manifest
        .expect("runtime capability manifest");
    assert_eq!(
        manifest.schema_version,
        RUNTIME_CAPABILITY_MANIFEST_SCHEMA_VERSION
    );
    assert_eq!(manifest.runtime_id, "app-server");
    assert_eq!(manifest.session_id, None);
    assert_eq!(manifest.capabilities.len(), 1);
    assert_eq!(
        manifest.capabilities[0].id,
        "test.capability.content-studio.workspace-main"
    );
    assert_eq!(manifest.capabilities[0].status, "supported");
    assert_eq!(manifest.capabilities[0].scope, "runtime");
}

#[test]
fn runtime_core_paginates_capability_list_after_scope_filtering() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.1".to_string(),
                title: "Capability 1".to_string(),
                description: None,
                methods: vec!["method/one".to_string()],
            }),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.2".to_string(),
                title: "Capability 2".to_string(),
                description: None,
                methods: vec!["method/two".to_string()],
            })
            .for_apps(["content-studio"]),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "cap.3".to_string(),
                title: "Capability 3".to_string(),
                description: None,
                methods: vec!["method/three".to_string()],
            }),
        ])),
    );

    let first_page = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: None,
            session_id: None,
            cursor: None,
            limit: Some(2),
        })
        .expect("first page");
    let first_ids: Vec<&str> = first_page
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();
    assert_eq!(first_ids, vec!["cap.1", "cap.2"]);
    assert_eq!(first_page.next_cursor.as_deref(), Some("2"));
    assert_eq!(
        first_page
            .runtime_capability_manifest
            .as_ref()
            .expect("first page manifest")
            .capabilities
            .len(),
        2
    );

    let second_page = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("content-studio".to_string()),
            workspace_id: None,
            session_id: None,
            cursor: first_page.next_cursor,
            limit: Some(2),
        })
        .expect("second page");
    let second_ids: Vec<&str> = second_page
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();
    assert_eq!(second_ids, vec!["cap.3"]);
    assert_eq!(second_page.next_cursor, None);
}

#[test]
fn capability_list_with_session_id_uses_stored_session_scope() {
    let core = RuntimeCore::with_backend_and_capability_source(
        Arc::new(MockBackend),
        Arc::new(crate::CapabilityInventorySource::new(vec![
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "session.draft.write".to_string(),
                title: "Session Draft Write".to_string(),
                description: None,
                methods: vec![METHOD_TURN_START.to_string()],
            })
            .for_apps(["content-studio"])
            .for_workspaces(["workspace-main"])
            .for_sessions(["sess_allowed"]),
            crate::CapabilityInventoryRecord::new(CapabilityDescriptor {
                id: "workspace.readiness".to_string(),
                title: "Workspace Readiness".to_string(),
                description: None,
                methods: vec!["capability/list".to_string()],
            })
            .for_workspaces(["workspace-main"]),
        ])),
    );
    core.start_session(AgentSessionStartParams {
        session_id: Some("sess_allowed".to_string()),
        thread_id: None,
        app_id: "content-studio".to_string(),
        workspace_id: Some("workspace-main".to_string()),
        business_object_ref: None,
        locale: None,
    })
    .expect("session");

    let listed = core
        .list_capabilities(CapabilityListParams {
            app_id: Some("other-app".to_string()),
            workspace_id: Some("other-workspace".to_string()),
            session_id: Some("sess_allowed".to_string()),
            cursor: None,
            limit: None,
        })
        .expect("capability list");
    let ids: Vec<&str> = listed
        .capabilities
        .iter()
        .map(|capability| capability.id.as_str())
        .collect();

    assert_eq!(ids, vec!["session.draft.write", "workspace.readiness"]);
}

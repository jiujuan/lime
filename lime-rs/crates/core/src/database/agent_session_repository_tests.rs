use super::*;

fn create_agent_sessions_table(conn: &Connection) {
    conn.execute(
        "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                total_tokens INTEGER,
                input_tokens INTEGER,
                output_tokens INTEGER,
                cached_input_tokens INTEGER,
                cache_creation_input_tokens INTEGER,
                accumulated_total_tokens INTEGER,
                accumulated_input_tokens INTEGER,
                accumulated_output_tokens INTEGER,
                schedule_id TEXT,
                updated_at TEXT
            )",
        [],
    )
    .expect("create agent_sessions");
}

#[test]
fn delete_session_should_remove_session_record() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute("CREATE TABLE agent_sessions (id TEXT PRIMARY KEY)", [])
        .expect("create agent_sessions");
    conn.execute("INSERT INTO agent_sessions (id) VALUES ('session-1')", [])
        .expect("insert session");

    delete_session(&conn, "session-1").expect("delete session");

    let remaining: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| row.get(0),
        )
        .expect("count sessions");
    assert_eq!(remaining, 0);
}

#[test]
fn insert_session_record_should_insert_and_support_current_reads() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                model TEXT NOT NULL,
                system_prompt TEXT,
                title TEXT,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                working_dir TEXT,
                execution_strategy TEXT NOT NULL,
                session_type TEXT NOT NULL DEFAULT 'user',
                user_set_name INTEGER NOT NULL DEFAULT 0,
                extension_data_json TEXT NOT NULL DEFAULT '{}'
            )",
        [],
    )
    .expect("create agent_sessions");

    insert_session_record(
        &conn,
        &SessionCreateRecord {
            id: "session-1".to_string(),
            model: "agent:default".to_string(),
            title: "新对话".to_string(),
            created_at: "created".to_string(),
            updated_at: "updated".to_string(),
            working_dir: "/tmp/project".to_string(),
            execution_strategy: "react".to_string(),
            session_type: "user".to_string(),
            user_set_name: false,
            extension_data_json: "{}".to_string(),
        },
    )
    .expect("insert session");

    assert!(session_exists(&conn, "session-1").expect("session exists"));
    assert!(!session_exists(&conn, "missing").expect("missing session"));
    assert_eq!(
        get_session_working_dir(&conn, "session-1").expect("read working dir"),
        Some("/tmp/project".to_string())
    );
    assert_eq!(
        get_session_extension_data_json(&conn, "session-1").expect("read extension data"),
        Some("{}".to_string())
    );
}

#[test]
fn touch_session_updated_at_should_replace_timestamp() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (id TEXT PRIMARY KEY, updated_at TEXT NOT NULL)",
        [],
    )
    .expect("create agent_sessions");
    conn.execute(
        "INSERT INTO agent_sessions (id, updated_at) VALUES ('session-1', 'old')",
        [],
    )
    .expect("insert session");

    touch_session_updated_at(&conn, "session-1", "now").expect("touch session");

    let updated_at: String = conn
        .query_row(
            "SELECT updated_at FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| row.get(0),
        )
        .expect("read updated_at");
    assert_eq!(updated_at, "now");
}

#[test]
fn get_session_extension_data_json_should_read_current_metadata() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (id TEXT PRIMARY KEY, extension_data_json TEXT NOT NULL)",
        [],
    )
    .expect("create agent_sessions");
    conn.execute(
        "INSERT INTO agent_sessions (id, extension_data_json) VALUES (?1, ?2)",
        [
            "session-1",
            r#"{"lime_provider_routing.v0":{"provider_selector":"openai"}}"#,
        ],
    )
    .expect("insert session");

    let extension_data =
        get_session_extension_data_json(&conn, "session-1").expect("read extension data");

    assert_eq!(
        extension_data.as_deref(),
        Some(r#"{"lime_provider_routing.v0":{"provider_selector":"openai"}}"#)
    );
    assert_eq!(
        get_session_extension_data_json(&conn, "missing").expect("read missing"),
        None
    );
}

#[test]
fn update_session_extension_data_should_replace_current_metadata() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                extension_data_json TEXT NOT NULL,
                updated_at TEXT
            )",
        [],
    )
    .expect("create agent_sessions");
    conn.execute(
        "INSERT INTO agent_sessions (id, extension_data_json, updated_at)
             VALUES ('session-1', '{}', 'old')",
        [],
    )
    .expect("insert session");

    update_session_extension_data(
        &conn,
        "session-1",
        r#"{"todo":{"v0":{"items":["a"]}}}"#,
        "now",
    )
    .expect("update extension data");

    let row = conn
        .query_row(
            "SELECT extension_data_json, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)),
        )
        .expect("read extension data");
    assert_eq!(
        row,
        (
            r#"{"todo":{"v0":{"items":["a"]}}}"#.to_string(),
            "now".to_string(),
        )
    );
}

#[test]
fn update_session_metadata_should_update_name_working_dir_and_type() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                title TEXT,
                user_set_name INTEGER NOT NULL DEFAULT 0,
                working_dir TEXT,
                session_type TEXT NOT NULL DEFAULT 'user',
                updated_at TEXT
            )",
        [],
    )
    .expect("create agent_sessions");
    conn.execute(
        "INSERT INTO agent_sessions (
                id, title, user_set_name, working_dir, session_type, updated_at
             ) VALUES (
                'session-1', 'old', 0, '/tmp/old', 'user', 'old'
             )",
        [],
    )
    .expect("insert session");

    update_session_name(&conn, "session-1", "new", true, "name-now").expect("update name");
    update_session_working_dir_with_updated_at(&conn, "session-1", "/tmp/new", "dir-now")
        .expect("update working dir");
    update_session_type(&conn, "session-1", "hidden", "type-now").expect("update session type");

    let row = conn
        .query_row(
            "SELECT title, user_set_name, working_dir, session_type, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, bool>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, String>(3)?,
                    row.get::<_, String>(4)?,
                ))
            },
        )
        .expect("read metadata");
    assert_eq!(
        row,
        (
            Some("new".to_string()),
            true,
            Some("/tmp/new".to_string()),
            "hidden".to_string(),
            "type-now".to_string(),
        )
    );
}

#[test]
fn session_provider_config_update_should_normalize_provider_and_model() {
    let update = SessionProviderConfigUpdate::new(
        Some("  openai  ".to_string()),
        Some("  gpt-4.1  ".to_string()),
        Some("{}".to_string()),
    );
    let empty = SessionProviderConfigUpdate::new(
        Some(" ".to_string()),
        Some(" ".to_string()),
        Some("ignored".to_string()),
    );

    assert_eq!(update.provider_name.as_deref(), Some("openai"));
    assert_eq!(update.model_name.as_deref(), Some("gpt-4.1"));
    assert!(!update.is_empty());
    assert!(empty.is_empty());
}

#[test]
fn update_session_recipe_should_replace_and_clear_values() {
    let conn = Connection::open_in_memory().expect("open db");
    conn.execute(
        "CREATE TABLE agent_sessions (
                id TEXT PRIMARY KEY,
                recipe_json TEXT,
                user_recipe_values_json TEXT,
                updated_at TEXT
            )",
        [],
    )
    .expect("create agent_sessions");
    conn.execute(
        "INSERT INTO agent_sessions (
                id, recipe_json, user_recipe_values_json, updated_at
             ) VALUES (
                'session-1',
                '{\"title\":\"old\"}',
                '{\"temperature\":\"0.9\"}',
                'old'
             )",
        [],
    )
    .expect("insert session");

    update_session_recipe(
        &conn,
        "session-1",
        &SessionRecipeUpdate {
            recipe_json: Some(r#"{"title":"new"}"#.to_string()),
            user_recipe_values_json: Some(r#"{"temperature":"0.2"}"#.to_string()),
        },
        "now",
    )
    .expect("replace recipe");

    let row = conn
        .query_row(
            "SELECT recipe_json, user_recipe_values_json, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .expect("read replaced recipe");
    assert_eq!(
        row,
        (
            Some(r#"{"title":"new"}"#.to_string()),
            Some(r#"{"temperature":"0.2"}"#.to_string()),
            "now".to_string(),
        )
    );

    update_session_recipe(
        &conn,
        "session-1",
        &SessionRecipeUpdate::default(),
        "cleared",
    )
    .expect("clear recipe");

    let cleared = conn
        .query_row(
            "SELECT recipe_json, user_recipe_values_json, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<String>>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, String>(2)?,
                ))
            },
        )
        .expect("read cleared recipe");
    assert_eq!(cleared, (None, None, "cleared".to_string()));
}

#[test]
fn update_session_token_stats_should_preserve_none_fields() {
    let conn = Connection::open_in_memory().expect("open db");
    create_agent_sessions_table(&conn);
    conn.execute(
        "INSERT INTO agent_sessions (
                id, total_tokens, input_tokens, output_tokens, cached_input_tokens,
                cache_creation_input_tokens, accumulated_total_tokens,
                accumulated_input_tokens, accumulated_output_tokens, schedule_id, updated_at
             ) VALUES (?1, 10, 8, 2, 4, 5, 20, 18, 2, 'schedule-old', 'old')",
        ["session-1"],
    )
    .expect("insert session");

    update_session_token_stats(
        &conn,
        "session-1",
        &SessionTokenStatsUpdate {
            total_tokens: Some(31),
            input_tokens: Some(31),
            output_tokens: Some(0),
            cached_input_tokens: None,
            cache_creation_input_tokens: Some(7),
            accumulated_total_tokens: None,
            accumulated_input_tokens: Some(99),
            accumulated_output_tokens: None,
            schedule_id: None,
        },
        "now",
    )
    .expect("update stats");

    let row = conn
        .query_row(
            "SELECT total_tokens, input_tokens, output_tokens, cached_input_tokens,
                        cache_creation_input_tokens, accumulated_total_tokens,
                        accumulated_input_tokens, accumulated_output_tokens, schedule_id, updated_at
                 FROM agent_sessions WHERE id = 'session-1'",
            [],
            |row| {
                Ok((
                    row.get::<_, Option<i32>>(0)?,
                    row.get::<_, Option<i32>>(1)?,
                    row.get::<_, Option<i32>>(2)?,
                    row.get::<_, Option<i32>>(3)?,
                    row.get::<_, Option<i32>>(4)?,
                    row.get::<_, Option<i32>>(5)?,
                    row.get::<_, Option<i32>>(6)?,
                    row.get::<_, Option<i32>>(7)?,
                    row.get::<_, Option<String>>(8)?,
                    row.get::<_, String>(9)?,
                ))
            },
        )
        .expect("read session");

    assert_eq!(
        row,
        (
            Some(31),
            Some(31),
            Some(0),
            Some(4),
            Some(7),
            Some(20),
            Some(99),
            Some(2),
            Some("schedule-old".to_string()),
            "now".to_string(),
        )
    );
}

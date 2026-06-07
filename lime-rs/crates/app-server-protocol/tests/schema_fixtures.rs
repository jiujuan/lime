use std::path::PathBuf;

#[test]
fn schema_fixtures_match_generated_output() {
    let root = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("schema");
    let fixture_tree =
        app_server_protocol::read_fixture_tree(&root).expect("read app-server protocol fixtures");
    let generated_tree = app_server_protocol::generated_fixture_tree();

    assert!(
        !fixture_tree.is_empty(),
        "app-server protocol schema fixtures must be checked in"
    );
    app_server_protocol::assert_fixture_trees_match(
        "app-server protocol schema",
        &fixture_tree,
        &generated_tree,
    )
    .expect("schema fixtures match generated output");
}

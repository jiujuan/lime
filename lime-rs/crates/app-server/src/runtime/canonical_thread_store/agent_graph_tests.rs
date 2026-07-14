use agent_protocol::ThreadId;
use futures::executor::block_on;
use thread_store::{AgentGraphStore, ThreadSpawnEdgeStatus, ThreadSpawnParent};

use super::ProjectionStore;

fn store() -> (tempfile::TempDir, ProjectionStore) {
    let temp = tempfile::tempdir().expect("tempdir");
    let store = ProjectionStore::initialize(temp.path().join("projection.sqlite"))
        .expect("projection store");
    (temp, store)
}

fn thread_id(id: &str) -> ThreadId {
    ThreadId::new(id)
}

#[test]
fn canonical_thread_spawn_edge_upsert_reparents_and_replaces_status() {
    let (_temp, store) = store();
    let first_parent = thread_id("parent-1");
    let second_parent = thread_id("parent-2");
    let child = thread_id("child-1");

    block_on(store.upsert_thread_spawn_edge(
        first_parent.clone(),
        child.clone(),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect("insert edge");
    block_on(store.upsert_thread_spawn_edge(
        second_parent.clone(),
        child.clone(),
        ThreadSpawnEdgeStatus::Closed,
    ))
    .expect("reparent edge");

    assert_eq!(
        block_on(store.list_thread_spawn_children(first_parent, None))
            .expect("old parent children"),
        Vec::<ThreadId>::new()
    );
    assert_eq!(
        block_on(
            store.list_thread_spawn_children(
                second_parent.clone(),
                Some(ThreadSpawnEdgeStatus::Open),
            )
        )
        .expect("open children"),
        Vec::<ThreadId>::new()
    );
    assert_eq!(
        block_on(
            store.list_thread_spawn_children(second_parent, Some(ThreadSpawnEdgeStatus::Closed),)
        )
        .expect("closed children"),
        vec![child]
    );
}

#[test]
fn canonical_thread_spawn_parent_reads_open_and_closed_status() {
    let (_temp, store) = store();
    let parent = thread_id("parent");
    let child = thread_id("child");

    block_on(store.upsert_thread_spawn_edge(
        parent.clone(),
        child.clone(),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect("insert edge");
    assert_eq!(
        block_on(store.read_thread_spawn_parent(child.clone())).expect("read open parent"),
        Some(ThreadSpawnParent {
            parent_thread_id: parent.clone(),
            status: ThreadSpawnEdgeStatus::Open,
        })
    );

    block_on(store.set_thread_spawn_edge_status(child.clone(), ThreadSpawnEdgeStatus::Closed))
        .expect("close edge");
    assert_eq!(
        block_on(store.read_thread_spawn_parent(child)).expect("read closed parent"),
        Some(ThreadSpawnParent {
            parent_thread_id: parent,
            status: ThreadSpawnEdgeStatus::Closed,
        })
    );
}

#[test]
fn canonical_thread_spawn_parent_returns_none_for_missing_child() {
    let (_temp, store) = store();

    assert_eq!(
        block_on(store.read_thread_spawn_parent(thread_id("missing")))
            .expect("read missing parent"),
        None
    );
}

#[test]
fn canonical_thread_spawn_edge_lists_stable_breadth_first_descendants() {
    let (_temp, store) = store();
    let root = thread_id("root");
    let child_a = thread_id("child-a");
    let child_b = thread_id("child-b");
    let child_closed = thread_id("child-c");
    let grandchild_a = thread_id("grandchild-a");
    let grandchild_closed = thread_id("grandchild-b");
    let hidden_below_closed = thread_id("great-grandchild-a");

    for (parent, child, status) in [
        (root.clone(), child_b.clone(), ThreadSpawnEdgeStatus::Open),
        (root.clone(), child_a.clone(), ThreadSpawnEdgeStatus::Open),
        (
            root.clone(),
            child_closed.clone(),
            ThreadSpawnEdgeStatus::Closed,
        ),
        (
            child_b.clone(),
            grandchild_closed.clone(),
            ThreadSpawnEdgeStatus::Closed,
        ),
        (
            child_a.clone(),
            grandchild_a.clone(),
            ThreadSpawnEdgeStatus::Open,
        ),
        (
            child_closed.clone(),
            hidden_below_closed.clone(),
            ThreadSpawnEdgeStatus::Open,
        ),
    ] {
        block_on(store.upsert_thread_spawn_edge(parent, child, status)).expect("insert edge");
    }

    assert_eq!(
        block_on(store.list_thread_spawn_children(root.clone(), None)).expect("all children"),
        vec![child_a.clone(), child_b.clone(), child_closed.clone()]
    );
    assert_eq!(
        block_on(store.list_thread_spawn_descendants(root.clone(), None)).expect("all descendants"),
        vec![
            child_a.clone(),
            child_b.clone(),
            child_closed,
            grandchild_a.clone(),
            grandchild_closed,
            hidden_below_closed,
        ]
    );
    assert_eq!(
        block_on(store.list_thread_spawn_descendants(root, Some(ThreadSpawnEdgeStatus::Open),))
            .expect("open descendants"),
        vec![child_a, child_b, grandchild_a]
    );
}

#[test]
fn canonical_thread_spawn_edge_close_is_durable_and_preserves_audit_state() {
    let (temp, store) = store();
    let path = temp.path().join("projection.sqlite");
    let parent = thread_id("parent");
    let child = thread_id("child");

    block_on(store.upsert_thread_spawn_edge(
        parent.clone(),
        child.clone(),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect("insert edge");
    block_on(store.set_thread_spawn_edge_status(child.clone(), ThreadSpawnEdgeStatus::Closed))
        .expect("close edge");
    drop(store);

    let reopened = ProjectionStore::initialize(path).expect("reopen projection store");
    assert_eq!(
        block_on(reopened.read_thread_spawn_parent(child.clone()))
            .expect("read parent after reopen"),
        Some(ThreadSpawnParent {
            parent_thread_id: parent.clone(),
            status: ThreadSpawnEdgeStatus::Closed,
        })
    );
    assert_eq!(
        block_on(
            reopened.list_thread_spawn_children(parent.clone(), Some(ThreadSpawnEdgeStatus::Open),)
        )
        .expect("open children after reopen"),
        Vec::<ThreadId>::new()
    );
    assert_eq!(
        block_on(reopened.list_thread_spawn_children(parent, Some(ThreadSpawnEdgeStatus::Closed),))
            .expect("closed children after reopen"),
        vec![child]
    );
}

#[test]
fn canonical_thread_spawn_edge_missing_status_update_is_a_no_op() {
    let (_temp, store) = store();

    block_on(
        store.set_thread_spawn_edge_status(thread_id("missing"), ThreadSpawnEdgeStatus::Closed),
    )
    .expect("missing edge update");
}

#[test]
fn canonical_thread_spawn_edge_rejects_self_edge_without_mutation() {
    let (_temp, store) = store();
    let outside = thread_id("outside");
    let thread = thread_id("thread");

    block_on(store.upsert_thread_spawn_edge(
        outside.clone(),
        thread.clone(),
        ThreadSpawnEdgeStatus::Closed,
    ))
    .expect("insert existing edge");
    let error = block_on(store.upsert_thread_spawn_edge(
        thread.clone(),
        thread.clone(),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect_err("self edge must fail closed");

    assert!(error.to_string().contains("cannot target itself"));
    assert_eq!(
        block_on(store.list_thread_spawn_children(outside, Some(ThreadSpawnEdgeStatus::Closed),))
            .expect("existing parent after failure"),
        vec![thread.clone()]
    );
    assert_eq!(
        block_on(store.list_thread_spawn_children(thread, None))
            .expect("self children after failure"),
        Vec::<ThreadId>::new()
    );
}

#[test]
fn canonical_thread_spawn_edge_rejects_cycle_and_preserves_existing_parent() {
    let (_temp, store) = store();
    let outside = thread_id("outside");
    let root = thread_id("root");
    let child = thread_id("child");
    let grandchild = thread_id("grandchild");

    for (parent, child, status) in [
        (outside.clone(), root.clone(), ThreadSpawnEdgeStatus::Closed),
        (root.clone(), child.clone(), ThreadSpawnEdgeStatus::Open),
        (
            child.clone(),
            grandchild.clone(),
            ThreadSpawnEdgeStatus::Open,
        ),
    ] {
        block_on(store.upsert_thread_spawn_edge(parent, child, status)).expect("insert edge");
    }

    let error = block_on(store.upsert_thread_spawn_edge(
        grandchild.clone(),
        root.clone(),
        ThreadSpawnEdgeStatus::Open,
    ))
    .expect_err("cycle attempt must fail closed");

    assert!(error.to_string().contains("create a cycle"));
    assert_eq!(
        block_on(
            store.list_thread_spawn_children(outside.clone(), Some(ThreadSpawnEdgeStatus::Closed),)
        )
        .expect("existing parent after failure"),
        vec![root.clone()]
    );
    assert_eq!(
        block_on(store.list_thread_spawn_descendants(outside, None))
            .expect("descendants after failure"),
        vec![root, child, grandchild]
    );
}

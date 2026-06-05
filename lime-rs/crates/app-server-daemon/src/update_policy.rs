use crate::ExecutableIdentity;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RestartMode {
    IfVersionChanged,
    Always,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdaterRefreshMode {
    None,
    ReexecIfManagedBinaryChanged,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UpdateLoopControl {
    Continue,
    Stop,
}

pub fn update_modes_for_identities(
    running_updater_identity: &ExecutableIdentity,
    managed_identity: &ExecutableIdentity,
) -> (RestartMode, UpdaterRefreshMode) {
    if running_updater_identity == managed_identity {
        (RestartMode::IfVersionChanged, UpdaterRefreshMode::None)
    } else {
        (
            RestartMode::Always,
            UpdaterRefreshMode::ReexecIfManagedBinaryChanged,
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::executable_identity_from_bytes;

    #[test]
    fn unchanged_updater_only_restarts_app_server_if_version_changed() {
        let identity = executable_identity_from_bytes(b"same");

        assert_eq!(
            update_modes_for_identities(&identity, &identity),
            (RestartMode::IfVersionChanged, UpdaterRefreshMode::None)
        );
    }

    #[test]
    fn changed_managed_binary_forces_restart_and_reexec() {
        let running = executable_identity_from_bytes(b"running");
        let managed = executable_identity_from_bytes(b"managed");

        assert_eq!(
            update_modes_for_identities(&running, &managed),
            (
                RestartMode::Always,
                UpdaterRefreshMode::ReexecIfManagedBinaryChanged
            )
        );
    }
}

//! GUI-safe process helpers.
//!
//! Lime is a desktop GUI app, so background subprocesses must not create
//! platform terminal windows unless the user explicitly asks for one.

#[cfg(windows)]
const CREATE_NO_WINDOW_FLAG: u32 = 0x08000000;

#[allow(unused_variables)]
pub fn configure_tokio_command_for_gui(command: &mut tokio::process::Command) {
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW_FLAG);
}

#[allow(unused_variables)]
pub fn configure_std_command_for_gui(command: &mut std::process::Command) {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        command.creation_flags(CREATE_NO_WINDOW_FLAG);
    }
}

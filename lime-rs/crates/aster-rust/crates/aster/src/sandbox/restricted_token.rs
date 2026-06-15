//! Windows restricted token sandbox runner.
//!
//! 这层只承接 `SandboxType::RestrictedToken` 的执行边界。策略决策仍由
//! `lime-agent` 负责；这里负责把 current `SandboxConfig` 落到 Windows
//! restricted token、workspace ACL 和 `CreateProcessAsUserW`。

#[cfg(target_os = "windows")]
use super::config::SandboxConfig;
#[cfg(target_os = "windows")]
use super::executor::{ExecutorOptions, ExecutorResult};
#[cfg(target_os = "windows")]
use super::output_buffer::BoundedOutputBuffer;

#[cfg(target_os = "windows")]
use anyhow::{anyhow, Context};
#[cfg(target_os = "windows")]
use std::collections::HashMap;
#[cfg(target_os = "windows")]
use std::ffi::{c_void, OsStr};
#[cfg(target_os = "windows")]
use std::os::windows::ffi::OsStrExt;
#[cfg(target_os = "windows")]
use std::path::{Path, PathBuf};
#[cfg(target_os = "windows")]
use std::ptr;
#[cfg(target_os = "windows")]
use std::time::Duration;
#[cfg(target_os = "windows")]
use windows_sys::Win32::Foundation::{
    CloseHandle, GetLastError, LocalFree, SetHandleInformation, ERROR_SUCCESS, HANDLE,
    HANDLE_FLAG_INHERIT, HLOCAL, WAIT_FAILED, WAIT_OBJECT_0, WAIT_TIMEOUT,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Security::Authorization::{
    GetNamedSecurityInfoW, SetEntriesInAclW, SetNamedSecurityInfoW, EXPLICIT_ACCESS_W,
    SE_FILE_OBJECT, TRUSTEE_IS_SID, TRUSTEE_IS_UNKNOWN, TRUSTEE_W,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Security::{
    AdjustTokenPrivileges, CopySid, CreateRestrictedToken, CreateWellKnownSid, GetLengthSid,
    GetTokenInformation, LookupPrivilegeValueW, TokenGroups, TokenUser, ACL,
    DACL_SECURITY_INFORMATION, SID_AND_ATTRIBUTES, TOKEN_ADJUST_DEFAULT, TOKEN_ADJUST_PRIVILEGES,
    TOKEN_ADJUST_SESSIONID, TOKEN_ASSIGN_PRIMARY, TOKEN_DUPLICATE, TOKEN_PRIVILEGES, TOKEN_QUERY,
    TOKEN_USER,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::Storage::FileSystem::{
    DELETE, FILE_APPEND_DATA, FILE_DELETE_CHILD, FILE_GENERIC_EXECUTE, FILE_GENERIC_READ,
    FILE_GENERIC_WRITE, FILE_WRITE_ATTRIBUTES, FILE_WRITE_DATA, FILE_WRITE_EA,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::JobObjects::{
    AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
    SetInformationJobObject, TerminateJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
    JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
};
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Pipes::CreatePipe;
#[cfg(target_os = "windows")]
use windows_sys::Win32::System::Threading::{
    CreateProcessAsUserW, GetCurrentProcess, GetExitCodeProcess, OpenProcessToken,
    TerminateProcess, WaitForSingleObject, CREATE_UNICODE_ENVIRONMENT, INFINITE,
    PROCESS_INFORMATION, STARTF_USESTDHANDLES, STARTUPINFOW,
};

#[cfg(target_os = "windows")]
const DISABLE_MAX_PRIVILEGE: u32 = 0x01;
#[cfg(target_os = "windows")]
const LUA_TOKEN: u32 = 0x04;
#[cfg(target_os = "windows")]
const WRITE_RESTRICTED: u32 = 0x08;
#[cfg(target_os = "windows")]
const WIN_WORLD_SID: i32 = 1;
#[cfg(target_os = "windows")]
const SE_GROUP_LOGON_ID: u32 = 0xC0000000;
#[cfg(target_os = "windows")]
const GENERIC_WRITE_MASK: u32 = 0x4000_0000;
#[cfg(target_os = "windows")]
const DENY_ACCESS: i32 = 3;
const TIMEOUT_EXIT_CODE: i32 = 124;

#[cfg(target_os = "windows")]
pub async fn execute(
    options: &ExecutorOptions,
    config: &SandboxConfig,
) -> anyhow::Result<ExecutorResult> {
    let command = options.command.clone();
    let args = options.args.clone();
    let env = merged_environment(options, config);
    let cwd = working_directory(options)?;
    let config = config.clone();
    let timeout = timeout_duration(options, &config);

    let task = tokio::task::spawn_blocking(move || {
        run_restricted(&command, &args, &cwd, &env, &config, timeout)
    });
    let result = task.await??;

    Ok(result)
}

#[cfg(target_os = "windows")]
fn run_restricted(
    command: &str,
    args: &[String],
    cwd: &Path,
    env: &HashMap<String, String>,
    config: &SandboxConfig,
    timeout: Option<Duration>,
) -> anyhow::Result<ExecutorResult> {
    let mut handles = SandboxHandles::new();
    let mut cap_sid = CapabilitySid::new()?;
    let mut acl_rollbacks = Vec::new();

    unsafe {
        for path in writable_roots(config, cwd) {
            let rollback = ensure_allow_write_ace(&path, cap_sid.as_ptr())
                .with_context(|| format!("grant workspace write ACL for {}", path.display()))?;
            acl_rollbacks.push(rollback);
        }
        for path in &config.denied_paths {
            if path.exists() {
                let rollback = add_deny_write_ace(path, cap_sid.as_ptr())
                    .with_context(|| format!("apply denied path ACL for {}", path.display()))?;
                acl_rollbacks.push(rollback);
            }
        }

        let base_token = get_current_token_for_restriction()?;
        handles.push(base_token);
        let token = create_restricted_token(base_token, cap_sid.as_ptr())?;
        handles.push(token);

        let stdio = create_stdio_pipes()?;
        handles.push(stdio.stdin_read);
        handles.push(stdio.stdout_read);
        handles.push(stdio.stdout_write);
        handles.push(stdio.stderr_read);
        handles.push(stdio.stderr_write);

        let job = JobObject::kill_on_close()?;

        let argv = process_argv(command, args);
        let process = create_process(token, &argv, cwd, env, &stdio)?;
        handles.push(process.hProcess);
        handles.push(process.hThread);
        if let Err(err) = job.assign(process.hProcess) {
            TerminateProcess(process.hProcess, 1);
            return Err(err);
        }

        CloseHandle(stdio.stdout_write);
        handles.take(stdio.stdout_write);
        CloseHandle(stdio.stderr_write);
        handles.take(stdio.stderr_write);
        CloseHandle(stdio.stdin_read);
        handles.take(stdio.stdin_read);

        let stdout_reader = PipeReader::spawn(stdio.stdout_read);
        handles.take(stdio.stdout_read);
        let stderr_reader = PipeReader::spawn(stdio.stderr_read);
        handles.take(stdio.stderr_read);

        let wait_result = WaitForSingleObject(process.hProcess, wait_timeout_millis(timeout));
        let mut wait_error = None;
        let timed_out = match wait_result {
            WAIT_OBJECT_0 => false,
            WAIT_TIMEOUT => {
                TerminateJobObject(job.handle(), TIMEOUT_EXIT_CODE as u32);
                WaitForSingleObject(process.hProcess, INFINITE);
                true
            }
            WAIT_FAILED => {
                let error = anyhow!("WaitForSingleObject failed: {}", GetLastError());
                TerminateJobObject(job.handle(), TIMEOUT_EXIT_CODE as u32);
                WaitForSingleObject(process.hProcess, INFINITE);
                wait_error = Some(error);
                false
            }
            other => {
                let error = anyhow!("WaitForSingleObject returned unexpected status: {other}");
                TerminateJobObject(job.handle(), TIMEOUT_EXIT_CODE as u32);
                WaitForSingleObject(process.hProcess, INFINITE);
                wait_error = Some(error);
                false
            }
        };
        let mut exit_code = TIMEOUT_EXIT_CODE as u32;
        if !timed_out && GetExitCodeProcess(process.hProcess, &mut exit_code) == 0 {
            wait_error = Some(anyhow!("GetExitCodeProcess failed: {}", GetLastError()));
        }

        let stdout_result = stdout_reader.join("stdout");
        let stderr_result = stderr_reader.join("stderr");
        let stdout = stdout_result?.into_captured_output();
        let mut stderr_buffer = stderr_result?;
        if let Some(error) = wait_error {
            return Err(error);
        }
        if timed_out {
            let timeout_ms = timeout.map(|duration| duration.as_millis()).unwrap_or(0);
            if !stderr_buffer.is_empty() && !stderr_buffer.ends_with_byte(b'\n') {
                stderr_buffer.push_str("\n");
            }
            stderr_buffer.push_str(&format!(
                "Windows restricted token sandbox timed out after {timeout_ms}ms; job object terminated the process tree"
            ));
        }
        let stderr = stderr_buffer.into_captured_output();

        Ok(ExecutorResult::from_captured(
            exit_code as i32,
            stdout,
            stderr,
            true,
            super::config::SandboxType::RestrictedToken,
        ))
    }
}

#[cfg(target_os = "windows")]
fn timeout_duration(options: &ExecutorOptions, config: &SandboxConfig) -> Option<Duration> {
    options.timeout.map(Duration::from_millis).or_else(|| {
        config
            .resource_limits
            .as_ref()
            .and_then(|limits| limits.max_execution_time)
            .map(Duration::from_millis)
    })
}

#[cfg(target_os = "windows")]
fn wait_timeout_millis(timeout: Option<Duration>) -> u32 {
    timeout
        .map(|duration| duration.as_millis().min((u32::MAX - 1) as u128) as u32)
        .unwrap_or(INFINITE)
}

#[cfg(target_os = "windows")]
fn working_directory(options: &ExecutorOptions) -> anyhow::Result<PathBuf> {
    match options.working_dir.as_deref() {
        Some(path) => Ok(PathBuf::from(path)),
        None => std::env::current_dir().context("resolve current working directory"),
    }
}

#[cfg(target_os = "windows")]
fn merged_environment(
    options: &ExecutorOptions,
    config: &SandboxConfig,
) -> HashMap<String, String> {
    let mut env: HashMap<String, String> = std::env::vars().collect();
    env.extend(config.environment_variables.clone());
    env.extend(options.env.clone());
    env.insert("ASTER_WORKSPACE_SANDBOX".to_string(), "1".to_string());
    env.insert(
        "ASTER_WORKSPACE_SANDBOX_BACKEND".to_string(),
        "restricted_token".to_string(),
    );
    env
}

#[cfg(target_os = "windows")]
fn writable_roots(config: &SandboxConfig, cwd: &Path) -> Vec<PathBuf> {
    let mut roots = if config.writable_paths.is_empty() {
        vec![cwd.to_path_buf()]
    } else {
        config.writable_paths.clone()
    };
    roots.sort_by_key(|path| canonical_path_key(path));
    roots.dedup_by_key(|path| canonical_path_key(path));
    roots
}

#[cfg(target_os = "windows")]
fn process_argv(command: &str, args: &[String]) -> Vec<String> {
    let mut argv = Vec::with_capacity(args.len() + 1);
    argv.push(command.to_string());
    argv.extend(args.iter().cloned());
    argv
}

#[cfg(target_os = "windows")]
fn canonical_path_key(path: &Path) -> String {
    std::fs::canonicalize(path)
        .unwrap_or_else(|_| path.to_path_buf())
        .to_string_lossy()
        .replace('\\', "/")
        .to_ascii_lowercase()
}

#[cfg(target_os = "windows")]
fn to_wide<S: AsRef<OsStr>>(s: S) -> Vec<u16> {
    let mut value: Vec<u16> = s.as_ref().encode_wide().collect();
    value.push(0);
    value
}

#[cfg(target_os = "windows")]
fn quote_windows_arg(arg: &str) -> String {
    let needs_quotes = arg.is_empty()
        || arg
            .chars()
            .any(|c| matches!(c, ' ' | '\t' | '\n' | '\r' | '"'));
    if !needs_quotes {
        return arg.to_string();
    }

    let mut quoted = String::with_capacity(arg.len() + 2);
    quoted.push('"');
    let mut backslashes = 0;
    for ch in arg.chars() {
        match ch {
            '\\' => backslashes += 1,
            '"' => {
                quoted.push_str(&"\\".repeat(backslashes * 2 + 1));
                quoted.push('"');
                backslashes = 0;
            }
            _ => {
                if backslashes > 0 {
                    quoted.push_str(&"\\".repeat(backslashes));
                    backslashes = 0;
                }
                quoted.push(ch);
            }
        }
    }
    if backslashes > 0 {
        quoted.push_str(&"\\".repeat(backslashes * 2));
    }
    quoted.push('"');
    quoted
}

#[cfg(target_os = "windows")]
fn argv_to_command_line(argv: &[String]) -> String {
    argv.iter()
        .map(|arg| quote_windows_arg(arg))
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(target_os = "windows")]
fn env_block(env: &HashMap<String, String>) -> Vec<u16> {
    let mut items: Vec<_> = env.iter().collect();
    items.sort_by(|(left, _), (right, _)| {
        left.to_uppercase()
            .cmp(&right.to_uppercase())
            .then(left.cmp(right))
    });

    let mut block = Vec::new();
    for (key, value) in items {
        let mut entry = to_wide(format!("{key}={value}"));
        entry.pop();
        block.extend(entry);
        block.push(0);
    }
    block.push(0);
    block
}

#[cfg(target_os = "windows")]
struct StdioPipes {
    stdin_read: HANDLE,
    stdout_read: HANDLE,
    stdout_write: HANDLE,
    stderr_read: HANDLE,
    stderr_write: HANDLE,
}

#[cfg(target_os = "windows")]
unsafe fn create_stdio_pipes() -> anyhow::Result<StdioPipes> {
    let mut stdin_read = 0;
    let mut stdin_write = 0;
    let mut stdout_read = 0;
    let mut stdout_write = 0;
    let mut stderr_read = 0;
    let mut stderr_write = 0;

    if CreatePipe(&mut stdin_read, &mut stdin_write, ptr::null_mut(), 0) == 0 {
        return Err(anyhow!("CreatePipe stdin failed: {}", GetLastError()));
    }
    CloseHandle(stdin_write);
    if CreatePipe(&mut stdout_read, &mut stdout_write, ptr::null_mut(), 0) == 0 {
        CloseHandle(stdin_read);
        return Err(anyhow!("CreatePipe stdout failed: {}", GetLastError()));
    }
    if CreatePipe(&mut stderr_read, &mut stderr_write, ptr::null_mut(), 0) == 0 {
        CloseHandle(stdin_read);
        CloseHandle(stdout_read);
        CloseHandle(stdout_write);
        return Err(anyhow!("CreatePipe stderr failed: {}", GetLastError()));
    }
    for handle in [stdin_read, stdout_write, stderr_write] {
        if SetHandleInformation(handle, HANDLE_FLAG_INHERIT, HANDLE_FLAG_INHERIT) == 0 {
            CloseHandle(stdin_read);
            CloseHandle(stdout_read);
            CloseHandle(stdout_write);
            CloseHandle(stderr_read);
            CloseHandle(stderr_write);
            return Err(anyhow!(
                "SetHandleInformation failed for inherited stdio handle: {}",
                GetLastError()
            ));
        }
    }

    Ok(StdioPipes {
        stdin_read,
        stdout_read,
        stdout_write,
        stderr_read,
        stderr_write,
    })
}

#[cfg(target_os = "windows")]
unsafe fn create_process(
    token: HANDLE,
    argv: &[String],
    cwd: &Path,
    env: &HashMap<String, String>,
    stdio: &StdioPipes,
) -> anyhow::Result<PROCESS_INFORMATION> {
    let command_line = argv_to_command_line(argv);
    let mut command_line_wide = to_wide(&command_line);
    let env = env_block(env);
    let cwd = to_wide(cwd);
    let mut startup_info: STARTUPINFOW = std::mem::zeroed();
    startup_info.cb = std::mem::size_of::<STARTUPINFOW>() as u32;
    startup_info.dwFlags |= STARTF_USESTDHANDLES;
    startup_info.hStdInput = stdio.stdin_read;
    startup_info.hStdOutput = stdio.stdout_write;
    startup_info.hStdError = stdio.stderr_write;

    let mut process_info: PROCESS_INFORMATION = std::mem::zeroed();
    let ok = CreateProcessAsUserW(
        token,
        ptr::null(),
        command_line_wide.as_mut_ptr(),
        ptr::null_mut(),
        ptr::null_mut(),
        1,
        CREATE_UNICODE_ENVIRONMENT,
        env.as_ptr() as *mut c_void,
        cwd.as_ptr(),
        &startup_info,
        &mut process_info,
    );
    if ok == 0 {
        return Err(anyhow!(
            "CreateProcessAsUserW failed: {} while launching {}",
            GetLastError(),
            command_line
        ));
    }
    Ok(process_info)
}

#[cfg(target_os = "windows")]
unsafe fn read_pipe_to_buffer(handle: HANDLE) -> anyhow::Result<BoundedOutputBuffer> {
    let mut output = BoundedOutputBuffer::default();
    let mut buffer = [0u8; 8192];
    loop {
        let mut read_bytes = 0u32;
        let ok = windows_sys::Win32::Storage::FileSystem::ReadFile(
            handle,
            buffer.as_mut_ptr(),
            buffer.len() as u32,
            &mut read_bytes,
            ptr::null_mut(),
        );
        if ok == 0 || read_bytes == 0 {
            break;
        }
        output.push_chunk(&buffer[..read_bytes as usize]);
    }
    Ok(output)
}

#[cfg(target_os = "windows")]
struct PipeReader {
    handle: std::thread::JoinHandle<anyhow::Result<BoundedOutputBuffer>>,
}

#[cfg(target_os = "windows")]
impl PipeReader {
    fn spawn(handle: HANDLE) -> Self {
        let raw_handle = handle as isize;
        let handle = std::thread::spawn(move || {
            let handle = raw_handle as HANDLE;
            unsafe {
                let output = read_pipe_to_buffer(handle);
                CloseHandle(handle);
                output
            }
        });
        Self { handle }
    }

    fn join(self, stream_name: &str) -> anyhow::Result<BoundedOutputBuffer> {
        self.handle
            .join()
            .map_err(|_| anyhow!("{stream_name} pipe reader panicked"))?
    }
}

#[cfg(target_os = "windows")]
struct SandboxHandles(Vec<HANDLE>);

#[cfg(target_os = "windows")]
impl SandboxHandles {
    fn new() -> Self {
        Self(Vec::new())
    }

    fn push(&mut self, handle: HANDLE) {
        if handle != 0 {
            self.0.push(handle);
        }
    }

    fn take(&mut self, handle: HANDLE) {
        self.0.retain(|value| *value != handle);
    }
}

#[cfg(target_os = "windows")]
impl Drop for SandboxHandles {
    fn drop(&mut self) {
        for handle in self.0.drain(..) {
            unsafe {
                CloseHandle(handle);
            }
        }
    }
}

#[cfg(target_os = "windows")]
struct JobObject {
    handle: HANDLE,
}

#[cfg(target_os = "windows")]
impl JobObject {
    unsafe fn kill_on_close() -> anyhow::Result<Self> {
        let handle = CreateJobObjectW(ptr::null_mut(), ptr::null());
        if handle == 0 {
            return Err(anyhow!("CreateJobObjectW failed: {}", GetLastError()));
        }
        let mut limits: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        limits.BasicLimitInformation.LimitFlags = JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE;
        let ok = SetInformationJobObject(
            handle,
            JobObjectExtendedLimitInformation,
            &mut limits as *mut _ as *mut c_void,
            std::mem::size_of::<JOBOBJECT_EXTENDED_LIMIT_INFORMATION>() as u32,
        );
        if ok == 0 {
            CloseHandle(handle);
            return Err(anyhow!(
                "SetInformationJobObject failed: {}",
                GetLastError()
            ));
        }
        Ok(Self { handle })
    }

    fn handle(&self) -> HANDLE {
        self.handle
    }

    unsafe fn assign(&self, process: HANDLE) -> anyhow::Result<()> {
        if AssignProcessToJobObject(self.handle, process) == 0 {
            return Err(anyhow!(
                "AssignProcessToJobObject failed: {}",
                GetLastError()
            ));
        }
        Ok(())
    }
}

#[cfg(target_os = "windows")]
impl Drop for JobObject {
    fn drop(&mut self) {
        unsafe {
            if self.handle != 0 {
                CloseHandle(self.handle);
                self.handle = 0;
            }
        }
    }
}

#[cfg(target_os = "windows")]
struct CapabilitySid {
    sid: *mut c_void,
}

#[cfg(target_os = "windows")]
impl CapabilitySid {
    fn new() -> anyhow::Result<Self> {
        let sid = format!(
            "S-1-5-21-{}-{}-{}-{}",
            rand::random::<u32>(),
            rand::random::<u32>(),
            rand::random::<u32>(),
            rand::random::<u32>()
        );
        unsafe {
            let mut psid = ptr::null_mut();
            let ok = windows_sys::Win32::Security::Authorization::ConvertStringSidToSidW(
                to_wide(&sid).as_ptr(),
                &mut psid,
            );
            if ok == 0 || psid.is_null() {
                return Err(anyhow!(
                    "ConvertStringSidToSidW failed for workspace capability SID: {}",
                    GetLastError()
                ));
            }
            Ok(Self { sid: psid })
        }
    }

    fn as_ptr(&mut self) -> *mut c_void {
        self.sid
    }
}

#[cfg(target_os = "windows")]
impl Drop for CapabilitySid {
    fn drop(&mut self) {
        unsafe {
            if !self.sid.is_null() {
                LocalFree(self.sid as HLOCAL);
            }
        }
    }
}

#[cfg(target_os = "windows")]
unsafe fn get_current_token_for_restriction() -> anyhow::Result<HANDLE> {
    let desired = TOKEN_DUPLICATE
        | TOKEN_QUERY
        | TOKEN_ASSIGN_PRIMARY
        | TOKEN_ADJUST_DEFAULT
        | TOKEN_ADJUST_SESSIONID
        | TOKEN_ADJUST_PRIVILEGES;
    let mut token = 0;
    if OpenProcessToken(GetCurrentProcess(), desired, &mut token) == 0 {
        return Err(anyhow!("OpenProcessToken failed: {}", GetLastError()));
    }
    Ok(token)
}

#[cfg(target_os = "windows")]
unsafe fn create_restricted_token(
    base_token: HANDLE,
    capability_sid: *mut c_void,
) -> anyhow::Result<HANDLE> {
    let mut logon_sid = get_logon_sid_bytes(base_token)?;
    let mut everyone_sid = world_sid()?;
    let mut entries: Vec<SID_AND_ATTRIBUTES> = vec![std::mem::zeroed(); 3];
    entries[0].Sid = capability_sid;
    entries[1].Sid = logon_sid.as_mut_ptr() as *mut c_void;
    entries[2].Sid = everyone_sid.as_mut_ptr() as *mut c_void;

    let mut token = 0;
    let ok = CreateRestrictedToken(
        base_token,
        DISABLE_MAX_PRIVILEGE | LUA_TOKEN | WRITE_RESTRICTED,
        0,
        ptr::null(),
        0,
        ptr::null(),
        entries.len() as u32,
        entries.as_mut_ptr(),
        &mut token,
    );
    if ok == 0 {
        return Err(anyhow!("CreateRestrictedToken failed: {}", GetLastError()));
    }
    enable_single_privilege(token, "SeChangeNotifyPrivilege")?;
    Ok(token)
}

#[cfg(target_os = "windows")]
unsafe fn world_sid() -> anyhow::Result<Vec<u8>> {
    let mut size = 0;
    CreateWellKnownSid(WIN_WORLD_SID, ptr::null_mut(), ptr::null_mut(), &mut size);
    let mut sid = vec![0u8; size as usize];
    if CreateWellKnownSid(
        WIN_WORLD_SID,
        ptr::null_mut(),
        sid.as_mut_ptr() as *mut c_void,
        &mut size,
    ) == 0
    {
        return Err(anyhow!("CreateWellKnownSid failed: {}", GetLastError()));
    }
    Ok(sid)
}

#[cfg(target_os = "windows")]
unsafe fn get_logon_sid_bytes(token: HANDLE) -> anyhow::Result<Vec<u8>> {
    let mut needed = 0;
    GetTokenInformation(token, TokenGroups, ptr::null_mut(), 0, &mut needed);
    if needed == 0 {
        return Err(anyhow!("TokenGroups size query returned 0"));
    }
    let mut buffer = vec![0u8; needed as usize];
    if GetTokenInformation(
        token,
        TokenGroups,
        buffer.as_mut_ptr() as *mut c_void,
        needed,
        &mut needed,
    ) == 0
    {
        return Err(anyhow!(
            "GetTokenInformation(TokenGroups) failed: {}",
            GetLastError()
        ));
    }
    let group_count = ptr::read_unaligned(buffer.as_ptr() as *const u32) as usize;
    let after_count = buffer.as_ptr().add(std::mem::size_of::<u32>()) as usize;
    let align = std::mem::align_of::<SID_AND_ATTRIBUTES>();
    let groups_ptr = ((after_count + (align - 1)) & !(align - 1)) as *const SID_AND_ATTRIBUTES;
    for index in 0..group_count {
        let entry = ptr::read_unaligned(groups_ptr.add(index));
        if (entry.Attributes & SE_GROUP_LOGON_ID) == SE_GROUP_LOGON_ID {
            let len = GetLengthSid(entry.Sid);
            if len == 0 {
                break;
            }
            let mut out = vec![0u8; len as usize];
            if CopySid(len, out.as_mut_ptr() as *mut c_void, entry.Sid) == 0 {
                break;
            }
            return Ok(out);
        }
    }
    let mut user_sid = get_user_sid_bytes(token)?;
    Ok(user_sid.split_off(0))
}

#[cfg(target_os = "windows")]
unsafe fn get_user_sid_bytes(token: HANDLE) -> anyhow::Result<Vec<u8>> {
    let mut needed = 0;
    GetTokenInformation(token, TokenUser, ptr::null_mut(), 0, &mut needed);
    if needed == 0 {
        return Err(anyhow!("TokenUser size query returned 0"));
    }
    let mut buffer = vec![0u8; needed as usize];
    if GetTokenInformation(
        token,
        TokenUser,
        buffer.as_mut_ptr() as *mut c_void,
        needed,
        &mut needed,
    ) == 0
    {
        return Err(anyhow!(
            "GetTokenInformation(TokenUser) failed: {}",
            GetLastError()
        ));
    }
    let token_user = ptr::read_unaligned(buffer.as_ptr() as *const TOKEN_USER);
    let sid = user_sid_ptr(&token_user);
    let len = GetLengthSid(sid);
    if len == 0 {
        return Err(anyhow!(
            "GetLengthSid(TokenUser) failed: {}",
            GetLastError()
        ));
    }
    let mut out = vec![0u8; len as usize];
    if CopySid(len, out.as_mut_ptr() as *mut c_void, sid) == 0 {
        return Err(anyhow!("CopySid(TokenUser) failed: {}", GetLastError()));
    }
    Ok(out)
}

#[cfg(target_os = "windows")]
unsafe fn user_sid_ptr(token_user: &TOKEN_USER) -> *mut c_void {
    token_user.User.Sid
}

#[cfg(target_os = "windows")]
unsafe fn enable_single_privilege(token: HANDLE, name: &str) -> anyhow::Result<()> {
    let mut luid = windows_sys::Win32::Foundation::LUID {
        LowPart: 0,
        HighPart: 0,
    };
    if LookupPrivilegeValueW(ptr::null(), to_wide(name).as_ptr(), &mut luid) == 0 {
        return Err(anyhow!("LookupPrivilegeValueW failed: {}", GetLastError()));
    }
    let mut privileges: TOKEN_PRIVILEGES = std::mem::zeroed();
    privileges.PrivilegeCount = 1;
    privileges.Privileges[0].Luid = luid;
    privileges.Privileges[0].Attributes = 0x00000002;
    if AdjustTokenPrivileges(token, 0, &privileges, 0, ptr::null_mut(), ptr::null_mut()) == 0 {
        return Err(anyhow!("AdjustTokenPrivileges failed: {}", GetLastError()));
    }
    Ok(())
}

#[cfg(target_os = "windows")]
unsafe fn ensure_allow_write_ace(path: &Path, sid: *mut c_void) -> anyhow::Result<AclRollback> {
    ensure_acl_entry(path, sid, write_allow_mask(), 2)
}

#[cfg(target_os = "windows")]
unsafe fn add_deny_write_ace(path: &Path, sid: *mut c_void) -> anyhow::Result<AclRollback> {
    ensure_acl_entry(path, sid, write_deny_mask(), DENY_ACCESS)
}

#[cfg(target_os = "windows")]
unsafe fn ensure_acl_entry(
    path: &Path,
    sid: *mut c_void,
    access_mask: u32,
    access_mode: i32,
) -> anyhow::Result<AclRollback> {
    let mut security_descriptor = ptr::null_mut();
    let mut old_dacl: *mut ACL = ptr::null_mut();
    let code = GetNamedSecurityInfoW(
        to_wide(path).as_ptr(),
        SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION,
        ptr::null_mut(),
        ptr::null_mut(),
        &mut old_dacl,
        ptr::null_mut(),
        &mut security_descriptor,
    );
    if code != ERROR_SUCCESS {
        return Err(anyhow!(
            "GetNamedSecurityInfoW failed for {}: {code}",
            path.display()
        ));
    }
    let rollback = AclRollback {
        path: path.to_path_buf(),
        dacl: old_dacl,
        security_descriptor,
    };

    let mut explicit: EXPLICIT_ACCESS_W = std::mem::zeroed();
    explicit.grfAccessPermissions = access_mask;
    explicit.grfAccessMode = access_mode;
    explicit.grfInheritance = 0x01 | 0x02;
    explicit.Trustee = TRUSTEE_W {
        pMultipleTrustee: ptr::null_mut(),
        MultipleTrusteeOperation: 0,
        TrusteeForm: TRUSTEE_IS_SID,
        TrusteeType: TRUSTEE_IS_UNKNOWN,
        ptstrName: sid as *mut u16,
    };
    let mut new_dacl = ptr::null_mut();
    let set_entries = SetEntriesInAclW(1, &explicit, old_dacl, &mut new_dacl);
    if set_entries != ERROR_SUCCESS {
        drop(rollback);
        return Err(anyhow!("SetEntriesInAclW failed: {set_entries}"));
    }
    let set_security = SetNamedSecurityInfoW(
        to_wide(path).as_ptr() as *mut u16,
        SE_FILE_OBJECT,
        DACL_SECURITY_INFORMATION,
        ptr::null_mut(),
        ptr::null_mut(),
        new_dacl,
        ptr::null_mut(),
    );
    LocalFree(new_dacl as HLOCAL);
    if set_security != ERROR_SUCCESS {
        drop(rollback);
        return Err(anyhow!(
            "SetNamedSecurityInfoW failed for {}: {set_security}",
            path.display()
        ));
    }
    Ok(rollback)
}

#[cfg(target_os = "windows")]
struct AclRollback {
    path: PathBuf,
    dacl: *mut ACL,
    security_descriptor: *mut c_void,
}

#[cfg(target_os = "windows")]
impl Drop for AclRollback {
    fn drop(&mut self) {
        unsafe {
            let _ = SetNamedSecurityInfoW(
                to_wide(&self.path).as_ptr() as *mut u16,
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                ptr::null_mut(),
                self.dacl,
                ptr::null_mut(),
            );
            if !self.security_descriptor.is_null() {
                LocalFree(self.security_descriptor as HLOCAL);
                self.security_descriptor = ptr::null_mut();
            }
        }
    }
}

#[cfg(target_os = "windows")]
fn write_allow_mask() -> u32 {
    FILE_GENERIC_READ | FILE_GENERIC_WRITE | FILE_GENERIC_EXECUTE | DELETE | FILE_DELETE_CHILD
}

#[cfg(target_os = "windows")]
fn write_deny_mask() -> u32 {
    FILE_GENERIC_WRITE
        | FILE_WRITE_DATA
        | FILE_APPEND_DATA
        | FILE_WRITE_EA
        | FILE_WRITE_ATTRIBUTES
        | GENERIC_WRITE_MASK
        | DELETE
        | FILE_DELETE_CHILD
}

#[cfg(test)]
#[cfg(target_os = "windows")]
mod tests {
    use super::*;
    use base64::Engine as _;
    use std::fs;
    use std::ptr;
    use std::time::Duration;
    use windows_sys::Win32::Security::Authorization::{
        ConvertSecurityDescriptorToStringSecurityDescriptorW, GetNamedSecurityInfoW, SE_FILE_OBJECT,
    };
    use windows_sys::Win32::Security::DACL_SECURITY_INFORMATION;

    #[test]
    fn quotes_each_windows_argument_independently() {
        let argv = vec![
            "pwsh.exe".to_string(),
            "-Command".to_string(),
            "Write-Output \"hello world\"".to_string(),
        ];

        assert_eq!(
            super::argv_to_command_line(&argv),
            "pwsh.exe -Command \"Write-Output \\\"hello world\\\"\""
        );
    }

    #[tokio::test]
    async fn smoke_enforces_paths_restores_acl_and_drains_large_output() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let outside = tempfile::tempdir().expect("outside tempdir");
        let denied_dir = workspace.path().join("blocked");
        fs::create_dir(&denied_dir).expect("denied dir");

        let workspace_dacl_before = dacl_sddl(workspace.path()).expect("workspace dacl before");
        let denied_dacl_before = dacl_sddl(&denied_dir).expect("denied dacl before");

        let allowed_file = workspace.path().join("allowed.txt");
        let outside_file = outside.path().join("outside.txt");
        let denied_file = denied_dir.join("blocked.txt");
        let script = format!(
            r#"
$ErrorActionPreference = 'Continue'
[System.IO.File]::WriteAllText({allowed_file}, 'allowed')
try {{
  [System.IO.File]::WriteAllText({outside_file}, 'outside')
  Write-Output 'outside:ok'
}} catch {{
  Write-Output 'outside:denied'
}}
try {{
  [System.IO.File]::WriteAllText({denied_file}, 'blocked')
  Write-Output 'denied:ok'
}} catch {{
  Write-Output 'denied:denied'
}}
1..20000 | ForEach-Object {{ "large-output-$($_)" }}
"#,
            allowed_file = powershell_literal(&allowed_file),
            outside_file = powershell_literal(&outside_file),
            denied_file = powershell_literal(&denied_file),
        );

        let result = execute(
            &ExecutorOptions {
                command: "powershell.exe".to_string(),
                args: powershell_args(&script),
                timeout: Some(15_000),
                env: HashMap::new(),
                working_dir: Some(workspace.path().to_string_lossy().to_string()),
            },
            &restricted_config(workspace.path(), &[denied_dir.clone()]),
        )
        .await
        .expect("restricted token smoke command");

        assert_eq!(result.exit_code, 0, "stderr: {}", result.stderr);
        assert!(
            result.stdout.contains("outside:denied"),
            "{}",
            result.stdout
        );
        assert!(result.stdout.contains("denied:denied"), "{}", result.stdout);
        assert!(
            result.stdout.contains("large-output-20000"),
            "stdout was not fully drained"
        );
        assert!(
            fs::read_to_string(&allowed_file)
                .expect("allowed file")
                .contains("allowed"),
            "workspace write did not persist expected content"
        );
        assert!(!outside_file.exists(), "outside write escaped sandbox");
        assert!(!denied_file.exists(), "denied path write escaped sandbox");
        assert_eq!(
            dacl_sddl(workspace.path()).expect("workspace dacl after"),
            workspace_dacl_before,
            "workspace DACL was not restored"
        );
        assert_eq!(
            dacl_sddl(&denied_dir).expect("denied dacl after"),
            denied_dacl_before,
            "denied path DACL was not restored"
        );
    }

    #[tokio::test]
    async fn timeout_terminates_child_process_tree() {
        let workspace = tempfile::tempdir().expect("workspace tempdir");
        let started_file = workspace.path().join("child-started.txt");
        let finished_file = workspace.path().join("child-finished.txt");
        let child_script = format!(
            r#"
Set-Content -LiteralPath {started_file} -Value 'started'
Start-Sleep -Seconds 5
Set-Content -LiteralPath {finished_file} -Value 'finished'
"#,
            started_file = powershell_literal(&started_file),
            finished_file = powershell_literal(&finished_file),
        );
        let child_encoded = encode_powershell_script(&child_script);
        let script = format!(
            r#"
$started = {started_file}
$deadline = [DateTime]::UtcNow.AddSeconds(4)
Start-Process -FilePath 'powershell.exe' -ArgumentList @('-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-EncodedCommand','{child_encoded}')
while (-not (Test-Path -LiteralPath $started) -and [DateTime]::UtcNow -lt $deadline) {{
  Start-Sleep -Milliseconds 50
}}
Write-Output 'parent-waiting'
Start-Sleep -Seconds 20
"#,
            started_file = powershell_literal(&started_file),
            child_encoded = child_encoded,
        );

        let result = execute(
            &ExecutorOptions {
                command: "powershell.exe".to_string(),
                args: powershell_args(&script),
                timeout: Some(7_000),
                env: HashMap::new(),
                working_dir: Some(workspace.path().to_string_lossy().to_string()),
            },
            &restricted_config(workspace.path(), &[]),
        )
        .await
        .expect("restricted token timeout command");

        assert_eq!(result.exit_code, TIMEOUT_EXIT_CODE, "{result:?}");
        assert!(
            result
                .stderr
                .contains("job object terminated the process tree"),
            "{}",
            result.stderr
        );
        assert!(started_file.exists(), "child process did not start");
        std::thread::sleep(Duration::from_secs(6));
        assert!(
            !finished_file.exists(),
            "child process survived restricted token timeout"
        );
    }

    fn restricted_config(workspace: &Path, denied_paths: &[PathBuf]) -> SandboxConfig {
        SandboxConfig {
            enabled: true,
            sandbox_type: super::super::config::SandboxType::RestrictedToken,
            writable_paths: vec![workspace.to_path_buf()],
            denied_paths: denied_paths.to_vec(),
            ..SandboxConfig::default()
        }
    }

    fn powershell_args(script: &str) -> Vec<String> {
        vec![
            "-NoProfile".to_string(),
            "-NonInteractive".to_string(),
            "-ExecutionPolicy".to_string(),
            "Bypass".to_string(),
            "-EncodedCommand".to_string(),
            encode_powershell_script(script),
        ]
    }

    fn encode_powershell_script(script: &str) -> String {
        let bytes = script
            .encode_utf16()
            .flat_map(u16::to_le_bytes)
            .collect::<Vec<_>>();
        base64::engine::general_purpose::STANDARD.encode(bytes)
    }

    fn powershell_literal(path: &Path) -> String {
        let escaped = path.to_string_lossy().replace('\'', "''");
        format!("'{escaped}'")
    }

    fn dacl_sddl(path: &Path) -> anyhow::Result<String> {
        unsafe {
            let mut security_descriptor = ptr::null_mut();
            let mut dacl = ptr::null_mut();
            let code = GetNamedSecurityInfoW(
                to_wide(path).as_ptr(),
                SE_FILE_OBJECT,
                DACL_SECURITY_INFORMATION,
                ptr::null_mut(),
                ptr::null_mut(),
                &mut dacl,
                ptr::null_mut(),
                &mut security_descriptor,
            );
            if code != ERROR_SUCCESS {
                return Err(anyhow!(
                    "GetNamedSecurityInfoW failed for {}: {code}",
                    path.display()
                ));
            }

            let mut string_descriptor: *mut u16 = ptr::null_mut();
            let mut string_len = 0u32;
            let ok = ConvertSecurityDescriptorToStringSecurityDescriptorW(
                security_descriptor,
                1,
                DACL_SECURITY_INFORMATION,
                &mut string_descriptor,
                &mut string_len,
            );
            LocalFree(security_descriptor as HLOCAL);
            if ok == 0 {
                return Err(anyhow!(
                    "ConvertSecurityDescriptorToStringSecurityDescriptorW failed for {}: {}",
                    path.display(),
                    GetLastError()
                ));
            }
            let value = String::from_utf16_lossy(std::slice::from_raw_parts(
                string_descriptor,
                string_len as usize,
            ))
            .trim_end_matches('\0')
            .to_string();
            LocalFree(string_descriptor as HLOCAL);
            Ok(value)
        }
    }
}

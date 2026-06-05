use tauri::{AppHandle, Emitter, Manager};

pub const VOICE_START_RECORDING_EVENT: &str = "voice-start-recording";
pub const VOICE_STOP_RECORDING_EVENT: &str = "voice-stop-recording";

fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        if let Err(error) = window.unminimize() {
            tracing::debug!("[语音输入] 恢复主窗口失败: {}", error);
        }
        if let Err(error) = window.show() {
            tracing::debug!("[语音输入] 显示主窗口失败: {}", error);
        }
        if let Err(error) = window.set_focus() {
            tracing::debug!("[语音输入] 聚焦主窗口失败: {}", error);
        }
    } else {
        tracing::warn!("[语音输入] 未找到主窗口，仍广播录音快捷键事件");
    }
}

fn emit_recording_event(app: &AppHandle, event_name: &str) -> Result<(), String> {
    focus_main_window(app);
    app.emit(event_name, ())
        .map_err(|error| format!("广播语音快捷键事件失败: {error}"))?;
    tracing::info!("[语音输入] 已广播快捷键事件: {}", event_name);
    Ok(())
}

pub fn request_start_recording(app: &AppHandle) -> Result<(), String> {
    emit_recording_event(app, VOICE_START_RECORDING_EVENT)
}

pub fn request_stop_recording(app: &AppHandle) -> Result<(), String> {
    emit_recording_event(app, VOICE_STOP_RECORDING_EVENT)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn voice_shortcut_event_names_match_frontend_contract() {
        assert_eq!(VOICE_START_RECORDING_EVENT, "voice-start-recording");
        assert_eq!(VOICE_STOP_RECORDING_EVENT, "voice-stop-recording");
    }
}

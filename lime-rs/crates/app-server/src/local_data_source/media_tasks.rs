use crate::media_task;
use app_server_protocol::MediaTaskArtifactAudioCompleteParams;
use app_server_protocol::MediaTaskArtifactAudioCreateParams;
use app_server_protocol::MediaTaskArtifactImageCreateParams;
use app_server_protocol::MediaTaskArtifactListParams;
use app_server_protocol::MediaTaskArtifactListResponse;
use app_server_protocol::MediaTaskArtifactLookupParams;
use app_server_protocol::MediaTaskArtifactResponse;
use app_server_protocol::MediaTaskArtifactVideoCreateParams;

pub(crate) fn create_image_media_task_artifact(
    params: MediaTaskArtifactImageCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_image_generation_task_artifact(params)
}

pub(crate) fn create_audio_media_task_artifact(
    params: MediaTaskArtifactAudioCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_audio_generation_task_artifact(params)
}

pub(crate) fn create_video_media_task_artifact(
    params: MediaTaskArtifactVideoCreateParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::create_video_generation_task_artifact(params)
}

pub(crate) fn complete_audio_media_task_artifact(
    params: MediaTaskArtifactAudioCompleteParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::complete_audio_generation_task_artifact(params)
}

pub(crate) fn get_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::get_media_task_artifact(params)
}

pub(crate) fn list_media_task_artifacts(
    params: MediaTaskArtifactListParams,
) -> Result<MediaTaskArtifactListResponse, String> {
    media_task::list_media_task_artifacts(params)
}

pub(crate) fn cancel_media_task_artifact(
    params: MediaTaskArtifactLookupParams,
) -> Result<MediaTaskArtifactResponse, String> {
    media_task::cancel_media_task_artifact(params)
}

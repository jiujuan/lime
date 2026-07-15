import accountPerformanceTrackingCover from "./assets/home-cover-account-performance-tracking.webp";
import articleToSlideVideoOutlineCover from "./assets/home-cover-article-to-slide-video-outline.webp";
import carouselPostReplicationCover from "./assets/home-cover-carousel-post-replication.webp";
import cloudVideoDubbingCover from "./assets/home-cover-cloud-video-dubbing.webp";
import draftCover from "./assets/home-cover-draft.webp";
import reviewCover from "./assets/home-cover-review.webp";
import rewriteCover from "./assets/home-cover-rewrite.webp";
import shortVideoScriptReplicationCover from "./assets/home-cover-short-video-script-replication.webp";
import trendCover from "./assets/home-cover-trend.webp";
import videoDubbingLanguageCover from "./assets/home-cover-video-dubbing-language.webp";
import viralCover from "./assets/home-cover-viral.webp";
import voiceCover from "./assets/home-cover-voice.webp";

const HOME_COVER_ASSETS: Record<string, string> = {
  "account-performance-tracking": accountPerformanceTrackingCover,
  "article-to-slide-video-outline": articleToSlideVideoOutlineCover,
  "carousel-post-replication": carouselPostReplicationCover,
  "cloud-video-dubbing": cloudVideoDubbingCover,
  "daily-trend-briefing": trendCover,
  draft: draftCover,
  review: reviewCover,
  rewrite: rewriteCover,
  scene: shortVideoScriptReplicationCover,
  service: reviewCover,
  sky: articleToSlideVideoOutlineCover,
  "short-video-script-replication": shortVideoScriptReplicationCover,
  trend: trendCover,
  "video-dubbing-language": videoDubbingLanguageCover,
  viral: viralCover,
  voice: voiceCover,
};

export function resolveHomeCoverAsset(token: string): string | undefined {
  const normalized = token.trim().toLowerCase();
  if (HOME_COVER_ASSETS[normalized]) {
    return HOME_COVER_ASSETS[normalized];
  }
  if (/carousel|post|social|xiaohongshu|内容/.test(normalized)) {
    return HOME_COVER_ASSETS["carousel-post-replication"];
  }
  if (/script|short-video|video/.test(normalized)) {
    return HOME_COVER_ASSETS["short-video-script-replication"];
  }
  if (/dub|voice|audio|language|配音/.test(normalized)) {
    return HOME_COVER_ASSETS["cloud-video-dubbing"];
  }
  if (/slide|article|outline|knowledge/.test(normalized)) {
    return HOME_COVER_ASSETS["article-to-slide-video-outline"];
  }
  if (/account|growth|tracking|review/.test(normalized)) {
    return HOME_COVER_ASSETS["account-performance-tracking"];
  }
  if (/trend|brief|report/.test(normalized)) {
    return HOME_COVER_ASSETS.trend;
  }
  return HOME_COVER_ASSETS.review;
}

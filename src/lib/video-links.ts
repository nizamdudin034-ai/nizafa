// In-app video links — video clicks must NEVER jump to YouTube.
// Own videos open the Optimize Analysis; every other video opens the
// public /analyze view (which redirects own videos to Optimize itself,
// so routing through /analyze is always safe).
export function analysisHref(videoId: string, isOwn: boolean): string {
  return isOwn
    ? `/optimize/${videoId}`
    : `/analyze?videoId=${encodeURIComponent(videoId)}`;
}

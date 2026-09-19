/**
 * Trailer-klippet — server-side kun.
 *
 * ffmpeg skærer {length} sekunder fra {start} af filmen og re-
 * encoder til en let 720p-MP4 (crf 26 / veryfast ≈ 5–15 MB for 90
 * sek). Re-encoding (og ikke -c copy) gør søgningen frame-accurate
 * og klippet uafhængigt af kildens keyframe-interval; +faststart
 * sætter moov-atomet først, så traileren kan afspilles straks
 * (streaming) i paywall-kortet og /api/embed-indlejringen.
 *
 * Input er filmens fil på disk — downloadVideoToDisk (fra under-
 * tekst-pipelinen) streamer den dertil uden RAM-belastning.
 */
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export async function extractTrailerClip(
  videoPath: string,
  trailerPath: string,
  startSec: number,
  lengthSec: number,
): Promise<void> {
  try {
    await execFileAsync("ffmpeg", [
      "-y",
      "-hide_banner",
      "-loglevel",
      "error",
      // input-søgning (-ss FØR -i) + re-encode = hurtig OG præcis
      "-ss",
      String(Math.max(0, Math.floor(startSec))),
      "-i",
      videoPath,
      "-t",
      String(lengthSec),
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-crf",
      "26",
      // -2: bredde rundes til lige tal (h264-krav), højden regnes ud
      "-vf",
      "scale=-2:720",
      "-c:a",
      "aac",
      "-b:a",
      "96k",
      "-movflags",
      "+faststart",
      trailerPath,
    ]);
  } catch (error) {
    const code = (error as { code?: string }).code;
    if (code === "ENOENT") {
      throw new Error(
        "ffmpeg er ikke installeret på serveren — installér det med: winget install ffmpeg",
      );
    }
    const stderr = (error as { stderr?: string }).stderr ?? "";
    throw new Error(
      `ffmpeg kunne ikke klippe traileren${stderr ? `: ${stderr.trim()}` : "."}`,
    );
  }
}
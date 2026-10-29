import * as FileSystem from 'expo-file-system/legacy';
import { sanitizeFileName } from '../utils/format';
import { cleanError, ensureReady, YtDlp } from './videoDownloader';



export type AudioFormat = 'mp3' | 'm4a' | 'wav';
export type AudioQuality = '128' | '192' | '320';

export type ExtractedAudio = {
  uri: string;
  name: string;
  sizeBytes: number;
  format: AudioFormat;
};

/**
 * Extracts the audio track from a local video file using the
 * yt-dlp + ffmpeg bundled in the app.
 */
export async function extractAudio(
  videoUri: string,
  fileName: string,
  format: AudioFormat,
  quality: AudioQuality,
  signal?: AbortSignal
): Promise<ExtractedAudio> {
  const native = YtDlp;
  if (!native) throw new Error('Audio extraction needs the full app build.');

  await ensureReady();

  const id = `ax_${Date.now()}`;
  const onAbort = () => {
    native.cancel(id);
  };
  signal?.addEventListener('abort', onAbort);

  const args = ['--enable-file-urls', '-x', '--audio-format', format];
  if (format !== 'wav') args.push('--audio-quality', `${quality}K`);

  try {
    const path = await native.download(videoUri, args, id);

    // Rename the output to match the original video's name
   // Rename the output to the user's chosen name
    const ext = path.split('.').pop() || format;
    const base = sanitizeFileName(fileName, 'audio');
    const finalName = `${base}.${ext}`;
    const target = FileSystem.cacheDirectory + encodeURIComponent(finalName);

    await FileSystem.deleteAsync(target, { idempotent: true });
    await FileSystem.moveAsync({ from: 'file://' + path, to: target });

    const info = await FileSystem.getInfoAsync(target);
    return {
      uri: target,
      name: finalName,
      sizeBytes: info.exists ? info.size ?? 0 : 0,
      format,
    };
  } catch (e) {
    if (signal?.aborted) throw new Error('cancelled');
    throw new Error(cleanError(e, "Couldn't extract audio. The video may not have a sound track."));
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
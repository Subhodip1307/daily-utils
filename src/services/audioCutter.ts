import * as FileSystem from 'expo-file-system/legacy';
import { sanitizeFileName } from '../utils/format';
import { runFfmpeg, uriToPath } from './ffmpeg';

export type CutFormat = 'mp3' | 'm4a' | 'wav';

export type CutOptions = {
  start: number; // seconds
  end: number; // seconds
  fadeIn: number; // seconds, 0 = off
  fadeOut: number;
  format: CutFormat;
  bitrate: number; // kbps (ignored for wav)
};

export type CutResult = { uri: string; name: string; sizeBytes: number; durationSec: number };

export async function cutAudio(
  inputUri: string,
  opts: CutOptions,
  fileName: string,
  onProgress: (p: number) => void,
  signal?: AbortSignal
): Promise<CutResult> {
  const length = opts.end - opts.start;
  if (length < 0.5) throw new Error('Select at least half a second.');

  const name = `${sanitizeFileName(fileName, 'audio cut')}.${opts.format}`;
  const uri = FileSystem.cacheDirectory + encodeURIComponent(name);
  const outPath = uriToPath(FileSystem.cacheDirectory!) + name;
  await FileSystem.deleteAsync(uri, { idempotent: true });

  // Fades (never longer than half the clip)
  const filters: string[] = [];
  const fi = Math.min(opts.fadeIn, length / 2);
  const fo = Math.min(opts.fadeOut, length / 2);
  if (fi > 0) filters.push(`afade=t=in:st=0:d=${fi.toFixed(2)}`);
  if (fo > 0) filters.push(`afade=t=out:st=${(length - fo).toFixed(2)}:d=${fo.toFixed(2)}`);

  const codec =
    opts.format === 'mp3'
      ? ['-c:a', 'libmp3lame', '-b:a', `${opts.bitrate}k`]
      : opts.format === 'm4a'
        ? ['-c:a', 'aac', '-b:a', `${opts.bitrate}k`]
        : ['-c:a', 'pcm_s16le'];

  await runFfmpeg(
    [
      '-ss', opts.start.toFixed(3),
      '-i', uriToPath(inputUri),
      '-t', length.toFixed(3),
      '-vn',
      '-map', '0:a:0',
      ...(filters.length ? ['-af', filters.join(',')] : []),
      ...codec,
      outPath,
    ],
    { onTime: (t) => onProgress(Math.min(1, t / length)), signal }
  );

  const info = await FileSystem.getInfoAsync(uri);
  if (!info.exists) throw new Error('The cut file was not created.');
  return { uri, name, sizeBytes: info.size ?? 0, durationSec: length };
}

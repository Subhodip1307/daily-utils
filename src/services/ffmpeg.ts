import { requireOptionalNativeModule } from 'expo';
import { ensureReady } from './videoDownloader';

type FfmpegNative = {
  ffmpeg(args: string[], processId: string): Promise<void>;
  cancelFfmpeg(processId: string): void;
  waveform(path: string, buckets: number): Promise<number[]>;
  addListener(
    event: 'onFfmpegProgress',
    cb: (e: { id: string; time: number }) => void
  ): { remove(): void };
};

const Native = requireOptionalNativeModule<FfmpegNative>('YtDlp');

/** "file:///data/.../My%20Song.mp3" -> "/data/.../My Song.mp3" */
export const uriToPath = (uri: string) => decodeURIComponent(uri.replace(/^file:\/\//, ''));

function lastLine(e: unknown, fallback: string) {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const lines = msg.split('\n').map((l) => l.trim()).filter(Boolean);
  return lines.length ? lines[lines.length - 1].slice(0, 200) : fallback;
}

let counter = 0;

/** Runs an ffmpeg command. onTime receives the processed time in seconds. */
export async function runFfmpeg(
  args: string[],
  options: { onTime?: (seconds: number) => void; signal?: AbortSignal } = {}
) {
  if (!Native) throw new Error('This feature needs the full app build.');
  await ensureReady();

  const id = `ff_${Date.now()}_${counter++}`;
  const sub = Native.addListener('onFfmpegProgress', (e) => {
    if (e.id === id) options.onTime?.(e.time);
  });
  const onAbort = () => Native.cancelFfmpeg(id);
  options.signal?.addEventListener('abort', onAbort);

  try {
    await Native.ffmpeg(args, id);
  } catch (e) {
    if (options.signal?.aborted) throw new Error('cancelled');
    throw new Error(lastLine(e, 'Processing failed.'));
  } finally {
    sub.remove();
    options.signal?.removeEventListener('abort', onAbort);
  }
}

/** Peak values (0..1) for drawing a waveform */
export async function getWaveform(uri: string, buckets = 100): Promise<number[]> {
  if (!Native) throw new Error('This feature needs the full app build.');
  await ensureReady();
  return Native.waveform(uriToPath(uri), buckets);
}

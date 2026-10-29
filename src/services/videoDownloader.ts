import { requireOptionalNativeModule } from 'expo';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

export type MediaType = 'video' | 'audio';

export type MediaFormat = {
  id: string;
  type: MediaType;
  label: string;
  note?: string | null;
  ext: string;
  sizeBytes?: number | null;
};

export type VideoInfo = {
  url: string;
  title: string;
  author: string;
  source: string;
  durationSec: number;
  thumbnail: string;
  formats: MediaFormat[];
};

// ---------- native module ----------
type ProgressEvent = { id: string; progress: number; eta: number };
type YtDlpNative = {
  init(): Promise<void>;
  update(): Promise<string>;
  getInfo(url: string): Promise<string>;
  download(url: string, args: string[], processId: string): Promise<string>;
  cancel(processId: string): boolean;
  addListener(event: 'onProgress', cb: (e: ProgressEvent) => void): { remove(): void };
};

// null when running in Expo Go
export const YtDlp = requireOptionalNativeModule<YtDlpNative>('YtDlp');

let readyPromise: Promise<void> | null = null;

export function ensureReady(): Promise<void> {
  if (!YtDlp) return Promise.reject(new Error('Downloader not available'));
  if (!readyPromise) {
    readyPromise = YtDlp.init().then(() =>
      YtDlp.update()
        .then((s) => console.log('YTDLP UPDATE:', s))
        .catch((e) => console.log('YTDLP UPDATE FAILED:', e))
    );
    readyPromise.catch((e) => {
      console.log('YTDLP INIT FAILED:', e);
      readyPromise = null;
    });
  }
  return readyPromise;
}

/** Call once at app start: unpacks and updates yt-dlp in the background */
export function warmUpDownloader() {
  if (YtDlp) ensureReady().catch(() => {});
}

// ---------- helpers ----------
const DIRECT_RE = /\.(mp4|webm|mkv|mov|m4v|mp3|m4a|wav|aac|ogg)(\?|#|$)/i;
const AUDIO_EXT = ['mp3', 'm4a', 'wav', 'aac', 'ogg'];

export function cleanError(e: unknown, fallback: string): string {
  const msg = e instanceof Error ? e.message : String(e ?? '');
  const line = msg.split('\n').find((l) => l.includes('ERROR:'));
  return line ? line.replace(/.*ERROR:\s*(\[[^\]]+\]\s*)?/, '').slice(0, 160) : fallback;
}

function qualityNote(h: number): string | null {
  if (h >= 2160) return '4K';
  if (h >= 1440) return '2K';
  if (h >= 1080) return 'Full HD';
  if (h >= 720) return 'HD';
  return null;
}

function toVideoInfo(url: string, raw: any): VideoInfo {
  let data = raw;
  if (Array.isArray(raw.entries)) {
    data = raw.entries.find(Boolean);
    if (!data) throw new Error('No video found at this link.');
  }

  const formats: any[] = data.formats?.length ? data.formats : [data];
  const duration = Math.round(data.duration ?? 0);
  const sizeOf = (f: any): number => f.filesize ?? f.filesize_approx ?? 0;

  const audioOnly = formats.filter((f) => f.acodec !== 'none' && f.vcodec === 'none');
  const bestAudio = Math.max(0, ...audioOnly.map(sizeOf));
  const hasAudio = formats.some((f) => f.acodec !== 'none');

  // best estimated size per resolution
  const sizes = new Map<number, number>();
  for (const f of formats) {
    const h = f.height;
    if (!h || f.vcodec === 'none') continue;
    let s = sizeOf(f);
    if (s && f.acodec === 'none') s += bestAudio;
    sizes.set(h, Math.max(sizes.get(h) ?? 0, s));
  }

  const out: MediaFormat[] = [...sizes.keys()]
    .filter((h) => h >= 144)
    .sort((a, b) => b - a)
    .map((h) => ({
      id: `v${h}`,
      type: 'video',
      label: `${h}p`,
      note: qualityNote(h),
      ext: 'mp4',
      sizeBytes: sizes.get(h) || null,
    }));

  if (!out.length && formats.some((f) => f.vcodec !== 'none')) {
    out.push({ id: 'vbest', type: 'video', label: 'Best', note: null, ext: 'mp4', sizeBytes: null });
  }

  if (hasAudio) {
    out.push(
      { id: 'mp3-320', type: 'audio', label: '320 kbps', note: 'Best', ext: 'mp3', sizeBytes: duration * 40000 || null },
      { id: 'mp3-128', type: 'audio', label: '128 kbps', note: null, ext: 'mp3', sizeBytes: duration * 16000 || null }
    );
  }

  if (!out.length) throw new Error('No downloadable formats found for this link.');

  return {
    url,
    title: data.title || 'Untitled',
    author: data.uploader || data.channel || 'Unknown',
    source: data.extractor_key || 'Web',
    durationSec: duration,
    thumbnail: data.thumbnail || '',
    formats: out,
  };
}

function argsFor(format: MediaFormat): string[] {
  if (format.type === 'audio') {
    const kbps = format.id.split('-')[1];
    return ['-f', 'bestaudio/best', '-x', '--audio-format', 'mp3', '--audio-quality', `${kbps}K`];
  }
  const h = format.id.slice(1);
  const selector =
    h === 'best'
      ? 'bv*[ext=mp4]+ba[ext=m4a]/bv*+ba/b'
      : `bv*[height<=${h}][ext=mp4]+ba[ext=m4a]/bv*[height<=${h}]+ba/b[height<=${h}]/b`;
  return ['-f', selector, '--merge-output-format', 'mp4'];
}

function directInfo(url: string): VideoInfo {
  const name = decodeURIComponent(url.split(/[?#]/)[0].split('/').pop() || 'video.mp4');
  const ext = (name.split('.').pop() || 'mp4').toLowerCase();
  return {
    url,
    title: name,
    author: url.match(/^https?:\/\/([^/]+)/)?.[1] ?? 'Web',
    source: 'Direct link',
    durationSec: 0,
    thumbnail: '',
    formats: [
      { id: 'direct', type: AUDIO_EXT.includes(ext) ? 'audio' : 'video', label: 'Original', note: null, ext, sizeBytes: null },
    ],
  };
}

async function saveToLibrary(uri: string) {
  const ML = MediaLibrary as any; // supports old + new expo-media-library APIs
  if (ML.Asset?.create) await ML.Asset.create(uri);
  else await ML.createAssetAsync(uri);
}

// ---------- public API ----------

/** Step 1: get video details + available qualities */
export async function fetchVideoInfo(url: string): Promise<VideoInfo> {
  if (!/^https?:\/\/\S+\.\S+/.test(url)) {
    throw new Error('Please enter a valid link starting with http:// or https://');
  }

  if (!YtDlp) {
    if (DIRECT_RE.test(url)) return directInfo(url);
    throw new Error('YouTube and website links need the full app build. Direct video file links work here.');
  }

  try {
    await ensureReady();
    const json = await YtDlp.getInfo(url);
    return toVideoInfo(url, JSON.parse(json));
   } catch (e) {
    console.log('YTDLP INFO ERROR:', e);
    const raw = e instanceof Error ? e.message : String(e);
    throw new Error(raw.slice(-300));
  }
}

/** Step 2: download chosen format and save it to the gallery */
export async function downloadMedia(
  info: VideoInfo,
  format: MediaFormat,
  onProgress: (progress: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Please allow access to photos & media to save downloads.');
  }

  onProgress(0);
  const fileUri =
    format.id === 'direct'
      ? await downloadDirect(info, format, onProgress, signal)
      : await downloadWithYtDlp(info, format, onProgress, signal);

  try {
    await saveToLibrary(fileUri);
  } finally {
    FileSystem.deleteAsync(fileUri, { idempotent: true }).catch(() => {});
  }
  return fileUri;
}

async function downloadWithYtDlp(
  info: VideoInfo,
  format: MediaFormat,
  onProgress: (p: number) => void,
  signal?: AbortSignal
): Promise<string> {
  await ensureReady();
  const id = `dl_${Date.now()}`;
  let last = 0;

  const sub = YtDlp!.addListener('onProgress', (e) => {
    if (e.id !== id || e.progress <= 0) return;
    last = Math.max(last, Math.min(0.99, e.progress / 100));
    onProgress(last);
  });
  const onAbort = () => {
    YtDlp!.cancel(id);
  };
  signal?.addEventListener('abort', onAbort);

  try {
    const path = await YtDlp!.download(info.url, argsFor(format), id);
    onProgress(1);
    return 'file://' + path;
  } catch (e) {
    if (signal?.aborted) throw new Error('cancelled');
    throw new Error(cleanError(e, 'Download failed. Please try again.'));
  } finally {
    sub.remove();
    signal?.removeEventListener('abort', onAbort);
  }
}

async function downloadDirect(
  info: VideoInfo,
  format: MediaFormat,
  onProgress: (p: number) => void,
  signal?: AbortSignal
): Promise<string> {
  const safe = info.title.replace(/[^\w.-]+/g, '_').slice(0, 60) || `file.${format.ext}`;
  const localUri = FileSystem.cacheDirectory + safe;

  const task = FileSystem.createDownloadResumable(info.url, localUri, {}, (p) => {
    if (p.totalBytesExpectedToWrite > 0) {
      onProgress(Math.max(0.01, p.totalBytesWritten / p.totalBytesExpectedToWrite));
    }
  });
  const onAbort = () => {
    task.cancelAsync().catch(() => {});
  };
  signal?.addEventListener('abort', onAbort);

  try {
    const result = await task.downloadAsync();
    if (!result || signal?.aborted) throw new Error('cancelled');
    if (result.status !== 200) throw new Error('Download failed. Please try again.');
    onProgress(1);
    return result.uri;
  } finally {
    signal?.removeEventListener('abort', onAbort);
  }
}
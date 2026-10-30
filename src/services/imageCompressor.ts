import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { sanitizeFileName, stripExtension } from '../utils/format';

export type CompressFormat = 'jpeg' | 'webp';

export type CompressMode =
  | { type: 'quality'; quality: number } // 0.05 - 1
  | { type: 'target'; maxBytes: number }; // e.g. 100 * 1024

export type CompressOptions = {
  mode: CompressMode;
  maxSide: number | null; // longest side in px, null = original
  format: CompressFormat;
};

export type SourceImage = { id: string; uri: string; name: string; sizeBytes: number | null };

export type CompressedImage = {
  id: string;
  uri: string;
  name: string;
  sizeBytes: number;
  originalSize: number | null;
  width: number;
  height: number;
  reachedTarget: boolean;
};

type Ref = Awaited<ReturnType<ReturnType<typeof ImageManipulator.manipulate>['renderAsync']>>;
type Saved = { uri: string; size: number; width: number; height: number };

const EXT: Record<CompressFormat, string> = { jpeg: 'jpg', webp: 'webp' };

async function fileSize(uri: string) {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size ?? 0 : 0;
}

async function render(uri: string, longSide?: number, landscape?: boolean): Promise<Ref> {
  const ctx = ImageManipulator.manipulate(uri);
  if (longSide) ctx.resize(landscape ? { width: longSide } : { height: longSide });
  return ctx.renderAsync();
}

async function save(ref: Ref, format: CompressFormat, quality: number): Promise<Saved> {
  const r = await ref.saveAsync({
    format: format === 'webp' ? SaveFormat.WEBP : SaveFormat.JPEG,
    compress: quality,
  });
  return { uri: r.uri, size: await fileSize(r.uri), width: r.width, height: r.height };
}

/** Loads the image (rotation fixed) and applies the max resolution */
async function prepare(uri: string, maxSide: number | null): Promise<Ref> {
  const full = await render(uri);
  if (maxSide && Math.max(full.width, full.height) > maxSide) {
    return render(uri, maxSide, full.width >= full.height);
  }
  return full;
}

async function compressOne(
  uri: string,
  opts: CompressOptions
): Promise<{ saved: Saved; reached: boolean; tried: string[] }> {
  let ref = await prepare(uri, opts.maxSide);

  // ----- Quality mode: one pass -----
  if (opts.mode.type === 'quality') {
    const saved = await save(ref, opts.format, opts.mode.quality);
    return { saved, reached: true, tried: [] };
  }

  // ----- Target size mode: search for the best quality that fits -----
  const target = opts.mode.maxBytes;
  const tried: string[] = [];
  let smallest: Saved | null = null;

  for (let round = 0; round < 8; round++) {
    let lo = 0.05;
    let hi = 0.95;
    let best: Saved | null = null;

    for (let i = 0; i < 6; i++) {
      const q = (lo + hi) / 2;
      const s = await save(ref, opts.format, q);
      tried.push(s.uri);
      if (!smallest || s.size < smallest.size) smallest = s;

      if (s.size <= target) {
        if (!best || s.size > best.size) best = s; // highest quality that fits
        lo = q;
      } else {
        hi = q;
      }
    }

    if (best) return { saved: best, reached: true, tried };

    // still too big even at low quality -> shrink the resolution and retry
    const next = Math.round(Math.max(ref.width, ref.height) * 0.75);
    if (next < 160) break;
    ref = await render(uri, next, ref.width >= ref.height);
  }

  return { saved: smallest!, reached: false, tried };
}

export async function compressImages(
  images: SourceImage[],
  opts: CompressOptions,
  singleName: string | null,
  onProgress: (p: number) => void
): Promise<CompressedImage[]> {
  const dir = `${FileSystem.cacheDirectory}compress_${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const ext = EXT[opts.format];
  const usedNames = new Set<string>();
  const results: CompressedImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const { saved, reached, tried } = await compressOne(img.uri, opts);

    const base = sanitizeFileName(singleName ?? `${stripExtension(img.name)}_compressed`, 'image');
    let name = `${base}.${ext}`;
    let n = 2;
    while (usedNames.has(name)) name = `${base} (${n++}).${ext}`;
    usedNames.add(name);

    const target = dir + encodeURIComponent(name);
    await FileSystem.moveAsync({ from: saved.uri, to: target });

    // clean up the attempts we didn't keep
    for (const t of tried) await FileSystem.deleteAsync(t, { idempotent: true });

    results.push({
      id: img.id,
      uri: target,
      name,
      sizeBytes: saved.size,
      originalSize: img.sizeBytes,
      width: saved.width,
      height: saved.height,
      reachedTarget: reached,
    });
    onProgress((i + 1) / images.length);
  }

  return results;
}

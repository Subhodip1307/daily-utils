import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { sanitizeFileName, stripExtension } from '../utils/format';

export type OutputFormat = 'jpeg' | 'png' | 'webp';

export const FORMAT_INFO: Record<
  OutputFormat,
  { label: string; ext: string; mime: string; lossy: boolean; save: SaveFormat }
> = {
  jpeg: { label: 'JPG', ext: 'jpg', mime: 'image/jpeg', lossy: true, save: SaveFormat.JPEG },
  png: { label: 'PNG', ext: 'png', mime: 'image/png', lossy: false, save: SaveFormat.PNG },
  webp: { label: 'WEBP', ext: 'webp', mime: 'image/webp', lossy: true, save: SaveFormat.WEBP },
};

export type SourceImage = {
  id: string;
  uri: string;
  name: string;
  sizeBytes: number | null;
};

export type ConvertedImage = {
  id: string;
  uri: string;
  name: string;
  sizeBytes: number;
  originalSize: number | null;
  width: number;
  height: number;
};

/**
 * Converts images to the chosen format.
 * singleName: custom file name (only used when converting one image).
 */
export async function convertImages(
  images: SourceImage[],
  format: OutputFormat,
  quality: number,
  singleName: string | null,
  onProgress: (p: number) => void
): Promise<ConvertedImage[]> {
  const info = FORMAT_INFO[format];
  const dir = `${FileSystem.cacheDirectory}convert_${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });

  const usedNames = new Set<string>();
  const results: ConvertedImage[] = [];

  for (let i = 0; i < images.length; i++) {
    const img = images[i];

    const rendered = await ImageManipulator.manipulate(img.uri).renderAsync();
    const saved = await rendered.saveAsync({
      format: info.save,
      compress: info.lossy ? quality : 1,
    });

    // Unique, clean file name
    const base = sanitizeFileName(singleName ?? stripExtension(img.name), 'image');
    let name = `${base}.${info.ext}`;
    let n = 2;
    while (usedNames.has(name)) name = `${base} (${n++}).${info.ext}`;
    usedNames.add(name);

    const target = dir + encodeURIComponent(name);
    await FileSystem.moveAsync({ from: saved.uri, to: target });
    const fileInfo = await FileSystem.getInfoAsync(target);

    results.push({
      id: img.id,
      uri: target,
      name,
      sizeBytes: fileInfo.exists ? fileInfo.size ?? 0 : 0,
      originalSize: img.sizeBytes,
      width: saved.width,
      height: saved.height,
    });
    onProgress((i + 1) / images.length);
  }

  return results;
}

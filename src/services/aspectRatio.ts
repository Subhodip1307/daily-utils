import { FilterMode, ImageFormat, MipmapMode, Skia, TileMode } from '@shopify/react-native-skia';
import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { sanitizeFileName } from '../utils/format';

export const MIN_SIDE = 16;
export const MAX_SIDE = 4096;

export type Background = { type: 'blur' } | { type: 'color'; color: string };
export type TargetShape =
  | { type: 'ratio'; w: number; h: number } // keep full resolution, change shape
  | { type: 'size'; width: number; height: number }; // exact pixels

export type AspectResult = {
  uri: string;
  name: string;
  width: number;
  height: number;
  sizeBytes: number;
};

/** Smallest canvas of the given ratio that fits the whole image (capped at MAX_SIDE) */
export function computeCanvas(imgW: number, imgH: number, ratioW: number, ratioH: number) {
  const target = ratioW / ratioH;
  let w: number;
  let h: number;
  if (imgW / imgH > target) {
    w = imgW;
    h = imgW / target;
  } else {
    h = imgH;
    w = imgH * target;
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { width: Math.round(w * scale), height: Math.round(h * scale) };
}

export async function renderAspectRatio(
  uri: string,
  shape: TargetShape,
  background: Background,
  fileName: string
): Promise<AspectResult> {
  // 1. Fix photo rotation (EXIF) and save a clean copy Skia can read
  const normalized = await ImageManipulator.manipulate(uri).renderAsync();
  const clean = await normalized.saveAsync({ format: SaveFormat.JPEG, compress: 0.95 });

  const data = await Skia.Data.fromURI(clean.uri);
  const image = Skia.Image.MakeImageFromEncoded(data);
  if (!image) throw new Error('Could not read this image.');

  const iw = image.width();
  const ih = image.height();
  const { width: W, height: H } =
    shape.type === 'ratio' ? computeCanvas(iw, ih, shape.w, shape.h) : shape;

  // 2. Draw on a new canvas
  const surface = Skia.Surface.Make(W, H) ?? Skia.Surface.MakeOffscreen(W, H);
  if (!surface) throw new Error('This size is too large to process.');
  const canvas = surface.getCanvas();
  const src = Skia.XYWHRect(0, 0, iw, ih);

  if (background.type === 'color') {
    canvas.drawColor(Skia.Color(background.color));
  } else {
    // blurred, zoomed copy fills the whole canvas
    const cover = Math.max(W / iw, H / ih);
    const cw = iw * cover;
    const ch = ih * cover;
    const blurPaint = Skia.Paint();
    const sigma = Math.max(W, H) * 0.025;
    blurPaint.setImageFilter(Skia.ImageFilter.MakeBlur(sigma, sigma, TileMode.Clamp, null));
    canvas.drawImageRectOptions(
      image,
      src,
      Skia.XYWHRect((W - cw) / 2, (H - ch) / 2, cw, ch),
      FilterMode.Linear,
      MipmapMode.None,
      blurPaint
    );
    // slight dark overlay so the main photo stands out
    const dim = Skia.Paint();
    dim.setColor(Skia.Color('rgba(0,0,0,0.18)'));
    canvas.drawRect(Skia.XYWHRect(0, 0, W, H), dim);
  }

  // full photo, centered, never cropped
  const fit = Math.min(W / iw, H / ih);
  const fw = iw * fit;
  const fh = ih * fit;
  canvas.drawImageRectOptions(
    image,
    src,
    Skia.XYWHRect((W - fw) / 2, (H - fh) / 2, fw, fh),
    FilterMode.Linear,
    MipmapMode.None,
    Skia.Paint()
  );

  surface.flush();
  const base64 = surface.makeImageSnapshot().encodeToBase64(ImageFormat.JPEG, 92);

  // 3. Save the result
  const name = `${sanitizeFileName(fileName, 'image')}.jpg`;
  const target = FileSystem.cacheDirectory + encodeURIComponent(name);
  await FileSystem.writeAsStringAsync(target, base64, { encoding: FileSystem.EncodingType.Base64 });
  await FileSystem.deleteAsync(clean.uri, { idempotent: true });

  const info = await FileSystem.getInfoAsync(target);
  return { uri: target, name, width: W, height: H, sizeBytes: info.exists ? info.size ?? 0 : 0 };
}

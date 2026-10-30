import * as FileSystem from 'expo-file-system/legacy';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import * as Print from 'expo-print';
import { sanitizeFileName } from '../utils/format';

export type PickedImage = { id: string; uri: string; width: number; height: number; name: string };
export type PageSize = 'A4' | 'Letter';
export type Orientation = 'portrait' | 'landscape';
export type MarginSize = 'none' | 'small' | 'large';
export type FitMode = 'contain' | 'cover';

export type PdfOptions = {
  pageSize: PageSize;
  orientation: Orientation;
  margin: MarginSize;
  fit: FitMode;
};

export type PdfResult = { uri: string; name: string; sizeBytes: number; pages: number };

// Page sizes in points (72 per inch)
const PAGE_SIZES: Record<PageSize, [number, number]> = {
  A4: [595, 842],
  Letter: [612, 792],
};
const MARGINS: Record<MarginSize, number> = { none: 0, small: 18, large: 36 };
const MAX_SIDE = 1600; // shrink big photos so the PDF stays small

/** Resizes (if needed) and converts an image to a base64 JPEG */
async function toBase64Jpeg(img: PickedImage): Promise<string> {
  const ctx = ImageManipulator.manipulate(img.uri);
  if (Math.max(img.width, img.height) > MAX_SIDE) {
    ctx.resize(img.width >= img.height ? { width: MAX_SIDE } : { height: MAX_SIDE });
  }
  const rendered = await ctx.renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.82, base64: true });
  if (!saved.base64) throw new Error('Could not read one of the images.');
  return saved.base64;
}

function buildHtml(images: string[], w: number, h: number, margin: number, fit: FitMode) {
  const pages = images
    .map((b64) => `<div class="page"><img src="data:image/jpeg;base64,${b64}" /></div>`)
    .join('');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8" />
<style>
  @page { size: ${w}pt ${h}pt; margin: 0; }
  html, body { margin: 0; padding: 0; background: #fff; }
  .page {
    width: ${w}pt;
    height: ${h - 2}pt;
    padding: ${margin}pt;
    box-sizing: border-box;
    overflow: hidden;
    page-break-after: always;
  }
  .page:last-child { page-break-after: auto; }
  img { width: 100%; height: 100%; object-fit: ${fit}; display: block; }
</style>
</head>
<body>${pages}</body>
</html>`;
}

/** Creates the PDF. onProgress goes from 0 to 1. */
export async function createPdf(
  images: PickedImage[],
  options: PdfOptions,
  fileName: string,
  onProgress: (p: number) => void
): Promise<PdfResult> {
  if (!images.length) throw new Error('Add at least one image.');

  const [pw, ph] = PAGE_SIZES[options.pageSize];
  const [w, h] = options.orientation === 'portrait' ? [pw, ph] : [ph, pw];

  // 1. Prepare every image
  const data: string[] = [];
  for (let i = 0; i < images.length; i++) {
    data.push(await toBase64Jpeg(images[i]));
    onProgress((i + 1) / (images.length + 1));
  }

  // 2. Render the PDF
  const { uri } = await Print.printToFileAsync({
    html: buildHtml(data, w, h, MARGINS[options.margin], options.fit),
    width: w,
    height: h,
  });
  onProgress(1);

  // 3. Rename to the chosen file name
  const name = `${sanitizeFileName(fileName, 'Images')}.pdf`;
  const target = FileSystem.cacheDirectory + encodeURIComponent(name);
  await FileSystem.deleteAsync(target, { idempotent: true });
  await FileSystem.moveAsync({ from: uri, to: target });

  const info = await FileSystem.getInfoAsync(target);
  return {
    uri: target,
    name,
    sizeBytes: info.exists ? info.size ?? 0 : 0,
    pages: images.length,
  };
}

/**
 * Lets the user pick a folder and saves the PDF there.
 * Returns false if the user closed the folder picker.
 */
export async function savePdfToFolder(pdf: PdfResult): Promise<boolean> {
  const SAF = FileSystem.StorageAccessFramework;
  const permission = await SAF.requestDirectoryPermissionsAsync();
  if (!permission.granted) return false;

  const dest = await SAF.createFileAsync(
    permission.directoryUri,
    pdf.name.replace(/\.pdf$/i, ''),
    'application/pdf'
  );
  const base64 = await FileSystem.readAsStringAsync(pdf.uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  await FileSystem.writeAsStringAsync(dest, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return true;
}

import * as MediaLibrary from 'expo-media-library';

export async function saveToGallery(uri: string) {
  const permission = await MediaLibrary.requestPermissionsAsync();
  if (!permission.granted) {
    throw new Error('Please allow access to photos & media.');
  }
  const ML = MediaLibrary as any; // supports old + new expo-media-library APIs
  if (ML.Asset?.create) await ML.Asset.create(uri);
  else await ML.createAssetAsync(uri);
}
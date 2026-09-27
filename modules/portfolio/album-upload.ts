export const albumPhotoLimit = 12 * 1024 * 1024;
export const albumPhotoTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export function albumPhotoError(file: { size: number; type: string }) {
  if (!file.size) return 'Choose a photo to upload.';
  if (file.size > albumPhotoLimit) return 'Each photo must be 12 MB or smaller.';
  if (!albumPhotoTypes.includes(file.type)) return 'Choose a JPG, PNG, WebP, or GIF photo.';
  return '';
}

const JPEG_DATA_URL_PREFIX = 'data:image/jpeg;base64,';

/**
 * Convert a base64 JPEG payload from the stream into a browser-managed object URL.
 * Object URLs keep the hot stream path lighter than large data URLs in the DOM.
 */
export function base64JpegToObjectUrl(base64Data) {
  const binaryString = atob(base64Data);
  const bytes = new Uint8Array(binaryString.length);

  for (let index = 0; index < binaryString.length; index += 1) {
    bytes[index] = binaryString.charCodeAt(index);
  }

  return URL.createObjectURL(new Blob([bytes], { type: 'image/jpeg' }));
}

export function replaceImageObjectUrl(image, objectUrl, revokeDelay = 0) {
  if (!image || !objectUrl) return;

  const previousObjectUrl = image._objectUrl;
  image._objectUrl = objectUrl;
  image.src = objectUrl;

  if (previousObjectUrl) {
    window.setTimeout(() => URL.revokeObjectURL(previousObjectUrl), revokeDelay);
  }
}

export function revokeImageObjectUrl(image) {
  if (!image?._objectUrl) return;
  URL.revokeObjectURL(image._objectUrl);
  image._objectUrl = null;
}

export function base64JpegToDataUrl(base64Data) {
  return `${JPEG_DATA_URL_PREFIX}${base64Data}`;
}

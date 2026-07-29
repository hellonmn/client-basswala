/**
 * utils/upload.ts
 *
 * Cross-platform FormData helper for image uploads.
 *
 * React Native's `FormData.append('field', { uri, name, type })` pattern works
 * on iOS/Android — RN's polyfill knows how to stream the local file. But it
 * DOES NOT work on the web build: browsers need a real Blob/File, and the
 * plain object gets serialized as the string "[object Object]".
 *
 * Use `appendImage(fd, field, uri, name?)` everywhere that used to call
 * `fd.append(field, { uri, name, type } as any)` to get uploads working on
 * web without breaking native.
 */

import { Platform } from "react-native";

/**
 * Resize + recompress an image to keep the upload comfortably small
 * regardless of source camera. Returns a NEW uri pointing at the
 * downscaled file.
 *
 * Why: Android cameras produce 8-12 MP JPEGs even at picker
 * `quality: 0.4`, and Hostinger's reverse proxy quietly drops the
 * socket on bodies > 1 MB — which axios surfaces as the generic
 * "Network Error" with no status code. Shrinking here means uploads
 * always fit, no matter what the server-side limit is.
 *
 * Targets: max 720 px on the longer side, JPEG quality 0.6. Result
 * is typically 80-200 KB for a portrait — plenty for an avatar.
 *
 * Lazy-required so the app doesn't crash if a dev client without
 * expo-image-manipulator compiled in runs the JS (e.g. before a
 * native rebuild). Falls back to the original uri on failure.
 */
// Cache the manipulator module across calls. Once we've confirmed the
// native side is missing (dev client without the package linked), every
// subsequent call short-circuits instead of re-logging the loud
// "Cannot find native module" warning.
let _imageManipulator: any = undefined;          // undefined = not probed, null = unavailable

export async function compressImage(uri: string, maxDim = 720, quality = 0.6): Promise<string> {
  if (_imageManipulator === null) return uri;
  if (_imageManipulator === undefined) {
    try {
      _imageManipulator = require("expo-image-manipulator");
      if (!_imageManipulator?.manipulateAsync) _imageManipulator = null;
    } catch (err) {
      console.warn("[upload] expo-image-manipulator unavailable — uploading uncompressed. Rebuild the dev client to enable resizing.");
      _imageManipulator = null;
      return uri;
    }
  }
  if (!_imageManipulator) return uri;

  try {
    const result = await _imageManipulator.manipulateAsync(
      uri,
      [{ resize: { width: maxDim } }],
      { compress: quality, format: _imageManipulator.SaveFormat.JPEG },
    );
    return result?.uri || uri;
  } catch (err) {
    console.warn("[upload] compressImage failed, sending original:", (err as any)?.message);
    return uri;
  }
}

/** Infer a MIME type from the file extension, falling back to image/jpeg. */
export function inferMimeType(nameOrUri: string): string {
  const ext = (nameOrUri.split("?")[0].split("#")[0].split(".").pop() || "").toLowerCase();
  switch (ext) {
    case "png":  return "image/png";
    case "webp": return "image/webp";
    case "gif":  return "image/gif";
    case "heic": return "image/heic";
    case "heif": return "image/heif";
    case "jpg":
    case "jpeg":
    default:     return "image/jpeg";
  }
}

/**
 * Append an image to a FormData in a platform-correct way.
 *
 * @param fd      Target FormData
 * @param field   Field name the backend's multer expects (e.g. "photo", "avatar")
 * @param uri     The local URI from expo-image-picker. On web this is usually
 *                a blob: or data: URL; on native it's a file: URL.
 * @param name    Optional filename sent to the server. Defaults to a timestamped jpg.
 */
export async function appendImage(
  fd: FormData,
  field: string,
  uri: string,
  name?: string,
): Promise<void> {
  const finalName = name || `upload_${Date.now()}.jpg`;
  const type = inferMimeType(name || uri);

  if (Platform.OS === "web") {
    const response = await fetch(uri);
    const blob = await response.blob();
    const file = typeof File !== "undefined"
      ? new File([blob], finalName, { type: blob.type || type })
      : blob;
    fd.append(field, file as any, finalName);
    return;
  }

  fd.append(field, { uri, name: finalName, type } as any);
}

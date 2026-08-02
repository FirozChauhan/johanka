import { v2 as cloudinary } from "cloudinary";
import type { ResolvedSettings } from "./settings";

/*
  Minimal Cloudinary client.

  We only ever upload the small poster JPEG produced by ffmpeg — never the raw
  video (StreamTape stays the free video store). The returned secure_url is
  what gets stored in Postgres and shown in the UI.
*/

export interface CloudinaryCreds {
  cloudName: string;
  apiKey: string;
  apiSecret: string;
}

/** Narrowing type guard: are all three Cloudinary settings present? */
export function cloudinaryConfigured(
  creds?: Partial<ResolvedSettings>
): creds is ResolvedSettings & {
  cloudinaryCloudName: string;
  cloudinaryApiKey: string;
  cloudinaryApiSecret: string;
} {
  return Boolean(
    creds?.cloudinaryCloudName && creds?.cloudinaryApiKey && creds?.cloudinaryApiSecret
  );
}

export interface PosterUpload {
  url: string;
  publicId: string;
}

/** Upload a poster frame to Cloudinary and resolve with its secure URL. */
export async function uploadPoster(
  creds: CloudinaryCreds,
  bytes: Buffer,
  publicId: string
): Promise<PosterUpload> {
  cloudinary.config({
    cloud_name: creds.cloudName,
    api_key: creds.apiKey,
    api_secret: creds.apiSecret,
    secure: true,
  });

  return new Promise<PosterUpload>((resolvePromise, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      {
        public_id: publicId,
        folder: "johanka",
        resource_type: "image",
        overwrite: true,
      },
      (err, result) => {
        if (err || !result) {
          reject(
            err instanceof Error
              ? err
              : new Error((err as { message?: string })?.message || "Cloudinary upload failed")
          );
          return;
        }
        resolvePromise({
          url: result.secure_url,
          publicId: result.public_id ?? publicId,
        });
      }
    );
    stream.end(bytes);
  });
}

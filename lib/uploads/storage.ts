import "server-only";
import { S3Client, PutBucketCorsCommand, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { attachmentDisposition } from "./validation";

export function uploadsConfigured() {
  return ["UPLOAD_BUCKET", "UPLOAD_ENDPOINT", "UPLOAD_ACCESS_KEY_ID", "UPLOAD_SECRET_ACCESS_KEY"].every((key) => process.env[key]);
}

function storage() {
  if (!uploadsConfigured()) throw new Error("Client upload storage is not configured.");
  return {
    Bucket: process.env.UPLOAD_BUCKET!,
    client: new S3Client({
      endpoint: process.env.UPLOAD_ENDPOINT,
      region: process.env.UPLOAD_REGION || "auto",
      forcePathStyle: process.env.UPLOAD_FORCE_PATH_STYLE === "true",
      requestChecksumCalculation: "WHEN_REQUIRED",
      credentials: { accessKeyId: process.env.UPLOAD_ACCESS_KEY_ID!, secretAccessKey: process.env.UPLOAD_SECRET_ACCESS_KEY! }
    })
  };
}

export async function configureUploadCors(origin: string) {
  const { client, Bucket } = storage();
  await client.send(new PutBucketCorsCommand({ Bucket, CORSConfiguration: { CORSRules: [{
    AllowedOrigins: [new URL(origin).origin], AllowedMethods: ["PUT"],
    AllowedHeaders: ["content-type", "if-none-match", "x-amz-*"], MaxAgeSeconds: 600
  }] } }));
}

export async function signOriginalUpload(Key: string, sizeBytes: number) {
  const { client, Bucket } = storage();
  // Sign the length and create-only condition: clients cannot inflate files or replace a received original.
  return getSignedUrl(client, new PutObjectCommand({ Bucket, Key, ContentLength: sizeBytes,
    ContentType: "application/octet-stream", IfNoneMatch: "*" }), {
    expiresIn: 900, signableHeaders: new Set(["content-length", "content-type", "if-none-match"])
  });
}

export async function originalSize(Key: string) {
  const { client, Bucket } = storage();
  try {
    const result = await client.send(new HeadObjectCommand({ Bucket, Key }));
    return result.ContentLength;
  } catch (error) {
    if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return undefined;
    throw error;
  }
}

export async function signOriginalDownload(Key: string, filename: string) {
  const { client, Bucket } = storage();
  return getSignedUrl(client, new GetObjectCommand({ Bucket, Key,
    ResponseContentType: "application/octet-stream", ResponseContentDisposition: attachmentDisposition(filename)
  }), { expiresIn: 60 });
}

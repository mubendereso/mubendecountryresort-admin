import "server-only";

import { S3Client, PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";

let cachedClient: S3Client | null = null;

function getEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function getClient() {
  if (cachedClient) return cachedClient;

  cachedClient = new S3Client({
    region: "auto",
    endpoint: `https://${getEnv("R2_ACCOUNT_ID")}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: getEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: getEnv("R2_SECRET_ACCESS_KEY")
    }
  });

  return cachedClient;
}

export type UploadResult = {
  key: string;
  url: string;
};

export async function uploadObject(
  key: string,
  body: Buffer | Uint8Array,
  contentType: string
): Promise<UploadResult> {
  await getClient().send(
    new PutObjectCommand({
      Bucket: getEnv("R2_BUCKET"),
      Key: key,
      Body: body,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable"
    })
  );

  return {
    key,
    url: `${getEnv("R2_PUBLIC_URL").replace(/\/$/, "")}/${key}`
  };
}

export async function deleteObject(key: string) {
  await getClient().send(
    new DeleteObjectCommand({
      Bucket: getEnv("R2_BUCKET"),
      Key: key
    })
  );
}

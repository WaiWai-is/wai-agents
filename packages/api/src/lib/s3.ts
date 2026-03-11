import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const S3_ACCESS_KEY = process.env.S3_ACCESS_KEY;
const S3_SECRET_KEY = process.env.S3_SECRET_KEY;
if (!S3_ACCESS_KEY || !S3_SECRET_KEY) {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('S3_ACCESS_KEY and S3_SECRET_KEY are required in production');
  }
}

const s3 = new S3Client({
  endpoint: process.env.S3_ENDPOINT,
  region: process.env.S3_REGION || 'eu-central-1',
  credentials: {
    accessKeyId: S3_ACCESS_KEY ?? '',
    secretAccessKey: S3_SECRET_KEY ?? '',
  },
  forcePathStyle: true, // Required for Hetzner S3
});

const BUCKET = process.env.S3_BUCKET || 'wai-agents';

export async function getUploadUrl(key: string, contentType: string, expiresIn = 3600): Promise<string> {
  const command = new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    ContentType: contentType,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function getDownloadUrl(key: string, expiresIn = 3600): Promise<string> {
  const command = new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  return getSignedUrl(s3, command, { expiresIn });
}

export async function deleteObject(key: string): Promise<void> {
  const command = new DeleteObjectCommand({
    Bucket: BUCKET,
    Key: key,
  });
  await s3.send(command);
}

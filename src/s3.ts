import { Credentials, S3 } from 'aws-sdk';
import * as fs from 'fs';
import { Readable } from 'stream';

export function getS3Instance({
  region,
  accessKey,
  secretAccessKey,
}: {
  region: string;
  accessKey: string;
  secretAccessKey: string;
}): AWS.S3 {
  const credentials = new Credentials({
    accessKeyId: accessKey,
    secretAccessKey,
  });
  return new S3({ apiVersion: '2006-03-01', credentials, region });
}

export async function getS3Stream({
  bucket,
  key,
  s3,
}: {
  bucket: string;
  key: string;
  s3: AWS.S3;
}): Promise<Readable> {
  const request = s3.getObject({ Bucket: bucket, Key: key });
  return request.createReadStream();
}

export async function getS3Contents({
  bucket,
  key,
  s3,
  nullOnMissing,
}: {
  bucket: string;
  key: string;
  s3: AWS.S3;
  nullOnMissing: boolean;
}): Promise<string | null> {
  try {
    const response = await s3.getObject({ Bucket: bucket, Key: key }).promise();

    if (typeof response.Body === 'string') {
      return response.Body;
    }

    if (Buffer.isBuffer(response.Body)) {
      return (response.Body as Buffer).toString('utf-8');
    }

    throw new Error('Unexpected body type');
  } catch (e) {
    if (e.code === 'NoSuchKey' && nullOnMissing) {
      return null;
    }
    throw e;
  }
}

export async function uploadFileToS3(params: {
  bucket: string;
  key: string;
  s3: AWS.S3;
  filePath: string;
  contentType: string;
  immutable?: boolean;
}) {
  const content = fs.createReadStream(params.filePath);
  return _uploadToS3({ ...params, content });
}

export async function uploadToS3(params: {
  bucket: string;
  key: string;
  s3: AWS.S3;
  content: string;
  contentType: string;
  immutable?: boolean;
}) {
  return _uploadToS3(params);
}

async function _uploadToS3({
  bucket,
  key,
  s3,
  content,
  contentType,
  immutable = false,
}: {
  bucket: string;
  key: string;
  s3: AWS.S3;
  content: string | Readable;
  contentType: string;
  immutable?: boolean;
}) {
  const CacheControl = immutable
    ? 'public, max-age=31536000'
    : 'no-cache, max-age=0';
  const Tagging = immutable ? 'Type=Artifact' : undefined;

  const params: S3.Types.PutObjectRequest = {
    Bucket: bucket,
    Key: key,
    Body: content,
    ACL: 'public-read',
    ContentType: contentType,
    CacheControl,
    Tagging,
  };

  await s3.putObject(params).promise();
}

export function toKey(key: string, destDir?: string): string {
  let prefix = '';
  if (destDir) {
    prefix =
      destDir.lastIndexOf('/') === destDir.length - 1 ? destDir : destDir + '/';
  }
  return `${prefix}${key}`;
}

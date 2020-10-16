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

export async function uploadFileToS3({
  bucket,
  key,
  s3,
  sourcePath,
  contentType,
  immutable = false,
}: {
  bucket: string;
  key: string;
  s3: AWS.S3;
  sourcePath: string;
  contentType: string;
  immutable?: boolean;
}) {
  const Body = fs.createReadStream(sourcePath);

  const CacheControl = immutable
    ? 'public, max-age=31536000'
    : 'no-cache, max-age=0';

  const params: S3.Types.PutObjectRequest = {
    Bucket: bucket,
    Key: key,
    Body,
    ACL: 'public-read',
    ContentType: contentType,
    CacheControl,
  };

  await s3.putObject(params).promise();
}

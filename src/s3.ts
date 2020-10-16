import { Credentials, S3 } from 'aws-sdk';
import { Readable } from 'stream';

export async function getS3Stream({
  bucket,
  key,
  region,
  accessKey,
  secretAccessKey,
}: {
  bucket: string;
  key: string;
  region: string;
  accessKey: string;
  secretAccessKey: string;
}): Promise<Readable> {
  const credentials = new Credentials({
    accessKeyId: accessKey,
    secretAccessKey,
  });
  const s3 = new S3({ apiVersion: '2006-03-01', credentials, region });

  const request = s3.getObject({ Bucket: bucket, Key: key });
  return request.createReadStream();
}

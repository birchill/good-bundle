import { Credentials, S3 } from 'aws-sdk';

export async function getS3File({
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
}): Promise<string | null> {
  const credentials = new Credentials({
    accessKeyId: accessKey,
    secretAccessKey,
  });
  const s3 = new S3({ apiVersion: '2006-03-01', credentials, region });

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
    if (e.code === 'NoSuchKey') {
      return null;
    }
    throw e;
  }
}

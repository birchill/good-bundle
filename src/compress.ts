import { pipeline as callbackPipeline } from 'stream';
import { createReadStream, createWriteStream, statSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import { createBrotliCompress, createGunzip } from 'zlib';

const pipeline = promisify(callbackPipeline);

export async function getCompressedSize(
  path: string,
  compression: 'brotli' | 'gzip'
): Promise<number> {
  const outPath = compression === 'brotli' ? path + '.br' : path + '.gz';
  const compress =
    compression === 'brotli' ? createBrotliCompress() : createGunzip();

  await pipeline(createReadStream(path), compress, createWriteStream(outPath));
  const { size } = statSync(outPath);
  unlinkSync(outPath);

  return size;
}

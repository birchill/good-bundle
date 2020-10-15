import { pipeline as callbackPipeline } from 'stream';
import { createReadStream, createWriteStream, statSync, unlinkSync } from 'fs';
import { promisify } from 'util';
import { createBrotliCompress } from 'zlib';

const pipeline = promisify(callbackPipeline);

export async function getCompressedSize(path: string): Promise<number> {
  const outPath = path + '.br';
  await pipeline(
    createReadStream(path),
    createBrotliCompress(),
    createWriteStream(outPath)
  );
  const { size } = statSync(outPath);
  unlinkSync(outPath);
  return size;
}

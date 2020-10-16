import cloneable from 'cloneable-readable';
import { parse as csvParse } from '@fast-csv/parse';
import * as fs from 'fs';
import { pipeline as callbackPipeline, Readable } from 'stream';
import { promisify } from 'util';

const pipeline = promisify(callbackPipeline);

export type AssetSizes = {
  [name: string]: { size: number; compressedSize: number };
};

export async function storeAndGetPreviousSizes(
  logStream: Readable,
  destFile: string,
  baseRevision: string
): Promise<AssetSizes | null> {
  // Look up the record for the base changeset while writing the contents
  // to a file.
  const stream = cloneable(logStream);
  const getPreviousSizes = new Promise<AssetSizes | null>((resolve, reject) => {
    const result: AssetSizes = {};
    stream
      .clone()
      .on('error', (e) => {
        if ((e as any).code === 'NoSuchKey') {
          resolve(null);
        } else {
          reject(e);
        }
      })
      .pipe(csvParse({ headers: true }))
      .on('error', reject)
      .on('data', (row) => {
        if (row.changeset === baseRevision) {
          result[row.name] = {
            size: row.size,
            compressedSize: row.compressedSize,
          };
        }
      })
      .on('end', () => resolve(result));
  });

  try {
    await pipeline(stream, fs.createWriteStream(destFile));
  } catch (e) {
    if (e.code === 'NoSuchKey') {
      return null;
    }
    throw e;
  }

  return await getPreviousSizes;
}

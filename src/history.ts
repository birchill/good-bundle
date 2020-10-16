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
  const getPreviousSizes = new Promise<AssetSizes>((resolve, reject) => {
    const result: AssetSizes = {};
    stream
      .clone()
      .pipe(csvParse({ headers: true }))
      .on('error', (err) => {
        console.log('Encountered error in CSV parsing stream');
        console.log(err);
        reject(err);
      })
      .on('data', (row) => {
        console.log(`DEBUG (row): ${JSON.stringify(row)}`);
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
    console.log('Encountered error in pipeline');
    console.log(e);
    if (e.code === 'NoSuchKey') {
      return null;
    }
  }

  return await getPreviousSizes;
}

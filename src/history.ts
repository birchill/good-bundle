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
  console.log('Well we got to storeAndGetPreviousSizes');
  // Look up the record for the base changeset while writing the contents
  // to a file.
  try {
    console.log('Got to the cloning part');
    const stream = cloneable(logStream);
    console.log('Setting up the promise');
    const getPreviousSizes = new Promise<AssetSizes>((resolve, reject) => {
      console.log('Inside the promise');
      const result: AssetSizes = {};
      stream
        .clone()
        .on('error', (err) => {
          console.log('Encountered error in other thing');
          console.log(err);
          reject(err);
        })
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
        .on('end', () => {
          console.log('Done waiting');
          resolve(result);
        });
    });

    try {
      console.log('Waiting on the pipeline');
      await pipeline(stream, fs.createWriteStream(destFile));
    } catch (e) {
      console.log('Encountered error in pipeline');
      console.log(e);
      if (e.code === 'NoSuchKey') {
        return null;
      }
    }

    console.log('Waiting on the promise');
    return await getPreviousSizes;
  } catch (e) {
    console.log('Got an error thrown from somewhere else?');
    console.log(e);
    return null;
  }
}

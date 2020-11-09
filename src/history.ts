import * as github from '@actions/github';
import { ExecOptions, exec } from '@actions/exec';
import cloneable from 'cloneable-readable';
import { parse as csvParse } from '@fast-csv/parse';
import * as fs from 'fs';
import { pipeline as callbackPipeline, Readable } from 'stream';
import { promisify } from 'util';

import { OutputFormat } from './config';

const pipeline = promisify(callbackPipeline);

export type PreviousRunData = {
  [name: string]: {
    size: number;
    compressedSize: number;
    statsUrl?: string;
  };
};

export async function fetchPreviousRun({
  stream,
  format,
  destFile,
  changeset,
}: {
  stream: Readable;
  format: OutputFormat;
  destFile: string;
  changeset: string;
}): Promise<PreviousRunData | null> {
  if (format === 'csv') {
    return fetchAndSaveCSV(stream, changeset, destFile);
  } else {
    return fetchAndSaveJson(stream, changeset, destFile);
  }
}

async function fetchAndSaveCSV(
  originalStream: Readable,
  changeset: string,
  destFile: string
): Promise<PreviousRunData | null> {
  console.log(`Looking for data for ${changeset} in CSV file...`);
  const stream = cloneable(originalStream);
  const getPreviousSizes = new Promise<PreviousRunData | null>(
    (resolve, reject) => {
      const result: PreviousRunData = {};
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
          console.log(row);
          if (row.changeset === changeset) {
            console.log('Got match');
            result[row.name] = {
              size: parseInt(row.size, 10),
              compressedSize: parseInt(row.compressedSize, 10),
              statsUrl: row.statsUrl,
            };
          }
        })
        .on('end', () => resolve(result));
    }
  );

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

async function fetchAndSaveJson(
  stream: Readable,
  changeset: string,
  destFile: string
): Promise<PreviousRunData | null> {
  // First just write it to disk.
  //
  // Unlike CSV, we can't process the data while we're streaming it because it's
  // just one big JSON array.
  try {
    await pipeline(stream, fs.createWriteStream(destFile));
  } catch (e) {
    if (e.code === 'NoSuchKey') {
      return null;
    }
    throw e;
  }

  const contents = JSON.parse(
    fs.readFileSync(destFile, { encoding: 'utf-8' })
  ) as Array<object>;

  const result: PreviousRunData = {};
  for (const record of contents) {
    if (isJsonRecord(record) && record.changeset === changeset) {
      result[record.name] = {
        size: record.size,
        compressedSize: record.compressedSize,
        statsUrl: record.statsUrl,
      };
    }
  }

  return result;
}

interface JsonRecord {
  changeset: string;
  name: string;
  size: number;
  compressedSize: number;
  statsUrl?: string;
}

function isJsonRecord(record: unknown): record is JsonRecord {
  if (!record || typeof record !== 'object') {
    return false;
  }

  if (typeof (record as any).changeset !== 'string') {
    return false;
  }

  if (typeof (record as any).name !== 'string') {
    return false;
  }

  if (typeof (record as any).size !== 'number') {
    return false;
  }

  if (typeof (record as any).compressedSize !== 'number') {
    return false;
  }

  if (
    typeof (record as any).statsUrl !== 'string' &&
    typeof (record as any).statsUrl !== 'undefined'
  ) {
    return false;
  }

  return true;
}

export async function getBaseRevision(): Promise<string> {
  // For a pull request, we should use the latest commit from the target branch.
  if (github.context.payload.pull_request) {
    return getBranchHeadRev(process.env.GITHUB_BASE_REF!);
  } else {
    return github.context.payload.before;
  }
}

async function getBranchHeadRev(branch: string): Promise<string> {
  let result: string = '';
  const options: ExecOptions = {
    cwd: process.env.GITHUB_WORKSPACE,
    listeners: {
      stdout: (data: Buffer) => {
        result += data.toString();
      },
    },
    silent: true,
    failOnStdErr: true,
  };

  await exec(`git rev-parse ${branch}`, [], options);

  return result.trim();
}

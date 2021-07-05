import * as github from '@actions/github';
import { ExecOptions, exec } from '@actions/exec';
import cloneable from 'cloneable-readable';
import { parse as csvParse } from '@fast-csv/parse';
import * as fs from 'fs';
import { pipeline as callbackPipeline, Readable } from 'stream';
import { promisify } from 'util';

import { OutputFormat } from './config';
import { AssetSummaryRecord } from './measure';

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
          if (row.changeset === changeset) {
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
      for (const asset of record.assets) {
        const { name, size, compressedSize } = asset;
        result[name] = { size, compressedSize, statsUrl: record.statsUrl };
      }
    }
  }

  return result;
}

interface JsonRecord {
  changeset: string;
  assets: Array<AssetSummaryRecord>;
  statsUrl?: string;
}

function isJsonRecord(record: unknown): record is JsonRecord {
  if (!record || typeof record !== 'object') {
    return false;
  }

  if (typeof (record as any).changeset !== 'string') {
    return false;
  }

  if (
    !Array.isArray((record as any).assets) ||
    !(record as any).assets.every(isAssetRecord)
  ) {
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

function isAssetRecord(record: unknown): record is AssetSummaryRecord {
  if (!record || typeof record !== 'object') {
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

  return true;
}

export async function getBaseRevision(): Promise<string> {
  console.log('getBaseRevision');
  console.log(JSON.stringify(github.context.payload, null, 2));

  // For a pull request, we should use the latest commit from the target branch.
  if (github.context.payload.pull_request) {
    console.log(
      `  is PR, using getBranchHeadRev with ${process.env.GITHUB_BASE_REF}`
    );
    return getBranchHeadRev(process.env.GITHUB_BASE_REF!);
  } else {
    console.log(
      `  not PR, returning previous commit: ${github.context.payload.before}`
    );
    return github.context.payload.before;
  }
}

async function getBranchHeadRev(branch: string): Promise<string> {
  console.log(`getBranchHeadRev(${branch})`);
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

  console.log(`  git rev-parse ${branch} gave: ${result}`);

  return result.trim();
}

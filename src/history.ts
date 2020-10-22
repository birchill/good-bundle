import * as github from '@actions/github';
import { ExecOptions, exec } from '@actions/exec';
import cloneable from 'cloneable-readable';
import { parse as csvParse } from '@fast-csv/parse';
import * as fs from 'fs';
import { pipeline as callbackPipeline, Readable } from 'stream';
import { promisify } from 'util';

const pipeline = promisify(callbackPipeline);

export type PreviousRunData = {
  [name: string]: {
    size: number;
    compressedSize: number;
    statsFileUrl?: string;
  };
};

export async function fetchHistory(
  logStream: Readable,
  destFile: string,
  baseRevision: string
): Promise<PreviousRunData | null> {
  // Look up the record for the base changeset while writing the contents
  // to a file.
  const stream = cloneable(logStream);
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
          if (row.changeset === baseRevision) {
            result[row.name] = {
              size: row.size,
              compressedSize: row.compressedSize,
              statsFileUrl: row.statsFileUrl,
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

export async function getBaseRevision(): Promise<string> {
  // For a pull request, however, we should use the latest commit from the
  // target branch.
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

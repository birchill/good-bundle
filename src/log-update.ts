import * as core from '@actions/core';
import * as fs from 'fs';
import { pipeline as callbackPipeline } from 'stream';
import { promisify } from 'util';

import { serializeCsv } from './csv';
import { AssetSummaryRecord } from './measure';
import { getS3Stream, getS3Contents, uploadFileToS3 } from './s3';

const pipeline = promisify(callbackPipeline);

export interface LogData {
  project: string;
  branch: string;
  changeset?: string;
  commitMessage: string;
  author: string;
  avatar: string;
  baseRevision: string;
  compareUrl: string;
  timestamp: number;
  date: string;
  statsUrl?: string;
  reportUrl?: string;
}

export async function appendCsvLog({
  data,
  assetSizes,
  output,
}: {
  data: LogData;
  assetSizes: Array<AssetSummaryRecord>;
  output: {
    filename: string;
    key: string;
    s3: AWS.S3;
    bucket: string;
  };
}) {
  let contents =
    '\n' +
    assetSizes
      .map((record) =>
        serializeCsv([
          data.project,
          data.branch,
          data.changeset || '',
          data.commitMessage,
          data.author,
          data.avatar,
          data.baseRevision,
          data.compareUrl,
          data.timestamp,
          data.date,
          record.name,
          record.size,
          record.compressedSize,
          data.statsUrl || '',
          data.reportUrl || '',
        ])
      )
      .join('\n');

  // Download existing data (if we haven't already)
  let newFile = false;
  if (!fs.existsSync(output.filename)) {
    try {
      const stream = await getS3Stream({
        bucket: output.bucket,
        key: output.key,
        s3: output.s3,
      });
      await pipeline(stream, fs.createWriteStream(output.filename));
    } catch (e) {
      if (e.code === 'NoSuchKey') {
        newFile = true;
      } else {
        throw e;
      }
    }
  }

  // Write to the file
  if (newFile) {
    const header = serializeCsv([
      'project',
      'branch',
      'changeset',
      'message',
      'author',
      'avatar',
      'baseRevision',
      'compare',
      'timestamp',
      'date',
      'name',
      'size',
      'compressedSize',
      'statsUrl',
      'reportUrl',
    ]);
    contents = header + contents;
    fs.writeFileSync(output.filename, contents);
  } else {
    fs.appendFileSync(output.filename, contents);
  }

  core.info(`Uploading ${output.key} to ${output.bucket}...`);
  await uploadFileToS3({
    bucket: output.bucket,
    key: output.key,
    s3: output.s3,
    filePath: output.filename,
    contentType: 'text/csv',
  });
}

export async function appendJsonLog({
  data,
  assetSizes,
  output,
}: {
  data: LogData;
  assetSizes: Array<AssetSummaryRecord>;
  output: {
    filename: string;
    key: string;
    s3: AWS.S3;
    bucket: string;
  };
}) {
  // Get existing data
  let contents: string | null;
  if (fs.existsSync(output.filename)) {
    contents = fs.readFileSync(output.filename, { encoding: 'utf-8' });
  } else {
    contents = await getS3Contents({
      bucket: output.bucket,
      key: output.key,
      s3: output.s3,
      nullOnMissing: true,
    });
  }

  // Write to the file
  let arrayToWrite: Array<any> = [];
  if (contents) {
    arrayToWrite = JSON.parse(contents);
    if (!Array.isArray(arrayToWrite)) {
      throw new Error(`JSON object ${output.key} is not an array`);
    }
  }

  // Just write a single record.
  //
  // From a structured-data point of view, that seems the most logical thing to
  // do (and reduces the log file size).
  //
  // But maybe analytics tools would find it easier if we wrote separate
  // records for each asset?
  arrayToWrite.push({
    ...data,
    assets: assetSizes,
  });

  fs.writeFileSync(output.filename, JSON.stringify(arrayToWrite));

  core.info(`Uploading ${output.key} to ${output.bucket}...`);
  await uploadFileToS3({
    bucket: output.bucket,
    key: output.key,
    s3: output.s3,
    filePath: output.filename,
    contentType: 'application/json',
  });
}

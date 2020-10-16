import * as core from '@actions/core';
import * as github from '@actions/github';
import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';

import { getBranch } from './branch';
import { commentOnPr } from './comment';
import { serializeCsv } from './csv';
import {
  AssetSizes,
  getBaseRevision,
  storeAndGetPreviousSizes,
} from './history';
import { logSizes } from './log';
import { getManifest } from './manifest';
import {
  AssetSummaryRecord,
  groupAssetRecordsByName,
  measureAssetSizes,
} from './measure';
import { getS3Instance, getS3Stream, uploadFileToS3, uploadToS3 } from './s3';

async function main(): Promise<void> {
  try {
    console.log(JSON.stringify(github.context, null, 2));

    // Get bucket parameters
    const bucket = core.getInput('bucket', { required: true });
    const region = core.getInput('region', { required: true });
    const awsAccessKey = core.getInput('awsAccessKey', { required: true });
    const awsSecretAccessKey = core.getInput('awsSecretAccessKey', {
      required: true,
    });

    // Find and validate config file
    const configPath = path.join(
      process.env.GITHUB_WORKSPACE!,
      'good-bundle.config.json'
    );
    if (!fs.existsSync(configPath)) {
      throw new Error(`Could not find config file at ${configPath}`);
    }
    const config = JSON.parse(
      fs.readFileSync(configPath, { encoding: 'utf-8' })
    );
    if (!config) {
      throw new Error('Got empty config');
    }

    // Validate assets
    if (typeof config.assets !== 'object' || !config.assets) {
      throw new Error('Missing assets key in configuration');
    }
    const assets: { [label: string]: Array<string> } = config.assets;
    for (const [key, value] of Object.entries(config.assets)) {
      if (typeof key !== 'string' || typeof value !== 'string' || !value) {
        throw new Error(`Invalid asset definition: ${key}: ${value}`);
      }
      const entries = await fg(value, { dot: true });
      if (!entries.length) {
        throw new Error(`Didn't find any matches for pattern ${value}`);
      }
      assets[key] = entries;
    }

    // Validate stats file
    let statsFile: string | undefined;
    if (typeof config.stats === 'string') {
      statsFile = path.join(process.env.GITHUB_WORKSPACE!, config.stats);
      if (!fs.existsSync(statsFile)) {
        throw new Error(`Could not find stats file: ${statsFile}`);
      }
    }

    // Measure asset sizes
    const assetSizes = groupAssetRecordsByName(
      await measureAssetSizes(assets, { log: true })
    );

    // Output total size
    const [totalSize, totalCompressedSize] = assetSizes.reduce(
      ([size, compressedSize], record) => [
        size + record.size,
        compressedSize + record.compressedSize,
      ],
      [0, 0]
    );
    core.setOutput('totalSize', totalSize);
    core.setOutput('totalCompressedSize', totalCompressedSize);

    // Look for existing log file in S3 bucket
    const s3 = getS3Instance({
      region,
      accessKey: awsAccessKey,
      secretAccessKey: awsSecretAccessKey,
    });
    const logKey = toKey('bundle-stats-001.csv');
    const existingLog = await getS3Stream({
      bucket,
      key: logKey,
      s3,
    });

    // Get existing sizes
    const logFilename = path.join(__dirname, 'bundle-stats-001.csv');
    const baseRevision = await getBaseRevision();
    let previousSizes = await storeAndGetPreviousSizes(
      existingLog,
      logFilename,
      baseRevision
    );

    // Print different to console
    logSizes(assetSizes, previousSizes || {});

    const isPr = !!github.context.payload.pull_request;
    if (isPr) {
      await commentOnPr(assetSizes, previousSizes || {});
    } else {
      await uploadResults({
        statsFile,
        bucket,
        s3,
        region,
        previousSizes,
        logKey,
        assetSizes,
        logFilename,
        baseRevision,
      });
    }

    core.info('Done.');
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

function toKey(key: string): string {
  const destDir = core.getInput('destDir');
  let prefix = '';
  if (destDir) {
    prefix =
      destDir.lastIndexOf('/') === destDir.length - 1 ? destDir : destDir + '/';
  }
  return `${prefix}${key}`;
}

async function uploadResults({
  statsFile,
  bucket,
  s3,
  region,
  logKey,
  logFilename,
  assetSizes,
  previousSizes,
  baseRevision,
}: {
  statsFile: string | undefined;
  bucket: string;
  s3: AWS.S3;
  region: string;
  logKey: string;
  logFilename: string;
  assetSizes: Array<AssetSummaryRecord>;
  previousSizes: AssetSizes | null;
  baseRevision: string;
}) {
  // Get push metadata
  const project = `${github.context.repo.owner}/${github.context.repo.repo}`;
  const branch = getBranch();
  const changeset = process.env.GITHUB_SHA;
  const context = github.context;
  const headCommit = context.payload.head_commit;
  // We only take the first line of the commit message because many tools
  // (e.g. Google Data Portal) can't process CSV files with line breaks.
  const commitMessage = headCommit
    ? headCommit.message.split(/\r\n|\r|\n/)[0]
    : '';
  const compareUrl = context.payload.compare || '';
  const date = headCommit
    ? new Date(headCommit.timestamp).getTime()
    : Date.now();

  // Upload stats file
  let statsFileUrl = '';
  if (statsFile) {
    const statsKey = toKey(`${changeset}-stats.json`);
    core.info(`Uploading ${statsKey} to ${bucket}...`);
    await uploadFileToS3({
      bucket,
      key: toKey(`${changeset}-stats.json`),
      s3,
      filePath: statsFile,
      contentType: 'application/json',
      immutable: true,
    });
    statsFileUrl = `https://${bucket}.s3-${region}.amazonaws.com/${statsKey}`;
  }

  // Upload manifest file if this is the first run
  if (!previousSizes) {
    const manifestKey = toKey('quicksight_manifest.json');
    core.info(`Uploading ${manifestKey} to ${bucket}...`);
    await uploadToS3({
      bucket,
      key: manifestKey,
      s3,
      content: JSON.stringify(
        getManifest({
          keys: [logKey],
          bucket,
          region,
        })
      ),
      contentType: 'application/json',
    });
  }

  // Write log file
  let contents =
    '\n' +
    assetSizes
      .map((record) =>
        serializeCsv([
          project,
          branch,
          changeset,
          commitMessage,
          baseRevision,
          compareUrl,
          date,
          record.name,
          record.size,
          record.compressedSize,
          statsFileUrl,
        ])
      )
      .join('\n');
  if (previousSizes) {
    fs.appendFileSync(logFilename, contents);
  } else {
    const header = serializeCsv([
      'project',
      'branch',
      'changeset',
      'message',
      'baseRevision',
      'compare',
      'date',
      'name',
      'size',
      'compressedSize',
      'statsUrl',
    ]);
    contents = header + contents;
    fs.writeFileSync(logFilename, contents);
  }

  // Upload log file
  //
  // (We do this last in case there are any errors along the way.)
  core.info(`Uploading ${logKey} to ${bucket}...`);
  await uploadFileToS3({
    bucket,
    key: logKey,
    s3,
    filePath: logFilename,
    contentType: 'text/csv',
  });
}

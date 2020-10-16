import * as core from '@actions/core';
import * as github from '@actions/github';
import fg from 'fast-glob';
import * as fs from 'fs';
import * as path from 'path';

import { getBranch } from './branch';
import { serializeCsv } from './csv';
import { storeAndGetPreviousSizes } from './history';
import { logSizes } from './log';
import { getManifest } from './manifest';
import { groupAssetRecordsByName, measureAssetSizes } from './measure';
import { getS3Instance, getS3Stream, uploadFileToS3, uploadToS3 } from './s3';

async function main(): Promise<void> {
  try {
    // Validate input
    //
    // TODO: Drop this and just make the action itself detect if this is a PR
    // or not, and only store results if it's a push.
    const action = core.getInput('action', { required: true });
    if (action !== 'store' && action !== 'compare') {
      throw new Error(
        `Unrecognized action "${action}". Only "store" and "compare" are recognized.`
      );
    }

    // Get bucket parameters
    const bucket = core.getInput('bucket', { required: true });
    const dest = core.getInput('dest');
    const region = core.getInput('region', { required: true });
    const awsAccessKey = core.getInput('awsAccessKey', { required: true });
    const awsSecretAccessKey = core.getInput('awsSecretAccessKey', {
      required: true,
    });

    // Find and validate config file
    const configPath = `${process.env.GITHUB_WORKSPACE}/good-bundle.config.json`;
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

    // Get push metadata
    const branch = getBranch();
    const changeset = process.env.GITHUB_SHA;
    const context = github.context;
    const headCommit = context.payload.head_commit;
    const commitMessage = headCommit ? headCommit.message : '';
    const before = context.payload.before;
    const compareUrl = context.payload.compare || '';
    const date = headCommit
      ? new Date(headCommit.timestamp).getTime()
      : Date.now();

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
    const toKey = (key: string): string => {
      let prefix = '';
      if (dest) {
        prefix = dest.lastIndexOf('/') === dest.length - 1 ? dest : dest + '/';
      }
      return `${prefix}${key}`;
    };
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
    const logFile = path.join(__dirname, 'bundle-stats-001.csv');
    let previousSizes = await storeAndGetPreviousSizes(
      existingLog,
      logFile,
      before
    );

    // Print different to console
    logSizes(assetSizes, previousSizes || {});

    // Upload stats file
    let statsFileUrl = '';
    if (statsFile) {
      const statsKey = toKey(`${changeset}-stats.json`);
      await uploadFileToS3({
        bucket,
        key: toKey(`${changeset}-stats.json`),
        s3,
        filePath: statsFile,
        contentType: 'application/json',
        immutable: true,
      });
      statsFileUrl = `https://${bucket}.s3-${region}.amazonaws/${statsKey}`;
    }

    // Upload manifest file if this is the first run
    if (!previousSizes) {
      await uploadToS3({
        bucket,
        key: toKey('quicksight_manifest.json'),
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
    let contents = assetSizes
      .map((record) =>
        serializeCsv([
          branch,
          changeset,
          commitMessage,
          before,
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
      fs.appendFileSync(logFile, contents);
    } else {
      const header = serializeCsv([
        'branch',
        'changeset',
        'message',
        'before',
        'compare',
        'date',
        'name',
        'size',
        'compressedSize',
        'statsUrl',
      ]);
      contents = header + contents;
      fs.writeFileSync(logFile, contents);
    }

    // Upload log file
    //
    // (We do this last in case there are any errors along the way.)
    await uploadFileToS3({
      bucket,
      key: logKey,
      s3,
      filePath: logFile,
      contentType: 'text/csv',
    });

    // TODO: If this is a PR, create a comment on the PR
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

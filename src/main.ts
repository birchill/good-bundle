import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

import { getBranch } from './branch';
import { serializeCsv } from './csv';
import { groupAssetRecordsByName, measureAssetSizes } from './measure';

async function main(): Promise<void> {
  try {
    // Validate input
    const action = core.getInput('action', { required: true });
    if (action !== 'store' && action !== 'compare') {
      throw new Error(
        `Unrecognized action "${action}". Only "store" and "compare" are recognized.`
      );
    }

    // Get bucket parameters
    /*
    const bucket = core.getInput('bucket', { required: true });
    const dest = core.getInput('dest');
    const region = core.getInput('region', { required: true });
    const awsAccessKey = core.getInput('awsAccessKey', { required: true });
    const awsSecretAccessKey = core.getInput('awsSecretAccessKey', {
      required: true,
    });
    */

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

    // Get push metadata
    const branch = getBranch();
    const changeset = process.env.GITHUB_SHA;
    const context = github.context;
    const headCommit = context.payload.head_commit;
    const commitMessage = headCommit ? headCommit.message : '';
    const compareUrl = context.payload.compare || '';
    const date = headCommit
      ? new Date(headCommit.timestamp).getTime()
      : Date.now();

    console.log('Would write the following records:');
    console.log(
      serializeCsv([
        'branch',
        'changeset',
        'message',
        'compare',
        'date',
        'name',
        'size',
        'compressedSize',
      ])
    );
    for (const record of assetSizes) {
      console.log(
        serializeCsv([
          branch,
          changeset,
          commitMessage,
          compareUrl,
          date,
          record.name,
          record.size,
          record.compressedSize,
        ])
      );
    }

    // - Grab file from S3 bucket
    // - Print out the delta (abs. and percent) using fancy formatting

    // store:
    // - Upload the stats file (rename to <changesetId>-stats.json)
    // - Append a row to the CSV file
    // - If we created the file, generate a quicksight_manifest.json file and
    //   upload that too

    // compare:
    // - Create a comment on the PR (if any)
    // - Add a build status summary?
  } catch (error) {
    core.setFailed(error.message);
  }
}

main();

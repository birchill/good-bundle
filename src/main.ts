import * as core from '@actions/core';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

import { getCompressedSize } from './brotli';
import { formatBytes } from './format-bytes';

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
    let totalSize = 0;
    let totalCompressedSize = 0;
    for (const [name, paths] of Object.entries(assets)) {
      let assetTotal = 0;
      let assetCompressedTotal = 0;
      console.log(`${name}: `);
      for (const path of paths) {
        const { size } = fs.statSync(path);
        assetTotal += size;

        const compressedSize = await getCompressedSize(path);
        assetCompressedTotal += compressedSize;

        console.log(
          `* ${path}: ${formatBytes(size)} (compressed: ${formatBytes(
            compressedSize
          )})`
        );
      }

      // Print total for multi-part assets
      if (paths.length > 1) {
        console.log(
          `  TOTAL: ${formatBytes(assetTotal)} (compressed: ${formatBytes(
            assetCompressedTotal
          )})`
        );
      }

      totalSize += assetTotal;
      totalCompressedSize += assetCompressedTotal;
    }
    core.setOutput('totalSize', totalSize);
    core.setOutput('totalCompressedSize', totalCompressedSize);

    // - Get branch, changeset, changeset title, base revision

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

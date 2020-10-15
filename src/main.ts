import * as core from '@actions/core';
import { existsSync, readFileSync } from 'fs';
import fg from 'fast-glob';

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
    if (!existsSync(configPath)) {
      throw new Error(`Could not find config file at ${configPath}`);
    }
    const config = JSON.parse(readFileSync(configPath, { encoding: 'utf-8' }));
    if (!config) {
      throw new Error('Got empty config');
    }

    // Validate assets
    if (typeof config.assets !== 'object' || !config.assets) {
      throw new Error('Missing assets key in configuration');
    }
    const assets: { [label: string]: Array<string> } = config.assets;
    for (const [key, value] of config.assets.entries()) {
      if (typeof key !== 'string' || typeof value !== 'string' || !value) {
        throw new Error(`Invalid asset definition: ${key}: ${value}`);
      }
      const entries = await fg(['.editorconfig', '**/index.js'], { dot: true });
      if (!entries.length) {
        throw new Error(`Didn't find any matches for pattern ${value}`);
      }
      assets[key] = entries;
    }

    // - Validate that stats file exists if specified
    // - Get file size for each
    // - Brotli compress and record file size
    // - Record totalSize (what about totalChange? totalPercentChange?)
    //     core.setOutput("totalSize", 0);
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

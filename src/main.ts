import * as core from '@actions/core';
import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';

import { getBranch } from './branch';
import { commentOnPr, getComparisonUrl } from './comment';
import { OutputDestination, readConfig } from './config';
import { serializeCsv } from './csv';
import { PreviousRunData, getBaseRevision, fetchHistory } from './history';
import { logSizes } from './log';
import { getManifest } from './manifest';
import {
  AssetSummaryRecord,
  groupAssetRecordsByName,
  measureAssetSizes,
} from './measure';
import { generateReport } from './report';
import { getS3Instance, getS3Stream, uploadFileToS3, uploadToS3 } from './s3';

async function main(): Promise<void> {
  try {
    // Get credentials parameters
    const awsAccessKey = core.getInput('awsAccessKey', { required: true });
    const awsSecretAccessKey = core.getInput('awsSecretAccessKey', {
      required: true,
    });

    // Read config
    const { assets, output, statsFile } = await readConfig();

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

    // Look for an existing log file in the S3 bucket
    const s3 = getS3Instance({
      region: output.region,
      accessKey: awsAccessKey,
      secretAccessKey: awsSecretAccessKey,
    });
    const logKey = toKey('bundle-stats-001.csv', output.destDir);
    const existingLog = await getS3Stream({
      bucket: output.bucketName,
      key: logKey,
      s3,
    });

    // Get existing sizes
    const logFilename = path.join(__dirname, 'bundle-stats-001.csv');
    const baseRevision = await getBaseRevision();
    let previousRun = await fetchHistory(
      existingLog,
      logFilename,
      baseRevision
    );

    // Print difference to console
    logSizes(assetSizes, previousRun || {});

    // Generate report
    let reportFile: string | undefined;
    if (statsFile) {
      reportFile = path.join(__dirname, 'report.html');

      // Try to guess the directory that holds the assets
      const firstAssetWithAPath = Object.values(assets).find(
        (paths) => paths.length
      );
      const bundleDir = firstAssetWithAPath
        ? path.dirname(firstAssetWithAPath[0]!)
        : undefined;

      await generateReport(statsFile, reportFile, bundleDir);
    }

    // Upload the stats and report.
    //
    // We do this even for PRs since we use it in the PR comment.
    let statsUrl = '';
    if (statsFile) {
      const statsKey = toKey(
        `${process.env.GITHUB_SHA}-stats.json`,
        output.destDir
      );
      core.info(`Uploading ${statsKey} to ${output.bucketName}...`);
      await uploadFileToS3({
        bucket: output.bucketName,
        key: statsKey,
        s3,
        filePath: statsFile,
        contentType: 'application/json',
        immutable: true,
      });
      statsUrl = `https://${output.bucketName}.s3-${output.region}.amazonaws.com/${statsKey}`;
      core.setOutput('statsUrl', statsUrl);

      const comparisonUrl = getComparisonUrl({
        baseline: previousRun || {},
        statsUrl,
      });
      if (comparisonUrl) {
        console.log(`Run comparison can be viewed at: ${comparisonUrl}`);
      }
    }

    let reportUrl = '';
    if (reportFile) {
      const reportKey = toKey(
        `${process.env.GITHUB_SHA}-report.html`,
        output.destDir
      );
      core.info(`Uploading ${reportKey} to ${output.bucketName}...`);
      await uploadFileToS3({
        bucket: output.bucketName,
        key: reportKey,
        s3,
        filePath: reportFile,
        contentType: 'text/html; charset=utf-8',
        immutable: true,
      });
      reportUrl = `https://${output.bucketName}.s3-${output.region}.amazonaws.com/${reportKey}`;
      console.log(`Analysis available at ${reportUrl}`);
      core.setOutput('reportUrl', reportUrl);
    }

    const isPr = !!github.context.payload.pull_request;
    if (isPr) {
      await commentOnPr(assetSizes, previousRun || {}, reportUrl, statsUrl);
    } else if (github.context.eventName === 'push') {
      await uploadResults({
        statsUrl,
        reportUrl,
        output,
        s3,
        previousSizes: previousRun,
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

function toKey(key: string, destDir?: string): string {
  let prefix = '';
  if (destDir) {
    prefix =
      destDir.lastIndexOf('/') === destDir.length - 1 ? destDir : destDir + '/';
  }
  return `${prefix}${key}`;
}

async function uploadResults({
  statsUrl,
  output,
  s3,
  logKey,
  logFilename,
  assetSizes,
  previousSizes,
  baseRevision,
}: {
  statsUrl: string | undefined;
  reportUrl: string | undefined;
  output: OutputDestination;
  s3: AWS.S3;
  logKey: string;
  logFilename: string;
  assetSizes: Array<AssetSummaryRecord>;
  previousSizes: PreviousRunData | null;
  baseRevision: string;
}) {
  // Collect various metadata
  const branch = getBranch();
  const changeset = process.env.GITHUB_SHA;
  const context = github.context;
  const headCommit = context.payload.head_commit;
  // We only take the first line of the commit message because many tools
  // (e.g. Google Data Portal) can't process CSV files with line breaks.
  const commitMessage = headCommit
    ? headCommit.message.split(/\r\n|\r|\n/)[0]
    : '';
  const author = headCommit.author.username;
  const avatar = context.payload.sender?.avatar_url;
  const compareUrl = context.payload.compare || '';
  const timestamp = headCommit
    ? new Date(headCommit.timestamp).getTime()
    : Date.now();
  // QuickSight likes ISO strings
  const date = new Date(timestamp).toISOString();

  // Upload manifest file if this is the first run
  if (!previousSizes) {
    const manifestKey = toKey('quicksight_manifest.json', output.destDir);
    core.info(`Uploading ${manifestKey} to ${output.bucketName}...`);
    await uploadToS3({
      bucket: output.bucketName,
      key: manifestKey,
      s3,
      content: JSON.stringify(
        getManifest({
          keys: [logKey],
          bucket: output.bucketName,
          region: output.region,
        })
      ),
      contentType: 'application/json',
    });
  }

  // Write log file
  //
  // TODO: Add reportUrl to this
  let contents =
    '\n' +
    assetSizes
      .map((record) =>
        serializeCsv([
          output.project,
          branch,
          changeset,
          commitMessage,
          author,
          avatar,
          baseRevision,
          compareUrl,
          timestamp,
          date,
          record.name,
          record.size,
          record.compressedSize,
          statsUrl,
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
    ]);
    contents = header + contents;
    fs.writeFileSync(logFilename, contents);
  }

  // Upload log file
  //
  // (We do this last in case there are any errors along the way.)
  core.info(`Uploading ${logKey} to ${output.bucketName}...`);
  await uploadFileToS3({
    bucket: output.bucketName,
    key: logKey,
    s3,
    filePath: logFilename,
    contentType: 'text/csv',
  });

  const logUrl = `https://${output.bucketName}.s3-${output.region}.amazonaws.com/${logKey}`;
  core.setOutput('logUrl', logUrl);
}

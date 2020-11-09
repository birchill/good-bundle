import * as core from '@actions/core';
import * as github from '@actions/github';
import * as path from 'path';

import { getBranch } from './branch';
import { commentOnPr, getComparisonUrl } from './comment';
import { OutputDestination, readConfig } from './config';
import { PreviousRunData, getBaseRevision, fetchPreviousRun } from './history';
import { logSizes } from './log';
import { appendCsvLog, appendJsonLog, LogData } from './log-update';
import { getManifest } from './manifest';
import {
  AssetSummaryRecord,
  groupAssetRecordsByName,
  measureAssetSizes,
} from './measure';
import { generateReport } from './report';
import {
  getS3Instance,
  getS3Stream,
  toKey,
  uploadFileToS3,
  uploadToS3,
} from './s3';

async function main(): Promise<void> {
  try {
    // Get credentials
    const awsAccessKey = core.getInput('AWS_ACCESS_KEY_ID', { required: true });
    const awsSecretAccessKey = core.getInput('AWS_SECRET_ACCESS_KEY', {
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

    // The first-specified format is the primary format, i.e. the one we use
    // for looking up historical results.
    const format = output.format[0];
    const logFilename = `bundle-stats-001.${format}`;
    const logKey = toKey(logFilename, output.destDir);
    const logStream = await getS3Stream({
      bucket: output.bucket,
      key: logKey,
      s3,
    });

    // Get existing sizes
    const baseRevision = await getBaseRevision();
    const previousRun = await fetchPreviousRun({
      stream: logStream,
      format,
      destFile: path.join(__dirname, logFilename),
      changeset: baseRevision,
    });

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
      core.info(`Uploading ${statsKey} to ${output.bucket}...`);
      await uploadFileToS3({
        bucket: output.bucket,
        key: statsKey,
        s3,
        filePath: statsFile,
        contentType: 'application/json',
        immutable: true,
      });
      statsUrl = `https://${output.bucket}.s3-${output.region}.amazonaws.com/${statsKey}`;
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
      core.info(`Uploading ${reportKey} to ${output.bucket}...`);
      await uploadFileToS3({
        bucket: output.bucket,
        key: reportKey,
        s3,
        filePath: reportFile,
        contentType: 'text/html; charset=utf-8',
        immutable: true,
      });
      reportUrl = `https://${output.bucket}.s3-${output.region}.amazonaws.com/${reportKey}`;
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

async function uploadResults({
  statsUrl,
  reportUrl,
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
  // (e.g. Google Data Studio) can't process CSV files with line breaks.
  const commitMessage = headCommit
    ? headCommit.message.split(/\r\n|\r|\n/)[0]
    : '';

  const author = headCommit.author.username;
  const avatar = context.payload.sender?.avatar_url;
  const compareUrl = context.payload.compare || '';
  const timestamp = headCommit
    ? new Date(headCommit.timestamp).getTime()
    : Date.now();

  // QuickSight likes ISO strings so export it as a string too so QuickSight
  // users can get productive without having to configure calculated fields.
  const date = new Date(timestamp).toISOString();

  // Upload manifest file if this is the first run
  if (!previousSizes) {
    const manifestKey = toKey('quicksight_manifest.json', output.destDir);
    core.info(`Uploading ${manifestKey} to ${output.bucket}...`);
    await uploadToS3({
      bucket: output.bucket,
      key: manifestKey,
      s3,
      content: JSON.stringify(
        getManifest({
          keys: [logKey],
          bucket: output.bucket,
          region: output.region,
        })
      ),
      contentType: 'application/json',
    });
  }

  // Update log file(s)
  const data: LogData = {
    project: output.project,
    branch,
    changeset,
    commitMessage,
    author,
    avatar,
    baseRevision,
    compareUrl,
    timestamp,
    date,
    statsUrl,
    reportUrl,
  };

  for (const format of output.format) {
    const filename = `bundle-stats-001.${format}`;
    const key = toKey(logFilename, output.destDir);

    if (format === 'csv') {
      await appendCsvLog({
        data,
        assetSizes,
        output: {
          filename,
          key,
          s3,
          bucket: output.bucket,
        },
      });
    } else {
      await appendJsonLog({
        data,
        assetSizes,
        output: {
          filename,
          key,
          s3,
          bucket: output.bucket,
        },
      });
    }
  }
}

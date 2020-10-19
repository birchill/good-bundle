import * as core from '@actions/core';
import * as github from '@actions/github';

import { formatBytes, niceRound } from './format';
import { AssetSizes } from './history';
import { AssetSummaryRecord } from './measure';

export async function commentOnPr(
  assets: Array<AssetSummaryRecord>,
  baseline: AssetSizes
) {
  const prNumber = github.context.payload.pull_request?.number;
  if (!prNumber) {
    return;
  }

  const token = core.getInput('GITHUB_TOKEN');
  if (!token) {
    return;
  }

  let body = '| Asset | Size | Compressed size |\n';
  body += '| ----- | ---- | --------------- |\n';

  for (const asset of assets) {
    body += `| ${asset.name} | ${formatBytes(asset.size)}`;

    if (typeof baseline[asset.name] !== 'undefined') {
      const previous = baseline[asset.name];
      const diff = asset.size - previous.size;
      const diffPercent = niceRound((diff / previous.size) * 100);
      if (diff < 0) {
        body += ` (▼${formatBytes(Math.abs(diff))} ▼${Math.abs(
          diffPercent
        )}%})`;
      } else if (diff > 0) {
        body += ` (▲${formatBytes(diff)} ▲${diffPercent}%)`;
      } else {
        body += ' (±0 bytes)';
      }

      body += ` | ${formatBytes(asset.compressedSize)}`;

      const compressedDiff = asset.compressedSize - previous.compressedSize;
      const compressedDiffPercent = niceRound(
        (compressedDiff / previous.compressedSize) * 100
      );
      if (compressedDiff < 0) {
        body += ` (▼${formatBytes(Math.abs(compressedDiff))} ▼${Math.abs(
          compressedDiffPercent
        )}%})`;
      } else if (compressedDiff > 0) {
        body += ` (▲${formatBytes(compressedDiff)} ▲${compressedDiffPercent}%)`;
      } else {
        body += ' (±0 bytes)';
      }
    } else {
      body += ` | ${formatBytes(asset.compressedSize)}`;
    }

    body += ' |\n';
  }

  const octokit = github.getOctokit(token);
  await octokit.issues.createComment({
    owner: github.context.repo.owner,
    repo: github.context.repo.repo,
    issue_number: prNumber,
    body,
  });
}

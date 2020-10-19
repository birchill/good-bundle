import * as core from '@actions/core';

import { formatBytes, green, niceRound, red } from './format';
import { AssetSizes } from './history';
import { AssetSummaryRecord } from './measure';

export function logSizes(
  assets: Array<AssetSummaryRecord>,
  baseline: AssetSizes
) {
  for (const asset of assets) {
    let summary = `${asset.name} ${formatBytes(asset.size)}`;

    if (typeof baseline[asset.name] !== 'undefined') {
      const previous = baseline[asset.name];
      const diff = asset.size - previous.size;
      const diffPercent = niceRound((diff / previous.size) * 100);
      if (diff < 0) {
        summary += ` (${green(
          `-${formatBytes(Math.abs(diff))} ${diffPercent}%`
        )})`;
      } else if (diff > 0) {
        summary += ` (${red(`+${formatBytes(diff)} +${diffPercent}%`)})`;
      } else {
        summary += ' (±0 bytes)';
      }

      summary += ` compressed: ${formatBytes(asset.compressedSize)}`;

      const compressedDiff = asset.compressedSize - previous.compressedSize;
      const compressedDiffPercent = niceRound(
        (compressedDiff / previous.compressedSize) * 100
      );
      if (compressedDiff < 0) {
        summary += ` (${green(
          `-${formatBytes(Math.abs(compressedDiff))} ${compressedDiffPercent}%`
        )})`;
      } else if (compressedDiff > 0) {
        summary += ` (${red(
          `+${formatBytes(compressedDiff)} +${compressedDiffPercent}%`
        )})`;
      } else {
        summary += ' (±0 bytes)';
      }
    } else {
      summary += ` compressed: ${formatBytes(asset.compressedSize)}`;
      summary += ` ${red('(no base revision found for comparison)')}`;
    }

    core.info(summary);
  }
}

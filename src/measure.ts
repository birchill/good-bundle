import * as fs from 'fs';

import { getCompressedSize } from './brotli';
import { formatBytes } from './format';

type AssetSpec = {
  [name: string]: Array<string>;
};

type AssetRecord = {
  name: string;
  path: string;
  size: number;
  compressedSize: number;
};

export async function measureAssetSizes(
  assets: AssetSpec,
  { log = false }: { log?: boolean } = {}
): Promise<Array<AssetRecord>> {
  const result: Array<AssetRecord> = [];

  for (const [name, paths] of Object.entries(assets)) {
    let assetTotal = 0;
    let assetCompressedTotal = 0;

    if (log) {
      console.log(`${name}: `);
    }

    for (const path of paths) {
      const { size } = fs.statSync(path);
      const compressedSize = await getCompressedSize(path);
      result.push({ name, path, size, compressedSize });

      assetTotal += size;
      assetCompressedTotal += compressedSize;

      if (log) {
        console.log(
          `* ${path}: ${formatBytes(size)} (compressed: ${formatBytes(
            compressedSize
          )})`
        );
      }
    }

    if (log && paths.length > 1) {
      console.log(
        `  TOTAL: ${formatBytes(assetTotal)} (compressed: ${formatBytes(
          assetCompressedTotal
        )})`
      );
    }
  }

  return result;
}

type AssetSummaryRecord = {
  name: string;
  size: number;
  compressedSize: number;
};

type AssetSummary = {
  [name: string]: AssetSummaryRecord;
};

export function groupAssetRecordsByName(
  assetRecords: Array<AssetRecord>
): Array<AssetSummaryRecord> {
  const summary: AssetSummary = assetRecords.reduce(
    (result: AssetSummary, record) => {
      const { name, size, compressedSize } = record;
      if (result[name]) {
        result[name].size += size;
        result[name].compressedSize += compressedSize;
      } else {
        result[record.name] = { name, size, compressedSize };
      }
      return result;
    },
    {}
  );

  return Object.values(summary);
}

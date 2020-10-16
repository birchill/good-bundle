import * as fs from 'fs';

type Manifest = {
  fileLocations: Array<{ URIs?: Array<string>; URIPrefixes?: Array<string> }>;
  globalUploadSettings?: {
    format?: 'CSV' | 'TSV' | 'CLF' | 'ELF' | 'JSON'; // Default CSV
    delimeter?: string; // Default ','
    textqualifier?: string;
    containsHeader?: boolean; // Default true
  };
};

// URIs take one the following formats:
//
// https://s3.amazonaws.com/<bucket name>/<file name>
// s3://<bucket name>/<file name>
// https://<bucket name>.s3.amazonaws.com/<file name>
// https://s3-<region name>.amazonaws.com/<bucket name>/<file name>
// https://<bucket name>.s3-<region name>.amazonaws.com/<file name>
//
// But if your QuickSight account is in another region you need to use one
// of the formats that includes the region name so to be same we use that.

export async function writeManifest({
  keys,
  bucket,
  region,
  destFile,
}: {
  keys: Array<string>;
  bucket: string;
  region: string;
  destFile: string;
}) {
  const URIs = keys.map(
    (key) => `https://${bucket}.s3-${region}.amazonaws.com/${key}`
  );
  const manifest: Manifest = { fileLocations: [{ URIs }] };
  const contents = JSON.stringify(manifest);
  fs.writeFileSync(destFile, contents);
}

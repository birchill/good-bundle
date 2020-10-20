import { ExecOptions, exec } from '@actions/exec';

export async function generateReport(statsFile: string, reportFile: string) {
  await installWebpackBundleAnalyzer();
  await runWebpackBundleAnalyzer(statsFile, reportFile);
}

async function installWebpackBundleAnalyzer() {
  const options: ExecOptions = {
    silent: true,
    failOnStdErr: true,
  };

  await exec(`yarn install -g webpack-bundle-analyzer`, [], options);
}

async function runWebpackBundleAnalyzer(statsFile: string, reportFile: string) {
  const options: ExecOptions = {
    failOnStdErr: true,
  };

  await exec(
    `webpack-bundle-analyzer ${statsFile} --mode static -r ${reportFile} --no-open`,
    [],
    options
  );
}

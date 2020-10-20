import { ExecOptions, exec } from '@actions/exec';

export async function generateReport(
  statsFile: string,
  reportFile: string,
  bundleDir: string | undefined
) {
  await installWebpackBundleAnalyzer();
  await runWebpackBundleAnalyzer(statsFile, reportFile, bundleDir);
}

async function installWebpackBundleAnalyzer() {
  const options: ExecOptions = {
    silent: true,
    cwd: process.env.GITHUB_WORKSPACE,
  };

  await exec(`yarn add webpack-bundle-analyzer`, [], options);
}

async function runWebpackBundleAnalyzer(
  statsFile: string,
  reportFile: string,
  bundleDir: string | undefined
) {
  const options: ExecOptions = {
    cwd: process.env.GITHUB_WORKSPACE,
    failOnStdErr: true,
  };

  await exec(
    `npx webpack-bundle-analyzer ${statsFile} ${
      bundleDir || ''
    } --mode static -r ${reportFile} --no-open`,
    [],
    options
  );
}

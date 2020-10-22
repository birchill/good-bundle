import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export type Config = {
  assets: { [name: string]: Array<string> };
  statsFile?: string;
};

type RawConfig = {
  assets: { [name: string]: string };
  stats?: string;
};

export async function readConfig(): Promise<Config> {
  // Find and validate config file
  const config = getConfigObject() as RawConfig;

  // Validate assets
  if (typeof config.assets !== 'object' || !config.assets) {
    throw new Error('Missing assets key in configuration');
  }
  const assets: { [label: string]: Array<string> } = {};
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

  return {
    assets,
    statsFile,
  };
}

function getConfigObject(): Object {
  // First look for a config JSON file in the root directory.
  const configPath = path.join(
    process.env.GITHUB_WORKSPACE!,
    'good-bundle.config.json'
  );
  if (fs.existsSync(configPath)) {
    const config = JSON.parse(
      fs.readFileSync(configPath, { encoding: 'utf-8' })
    );
    if (typeof config !== 'object' || config === null) {
      throw new Error(`Invalid config object in ${configPath}`);
    }
  }

  // Next try package.json
  const packageJsonPath = path.join(
    process.env.GITHUB_WORKSPACE!,
    'package.json'
  );
  const NO_CONFIG_FOUND_MESSAGE =
    'No config found.\n\nPlease add either a good-bundle.config.json file to the root of the repository, or add a `goodBundle` entry to your package.json';
  if (!fs.existsSync(packageJsonPath)) {
    throw new Error(NO_CONFIG_FOUND_MESSAGE);
  }
  const packageJson = JSON.parse(
    fs.readFileSync(packageJsonPath, { encoding: 'utf-8' })
  );
  if (typeof packageJson !== 'object' || packageJson === null) {
    throw new Error('Invalid package.json file');
  }

  const CONFIG_KEYS = ['goodBundle', 'goodbundle', 'good-bundle'];
  const key = CONFIG_KEYS.find((key) => packageJson.hasOwnProperty(key));
  if (!key) {
    throw new Error(NO_CONFIG_FOUND_MESSAGE);
  }
  if (typeof packageJson[key] !== 'object' || packageJson[key] === null) {
    throw new Error(`Invalid configuration for ${key} in package.json`);
  }

  return packageJson[key];
}

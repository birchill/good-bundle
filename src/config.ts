import * as github from '@actions/github';
import * as fs from 'fs';
import * as path from 'path';
import fg from 'fast-glob';

export type Config = {
  assets: { [name: string]: Array<string> };
  output: OutputDestination;
  statsFile?: string;
};

export type OutputDestination = {
  bucketName: string;
  destDir?: string;
  region: string;
  project: string;
};

type RawConfig = {
  assets: { [name: string]: string };
  outputs: Array<RawOutputDestination>;
  stats?: string;
};

type RawOutputDestination = {
  bucketName: string;
  destDir?: string;
  region: string;
  project?: string;
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

  // Validate outputs
  if (!Array.isArray(config.outputs) || !config.outputs.length) {
    throw new Error('Missing outputs key in configuration');
  }
  if (config.outputs.length > 1) {
    console.warn(
      'Currently only one output destination is supported. Additional destinations will be ignored.'
    );
  }
  const output = getOutputDestination(config.outputs[0]);

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
    output,
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

function getOutputDestination(input: RawOutputDestination): OutputDestination {
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid output destionation object');
  }

  const REQUIRED_KEYS: Array<keyof RawOutputDestination> = [
    'bucketName',
    'region',
  ];
  for (const key of REQUIRED_KEYS) {
    if (typeof input[key] !== 'string' || !input[key]!.length) {
      throw new Error(`Missing '${key}' property in output destination`);
    }
  }

  if (
    typeof input.destDir !== 'string' &&
    typeof input.destDir !== 'undefined'
  ) {
    throw new Error(`Invalid destDir: ${input.destDir}`);
  }

  const project =
    typeof input.project === 'string'
      ? input.project
      : `${github.context.repo.owner}/${github.context.repo.repo}`;

  return {
    bucketName: input['bucketName'],
    destDir: input['destDir'],
    region: input['region'],
    project,
  };
}

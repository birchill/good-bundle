# Good bundle action

## What is this?

A GitHub action that collects bundle size statistics and stores them in an S3
bucket you allowing you to compare the effect of new Pull Requests on bundle size
or visualize and analyze the change over time.

Statistics gathered for each configured asset:

- Bundle size (uncompressed)
- Bundle size (brotli compressed)

Other features:

- Stores generated webpack stats file in S3 for future comparisons
- Stores generated webpack-bundle-analyzer reports too
- Comments on PRs showing the delta change with links to the above resources

## Why?

Good question. You probably should check out
[Relative CI](https://relative-ci.com/) instead.
I would never have made this if I knew about them to begin with.

That said, it does have a few advantages:

- Accurate size statistics
  (in my testing Relative CI reported a 200Kb asset as being 280kb!)
- Reports brotli compressed size
  (maybe you're lucky enough to be serving assets using Brotli)
- You own your data in S3 so you can slice and dice it as you please
- For example, you can use the data in your own custom visualizations
- It comments on PRs
  (This feature is coming to Relative CI so hopefully this point will be moot
  in the near future.)

## Setup

### 1. Set up an S3 bucket and IAM user

See the included `cloudformation.yml` file for an example configuration.

e.g.

```console
aws cloudformation deploy --stack-name bundlesize-stack --template-file cloudformation.yml --capabilities CAPABILITY_IAM --region us-west-2
```

Fetch the generated bucket name and AWS access keys. You'll need them in step 3.

```console
aws cloudformation describe-stacks --stack-name bundlesize-stack
```

(BEWARE: Having a CloudFormation template spit out secret access keys as an
output parameter is an anti-pattern.
Anyone who can inspect your stack can grab the keys and therefore put stuff
in your bucket.
It's up to you to decide if that's acceptable or not.
If not, you'll want to create the same sort of stack manually.)

Note that the user credentials need to have `s3:ListBucket` privileges for
the bucket itself (see the CloudFormation template for an example). This is
needed to differentiate between non-existent files and incorrectly configured
access privileges. Without the `s3:ListBucket` privilege, trying to access a
non-existent object will return 'Access Denied'.

`s3:PutObjectAcl` is also needed so that we can mark the uploaded files as
public (so they can be consumed by third-party tools).

### 2. Add configuration

Either:

- Create a configuration file in the root of your project named
  `good-bundle.config.json`, or
- Add a `goodBundle` property to your `package.json`.

If both are provided, `good-bundle.config.json` is used.

Keys:

- `assets` (required) - An object where the keys are the human-readable asset
  names and the values are globs specifying the file(s) to record under that asset.

  We _could_ just look for a webpack stats JSON file, parse that and work out
  the assets automatically but we don't yet.

  Also, this setting allows you to ignore assets you don't care about, assign
  human-readable names to individual assets (as opposed to the contenthash
  filenames they may end up with), or use this with projects that don't use
  webpack.

- `stats` (optional) - Path to a webpack compilation stats file.

  If provided, the file will be uploaded to S3, used to generate a
  visualization of the asset contents, and used for more fine-grained
  comparisons between different runs.

For example, for a very simple project you might have:

```json
{
  "assets": { "bundle.js": "bundle.js" }
}
```

Or even just:

```json
{
  "assets": { "JS": "*.js" }
}
```

While for a project with multiple assets using chunking, you might have:

```json
{
  "assets": {
    "main.js": "dist/main.*.js",
    "worker.js": "dist/worker.*.js",
    "JS total": "dist/*.js",
    "styles.css": "dist/styles.*.css"
  },
  "stats": "webpack-stats.json"
}
```

### 3. Set up a GitHub action

Inputs:

- `project` (optional) - A descriptive name for the project.
  Useful if you are logging multiple projects to the same file.
  Defaults to `owner/repository`.

- `bucket` (required) - The S3 bucket in which to store the result.
  If a webpack stats file is specified, it will also be stored along with
  the report generated using `webpack-bundle-analyzer`.

- `destDir` (optional) - A destination folder to use within the bucket.

- `region` (required) - The AWS region of the bucket, e.g. `ap-northeast-1`.

- `awsAccessKey` (required) - The access key used to read/write from the
  bucket. See [AWS documentation on access and secret
  keys](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).

- `awsSecretAccessKey` (required) - The secret access key used to read/write
  from the bucket.

- `GITHUB_TOKEN` (optional) - `${{ secrets.GITHUB_TOKEN }}`. If supplied this
  is used to add comments to PRs.

For example:

```yaml
name: Record bundle stats
on:
  push:
    # Don't upload stats from dependabot branch pushes
    branches:
      - '*'
      - '*/*'
      - '**'
      - '!dependabot/**'
  pull_request_target:
    types: [opened, synchronize]

jobs:
  report:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2.1.2
        with:
          node-version: '12.x'

      - name: yarn install
        run: yarn install

      - name: Build production version and generate stats too
        run: yarn build:stats

      - name: Compare and record bundle stats
        uses: birchill/good-bundle@v1
        with:
          bucket: myapp-stats
          destDir: myapp
          region: us-west-2
          awsAccessKey: ${{ secrets.AWS_ACCESS_KEY_ID }}
          awsSecretAccessKey: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

You can set the secret environment variables as follows:

1.  Go to your repository on GitHub.
1.  Settings
1.  Secrets
1.  New Secret

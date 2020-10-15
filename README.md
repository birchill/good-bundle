# Good bundle action

Gathers bundle statistics and stores in an S3 bucket or compares them to a base revision.

Statistics gathered for each configured asset:

- Bundle size (uncompressed)
- Bundle size (brotli compressed)

## Setup

### 1. Set up an S3 bucket and IAM user

See the included `cloudformation.yml` file for an example configuration.

e.g.

```console
aws cloudformation deploy --stack-name bundlesize-stack --template-file cloudformation.yml --capabilities CAPABILITY_IAM --region ap-northeast-1
```

Fetch the generated bucket name and AWS access keys. You'll need them in step 3.

```console
aws cloudformation describe-stacks --stack-name bundlesize-stack
```

### 2. Create a configuration file

Create a configuration file in the root of your project named `good-bundle.config.json`.

Keys:

- `assets` (required) - An object where the keys are the human-readable asset
  names and the values are globs specifying the file(s) to record under that asset.

- `stats` (optional) - Path to a webpack compilation stats file.

For example, for a very simple project you might have:

```json
{
  "assets": { "bundle.js": "bundle.js" }`
}
```

While for a project with multiple assets using chunking, you might have:

```json
{
  "assets": {
    "main.js": "dist/main.*.js",
    "worker.js": "dist/worker.*.js",
    "styles.css": "dist/styles.*.css"
  },
  "stats": "stats.json"
}
```

### 3. Set up a GitHub action

Inputs:

- `action` (optional, default: 'store') - 'store' or 'compare'.
  Determines if we should store the results in S3 or compare and report them.

- `bucket` (required) - The S3 bucket in which to store the result and stats file
  (if specified).

- `dest` (optional) - A destination folder to use within the bucket.

- `region` (required) - The AWS region of the bucket, e.g. `ap-northeast-1`.

- `awsAccessKey` (required) - The access key used to read/write from the
  bucket. See [AWS documentation on access and secret
  keys](https://docs.aws.amazon.com/general/latest/gr/aws-sec-cred-types.html#access-keys-and-secret-access-keys).

- `awsSecretAccessKey` (required) - The secret access key used to read/write
  from the bucket.

For example:

```yaml
name: Record bundle stats
on: [push, pull_request]

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

      - name: Build production version
        run: yarn build:stats

      - name: Record bundle stats
        uses: birchill/good-bundle@v1
        if: startsWith(github.ref, 'refs/head')
        with:
          action: store
          bucket: myapp-stats
          dest: bundle-stats
          region: ap-northeast-1
          awsAccessKey: ${{ secrets.AWS_ACCESS_KEY_ID }}
          awsSecretAccessKey: ${{ secrets.AWS_SECRET_ACCESS_KEY }}

      - name: Compare bundle size
        uses: birchill/good-bundle@v1
        if: startsWith(github.ref, 'refs/pull')
        with:
          action: compare
          bucket: myapp-stats
          dest: bundle-stats
          region: ap-northeast-1
          awsAccessKey: ${{ secrets.AWS_ACCESS_KEY_ID }}
          awsSecretAccessKey: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

You can set the secret environment variables as follows:

1.  Go to your repository on GitHub.
1.  Settings
1.  Secrets
1.  New Secret

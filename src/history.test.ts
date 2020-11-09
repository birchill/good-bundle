import * as fs from 'fs';
import * as path from 'path';
import { Readable } from 'stream';

import { fetchPreviousRun } from './history';

describe('fetchPreviousRun', () => {
  const DEST_FILE = path.join(__dirname, 'testfile');

  afterEach(() => {
    fs.unlinkSync(DEST_FILE);
  });

  test('reads a CSV file', async () => {
    const stream = Readable.from([
      `project,branch,changeset,message,author,avatar,baseRevision,compare,timestamp,date,name,size,compressedSize,statsUrl,reportUrl
myproject,main,53c1f854b4f84352c36e93ddbe81e3d42faffc36,Patch 1,authorA,https://avatars1.githubusercontent.com/u/1234,,https://github.com/myorg/myproject/compare/e0f0ef04f438...53c1f854b4f8,1602839157000,2020-10-16T09:05:57.000Z,myproject.js,182310,50231,https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/53c1f854b4f84352c36e93ddbe81e3d42faffc36-stats.json,
myproject,main,21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8,Patch 2,authorB,https://avatars1.githubusercontent.com/u/1235,53c1f854b4f84352c36e93ddbe81e3d42faffc36,https://github.com/myorg/myproject/compare/53c1f854b4f8...21b00f78c20f,1602840593000,2020-10-16T09:29:53.000Z,myproject.js,182310,50231,https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8-stats.json,
myproject,main,3549a13f4f639d95b600337d5e3c760e7a7d0097,Patch 3,authorA,https://avatars1.githubusercontent.com/u/1234,21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8,https://github.com/myorg/myproject/compare/21b00f78c20f...3549a13f4f63,1602840701000,2020-10-16T09:31:41.000Z,myproject.js,182310,50253,https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/3549a13f4f639d95b600337d5e3c760e7a7d0097-stats.json,
myproject,main,64ba100160713350a85d09a4a4477c844a746aff,Patch 4,authorB,https://avatars1.githubusercontent.com/u/1235,3549a13f4f639d95b600337d5e3c760e7a7d0097,https://github.com/myorg/myproject/compare/3549a13f4f63...64ba10016071,1602840837000,2020-10-16T09:33:57.000Z,myproject.js,182310,50253,https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/64ba100160713350a85d09a4a4477c844a746aff-stats.json,`,
    ]);

    const result = await fetchPreviousRun({
      stream,
      format: 'csv',
      destFile: DEST_FILE,
      changeset: '3549a13f4f639d95b600337d5e3c760e7a7d0097',
    });

    expect(result).toMatchObject({
      'myproject.js': {
        size: 182310,
        compressedSize: 50253,
        statsUrl:
          'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/3549a13f4f639d95b600337d5e3c760e7a7d0097-stats.json',
      },
    });
    expect(fs.existsSync(DEST_FILE)).toEqual(true);
  });

  test('reads a JSON file', async () => {
    const stream = Readable.from([
      JSON.stringify([
        {
          project: 'myproject',
          branch: 'main',
          changeset: '53c1f854b4f84352c36e93ddbe81e3d42faffc36',
          message: 'Patch 1',
          author: 'authorA',
          avatar: 'https://avatars1.githubusercontent.com/u/1234',
          baseRevision: '',
          compare:
            'https://github.com/myorg/myproject/compare/e0f0ef04f438...53c1f854b4f8',
          timestamp: 1602839157000,
          date: '2020-10-16T09:05:57.000Z',
          assets: [
            {
              name: 'myproject.js',
              size: 182310,
              compressedSize: 50231,
            },
          ],
          statsUrl:
            'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/53c1f854b4f84352c36e93ddbe81e3d42faffc36-stats.json',
          reportUrl: '',
        },
        {
          project: 'myproject',
          branch: 'main',
          changeset: '21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8',
          message: 'Patch 2',
          author: 'authorB',
          avatar: 'https://avatars1.githubusercontent.com/u/1235',
          baseRevision: '53c1f854b4f84352c36e93ddbe81e3d42faffc36',
          compare:
            'https://github.com/myorg/myproject/compare/53c1f854b4f8...21b00f78c20f',
          timestamp: 1602840593000,
          date: '2020-10-16T09:29:53.000Z',
          assets: [
            { name: 'myproject.js', size: 182310, compressedSize: 50231 },
          ],
          statsUrl:
            'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8-stats.json',
          reportUrl: '',
        },
        {
          project: 'myproject',
          branch: 'main',
          changeset: '3549a13f4f639d95b600337d5e3c760e7a7d0097',
          message: 'Patch 3',
          author: 'authorA',
          avatar: 'https://avatars1.githubusercontent.com/u/1234',
          baseRevision: '21b00f78c20fa7eb7721ff5dfbfca6fbd6d01ab8',
          compare:
            'https://github.com/myorg/myproject/compare/21b00f78c20f...3549a13f4f63',
          timestamp: 1602840701000,
          date: '2020-10-16T09:31:41.000Z',
          assets: [
            {
              name: 'myproject.js',
              size: 182310,
              compressedSize: 50253,
            },
          ],
          statsUrl:
            'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/3549a13f4f639d95b600337d5e3c760e7a7d0097-stats.json',
          reportUrl: '',
        },
        {
          project: 'myproject',
          branch: 'main',
          changeset: '64ba100160713350a85d09a4a4477c844a746aff',
          message: 'Patch 4',
          author: 'authorB',
          avatar: 'https://avatars1.githubusercontent.com/u/1235',
          baseRevision: '3549a13f4f639d95b600337d5e3c760e7a7d0097',
          compare:
            'https://github.com/myorg/myproject/compare/3549a13f4f63...64ba10016071',
          timestamp: 1602840837000,
          date: '2020-10-16T09:33:57.000Z',
          assets: [
            { name: 'myproject.js', size: 182310, compressedSize: 50253 },
          ],
          statsUrl:
            'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/64ba100160713350a85d09a4a4477c844a746aff-stats.json',
          reportUrl: '',
        },
      ]),
    ]);

    const result = await fetchPreviousRun({
      stream,
      format: 'json',
      destFile: DEST_FILE,
      changeset: '3549a13f4f639d95b600337d5e3c760e7a7d0097',
    });

    expect(result).toMatchObject({
      'myproject.js': {
        size: 182310,
        compressedSize: 50253,
        statsUrl:
          'https://bundlesize-stack-bundlestatsbucket-yer.s3-us-west-2.amazonaws.com/myproject/3549a13f4f639d95b600337d5e3c760e7a7d0097-stats.json',
      },
    });
    expect(fs.existsSync(DEST_FILE)).toEqual(true);
  });
});

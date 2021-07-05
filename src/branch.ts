export function getBranch(): string {
  console.log('getBranch');
  console.log(`  GITHUB_REF: ${process.env.GITHUB_REF}`);
  console.log(`  GITHUB_HEAD_REF: ${process.env.GITHUB_HEAD_REF}`);
  console.log(`  GITHUB_BASE_REF: ${process.env.GITHUB_BASE_REF}`);

  const githubRef = process.env.GITHUB_REF;
  if (!githubRef) {
    return '';
  }

  // Pushes generally have refs/heads/<branch>
  if (githubRef.startsWith('refs/heads/')) {
    console.log(`  ...Returning ${githubRef.slice('refs/heads/'.length)}`);
    return githubRef.slice('refs/heads/'.length);
  }

  // Pull requests will normally look like refs/pulls/17/merge etc. but
  // will set the GITHUB_BASE_REF to the target branch.
  if (githubRef.startsWith('refs/pulls') && process.env.GITHUB_BASE_REF) {
    console.log(`  ...Returning ${process.env.GITHUB_BASE_REF}`);
    return process.env.GITHUB_BASE_REF;
  }

  console.log('Failed to find branch name');
  console.log(`  GITHUB_REF: ${githubRef}`);
  console.log(`  GITHUB_HEAD_REF: ${process.env.GITHUB_HEAD_REF}`);
  console.log(`  GITHUB_BASE_REF: ${process.env.GITHUB_BASE_REF}`);

  return '';
}

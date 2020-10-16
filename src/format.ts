export function formatBytes(bytes: number, decimals = 2): string {
  if (bytes === 0) {
    return '0 Bytes';
  }

  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB', 'ZB', 'YB'];

  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Rounds to 1 decimal place, but only if necessary
export function niceRound(num: number): number {
  return Math.round((num + Number.EPSILON) * 10) / 10;
}

export function green(str: string): string {
  return `\u001b[32m${str}\u001b[0m`;
}

export function red(str: string): string {
  return `\u001b[31m${str}\u001b[0m`;
}

export function serializeCsv(input: Array<string | number>): string {
  let result = '';

  for (const item of input) {
    if (result) {
      result += ',';
    }

    if (typeof item === 'number') {
      result += item;
    } else if (item.includes('"') || item.includes(',')) {
      result += `"${item.replace(/"/g, '""')}"`;
    } else {
      result += item;
    }
  }

  return result;
}

export function normalize(name: string): string {
  return name
    .toLowerCase()
    .replace(/[.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isMatch(found: string, expected: string): boolean {
  const a = normalize(found);
  const b = normalize(expected);
  return a === b || a.includes(b) || b.includes(a);
}

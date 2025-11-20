/**
 * Safely quote a string for use in a POSIX shell command.
 * Wraps the value in single quotes and escapes existing single quotes.
 */
export function shellQuote(value: string): string {
  if (value.length === 0) {
    return "''";
  }

  return `'${value.replace(/'/g, `'\\''`)}'`;
}

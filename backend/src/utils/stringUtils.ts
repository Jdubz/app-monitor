const WORD_START_REGEX = /(^|[^A-Za-z0-9]+)([A-Za-z0-9])/g;

/**
 * Convert a string to Title Case.
 * Words are delimited by any non-alphanumeric character.
 */
export function toTitleCase(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .toLowerCase()
    .replace(WORD_START_REGEX, (_match, separator: string, char: string) => {
      return `${separator}${char.toUpperCase()}`;
    });
}

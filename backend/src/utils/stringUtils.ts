const WORD_START_REGEX = /(^|[^\p{L}\p{N}]+)([\p{L}\p{N}])/gu;
const REGEX_SPECIAL_CHARS = /[.*+?^${}()|[\]\\]/g;

/**
 * Convert a string to Title Case.
 * Words are delimited by any non-alphanumeric character.
 */
export function toTitleCase(value: string): string {
  if (!value) {
    return '';
  }

  return value
    .toLocaleLowerCase()
    .replace(WORD_START_REGEX, (_match, separator: string, char: string) => {
      const safeSeparator = separator ?? '';
      const nextChar = char ? char.toLocaleUpperCase() : '';
      return `${safeSeparator}${nextChar}`;
    });
}

export function escapeRegExp(value: string): string {
  if (value.length === 0) {
    return '';
  }
  return value.replace(REGEX_SPECIAL_CHARS, '\\$&');
}

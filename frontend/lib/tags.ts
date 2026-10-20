// Pure functions for sanitizing, deduplicating, and limiting tag lists

// Cleans an array of raw tag strings
// Trims whitespace, drops empty strings, removes duplicates ignoring case,
// limits length of each tag to 40 characters, and limits the total list to 10 tags
export function sanitizeTags(tags: string[]): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  for (const rawTag of tags) {
    const trimmed = rawTag.trim();
    if (!trimmed) {
      continue;
    }

    const capped = trimmed.slice(0, 40);
    const lower = capped.toLowerCase();

    if (!seen.has(lower)) {
      seen.add(lower);
      result.push(capped);
    }

    if (result.length >= 10) {
      break;
    }
  }

  return result;
}

// Parses raw user input (for instance comma-separated strings or typed tokens)
export function parseTagInput(input: string): string[] {
  const pieces = input.split(",");
  return sanitizeTags(pieces);
}

const uuidPattern =
  '[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}';

/** Keeps internal record identifiers and run-on inline bullets out of the UI. */
export function userFacingAiText(value: string) {
  const normalized = value
    .replace(/[\u2010-\u2015\u2212]/g, '-')
    .replace(/[\u00a0\u202f]/g, ' ')
    .replace(/\s*<br\s*\/?\s*>\s*/gi, '\n');
  const uuidList = new RegExp(
    `\\s*\\((?:IDs?|record IDs?)\\s*:?\\s*${uuidPattern}(?:\\s*,\\s*${uuidPattern})*\\)`,
    'gi',
  );
  const uuid = new RegExp(uuidPattern, 'gi');
  return normalized
    .replace(uuidList, '')
    .replace(uuid, '')
    .replace(/\(\s*(?:IDs?|record IDs?)?\s*\)/gi, '')
    .replace(/\s+•\s+/g, '\n- ')
    .replace(/^\s*•\s+/gm, '- ')
    .replace(/\s+\|\s*$/gm, '')
    .replace(/,\s*,/g, ',')
    .replace(/\(\s*,/g, '(')
    .replace(/[ \t]+\n/g, '\n')
    .trim();
}

/**
 * Removes a redundant unit prefix from a topic label for display and imports.
 * Example: unit "APIs and deployment" plus topic
 * "APIs and deployment: guided practice" becomes "Guided practice".
 */
export function topicDisplayTitle(title: string, unitTitle?: string | null) {
  const normalizedTitle = normalize(title);
  const normalizedUnit = unitTitle ? normalize(unitTitle) : '';
  if (!normalizedUnit) return normalizedTitle;

  const prefix = normalizedTitle.slice(0, normalizedUnit.length);
  if (
    prefix.toLocaleLowerCase('en-US') !==
    normalizedUnit.toLocaleLowerCase('en-US')
  )
    return normalizedTitle;

  const remainder = normalizedTitle.slice(normalizedUnit.length);
  const separator = remainder.match(/^\s*(?::|[-–—·])\s*/u);
  if (!separator) return normalizedTitle;
  const compact = remainder.slice(separator[0].length).trim();
  return compact ? sentenceCase(compact) : normalizedTitle;
}

function normalize(value: string) {
  return value.trim().replace(/\s+/g, ' ');
}

function sentenceCase(value: string) {
  return value.charAt(0).toLocaleUpperCase('en-US') + value.slice(1);
}

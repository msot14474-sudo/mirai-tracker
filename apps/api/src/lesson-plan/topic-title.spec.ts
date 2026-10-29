import { topicDisplayTitle } from './topic-title';

describe('topicDisplayTitle', () => {
  it('removes a repeated unit prefix and preserves the useful topic label', () => {
    expect(
      topicDisplayTitle(
        'APIs and deployment: guided practice',
        'APIs and deployment',
      ),
    ).toBe('Guided practice');
    expect(topicDisplayTitle('Arrays — traversal', 'Arrays')).toBe('Traversal');
  });

  it('does not remove meaningful text without a unit separator', () => {
    expect(topicDisplayTitle('Arrays and traversal', 'Arrays')).toBe(
      'Arrays and traversal',
    );
    expect(topicDisplayTitle('HTTP: request lifecycle', 'APIs')).toBe(
      'HTTP: request lifecycle',
    );
  });

  it('trims inconsistent whitespace without requiring a unit', () => {
    expect(topicDisplayTitle('  Query   planning  ')).toBe('Query planning');
  });
});

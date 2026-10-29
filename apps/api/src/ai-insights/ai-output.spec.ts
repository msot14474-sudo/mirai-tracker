import { userFacingAiText } from './ai-output';

describe('userFacingAiText', () => {
  it('removes internal UUID lists and separates inline bullets', () => {
    const result = userFacingAiText(
      '• 4 overdue topics (IDs 6dcd0c2b-c797-4c5d-b3ae-256e0ec17444, 1e42b473-758a-4dce-aa3f-240f4b552c8e) • 6 classes without logs • 16h available',
    );
    expect(result).toBe(
      '- 4 overdue topics\n- 6 classes without logs\n- 16h available',
    );
    expect(result).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}/i);
  });

  it('cleans saved replies containing non-breaking spacing and hyphens', () => {
    const result = userFacingAiText(
      '4 overdue topics (IDs\u202f6cdc0c2b‑c797‑4c5d‑b3ae‑256e0ec17444) <br>• 6 scheduled classes without logs <br>• 16\u202fh available |',
    );

    expect(result).toBe(
      '4 overdue topics\n- 6 scheduled classes without logs\n- 16 h available',
    );
  });
});

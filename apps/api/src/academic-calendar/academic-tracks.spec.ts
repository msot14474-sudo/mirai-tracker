import { requireAcademicTrack, trackCodeSchema } from './academic-tracks';
import { academicTrackIdentity } from '@mirai/calculations';
describe('subject tracks within a batch', () => {
  it('accepts only the two tracks, normalizes old suffixes and rejects conflicting labels', () => {
    expect(requireAcademicTrack('mirai', 'Mirai Track').code).toBe('MIRAI');
    expect(requireAcademicTrack('UNIVERSITY', 'University').code).toBe(
      'UNIVERSITY',
    );
    expect(trackCodeSchema.parse('University track')).toBe('UNIVERSITY');
    expect(() => requireAcademicTrack('CS', 'Computer Science')).toThrow(
      'Mirai or University',
    );
    expect(() => requireAcademicTrack('MIRAI', 'University')).toThrow(
      'must match',
    );
    expect(academicTrackIdentity(null).name).toBe('Track not assigned');
  });
});

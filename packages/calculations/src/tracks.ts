export const academicTracks = [
  { id: 'MIRAI', code: 'MIRAI', name: 'Mirai' },
  { id: 'UNIVERSITY', code: 'UNIVERSITY', name: 'University' },
] as const;
export type AcademicTrackCode = (typeof academicTracks)[number]['code'];
export function parseAcademicTrack(value: string | null | undefined) {
  const key = value?.trim().toLowerCase().replace(/[ _-]/g, '');
  return academicTracks.find(
    (t) =>
      key === t.code.toLowerCase() || key === `${t.code.toLowerCase()}track`,
  );
}
export function academicTrackIdentity(code: string | null | undefined) {
  return (
    parseAcademicTrack(code) ?? {
      id: 'UNASSIGNED',
      code: 'UNASSIGNED',
      name: 'Track not assigned',
    }
  );
}

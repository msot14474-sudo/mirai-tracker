import { academicTracks } from './tracks';
export function TrackSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      Subject track
      <select
        name="trackCode"
        aria-label="Subject track"
        required
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Choose a track</option>
        {academicTracks.map((t) => (
          <option key={t.code} value={t.code}>
            {t.name}
          </option>
        ))}
      </select>
    </label>
  );
}

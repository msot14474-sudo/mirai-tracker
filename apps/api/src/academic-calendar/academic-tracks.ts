import { BadRequestException } from '@nestjs/common';
import { parseAcademicTrack } from '@mirai/calculations';
import { z } from 'zod';
export const trackCodeSchema = z.string().transform((value, ctx) => {
  const track = parseAcademicTrack(value);
  if (!track) {
    ctx.addIssue({
      code: 'custom',
      message: 'Choose Mirai or University as the track.',
    });
    return z.NEVER;
  }
  return track.code;
});
export function requireAcademicTrack(code?: string, name?: string) {
  const track = parseAcademicTrack(code ?? name);
  if (!track || (name && parseAcademicTrack(name)?.code !== track.code))
    throw new BadRequestException(
      'Choose Mirai or University as the subject track. Track name and code must match.',
    );
  return track;
}

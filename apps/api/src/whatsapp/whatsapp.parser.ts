import { BadRequestException } from '@nestjs/common';
import { createHmac, timingSafeEqual } from 'node:crypto';
export function validSignature(
  raw: Buffer | undefined,
  signature: string | undefined,
  secret: string | undefined,
) {
  if (!raw || !secret || !signature || !/^sha256=[a-f0-9]{64}$/.test(signature))
    return false;
  return timingSafeEqual(
    Buffer.from(signature.slice(7), 'hex'),
    createHmac('sha256', secret).update(raw).digest(),
  );
}
export function phoneNumber(value: string) {
  const phone = value.replace(/[+\s()-]/g, '');
  if (!/^[1-9]\d{6,14}$/.test(phone))
    throw new BadRequestException(
      'Enter a phone number with country code, for example +91 followed by your number.',
    );
  return phone;
}

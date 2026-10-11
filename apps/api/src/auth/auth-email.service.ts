import { Injectable } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

@Injectable()
export class AuthEmailService {
  private readonly transporter: Transporter;

  constructor() {
    const username = process.env.SMTP_USERNAME;
    const password = process.env.SMTP_PASSWORD;
    this.transporter = createTransport({
      host: process.env.SMTP_HOST ?? 'localhost',
      port: Number(process.env.SMTP_PORT ?? 1025),
      secure: process.env.SMTP_SECURE === 'true',
      auth:
        username && password ? { user: username, pass: password } : undefined,
    });
  }

  async sendLoginOtp(input: {
    recipientEmail: string;
    recipientName: string;
    code: string;
    expiresInMinutes: number;
  }) {
    return this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'notifications@mirai.local',
      to: input.recipientEmail,
      subject: 'Your Mirai Tracker verification code',
      text: [
        `Hello ${input.recipientName},`,
        '',
        `Your Mirai Tracker verification code is ${input.code}.`,
        `It expires in ${input.expiresInMinutes} minutes.`,
        '',
        'If you did not try to sign in, you can ignore this message.',
      ].join('\n'),
    });
  }

  async sendPasswordResetOtp(input: {
    recipientEmail: string;
    recipientName: string;
    code: string;
    expiresInMinutes: number;
  }) {
    return this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'notifications@mirai.local',
      to: input.recipientEmail,
      subject: 'Reset your Mirai Tracker password',
      text: [
        `Hello ${input.recipientName},`,
        '',
        `Your password reset code is ${input.code}.`,
        `It expires in ${input.expiresInMinutes} minutes.`,
        '',
        'If you did not request this change, you can ignore this message.',
      ].join('\n'),
    });
  }
}

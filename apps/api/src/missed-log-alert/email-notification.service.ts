import { Injectable } from '@nestjs/common';
import { createTransport, Transporter } from 'nodemailer';

export type MissedLogEmail = {
  recipientName: string;
  recipientEmail: string;
  kind: 'faculty-reminder' | 'manager-escalation';
  subjectCode: string;
  subjectName: string;
  batchName: string;
  sessionDate: string;
  startsAt: Date;
  campusTimezone: string;
};

@Injectable()
export class EmailNotificationService {
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

  async sendWeeklySummary(message: {
    id: string;
    recipientEmail: string;
    title: string;
    text: string;
  }) {
    return this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'notifications@mirai.local',
      to: message.recipientEmail,
      messageId: `<weekly-${message.id}@mirai-tracker.app>`,
      subject: message.title,
      text:
        message.text +
        '\n\nOpen Mirai Tracker → AI insights → Weekly summaries to review this summary.\n' +
        (process.env.WEB_ORIGIN ?? 'https://mirai-tracker.vercel.app'),
    });
  }

  async sendDeploymentTest(recipientEmail: string) {
    return this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'notifications@mirai.local',
      to: recipientEmail,
      subject: 'Mirai Tracker production email test',
      text: [
        'Mirai Tracker successfully sent this message through the configured production SMTP service.',
        '',
        `Verified at: ${new Date().toISOString()}`,
      ].join('\n'),
    });
  }

  async sendMissedLog(message: MissedLogEmail) {
    const manager = message.kind === 'manager-escalation';
    const title = manager
      ? `Escalation: ${message.subjectCode} class log is 48 hours overdue`
      : `Reminder: log the ${message.subjectCode} class from ${message.sessionDate}`;
    const classTime = new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: message.campusTimezone,
    }).format(message.startsAt);
    const instruction = manager
      ? 'The class log is still missing 48 hours after the scheduled class ended. Please follow up with the assigned faculty member.'
      : 'This scheduled class was not logged by the end of the campus day. Please add the class log as soon as possible.';
    const text = [
      `Hello ${message.recipientName},`,
      '',
      instruction,
      '',
      `Subject: ${message.subjectCode} — ${message.subjectName}`,
      `Batch: ${message.batchName}`,
      `Scheduled: ${classTime}`,
      '',
      'Open Mirai Tracker to review the session.',
    ].join('\n');

    return this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'notifications@mirai.local',
      to: message.recipientEmail,
      subject: title,
      text,
    });
  }
}

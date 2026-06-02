import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT'),
      secure: false,
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
  }

  async sendPasswordResetEmail(
    to: string,
    name: string,
    resetLink: string,
  ): Promise<void> {
    const from =
      this.config.get<string>('SMTP_FROM') ??
      'TestMaker <no-reply@testmaker.app>';
    await this.transporter.sendMail({
      from,
      to,
      subject: 'Reset your TestMaker password',
      html: `
        <div style="font-family:Inter,Arial,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px">
          <h2 style="font-size:20px;font-weight:700;color:#111218;margin:0 0 8px">Password Reset</h2>
          <p style="font-size:14px;color:#5C5E64;margin:0 0 24px">Hi ${name},</p>
          <p style="font-size:14px;color:#5C5E64;margin:0 0 24px">
            An administrator has requested a password reset for your account. Click the button below to set a new password.
            This link will expire in <strong>24 hours</strong>.
          </p>
          <a href="${resetLink}"
             style="display:inline-block;background:#0485F7;color:#fff;font-size:14px;font-weight:600;padding:12px 28px;border-radius:10px;text-decoration:none">
            Reset Password
          </a>
          <p style="font-size:12px;color:#8A8D96;margin:24px 0 0">
            If you didn't expect this email, you can safely ignore it.
          </p>
        </div>
      `,
    });
  }
}

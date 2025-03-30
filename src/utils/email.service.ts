// src/utils/email.service.ts
import logger from './logger';
import { env } from '@/config';

interface EmailOptions {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

const sendEmail = async (options: EmailOptions): Promise<boolean> => {
  // --- MOCK IMPLEMENTATION ---
  // In a real app, integrate with your email provider (SendGrid, Mailgun, etc.)
  // Check if email configuration is present
//   if (!env.SENDGRID_API_KEY || !env.EMAIL_FROM_ADDRESS) {
//      logger.error('Email Service Error: Missing SENDGRID_API_KEY or EMAIL_FROM_ADDRESS in environment variables. Cannot send email.');
//      return false;
//   }

  logger.info(`--- Mock Email Sent ---`);
  logger.info(`To: ${options.to}`);
  logger.info(`From: ${env.EMAIL_FROM_ADDRESS || 'mock-email@example.com'}`);
  logger.info(`Subject: ${options.subject}`);
  logger.info(`Text Body: ${options.text}`);
  if (options.html) {
      logger.info(`HTML Body: [HTML Content]`); // Don't log full HTML usually
  }
  logger.info(`-----------------------`);

  // Simulate success
  return true;

  // --- Example using SendGrid (install @sendgrid/mail) ---
  /*
  const sgMail = require('@sendgrid/mail');
  sgMail.setApiKey(env.SENDGRID_API_KEY);
  const msg = {
      to: options.to,
      from: env.EMAIL_FROM_ADDRESS, // Use the verified sender
      subject: options.subject,
      text: options.text,
      html: options.html,
  };
  try {
      await sgMail.send(msg);
      logger.info(`Email successfully sent to ${options.to} with subject "${options.subject}"`);
      return true;
  } catch (error: any) {
      logger.error(`Email Service Error sending to ${options.to}:`, error.response?.body || error);
      return false;
  }
  */
};

export const emailService = {
  sendEmail,
};

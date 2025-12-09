/**
 * Email Notification Channel
 * 
 * Sends notifications via email using tenant's SMTP configuration.
 */

import { NotificationChannel } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';
import {
    INotificationChannel,
    NotificationPayload,
    NotificationResult,
} from '../notification.types';
import emailService from '../email.service';

export class EmailChannel implements INotificationChannel {
    readonly channel = NotificationChannel.EMAIL;

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        try {
            // Get recipient(s)
            let recipients: string[] = [];

            if (payload.userId) {
                // Get specific user's email
                const user = await prisma.user.findUnique({
                    where: { id: payload.userId },
                    select: { email: true },
                });
                if (user?.email) {
                    recipients.push(user.email);
                }
            } else {
                // Broadcast to all users in tenant with email preference enabled
                const users = await prisma.user.findMany({
                    where: {
                        tenantId: payload.tenantId,
                        isActive: true,
                    },
                    select: { email: true },
                });
                recipients = users.map((u: { email: string }) => u.email);
            }

            if (recipients.length === 0) {
                logger.warn('No email recipients found', { payload });
                return {
                    success: false,
                    channel: this.channel,
                    error: 'No email recipients found',
                };
            }

            // Build email content
            const html = this.buildEmailHtml(payload);
            const text = `${payload.title}\n\n${payload.message}`;

            // Send email
            const result = await emailService.sendEmail(payload.tenantId, {
                to: recipients,
                subject: `[${payload.type}] ${payload.title}`,
                html,
                text,
            });

            if (result.success) {
                logger.info('Email notification sent', {
                    tenantId: payload.tenantId,
                    type: payload.type,
                    recipientCount: recipients.length,
                });
            }

            return {
                success: result.success,
                channel: this.channel,
                notificationId: result.messageId,
                error: result.error,
            };
        } catch (error: any) {
            logger.error('Failed to send email notification', {
                error: error.message,
                payload,
            });
            return {
                success: false,
                channel: this.channel,
                error: error.message,
            };
        }
    }

    async isConfigured(tenantId: string): Promise<boolean> {
        const smtp = await emailService.getTenantSmtpConfig(tenantId);
        return smtp !== null;
    }

    /**
     * Build HTML email template
     */
    private buildEmailHtml(payload: NotificationPayload): string {
        const priorityColors = {
            LOW: '#6b7280',
            NORMAL: '#3b82f6',
            HIGH: '#f59e0b',
            URGENT: '#ef4444',
        };

        const color = priorityColors[payload.priority || 'NORMAL'];

        return `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { border-left: 4px solid ${color}; padding-left: 16px; margin-bottom: 20px; }
        .type-badge { display: inline-block; padding: 4px 12px; background: ${color}; color: white; border-radius: 4px; font-size: 12px; text-transform: uppercase; }
        .title { font-size: 20px; font-weight: 600; margin: 12px 0 8px 0; }
        .message { font-size: 16px; color: #4b5563; }
        .data { margin-top: 20px; padding: 16px; background: #f3f4f6; border-radius: 8px; }
        .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <span class="type-badge">${payload.type.replace(/_/g, ' ')}</span>
            <h1 class="title">${this.escapeHtml(payload.title)}</h1>
            <p class="message">${this.escapeHtml(payload.message)}</p>
        </div>
        
        ${payload.data && Object.keys(payload.data).length > 0 ? `
        <div class="data">
            <strong>Details:</strong><br>
            ${Object.entries(payload.data)
                    .map(([key, value]) => `${key}: ${value}`)
                    .join('<br>')}
        </div>
        ` : ''}
        
        <div class="footer">
            This is an automated notification from InvePro.
        </div>
    </div>
</body>
</html>
        `;
    }

    private escapeHtml(text: string): string {
        return text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }
}

export const emailChannel = new EmailChannel();

/**
 * SMS Notification Channel (Stub)
 * 
 * This is a stub implementation. To enable SMS notifications:
 * 1. Install SMS provider SDK (e.g., npm install twilio)
 * 2. Configure SMS settings in tenant configuration
 * 3. Implement the send() method with actual SMS sending logic
 */

import { NotificationChannel } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';
import {
    INotificationChannel,
    NotificationPayload,
    NotificationResult,
    TenantNotificationConfig,
} from '../notification.types';

export class SmsChannel implements INotificationChannel {
    readonly channel = NotificationChannel.SMS;

    async send(payload: NotificationPayload): Promise<NotificationResult> {
        // Check if SMS is configured
        const isConfigured = await this.isConfigured(payload.tenantId);

        if (!isConfigured) {
            logger.warn('SMS not configured for tenant', { tenantId: payload.tenantId });
            return {
                success: false,
                channel: this.channel,
                error: 'SMS not configured. Please configure SMS settings in tenant configuration.',
            };
        }

        // TODO: Implement actual SMS sending
        // Example implementation with Twilio:
        // const smsConfig = await this.getSmsConfig(payload.tenantId);
        // const client = require('twilio')(smsConfig.accountSid, smsConfig.authToken);
        // await client.messages.create({
        //     body: `${payload.title}: ${payload.message}`,
        //     from: smsConfig.fromNumber,
        //     to: userPhoneNumber,
        // });

        logger.info('SMS notification (stub) - would send', {
            tenantId: payload.tenantId,
            type: payload.type,
            title: payload.title,
        });

        return {
            success: false,
            channel: this.channel,
            error: 'SMS channel is not yet implemented. Contact your administrator to enable SMS notifications.',
        };
    }

    async isConfigured(tenantId: string): Promise<boolean> {
        try {
            const tenant = await prisma.tenant.findUnique({
                where: { id: tenantId },
                select: { configuration: true },
            });

            if (!tenant?.configuration) return false;

            const config = tenant.configuration as TenantNotificationConfig;
            const sms = config.sms;

            // Check minimum required fields based on provider
            if (!sms?.provider) return false;

            switch (sms.provider) {
                case 'twilio':
                    return !!(sms.accountSid && sms.authToken && sms.fromNumber);
                case 'africastalking':
                    return !!(sms.apiKey && sms.username);
                default:
                    return false;
            }
        } catch (error) {
            logger.error('Error checking SMS config', { tenantId, error });
            return false;
        }
    }

    /**
     * Get SMS configuration from tenant
     * Uncomment when implementing actual SMS sending
     */
    // private async getSmsConfig(tenantId: string): Promise<SmsConfig | null> {
    //     try {
    //         const tenant = await prisma.tenant.findUnique({
    //             where: { id: tenantId },
    //             select: { configuration: true },
    //         });

    //         if (!tenant?.configuration) return null;

    //         const config = tenant.configuration as TenantNotificationConfig;
    //         return config.sms || null;
    //     } catch (error) {
    //         return null;
    //     }
    // }
}

export const smsChannel = new SmsChannel();

/**
 * Notification System - Types and Interfaces
 * 
 * This module provides a pluggable notification architecture that supports
 * multiple channels (In-App, Email, SMS) via the Strategy pattern.
 */

import { AlertType, NotificationChannel, NotificationPriority } from '@prisma/client';

// Re-export Prisma types for convenience
export { AlertType, NotificationChannel, NotificationPriority };

/**
 * Payload for creating a notification
 */
export interface NotificationPayload {
    tenantId: string;
    userId?: string;              // Null = broadcast to all users with matching preferences
    locationId?: string;          // Optional location context
    type: AlertType;
    priority?: NotificationPriority;
    title: string;
    message: string;
    data?: Record<string, any>;   // Additional structured data
    dedupeKey?: string;           // Prevents duplicate notifications
    expiresAt?: Date;             // Optional expiration
}

/**
 * Result of sending a notification
 */
export interface NotificationResult {
    success: boolean;
    channel: NotificationChannel;
    notificationId?: string;
    error?: string;
}

/**
 * Strategy Pattern Interface for notification channels
 * Implement this interface to add new notification channels (Email, SMS, Push, etc.)
 */
export interface INotificationChannel {
    readonly channel: NotificationChannel;

    /**
     * Send a notification through this channel
     */
    send(payload: NotificationPayload): Promise<NotificationResult>;

    /**
     * Check if channel is properly configured and ready to send
     */
    isConfigured(tenantId: string): Promise<boolean>;
}

/**
 * SMTP Configuration for email notifications
 */
export interface SmtpConfig {
    host: string;
    port: number;
    secure: boolean;          // true for 465, false for other ports
    auth: {
        user: string;
        pass: string;
    };
    from: string;             // Default sender email
    fromName?: string;        // Default sender name
}

/**
 * Email notification options
 */
export interface EmailOptions {
    to: string | string[];
    subject: string;
    html?: string;
    text?: string;
    replyTo?: string;
}

/**
 * SMS Configuration 
 */
export interface SmsConfig {
    provider: 'twilio' | 'africastalking' | 'other';
    accountSid?: string;
    authToken?: string;
    fromNumber?: string;
    apiKey?: string;          // For Africa's Talking or other providers
    username?: string;        // For Africa's Talking
}

/**
 * Tenant notification settings stored in tenant.configuration
 */
export interface TenantNotificationConfig {
    smtp?: SmtpConfig;
    sms?: SmsConfig;
    enabledChannels?: NotificationChannel[];
    lowStockAlerts?: {
        enabled: boolean;
        emailRecipients?: string[];      // Additional email recipients beyond user preferences
        checkIntervalMinutes?: number;    // How often to check for low stock (for scheduled jobs)
    };
}

/**
 * Notification with full relations (from database)
 */
export interface NotificationWithRelations {
    id: string;
    tenantId: string;
    userId: string | null;
    locationId: string | null;
    type: AlertType;
    priority: NotificationPriority;
    title: string;
    message: string;
    data: Record<string, any> | null;
    isRead: boolean;
    readAt: Date | null;
    dedupeKey: string | null;
    createdAt: Date;
    expiresAt: Date | null;
}

/**
 * Query options for fetching notifications
 */
export interface NotificationQueryOptions {
    userId?: string;
    tenantId: string;
    unreadOnly?: boolean;
    types?: AlertType[];
    limit?: number;
    offset?: number;
}

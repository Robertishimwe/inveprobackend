/**
 * Email Service - Reusable SMTP Email Sender
 * 
 * This service provides email functionality for the entire application.
 * It can be used by the notification system or any other feature needing email.
 */

import nodemailer, { Transporter } from 'nodemailer';
import { SmtpConfig, EmailOptions } from './notification.types';
import { prisma } from '@/config';
import logger from '@/utils/logger';

// Cache transporters by tenant to avoid recreating them
const transporterCache = new Map<string, { transporter: Transporter; createdAt: number }>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Get SMTP configuration from tenant configuration
 */
export const getTenantSmtpConfig = async (tenantId: string): Promise<SmtpConfig | null> => {
    try {
        const tenant = await prisma.tenant.findUnique({
            where: { id: tenantId },
            select: { configuration: true },
        });

        if (!tenant?.configuration) return null;

        const config = tenant.configuration as Record<string, any>;
        const smtp = config.smtp as SmtpConfig | undefined;

        // Validate minimum required fields
        if (!smtp?.host || !smtp?.port || !smtp?.auth?.user || !smtp?.auth?.pass || !smtp?.from) {
            return null;
        }

        return smtp;
    } catch (error) {
        logger.error('Error fetching SMTP config', { tenantId, error });
        return null;
    }
};

/**
 * Create or get cached nodemailer transporter for a tenant
 */
const getTransporter = async (tenantId: string, smtp: SmtpConfig): Promise<Transporter> => {
    const cacheKey = `${tenantId}:${smtp.host}:${smtp.port}:${smtp.secure}`;
    const cached = transporterCache.get(cacheKey);

    // Return cached transporter if still valid
    if (cached && Date.now() - cached.createdAt < CACHE_TTL_MS) {
        return cached.transporter;
    }

    // Determine if we should use secure connection
    const isSecure = smtp.secure ?? smtp.port === 465;

    // Create new transporter with improved settings
    const transporter = nodemailer.createTransport({
        host: smtp.host,
        port: smtp.port,
        secure: isSecure, // true for 465, false for other ports (will use STARTTLS)
        auth: {
            user: smtp.auth.user,
            pass: smtp.auth.pass,
        },
        connectionTimeout: 30000, // 30 seconds
        greetingTimeout: 30000,   // 30 seconds for greeting
        socketTimeout: 30000,     // 30 seconds socket timeout
        tls: {
            // For secure connections, use proper TLS
            rejectUnauthorized: false, // Allow self-signed certs
            minVersion: 'TLSv1.2',
        },
        // Enable debug logging
        logger: false,
        debug: false,
    });

    // Cache the transporter
    transporterCache.set(cacheKey, {
        transporter,
        createdAt: Date.now(),
    });

    logger.info('Created new email transporter', {
        tenantId,
        host: smtp.host,
        port: smtp.port,
        secure: isSecure
    });
    return transporter;
};

/**
 * Send an email using tenant's SMTP configuration
 */
export const sendEmail = async (
    tenantId: string,
    options: EmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    try {
        // Get tenant SMTP config
        const smtp = await getTenantSmtpConfig(tenantId);

        if (!smtp) {
            logger.warn('SMTP not configured for tenant', { tenantId });
            return { success: false, error: 'SMTP not configured' };
        }

        const transporter = await getTransporter(tenantId, smtp);

        // Build email message
        const mailOptions = {
            from: smtp.fromName
                ? `"${smtp.fromName}" <${smtp.from}>`
                : smtp.from,
            to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
            replyTo: options.replyTo,
        };

        // Send email
        const info = await transporter.sendMail(mailOptions);

        logger.info('Email sent successfully', {
            tenantId,
            messageId: info.messageId,
            to: options.to,
        });

        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        logger.error('Failed to send email', { tenantId, error: error.message });
        return { success: false, error: error.message };
    }
};

/**
 * Verify SMTP connection
 */
export const verifySmtpConnection = async (tenantId: string): Promise<{ success: boolean; error?: string }> => {
    try {
        const smtp = await getTenantSmtpConfig(tenantId);
        if (!smtp) return { success: false, error: 'SMTP not configured' };

        const transporter = await getTransporter(tenantId, smtp);
        await transporter.verify();

        logger.info('SMTP connection verified', { tenantId });
        return { success: true };
    } catch (error: any) {
        const errorMessage = error.message || 'Unknown SMTP error';
        logger.error('SMTP verification failed', {
            tenantId,
            error: errorMessage,
            code: error.code,
            command: error.command,
        });
        return { success: false, error: errorMessage };
    }
};

/**
 * Send email with custom SMTP config (for testing or one-off sends)
 */
export const sendEmailWithConfig = async (
    smtp: SmtpConfig,
    options: EmailOptions
): Promise<{ success: boolean; messageId?: string; error?: string }> => {
    try {
        const transporter = nodemailer.createTransport({
            host: smtp.host,
            port: smtp.port,
            secure: smtp.secure ?? smtp.port === 465,
            auth: {
                user: smtp.auth.user,
                pass: smtp.auth.pass,
            },
        });

        const mailOptions = {
            from: smtp.fromName
                ? `"${smtp.fromName}" <${smtp.from}>`
                : smtp.from,
            to: Array.isArray(options.to) ? options.to.join(', ') : options.to,
            subject: options.subject,
            html: options.html,
            text: options.text,
        };

        const info = await transporter.sendMail(mailOptions);
        return { success: true, messageId: info.messageId };
    } catch (error: any) {
        return { success: false, error: error.message };
    }
};

/**
 * Clear cached transporter for a tenant (call after config update)
 */
export const clearTransporterCache = (tenantId: string): void => {
    for (const key of transporterCache.keys()) {
        if (key.startsWith(`${tenantId}:`)) {
            transporterCache.delete(key);
        }
    }
    logger.info('Cleared email transporter cache', { tenantId });
};

export const emailService = {
    getTenantSmtpConfig,
    sendEmail,
    sendEmailWithConfig,
    verifySmtpConnection,
    clearTransporterCache,
};

export default emailService;

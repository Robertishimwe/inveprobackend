/**
 * Notification Recipients Helper
 * 
 * Resolves which users should receive notifications based on:
 * 1. Alert type settings (per-alert-type configuration)
 * 2. Role filtering (only certain roles receive alerts)
 * 3. Location filtering (only users assigned to that location, except Admin)
 */

import { AlertType } from '@prisma/client';
import { prisma } from '@/config';
import logger from '@/utils/logger';

export interface AlertChannelSettings {
    enabled: boolean;
    roles: string[];  // Empty = ALL roles
    locationFiltering: boolean;
}

export interface EligibleRecipient {
    userId: string;
    email: string;
    firstName: string;
    lastName: string;
}

// Default settings if not configured
const DEFAULT_CHANNEL_SETTINGS: AlertChannelSettings = {
    enabled: true,
    roles: [], // Empty = ALL roles
    locationFiltering: false,
};

/**
 * Get alert channel settings from tenant configuration
 */
export const getAlertChannelSettings = async (
    tenantId: string,
    alertType: AlertType,
    channel: 'inApp' | 'email'
): Promise<AlertChannelSettings> => {
    const tenant = await prisma.tenant.findUnique({
        where: { id: tenantId },
        select: { configuration: true },
    });

    if (!tenant?.configuration) {
        return DEFAULT_CHANNEL_SETTINGS;
    }

    const config = tenant.configuration as Record<string, any>;
    const alertSettings = config.alertSettings?.[alertType]?.[channel];

    if (!alertSettings) {
        return DEFAULT_CHANNEL_SETTINGS;
    }

    return {
        enabled: alertSettings.enabled ?? true,
        roles: alertSettings.roles ?? [],
        locationFiltering: alertSettings.locationFiltering ?? false,
    };
};

/**
 * Get eligible recipients for a notification based on alert settings
 * 
 * Logic:
 * 1. If channel is disabled, return empty array
 * 2. If no roles specified, include all active users
 * 3. Filter by role names if specified
 * 4. If locationFiltering is enabled:
 *    - Admin role: Skip location filter (sees all locations)
 *    - Other roles: Only users assigned to the specified location
 */
export const getEligibleRecipients = async (
    tenantId: string,
    alertType: AlertType,
    channel: 'inApp' | 'email',
    locationId?: string
): Promise<EligibleRecipient[]> => {
    const settings = await getAlertChannelSettings(tenantId, alertType, channel);

    // If channel is disabled, no recipients
    if (!settings.enabled) {
        logger.debug('Alert channel disabled', { tenantId, alertType, channel });
        return [];
    }

    // Build base query for active users in the tenant
    const whereClause: any = {
        tenantId,
        isActive: true,
    };

    // Role filtering
    const roleFilter: string[] = settings.roles;
    const filterByRole = roleFilter.length > 0;

    // Get all eligible users with their roles and location assignments
    const users = await prisma.user.findMany({
        where: whereClause,
        include: {
            roles: {
                include: {
                    role: {
                        select: {
                            name: true,
                        },
                    },
                },
            },
            locations: {
                select: {
                    locationId: true,
                },
            },
        },
    });

    // Filter users based on settings
    const eligibleRecipients: EligibleRecipient[] = [];

    for (const user of users) {
        // Get user's role names
        const userRoleNames = user.roles.map((ur: { role: { name: string } }) => ur.role.name);
        const isAdmin = userRoleNames.includes('Admin');

        // Role filtering: Check if user has any of the required roles
        if (filterByRole) {
            const hasRequiredRole = userRoleNames.some((roleName: string) => roleFilter.includes(roleName));
            if (!hasRequiredRole) {
                continue; // User doesn't have required role
            }
        }

        // Location filtering: Check if user is assigned to the location
        if (settings.locationFiltering && locationId) {
            // Admin role always sees all locations
            if (!isAdmin) {
                const userLocationIds = user.locations.map((loc: { locationId: string }) => loc.locationId);
                // If user has no location assignments, they don't see location-specific alerts
                if (userLocationIds.length === 0 || !userLocationIds.includes(locationId)) {
                    continue; // User not assigned to this location
                }
            }
            // Admin passes through without location filtering
        }

        // User is eligible
        eligibleRecipients.push({
            userId: user.id,
            email: user.email,
            firstName: user.firstName || '',
            lastName: user.lastName || '',
        });
    }

    logger.debug('Eligible notification recipients resolved', {
        tenantId,
        alertType,
        channel,
        locationId,
        settings,
        recipientCount: eligibleRecipients.length,
    });

    return eligibleRecipients;
};

export default {
    getAlertChannelSettings,
    getEligibleRecipients,
};


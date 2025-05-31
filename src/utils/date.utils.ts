// src/utils/date.utils.ts
import { startOfDay, endOfDay, startOfMonth, endOfMonth, startOfYear, endOfYear, formatISO, parseISO, subDays, subMonths, subYears, differenceInDays } from 'date-fns';
import logger from './logger'; // Ensure logger is correctly imported

/**
 * Defines the structure for a date range including its prior equivalent.
 */
export interface DateRangeWithPrior {
    currentRange: {
        start: Date;
        end: Date;
    };
    previousRange: {
        start: Date;
        end: Date;
    };
    periodLabel: string; // e.g., "Today", "This Week", "Last 30 Days"
}

/**
 * Calculates the start and end dates for a given period string (e.g., 'today', '7d', 'month')
 * and also calculates the corresponding previous period range for comparison.
 * If specific startDate and endDate are provided, it uses those and calculates the prior period based on duration.
 *
 * @param period - Optional period string ('today', 'yesterday', '7d', '30d', 'month', 'last_month', 'year', 'last_year', 'custom'). Defaults to 'today'.
 * @param startDateISO - Optional specific start date in ISO 8601 format string (YYYY-MM-DD). Used if period is 'custom'.
 * @param endDateISO - Optional specific end date in ISO 8601 format string (YYYY-MM-DD). Used if period is 'custom'.
 * @returns {DateRangeWithPrior} Object containing current and previous date ranges and a label.
 * @throws {Error} if date ranges cannot be determined after fallbacks.
 */
export function getDateRange(
    periodInput: string = 'today', // Use different name to avoid modifying inside
    startDateISO?: string | null,
    endDateISO?: string | null
): DateRangeWithPrior {
    const now = new Date(); // Use a single reference point for "now"
    let period = periodInput; // Allow modifying period for fallback

    // --- FIX: Initialize variables with a default (e.g., 'today') ---
    let currentStart: Date = startOfDay(now);
    let currentEnd: Date = endOfDay(now);
    let previousStart: Date = startOfDay(subDays(now, 1));
    let previousEnd: Date = endOfDay(subDays(now, 1));
    let periodLabel: string = 'Today'; // Default label
    // -------------------------------------------------------------

    let isCustomRangeValid = false; // Flag to track if custom range was successfully parsed

    // --- Attempt Custom Date Range ---
    if (period === 'custom' && startDateISO) {
        try {
            const parsedStart = startOfDay(parseISO(startDateISO));
            // If endDate is not provided or invalid, default it to the end of the startDate
            const parsedEnd = endDateISO ? endOfDay(parseISO(endDateISO)) : endOfDay(parsedStart);

            // Basic validation: end date should not be before start date
            if (parsedEnd < parsedStart) {
                 throw new Error('End date cannot be before start date.');
            }

            // Assign successfully parsed custom dates
            currentStart = parsedStart;
            currentEnd = parsedEnd;
            periodLabel = `Custom: ${formatISO(currentStart, { representation: 'date' })} - ${formatISO(currentEnd, { representation: 'date' })}`;

            // Calculate previous period based on the duration of the custom range
            const durationDays = differenceInDays(currentEnd, currentStart) + 1;
            previousEnd = endOfDay(subDays(currentStart, 1)); // Use endOfDay for consistency
            previousStart = startOfDay(subDays(previousEnd, durationDays - 1));

            isCustomRangeValid = true; // Mark custom range as successfully processed

        } catch (e: any) {
            logger.warn(`Invalid custom date range provided: Start='${startDateISO}', End='${endDateISO}'. Defaulting to 'today'.`, { error: e?.message || e });
            period = 'today'; // Fallback to default period if custom dates are invalid
            // Variables already initialized to 'today', so no need to re-assign here
            periodLabel = 'Today'; // Reset label
        }
    }

    // --- Handle Predefined Periods (only if not a valid custom range) ---
    if (!isCustomRangeValid) {
        switch (period) {
            case 'yesterday':
                currentStart = startOfDay(subDays(now, 1));
                currentEnd = endOfDay(subDays(now, 1));
                previousStart = startOfDay(subDays(now, 2));
                previousEnd = endOfDay(subDays(now, 2));
                periodLabel = 'Yesterday';
                break;
            case '7d':
                currentStart = startOfDay(subDays(now, 6));
                currentEnd = endOfDay(now);
                previousEnd = endOfDay(subDays(currentStart, 1)); // End of day before start
                previousStart = startOfDay(subDays(previousEnd, 6)); // Go back 6 more days
                periodLabel = 'Last 7 Days';
                break;
            case '30d':
                currentStart = startOfDay(subDays(now, 29));
                currentEnd = endOfDay(now);
                 previousEnd = endOfDay(subDays(currentStart, 1));
                 previousStart = startOfDay(subDays(previousEnd, 29));
                periodLabel = 'Last 30 Days';
                break;
            case 'month': // Current calendar month to date
                currentStart = startOfMonth(now);
                currentEnd = endOfDay(now);
                previousStart = startOfMonth(subMonths(now, 1));
                // Compare up to the equivalent day in the previous month
                 const endOfPrevMonth = endOfMonth(previousStart);
                 const potentialPrevEnd = subMonths(currentEnd,1);
                 previousEnd = potentialPrevEnd > endOfPrevMonth ? endOfPrevMonth : potentialPrevEnd;
                 periodLabel = 'This Month';
                break;
            case 'last_month': // Previous full calendar month
                 currentStart = startOfMonth(subMonths(now, 1));
                 currentEnd = endOfMonth(subMonths(now, 1));
                 previousStart = startOfMonth(subMonths(now, 2));
                 previousEnd = endOfMonth(subMonths(now, 2));
                 periodLabel = 'Last Month';
                 break;
            case 'year': // Current calendar year to date
                currentStart = startOfYear(now);
                currentEnd = endOfDay(now);
                previousStart = startOfYear(subYears(now, 1));
                previousEnd = endOfDay(subYears(now, 1)); // Compare same day last year
                periodLabel = 'This Year';
                break;
             case 'last_year': // Previous full calendar year
                 currentStart = startOfYear(subYears(now, 1));
                 currentEnd = endOfYear(subYears(now, 1));
                 previousStart = startOfYear(subYears(now, 2));
                 previousEnd = endOfYear(subYears(now, 2));
                 periodLabel = 'Last Year';
                 break;
            case 'today':
            default: // Default to 'today' if period is unrecognized or fallback occurred
                currentStart = startOfDay(now);
                currentEnd = endOfDay(now);
                previousStart = startOfDay(subDays(now, 1));
                previousEnd = endOfDay(subDays(now, 1));
                periodLabel = 'Today';
                break;
        }
    }

    // Final check (should theoretically not be needed due to initialization)
    // if (!currentStart || !currentEnd || !previousStart || !previousEnd) {
    //     logger.error("Internal Error: Failed to calculate date ranges despite initialization.", { period, startDateISO, endDateISO });
    //     throw new Error("Could not determine date ranges.");
    // }


    return {
        currentRange: { start: currentStart, end: currentEnd },
        previousRange: { start: previousStart, end: previousEnd },
        periodLabel: periodLabel
    };
}


// Optional: Add other date utility functions if needed
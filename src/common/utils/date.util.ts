import dayjs from 'dayjs';
import timezone from 'dayjs/plugin/timezone';
import utc from 'dayjs/plugin/utc';

dayjs.extend(utc);
dayjs.extend(timezone);

const TIMEZONE_TOKEN_REGEX = /(Z|[+-]\d{2}:?\d{2})$/i;
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_TIMEZONE =
  process.env.APPOINTMENTS_TIMEZONE ?? process.env.APP_TIMEZONE ?? process.env.TZ ?? 'America/Sao_Paulo';

/**
 * Converts an ISO-like string into a Date instance. When the input does not
 * specify a timezone we assume it was provided in the default timezone (BR)
 * so that appointments created outside the frontend preserve the expected hour.
 */
export const parseDateInput = (value: string): Date => {
  if (TIMEZONE_TOKEN_REGEX.test(value)) {
    return new Date(value);
  }

  return dayjs.tz(value, DEFAULT_TIMEZONE).toDate();
};

const toBoundary = (value: string, boundary: 'start' | 'end'): Date => {
  const date = dayjs.tz(value, DEFAULT_TIMEZONE);
  return (boundary === 'start' ? date.startOf('day') : date.endOf('day')).toDate();
};

export const parseRangeStart = (value: string): Date => {
  if (DATE_ONLY_REGEX.test(value)) {
    return toBoundary(value, 'start');
  }
  return parseDateInput(value);
};

export const parseRangeEnd = (value: string): Date => {
  if (DATE_ONLY_REGEX.test(value)) {
    return toBoundary(value, 'end');
  }
  return parseDateInput(value);
};

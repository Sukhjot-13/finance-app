// src/lib/utils.js

/**
 * Formats a number as a currency string based on the provided currency code.
 * It automatically adjusts the locale for better number formatting.
 * @param {number} amount - The amount to format.
 * @param {string} currency - The ISO 4217 currency code (e.g., 'USD', 'INR').
 * @returns {string} - The formatted currency string.
 */
export const formatCurrency = (amount, currency = 'USD') => {
  // Switch locale based on currency for more accurate formatting
  // (e.g., 'en-IN' for Rupee formatting with lakhs).
  const locale = currency === 'INR' ? 'en-IN' : 'en-US';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currency,
    minimumFractionDigits: 2,
  }).format(amount || 0);
};


/**
 * Formats a date string into a more readable format like 'Month Day, Year'.
 * @param {string | Date} dateString - The date to format.
 * @returns {string} - The formatted date string.
 */
export const formatDate = (dateString) => {
  if (!dateString) return '';
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return ''; // Invalid date

    // Default format: 'Month Day, Year'
    return new Intl.DateTimeFormat('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    }).format(date);
  } catch (error) {
    console.error("Could not format date:", dateString);
    return '';
  }
};

/**
 * Formats a Date object into 'YYYY-MM-DD' for HTML date input fields.
 * @param {Date} date - The date object to format.
 * @returns {string} - The formatted date string.
 */
export const formatDateForInput = (date) => {
  if (!date || !(date instanceof Date)) {
    return '';
  }
  const year = date.getFullYear();
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
};

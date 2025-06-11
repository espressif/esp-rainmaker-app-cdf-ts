/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Common utilities for CI helper JavaScript scripts
 */

// ANSI color codes for terminal output
export const ANSI_CODES = {
  BOLD_ITALIC: process.env.ANSI_BOLD_ITALIC_CODE || "\x1b[1;3m",
  BOLD_BLUE: process.env.ANSI_BOLD_BLUE_COLOR_CODE || "\x1b[1;34m",
  RESET: process.env.ANSI_RESET_CODE || "\x1b[0m",
};

/**
 * Formats a message with ANSI color codes
 * @param {string} message - The message to format
 * @param {string} colorCode - The ANSI color code to use
 * @returns {string} - The formatted message
 */
export const formatMessage = (message, colorCode) => {
  return `${colorCode}${message}${ANSI_CODES.RESET}`;
};

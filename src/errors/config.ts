/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFError } from "./base";

/**
 * Configuration-specific errors.
 *
 * Used for errors related to CDF configuration, initialization,
 * and setup issues.
 */
export class ESPCDFConfigError extends ESPCDFError {
  constructor(
    message: string,
    errorCode: string,
    context?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "CONFIG", errorCode, context, originalError);
  }
}

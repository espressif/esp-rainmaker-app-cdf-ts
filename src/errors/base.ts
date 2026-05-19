/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Base error class for all CDF errors.
 * Provides component identification, error codes, and structured metadata.
 *
 * This class serves as the foundation for all CDF-specific errors, allowing
 * applications to programmatically identify error sources and handle them appropriately.
 */
export abstract class ESPCDFError extends Error {
  public readonly component: string;
  public readonly errorCode: string;
  public readonly context?: Record<string, any>;
  public readonly timestamp: Date;
  public readonly originalError?: Error;

  constructor(
    message: string,
    component: string,
    errorCode: string,
    context?: Record<string, any>,
    originalError?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
    this.component = component;
    this.errorCode = errorCode;
    this.context = context;
    this.timestamp = new Date();
    this.originalError = originalError;

    // Maintains proper stack trace for where our error was thrown (only available on V8)
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, this.constructor);
    }
  }

  /**
   * Returns a structured error object for serialization.
   * Useful for logging, monitoring, and error reporting.
   * @returns A serializable representation of the error
   */
  toJSON() {
    return {
      name: this.name,
      message: this.message,
      component: this.component,
      errorCode: this.errorCode,
      context: this.context,
      timestamp: this.timestamp.toISOString(),
      stack: this.stack,
      originalError: this.originalError?.message,
    };
  }
}

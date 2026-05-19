/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFError } from "./base";

/**
 * Registry-specific errors.
 *
 * Used for errors related to SDK adaptor registry operations such as
 * registration, retrieval, capability checks, etc.
 */
export class ESPCDFRegistryError extends ESPCDFError {
  constructor(
    message: string,
    errorCode: string,
    context?: Record<string, any>,
    originalError?: Error
  ) {
    super(message, "REGISTRY", errorCode, context, originalError);
  }
}

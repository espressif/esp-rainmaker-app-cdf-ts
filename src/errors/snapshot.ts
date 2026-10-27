/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFError } from "./base";

/** Raised by entities restored from a disk snapshot before live data has arrived. */
export class ESPCDFSnapshotError extends ESPCDFError {
  constructor(
    message: string,
    errorCode: "SNAPSHOT_NOT_LIVE" | "SNAPSHOT_OPERATION_UNAVAILABLE",
    context?: Record<string, any>
  ) {
    super(message, "SNAPSHOT", errorCode, context);
  }
}

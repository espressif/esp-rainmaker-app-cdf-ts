/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFTransportConfig } from "../entities/common";

/**
 * Client-registered transports by node id, then transport type
 * (`local`, `matter_local`, …). Survives cloud sync / node object replacement.
 */
export type RegisteredTransportsByNodeId = Record<
  string,
  Partial<Record<string, ESPCDFTransportConfig>>
>;

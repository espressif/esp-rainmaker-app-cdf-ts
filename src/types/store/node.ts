/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFNode } from "../../entities/ESPCDFNode";

/**
 * Map of node IDs to their nodes
 */
export type ESPCDFNodesByIDMap = Record<string, ESPCDFNode>;

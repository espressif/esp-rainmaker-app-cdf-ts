/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents an attribute of a node or device.
 */
export interface ESPCDFAttributeInterface {
  name: string;
  value?: any;
}

/**
 * Configuration for transport mechanism
 */
export interface ESPCDFTransportConfig {
  /** The transport mode (local or cloud) */
  type: string;
  /** Additional metadata for the transport configuration */
  metadata: Record<string, any>;
}

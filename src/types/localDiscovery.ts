/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Parameters for local device discovery.
 */
export interface ESPCDFDiscoveryParamsInterface {
  [key: string]: any;
}

/**
 * Local discovery adapter interface for discovering ESP devices on LAN.
 */
export interface ESPCDFLocalDiscoveryAdapterInterface {
  startDiscovery(
    callback: (data: Record<string, any>) => void,
    params: ESPCDFDiscoveryParamsInterface
  ): Promise<() => void>;
  stopDiscovery(): Promise<void>;
}

export type DiscoveryParamsInterface = ESPCDFDiscoveryParamsInterface;
export type ESPLocalDiscoveryAdapterInterface =
  ESPCDFLocalDiscoveryAdapterInterface;

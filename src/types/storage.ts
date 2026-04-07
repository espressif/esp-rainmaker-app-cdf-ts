/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Storage adapter interface used by SDK wrappers.
 */
export interface ESPCDFStorageAdapterInterface {
  setItem(name: string, value: string): Promise<void>;
  getItem(name: string): Promise<string | null>;
  removeItem(name: string): Promise<void>;
  clear(): Promise<void>;
}

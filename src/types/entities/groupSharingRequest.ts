/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAPIResponse } from "../../types";

/**
 * Status enum for group sharing requests
 */
export enum ESPCDFGroupSharingStatus {
  accepted = "accepted",
  pending = "pending",
  rejected = "rejected",
}

/**
 * Operation types that can trigger callbacks for group sharing requests
 */
export type ESPCDFGroupSharingRequestOperationType =
  | "accept"
  | "decline"
  | "remove";

export interface ESPCDFGroupSharingRequestOperation {
  accept(): Promise<ESPCDFAPIResponse>;
  decline(): Promise<ESPCDFAPIResponse>;
  remove(): Promise<ESPCDFAPIResponse>;
}

export interface ESPCDFGroupSharingRequestInterface {
  id: string;
  status: ESPCDFGroupSharingStatus;
  timestamp: number;
  groupIds: string[];
  groupnames: string[];
  username: string;
  primaryUsername: string;
  transfer: boolean;
  newRole: string;
  metadata: Record<string, any>;
  operations: ESPCDFGroupSharingRequestOperation;
  _raw: any;
}

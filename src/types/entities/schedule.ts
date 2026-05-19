/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAPIResponse } from "../../types";

/**
 * Operation types that can trigger callbacks for schedules
 */
export type ESPCDFScheduleOperationType =
  | "add"
  | "edit"
  | "remove"
  | "enable"
  | "disable";

export interface ESPCDFScheduleOperation {
  add(): Promise<ESPCDFAPIResponse>;
  edit(data: ESPCDFScheduleEditInput): Promise<ESPCDFAPIResponse>;
  remove(): Promise<ESPCDFAPIResponse>;
  enable(): Promise<ESPCDFAPIResponse>;
  disable(): Promise<ESPCDFAPIResponse>;
}

export interface ESPCDFScheduleTrigger {
  m?: number;
  d?: number;
  dd?: number;
  mm?: number;
  yy?: number;
  rsec?: number;
}

export interface ESPCDFScheduleAction {
  [key: string]: {
    [key: string]: any;
  };
}

export interface ESPCDFScheduleValidity {
  start?: number;
  end?: number;
}

export interface ESPCDFScheduleInterface {
  id: string;
  name: string;
  info?: string;
  nodes: string[];
  triggers: ESPCDFScheduleTrigger[];
  action: ESPCDFScheduleAction;
  enabled?: boolean;
  validity?: ESPCDFScheduleValidity;
  flags?: number;
  devicesCount?: number;
  operations: ESPCDFScheduleOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the schedule
  outOfSyncMeta?: Record<string, any>;
  _raw: any;
}

export type ESPCDFScheduleCreateInput = Omit<
  ESPCDFScheduleInterface,
  "operations" | "adaptorIdentifier" | "_raw"
>;

export type ESPCDFScheduleEditInput = Omit<
  ESPCDFScheduleInterface,
  "operations" | "adaptorIdentifier" | "_raw" | "id" | "nodes"
>;

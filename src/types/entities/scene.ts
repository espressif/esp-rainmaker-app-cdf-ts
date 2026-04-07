/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAPIResponse } from "../../types";

/**
 * Operation types that can trigger callbacks for scenes
 */
export type ESPCDFSceneOperationType = "add" | "edit" | "remove" | "activate";

export interface ESPCDFSceneOperation {
  add(): Promise<ESPCDFAPIResponse>;
  edit(data: ESPCDFSceneEditInput): Promise<ESPCDFAPIResponse>;
  remove(): Promise<ESPCDFAPIResponse>;
  activate(): Promise<ESPCDFAPIResponse>;
}

export interface ESPCDFSceneAction {
  [key: string]: {
    [key: string]: any;
  };
}
export interface ESPCDFSceneInterface {
  id: string;
  name: string;
  info?: string;
  nodes: string[];
  actions: ESPCDFSceneAction;
  devicesCount?: number;
  operations: ESPCDFSceneOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the scene
  _raw: any;
}

export type ESPCDFSceneCreateInput = Omit<
  ESPCDFSceneInterface,
  "operations" | "adaptorIdentifier" | "_raw"
>;

export type ESPCDFSceneEditInput = Omit<
  ESPCDFSceneInterface,
  "operations" | "adaptorIdentifier" | "_raw" | "id" | "nodes"
>;
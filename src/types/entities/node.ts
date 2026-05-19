/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAPIResponse, ESPCDFAPIDataResponse } from "../../types";
import { ESPCDFAttributeInterface, ESPCDFTransportConfig } from "./common";
import { ESPCDFDeviceInterface } from "./device";
import { ESPCDFServiceInterface } from "./service";

/**
 * Operation types that can trigger callbacks for nodes
 */
export type ESPCDFNodeOperationType =
  | "setMultipleParams"
  | "delete"
  | "updateMetadata"
  | "checkOTAUpdate"
  | "pushOTAUpdate"
  | "getOTAStatus"
  | "addAutomation"
  | "setTimeZone";

export interface ESPCDFOTAUpdateResponse {
  status: string;
  otaAvailable: boolean;
  description: string;
  fwVersion: string;
  otaJobId: string;
  fileSize: number;
  url?: string;
  fileMD5?: string;
  streamId?: string;
  metadata?: Record<string, any>;
}

export interface ESPCDFOTAUpdateStatusResponse {
  nodeId: string;
  status: string;
  additionalInfo: string;
  timestamp: number;
}

export interface ESPCDFNodeOperation {
  setMultipleParams(params: Record<string, any>): Promise<ESPCDFAPIResponse>;
  delete(): Promise<ESPCDFAPIResponse>;
  checkOTAUpdate?(): Promise<ESPCDFAPIDataResponse<ESPCDFOTAUpdateResponse>>;
  pushOTAUpdate?(params: any): Promise<ESPCDFAPIResponse>;
  getOTAUpdateStatus?(otaJobId: string): Promise<
    ESPCDFAPIDataResponse<ESPCDFOTAUpdateStatusResponse>
  >;
  addAutomation?(automationDetails: Record<string, any>): Promise<any>;
  setTimeZone(timeZone: string): Promise<ESPCDFAPIResponse>;
  updateMetadata(metadata: Record<string, any>): Promise<ESPCDFAPIResponse>;
}

/**
 * Fixed event types for node property changes
 * Using fixed types instead of property strings provides better type safety and maintainability
 */
export type ESPCDFNodePropertyChangeEventType =
  | "deviceParamChanged"
  | "serviceParamChanged"
  | "metadataChanged"
  | "availableTransportsChanged"
  | "connectivityStatusChanged"
  | "tagsChanged"
  | "roleChanged";

/**
 * Event data for device parameter changes
 */
export interface ESPCDFDeviceParamChangedEvent {
  type: "deviceParamChanged";
  deviceName: string;
  paramName: string;
  value: any;
  oldValue?: any;
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for service parameter changes
 */
export interface ESPCDFServiceParamChangedEvent {
  type: "serviceParamChanged";
  serviceName: string;
  paramName: string;
  value: any;
  oldValue?: any;
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for metadata changes
 */
export interface ESPCDFMetadataChangedEvent {
  type: "metadataChanged";
  metadata: Record<string, any>;
  oldMetadata?: Record<string, any>;
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for available transports changes
 */
export interface ESPCDFAvailableTransportsChangedEvent {
  type: "availableTransportsChanged";
  availableTransports: Partial<Record<string, ESPCDFTransportConfig>>;
  oldAvailableTransports?: Partial<Record<string, ESPCDFTransportConfig>>;
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for connectivity status changes
 */
export interface ESPCDFConnectivityStatusChangedEvent {
  type: "connectivityStatusChanged";
  connectivityStatus: ESPCDFConnectivityStatusInterface;
  oldConnectivityStatus?: ESPCDFConnectivityStatusInterface;
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for tags changes
 */
export interface ESPCDFTagsChangedEvent {
  type: "tagsChanged";
  tags: string[];
  oldTags?: string[];
  entity: ESPCDFNodeInterface;
}

/**
 * Event data for role changes
 */
export interface ESPCDFRoleChangedEvent {
  type: "roleChanged";
  role: string;
  oldRole?: string;
  entity: ESPCDFNodeInterface;
}

/**
 * Discriminated union of all property change events
 * This provides type safety - each event type has its own data structure
 */
export type ESPCDFPropertyChangeEvent =
  | ESPCDFDeviceParamChangedEvent
  | ESPCDFServiceParamChangedEvent
  | ESPCDFMetadataChangedEvent
  | ESPCDFAvailableTransportsChangedEvent
  | ESPCDFConnectivityStatusChangedEvent
  | ESPCDFTagsChangedEvent
  | ESPCDFRoleChangedEvent;

/**
 * Callback type for property change events
 * This allows adaptors to listen to property changes and sync to _raw
 */
export type ESPCDFPropertyChangeCallback = (
  event: ESPCDFPropertyChangeEvent
) => void;

/**
 * Represents the connectivity status of a node.
 */
export interface ESPCDFConnectivityStatusInterface {
  isConnected: boolean;
  lastConnectionTimestamp: number;
}

/**
 * Represents the configuration of a node.
 */
export interface ESPCDFNodeConfigInterface {
  configVersion: string;
  attributes?: ESPCDFAttributeInterface[];
  info?: ESPCDFNodeInfoInterface;
}

/**
 * Represents the information about a node.
 */
export interface ESPCDFNodeInfoInterface {
  name: string;
  type: string;
  model: string;
  firmwareVersion: string;
  readme?: string;
  // Allow additional fields that might be added in future API responses
  [key: string]: any;
}

export enum ESPCDFNodeTransport {
  LOCAL = "local",
  CLOUD = "cloud",
}

export type ESPCDFNodeTransportType = ESPCDFNodeTransport | string;

export interface ESPCDFNodeInterface {
  identifier: string;
  id: string;
  type?: string;
  isPrimaryUser?: boolean;
  connectivityStatus?: ESPCDFConnectivityStatusInterface;
  nodeConfig?: ESPCDFNodeConfigInterface;
  devices?: ESPCDFDeviceInterface[];
  services?: ESPCDFServiceInterface[];
  metadata?: Record<string, any>;
  tags?: string[];
  role?: string;
  /** Transport order - priority queue of transport modes */
  transportOrder?: string[];
  /** Available transports with their configurations */
  availableTransports?: Partial<Record<ESPCDFNodeTransportType, ESPCDFTransportConfig>>;
  operations: ESPCDFNodeOperation;
  _raw: any;
  [key: string]: any;
}

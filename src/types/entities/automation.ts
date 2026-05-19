/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFAPIResponse } from "../cdf";
import type { ESPCDFAutomation } from "../../entities/ESPCDFAutomation";

/**
 * Enum representing operators for automation conditions.
 */
export enum ESPCDFAutomationConditionOperator {
  EQUAL = "==",
  NOT_EQUAL = "!=",
  LESS_THAN = "<",
  LESS_THAN_OR_EQUAL = "<=",
  GREATER_THAN = ">",
  GREATER_THAN_OR_EQUAL = ">=",
}

/**
 * Enum representing operators for combining automation events.
 */
export enum ESPCDFAutomationEventOperator {
  AND = "and",
  OR = "or",
}

/**
 * Enum representing automation event types.
 */
export enum ESPCDFAutomationEventType {
  NODE_PARAMS = "node_params",
  WEATHER = "weather",
  DAYLIGHT = "daylight",
}

/**
 * Enum representing weather parameters for automation.
 */
export enum ESPCDFWeatherParameter {
  TEMPERATURE = "temperature",
  PRESSURE = "pressure",
  HUMIDITY = "humidity",
  WIND_SPEED = "wind_speed",
}

/**
 * Enum representing weather conditions for automation.
 */
export enum ESPCDFWeatherCondition {
  THUNDERSTORM = "Thunderstorm",
  DRIZZLE = "Drizzle",
  RAIN = "Rain",
  SNOW = "Snow",
  CLEAR = "Clear",
  CLOUDS = "Clouds",
  MIST = "Mist",
  SMOKE = "Smoke",
  HAZE = "Haze",
  DUST = "Dust",
  FOG = "Fog",
  SAND = "Sand",
  ASH = "Ash",
  SQUALL = "Squall",
  TORNADO = "Tornado",
}

/**
 * Enum representing daylight events.
 */
export enum ESPCDFDaylightEvent {
  SUNRISE = "sunrise",
  SUNSET = "sunset",
}

/**
 * Reusable action item: target node/device and param value.
 * Extensible: add new fields here and they apply to create, update, and interface.
 */
export interface ESPCDFAutomationAction {
  nodeId: string;
  deviceName: string;
  param: string;
  value: any;
}

/**
 * Reusable location (latitude/longitude).
 */
export interface ESPCDFAutomationLocation {
  latitude: string;
  longitude: string;
}

/**
 * Node/device parameter based automation event.
 */
export interface ESPCDFAutomationNodeParamsEvent {
  deviceName: string;
  param: string;
  value: any;
  check: ESPCDFAutomationConditionOperator;
}

/**
 * Weather parameter based automation event.
 */
export interface ESPCDFWeatherEvent {
  param: ESPCDFWeatherParameter;
  value: number | string;
  check: ESPCDFAutomationConditionOperator;
}

/**
 * Event condition shapes supported by automation (device param check, generic param check, or string).
 * Extensible: add new union members for new event types.
 */
export type ESPCDFAutomationEvent =
  | ESPCDFAutomationNodeParamsEvent
  | ESPCDFWeatherEvent
  | ESPCDFWeatherCondition
  | ESPCDFDaylightEvent
  | string;

/**
 * Operation types that can trigger callbacks for automations
 */
export type ESPCDFAutomationOperationType =
  | "update"
  | "delete"
  | "enable"
  | "disable";

export interface ESPCDFAutomationOperation {
  update(data: ESPCDFAutomationEditInput): Promise<ESPCDFAPIResponse>;
  delete(): Promise<ESPCDFAPIResponse>;
  enable(enabled: boolean): Promise<ESPCDFAPIResponse>;
}

export interface ESPCDFAutomationInterface {
  id: string;
  name: string;
  enabled: boolean;
  nodeId?: string;
  eventType: ESPCDFAutomationEventType;
  events: ESPCDFAutomationEvent[];
  eventOperator: ESPCDFAutomationEventOperator;
  actions: ESPCDFAutomationAction[];
  retrigger?: boolean;
  location?: ESPCDFAutomationLocation;
  region?: string;
  metadata?: any;
  operations: ESPCDFAutomationOperation;
  adaptorIdentifier?: string; // Adaptor identifier from the node used to create the automation
  _raw: any;
}

/**
 * Input shape for updating an existing automation (partial update).
 * Derived from ESPCDFAutomationInterface; omits runtime-only and identity fields; all fields optional.
 */
export type ESPCDFAutomationEditInput = Partial<
  Omit<
    ESPCDFAutomationInterface,
    "operations" | "_raw" | "adaptorIdentifier" | "id"
  >
>;

export type ESPCDFAutomationCreateInput = Omit<
  ESPCDFAutomationInterface,
  "operations" | "_raw" | "adaptorIdentifier" | "id"
>;

/**
 * Interface representing the raw response from automation API.
 */
export interface ESPCDFRawAutomationResponse {
  automation_id: string;
  status: string;
}

/**
 * Interface for paginated response containing automation data.
 */
export interface ESPCDFPaginatedAutomationsResponse {
  automations: ESPCDFAutomation[];
  hasNext: boolean;
  fetchNext?: () => Promise<ESPCDFPaginatedAutomationsResponse>;
}
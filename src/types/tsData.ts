/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

/**
 * Represents a single data point in a time series.
 */
export interface ESPCDFTSData {
  timestamp: number;
  value: number | string | boolean;
}

/**
 * Represents a single data point in a simple time series.
 */
export interface ESPCDFTSDataPoint {
  ts: number;
  val: number | string | boolean;
}

/**
 * Represents the data for a single parameter in a simple time series.
 */
export interface ESPCDFTSParamData {
  param_name: string;
  values: ESPCDFTSDataPoint[];
  num_records: number;
}

/**
 * Represents the data for a single node in a simple time series.
 */
export interface ESPCDFTSNodeData {
  node_id: string;
  params: ESPCDFTSParamData[];
  next_id?: string;
}

/**
 * Represents the response for a simple time series data request.
 */
export interface ESPCDFSimpleTSDataResponse {
  tsData: ESPCDFTSData[];
  hasNext: boolean;
  fetchNext?: () => Promise<ESPCDFSimpleTSDataResponse>;
}

/**
 * Represents the request for a simple time series data request.
 */
export interface ESPCDFSimpleTSDataRequest {
  startTime: number;
  endTime: number;
  resultCount?: number;
}

/**
 * Enum representing different aggregation methods for time series data.
 */
export enum ESPCDFAggregationMethod {
  Raw = "raw",
  Latest = "latest",
  Min = "min",
  Max = "max",
  Count = "count",
  Avg = "avg",
  Sum = "sum",
}

/**
 * Enum representing different time intervals for aggregation.
 */
export enum ESPCDFAggregationInterval {
  Minute = "minute",
  Hour = "hour",
  Day = "day",
  Week = "week",
  Month = "month",
  Year = "year",
}

/**
 * Enum representing the start day of the week for time series aggregation.
 */
export enum ESPCDFWeekStart {
  Sunday = "Sunday",
  Monday = "Monday",
  Tuesday = "Tuesday",
  Wednesday = "Wednesday",
  Thursday = "Thursday",
  Friday = "Friday",
  Saturday = "Saturday",
}

/**
 * Interface for raw time series data request parameters.
 */
export interface ESPCDFRawTSDataRequest {
  startTime?: number;
  endTime?: number;
  timezone?: string;
  resultCount?: number;
  differential?: boolean;
  resetOnNegative?: boolean;
  descOrder?: boolean;
}

/**
 * Interface for time series data request parameters with aggregation options.
 */
export interface ESPCDFTSDataRequest extends ESPCDFRawTSDataRequest {
  numIntervals?: number;
  aggregationInterval?: ESPCDFAggregationInterval;
  weekStart?: ESPCDFWeekStart;
  aggregate?: ESPCDFAggregationMethod;
}

/**
 * Interface for custom parameter time series data request parameters.
 */
export interface ESPCDFCustomParamTSDataRequest extends ESPCDFTSDataRequest {
  paramName: string;
  dataType: string;
}

/**
 * Interface for custom parameter simple time series data request parameters.
 */
export interface ESPCDFCustomParamSimpleTSDataRequest
  extends ESPCDFSimpleTSDataRequest {
  paramName: string;
  dataType: string;
}

/**
 * Interface for configuration parameters for fetching time series data.
 */
export interface ESPCDFFetchTSDataConfig {
  nodeId: string;
  paramName: string;
  endpoint: string;
  requestParams: Record<string, any>;
}

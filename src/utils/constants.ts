/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

export const SUCCESS = "success";

// Errors
export const SDK_CONFIG_MISSION_ERR = "SDK config is required";
export const NO_MORE_GROUPS_TO_FETCH_ERR = "No more groups to fetch";
export const NO_MORE_SHARING_REQUESTS_TO_FETCH_ERR =
  "No more sharing requests to fetch";
export const NO_MORE_NODES_TO_FETCH_ERR = "No more nodes to fetch";
export const NO_MORE_AUTOMATIONS_TO_FETCH_ERR = "No more automations to fetch";
export const USER_NOT_LOGGED_IN_ERR = "User not logged in";

// Dynamic error message generation
export const PROPERTY_NOT_A_FUNCTION_ERR = (key: string, keyPath: string[]) =>
  `The property '${key}' at '${keyPath.join(".")}' is not a function`;

// CDF node subscription events
export const ESP_CDF_NODE_SUBSCRIPTION_EVENTS = {
  NODE_PARAMS_CHANGED: "cdf/node/params/changed",
  USER_NODE_ADDED: "cdf/node/lifecycle/added",
  USER_NODE_REMOVED: "cdf/node/lifecycle/removed",
  NODE_CONNECTED: "cdf/node/connectivity/connected",
  NODE_DISCONNECTED: "cdf/node/connectivity/disconnected",
} as const;

// Node subscription events (CDF topic strings)
export const EVENT_NODE_PARAMS_CHANGED =
  ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_PARAMS_CHANGED;
export const EVENT_USER_NODE_ADDED =
  ESP_CDF_NODE_SUBSCRIPTION_EVENTS.USER_NODE_ADDED;
export const EVENT_USER_NODE_REMOVED =
  ESP_CDF_NODE_SUBSCRIPTION_EVENTS.USER_NODE_REMOVED;
export const EVENT_NODE_CONNECTED =
  ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_CONNECTED;
export const EVENT_NODE_DISCONNECTED =
  ESP_CDF_NODE_SUBSCRIPTION_EVENTS.NODE_DISCONNECTED;

// SERVICE TYPES
export const ESPRM_SERVICE_SCENES = "esp.service.scenes";
export const ESPRM_SERVICE_SCHEDULES = "esp.service.schedule";
export const ESPCDFServiceType = {
  LOCAL_CONTROL: "esp.service.local_control",
  TIME: "esp.service.time",
} as const;

// PARAM TYPES
export const ESPRM_PARAM_SCENES = "esp.param.scenes";
export const ESPRM_PARAM_SCHEDULES = "esp.param.schedules";
export const ESPCDFServiceParamType = {
  LOCAL_CONTROL: {
    TYPE: "esp.param.local_control_type",
    POP: "esp.param.local_control_pop",
  },
  TIME: {
    TIMEZONE: "esp.param.tz",
  },
} as const;

// SCENE OPERATIONS
export enum SceneOperation {
  ADD = "add",
  EDIT = "edit",
  REMOVE = "remove",
  ACTIVATE = "activate",
}

export enum ScheduleOperation {
  ADD = "add",
  EDIT = "edit",
  REMOVE = "remove",
  DISABLE = "disable",
  ENABLE = "enable",
  NO_CHANGE = "no_change",
}

// NODE UPDATE TYPES
export enum NodeUpdateType {
  CONNECTIVITY_STATUS = "connectivityStatus",
  DEVICE_PARAMS = "deviceParams",
  NODE_CONFIG = "nodeConfig",
}

// Group / Home (used by cdfstore home sync and app)
export const GROUP_TYPE_HOME = "home";
export const DEFAULT_HOME_GROUP_NAME = "Home";
/** Permission value for user custom data read/write */
export const CDF_USER_PERMISSION = "user";

/** Promise.allSettled result status strings */
export const REJECTED_STATUS = "rejected";
export const FULFILLED_STATUS = "fulfilled";

/** Node types excluded from unassigned-node listing (e.g. matter) */
export const NODE_TYPE = {
  PURE_MATTER: "pure_matter",
  RAINMAKER_MATTER: "rainmaker_matter",
} as const;

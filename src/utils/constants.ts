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

// notification events
export const EVENT_NODE_PARAMS_CHANGED = "rmaker.event.node_params_changed";
export const EVENT_USER_NODE_ADDED = "rmaker.event.user_node_added";
export const EVENT_USER_NODE_REMOVED = "rmaker.event.user_node_removed";
export const EVENT_NODE_CONNECTED = "rmaker.event.node_connected";
export const EVENT_NODE_DISCONNECTED = "rmaker.event.node_disconnected";

// SERIVCE TYPES
export const ESPRM_SERVICE_SCENES = "esp.service.scenes";

// PARAM TYPES
export const ESPRM_PARAM_SCENES = "esp.param.scenes";

// SCENE OPERATIONS
export enum SceneOperation {
  ADD = "add",
  EDIT = "edit",
  REMOVE = "remove",
  ACTIVATE = "activate",
}

// NODE UPDATE TYPES
export enum NodeUpdateType {
  CONNECTIVITY_STATUS = "connectivityStatus",
  DEVICE_PARAMS = "deviceParams",
  NODE_CONFIG = "nodeConfig",
}

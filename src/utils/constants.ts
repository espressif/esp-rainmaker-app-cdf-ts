export const SUCCESS = "success";

// Errors
export const SDK_CONFIG_MISSION_ERR = "SDK config is required";
export const NO_MORE_GROUPS_TO_FETCH_ERR = "No more groups to fetch";
export const NO_MORE_SHARING_REQUESTS_TO_FETCH_ERR =
  "No more sharing requests to fetch";
export const NO_MORE_NODES_TO_FETCH_ERR = "No more nodes to fetch";

// Dynamic error message generation
export const PROPERTY_NOT_A_FUNCTION_ERR = (key: string, keyPath: string[]) =>
  `The property '${key}' at '${keyPath.join(".")}' is not a function`;

// notification events
export const EVENT_NODE_PARAMS_CHANGED = "rmaker.event.node_params_changed";
export const EVENT_USER_NODE_ADDED = "rmaker.event.user_node_added";
export const EVENT_USER_NODE_REMOVED = "rmaker.event.user_node_removed";
export const EVENT_NODE_CONNECTED = "rmaker.event.node_connected";
export const EVENT_NODE_DISCONNECTED = "rmaker.event.node_disconnected";

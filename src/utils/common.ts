/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  makeAutoObservable,
  observable,
  isObservableArray,
  isObservableObject,
  isObservableMap,
  extendObservable as mobxExtendObservable,
} from "mobx";
import { ESPRMNode } from "../types/index";
import { ESPTransportMode } from "@espressif/rainmaker-base-sdk";

import { Interceptor, InterceptorConfig } from "../types";
import * as constants from "./constants";
import { CDF } from "../index";

/**
 * Recursively makes all properties of an object observable.
 *
 * This function traverses an object and makes every property observable,
 * including nested objects and arrays of objects. If a property is already
 * observable, it will not be modified.
 *
 * @param {any} obj - The object to be made observable.
 * @returns {any} - The observable version of the input object.
 *
 * @example
 * const obj = { a: 1, b: { c: 2 } };
 * const observableObj = makeEverythingObservable(obj);
 * console.log(isObservable(observableObj)); // true
 * console.log(isObservable(observableObj.b)); // true
 *
 * @remarks
 * This function is useful in scenarios where you need to ensure that all parts
 * of an object, including deeply nested properties, are observable by Mobx.
 * This is particularly useful in state management for reactive programming.
 */
export const makeEverythingObservable = <T extends object>(
  obj: T,
  visited: WeakSet<object> = new WeakSet()
): T => {
  try {
    if (Array.isArray(obj)) {
      if (isObservableArray(obj)) {
        return obj;
      }
      return observable.array(
        obj.map((item) => makeEverythingObservable(item, visited))
      ) as unknown as T;
    } else if (obj !== null && typeof obj === "object") {
      if (visited.has(obj)) {
        return obj;
      }
      visited.add(obj);

      if (isObservableObject(obj) || isObservableMap(obj)) {
        return obj;
      }

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          const value: any = (obj as Record<string, unknown>)[key];
          (obj as Record<string, unknown>)[key] = makeEverythingObservable(
            value,
            visited
          );
        }
      }
      return makeAutoObservable(obj);
    }
    return obj;
  } catch (error) {
    throw new Error("Error making object observable: " + error);
  }
};

/**
 * Intercepts and wraps nested functions within an object with custom logic.
 * @param {object} target - The object containing the nested functions to be intercepted.
 * @param {string} path - The path to the nested function to be intercepted.
 * @param {Interceptor} interceptor - The interceptor function to wrap the original function.
 * @returns {void}
 * @example
 * const target = {
 *  a: {
 *   b: {
 *   c: async function() {
 *    console.log("Original function");
 *  }
 * }
 * }
 * };
 * const interceptor = async (originalFunction, context, args) => {
 * console.log("Interceptor function");
 * return await originalFunction.call(context, ...args);
 * };
 * proxyActionHandler(target, "a.b.c", interceptor);
 * target.a.b.c(); // Output: "Interceptor function" followed by "Original function"
 * @remarks
 * This function is useful for intercepting and wrapping nested functions within an object
 * with custom logic. It allows you to modify the behavior of the original function without
 * changing its implementation. The interceptor function receives the original function, context,
 * and arguments as parameters, and can perform custom actions before and after calling the original function.
 * The original function is called using the `call` method to ensure that the context is preserved.
 * The `path` parameter specifies the nested function to be intercepted, using dot notation to traverse
 * nested objects. If the path is invalid or the property is not a function, an error will be thrown.
 * The `interceptor` function should return the result of the original function call, allowing you to
 * modify the return value if needed.
 * @see createInterceptor
 * @see Interceptor
 * @see Action
 * @see Rollback
 */

export function proxyActionHandler(
  target: object,
  path: string,
  interceptor: Interceptor
): void {
  // Convert the string path into an array of keys
  const keyPath = path.split(".");

  const traverseAndIntercept = (current: any, path: string[]): void => {
    if (!current || path.length === 0) return;
    const key = path[0];
    if (Array.isArray(current)) {
      // If current is an array, apply to each element
      current.forEach((item) => traverseAndIntercept(item, path));
    } else if (path.length === 1) {
      // Final key in the path; intercept the function
      const originalFunction = current[key];
      if (typeof originalFunction !== "function") {
        throw new Error(constants.PROPERTY_NOT_A_FUNCTION_ERR(key, keyPath));
      }
      current[key] = async function (...args: any[]) {
        return await interceptor.call(
          this,
          originalFunction.bind(this),
          this,
          args
        );
      };
    } else {
      // Continue traversing the object
      traverseAndIntercept(current[key], path.slice(1));
    }
  };

  traverseAndIntercept(target, keyPath);
}

/**
 * Performs a shallow clone of a given object or array.
 * @param obj The object or array to be shallowly cloned.
 * @returns A new shallow-cloned object or array.
 * @example
 * const obj = { a: 1, b: { c: 2 } };
 * const clonedObj = shallowClone(obj);
 * console.log(clonedObj); // { a: 1, b: { c: 2 } }
 * console.log(obj === clonedObj); // false
 * console.log(obj.b === clonedObj.b); // true
 * @remarks
 * This function performs a shallow clone of an object or array, creating a new object with the same properties
 * and values as the original. Nested objects and arrays are not deeply cloned, meaning that the new object will
 * share references to the nested objects and arrays with the original. This is useful when you need to create a
 * copy of an object without modifying the original, but do not need to deeply clone nested objects or arrays.
 */
export function shallowClone<T>(obj: T): T {
  if (obj === null || typeof obj !== "object") {
    return obj; // Return if obj is not an object or array
  }

  if (obj instanceof Array) {
    return obj.slice() as unknown as T; // Handle Array
  }

  if (obj instanceof Set) {
    return new Set(obj) as unknown as T; // Handle Set
  }

  if (obj instanceof Map) {
    return new Map(obj) as unknown as T; // Handle Map
  }

  // Handle objects
  return { ...obj };
}

/**
 * Creates an interceptor function that wraps an original function with custom actions and rollback logic.
 * @param action The custom action to be performed before calling the original function.
 * @param rollback The rollback function to be executed in case of an error.
 * @returns An interceptor function that wraps the original function.
 * @example
 * const action = (context, args) => {
 * context.nodeIds = [...context.nodeIds, ...args[0]];
 * };
 * const rollback = (context, prevContext) => {
 * context.nodeIds = prevContext.nodeIds;
 * };
 * const interceptor = createInterceptor(action, rollback);
 * const originalFunction = async function() {
 * console.log("Original function");
 * };
 * const context = { nodeIds: [] };
 * const args = [["node1", "node2"]];
 * interceptor(originalFunction, context, args);
 * @remarks
 * This function creates an interceptor function that wraps an original function with custom actions
 * and rollback logic. The `action` parameter specifies the custom action to be performed before calling
 * the original function, allowing you to modify the context or arguments as needed. The `rollback` parameter
 * specifies the rollback function to be executed in case of an error, allowing you to revert the context to
 * its previous state. The interceptor function receives the original function, context, and arguments as parameters,
 * and can perform custom actions before and after calling the original function. The original function is called using
 * the `call` method to ensure that the context is preserved. If an error occurs during the execution of the original
 * function, the interceptor will call the rollback function to revert the context to its previous state. This is useful
 * for implementing error handling, logging, or other custom logic around function calls.
 * @see Interceptor
 * @see Action
 * @see Rollback
 */
export function createInterceptor(config: InterceptorConfig): Interceptor {
  const { action, rollback, onSuccess, onError } = config;
  return async (originalFunction, context, args) => {
    const prevContext = shallowClone(context); // Clone the context for rollback
    try {
      // Perform the custom action before calling the original function
      if (action) action(context, args);
      const result = await originalFunction.call(context, ...args);
      if (onSuccess) return await onSuccess(result, args, context);
      return result;
    } catch (err) {
      // Rollback the context changes in case of an error
      if (rollback) rollback(context, prevContext);
      if (onError) return await onError(err);
      console.error("Interceptor error:", err);
      throw err;
    }
  };
}

/**
 * Extends an object with additional observable properties.
 * @param target The object to be extended with observable properties.
 * @param properties The properties to be added to the object.
 * @returns The extended object with observable properties.
 * @example
 * class UserStore {
 * @observable user = { name: "John", age: 30 };
 * }
 * const userStore = new UserStore();
 * extendObservable(userStore, { isAdmin: false });
 * console.log(userStore.isAdmin); // false
 * @remarks
 * This function extends an object with additional observable properties, allowing you to add reactive
 * properties to an existing object. The `target` parameter specifies the object to be extended, while the
 * `properties` parameter specifies the properties to be added. The properties will be made observable using
 * Mobx, allowing you to reactively track changes to the object. This is useful for adding new properties to
 * an existing object, or for converting a plain object into a reactive object. The function uses Mobx's
 * `extendObservable` method internally to make the properties observable.
 */
export function extendObservable(
  target: any,
  properties: { [key: string]: any }
) {
  mobxExtendObservable(target, properties);
}

/**
 * Capitalizes the first letter of a string.
 * @param {string} str - The string to capitalize.
 * @returns {string} The capitalized string.
 */
export function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export function deepMerge(target: any, source: any) {
  for (const key in source) {
    if (source[key] instanceof Object && target[key]) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  return { ...target, ...source };
}

export function handleNodeUpdateEvent(event: any, rootStore: CDF | null) {
  const { event_type, timestamp, node_id = null, payload = null } = event;

  // Parse payload safely
  const parsedPayload = safelyParsePayload(payload);

  // Handle events based on their type
  switch (event_type) {
    case constants.EVENT_NODE_PARAMS_CHANGED:
      handleNodeParamsChanged(rootStore, node_id, parsedPayload);
      break;

    case constants.EVENT_USER_NODE_ADDED:
      handleUserNodeAdded(rootStore, parsedPayload);
      break;

    case constants.EVENT_USER_NODE_REMOVED:
      handleUserNodeRemoved(rootStore, parsedPayload);
      break;

    case constants.EVENT_NODE_CONNECTED:
      handleNodeConnected(rootStore, node_id, timestamp);
      break;

    case constants.EVENT_NODE_DISCONNECTED:
      handleNodeDisconnected(rootStore, node_id, timestamp);
      break;

    default:
      throw new Error(`Unhandled event type: ${event_type}`);
  }
}

/**
 * Safely parses the payload and throws an error if parsing fails.
 */
function safelyParsePayload(payload: any): any {
  if (!payload) return null;

  try {
    return JSON.parse(payload);
  } catch (error) {
    throw new Error("Failed to parse payload: " + error);
  }
}

/**
 * Handles the `EVENT_NODE_PARAMS_CHANGED` event.
 */
function handleNodeParamsChanged(
  rootStore: CDF | null,
  node_id: string,
  payload: any
) {
  rootStore?.nodeStore?.updateNode(node_id, payload, constants.NodeUpdateType.DEVICE_PARAMS);
}

/**
 * Handles the `EVENT_USER_NODE_ADDED` event.
 */
async function handleUserNodeAdded(rootStore: CDF | null, payload: any) {
  if (!rootStore) return;

  const nodeIds = payload.nodeIds;
  const nodes: ESPRMNode[] = await Promise.all(
    nodeIds.map((nodeId: string) =>
      rootStore.userStore.user?.getNodeDetails(nodeId)
    )
  );

  nodes.forEach((node) => {
    if (node) rootStore.nodeStore.addNode(node);
  });
}

/**
 * Handles the `EVENT_USER_NODE_REMOVED` event.
 */
function handleUserNodeRemoved(rootStore: CDF | null, payload: any) {
  rootStore?.nodeStore?.deleteNodes(payload.nodeIds);
}

/**
 * Handles the `EVENT_NODE_CONNECTED` event.
 */
function handleNodeConnected(
  rootStore: CDF | null,
  node_id: string,
  timestamp: number
) {
  rootStore?.nodeStore?.updateNode(node_id, {
    isConnected: true,
  }, constants.NodeUpdateType.CONNECTIVITY_STATUS);
  rootStore?.nodeStore?.updateNodeTransport(node_id, {
    type: ESPTransportMode.cloud,
    metadata: {},
  });
}

/**
 * Handles the `EVENT_NODE_DISCONNECTED` event.
 */
function handleNodeDisconnected(
  rootStore: CDF | null,
  node_id: string,
  timestamp: number
) {
  rootStore?.nodeStore?.updateNode(node_id, {
    isConnected: false,
  }, constants.NodeUpdateType.CONNECTIVITY_STATUS);
  rootStore?.nodeStore?.updateNodeTransport(
    node_id,
    { type: ESPTransportMode.cloud, metadata: {} },
    "remove"
  );
}


/**
 * Compares two arrays of objects and checks if all objects in array1 exist in array2
 * 
 * @param array1 First array to compare
 * @param array2 Second array to compare against
 * @param key Optional key to use for faster comparison instead of full object comparison
 * @returns True if all objects in array1 exist in array2, false otherwise
 * 
 * @example
 * // With key comparison
 * compareArrays([{id: 1}, {id: 2}], [{id: 1}, {id: 2}, {id: 3}], 'id') // true
 * 
 * // With full object comparison
 * compareArrays([{x: 1}, {x: 2}], [{x: 1}, {x: 2}, {x: 3}]) // true
 */
export function compareArrays<T extends Record<string, any>>(
  array1: T[],
  array2: T[],
  key?: keyof T
): boolean {
  if (array1.length === 0) return true;  // Empty array1 is always contained
  if (array2.length === 0) return false; // array2 empty → cannot contain array1

  if (key) {
    const set2 = new Set(array2.map(obj => obj[key]));
    return array1.every(obj => obj[key] !== undefined && set2.has(obj[key]));
  }

  return array1.every(obj1 =>
    array2.some(obj2 => JSON.stringify(obj1) === JSON.stringify(obj2))
  );
}


/**
 * Compares two objects deeply and checks if they are equal.
 * @param a The first object to compare.
 * @param b The second object to compare.
 * @returns True if the objects are equal, false otherwise.
 */
export function isEqual(a: any, b: any): boolean {
  if (a === b) return true;

  if (typeof a !== "object" || typeof b !== "object" || a === null || b === null) {
    return false;
  }

  const keysA = Object.keys(a);
  const keysB = Object.keys(b);

  if (keysA.length !== keysB.length) return false;

  for (let key of keysA) {
    if (!keysB.includes(key)) return false;
    if (!isEqual(a[key], b[key])) return false;
  }

  return true;
}

/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import {
  makeObservable,
  observable,
  isObservableArray,
  isObservableObject,
  isObservableMap,
} from "mobx";

import { ESPCDFBatchOperationResult } from "../types";

/**
 * Recursively makes all properties of an object observable.
 *
 * This function traverses an object and makes every property observable,
 * including nested objects and arrays of objects. If a property is already
 * observable, it will not be modified.
 * @param obj - The object to be made observable.
 * @param excludeKeys - Keys to exclude from being made observable (e.g., '_raw', 'operations')
 * @param visited - Set of already visited objects to prevent circular references
 * @returns - The observable version of the input object.
 * @example
 * const obj = { a: 1, b: { c: 2 }, _raw: sdkObject };
 * const observableObj = makeEverythingObservable(obj, new Set(['_raw']));
 * console.log(isObservable(observableObj)); // true
 * console.log(isObservable(observableObj.b)); // true
 * console.log(isObservable(observableObj._raw)); // false (excluded)
 *
 * Useful when nested properties must be observable in MobX; exclude keys like '_raw' and
 * 'operations' that are SDK-specific and don't need reactivity.
 */
export const makeEverythingObservable = <T extends object>(
  obj: T,
  excludeKeys: Set<string> = new Set(["_raw", "operations"]),
  visited: WeakSet<object> = new WeakSet()
): T => {
  try {
    // Skip Error instances - they have non-serializable properties and circular references
    if (obj instanceof Error) {
      return obj;
    }

    if (Array.isArray(obj)) {
      if (isObservableArray(obj)) {
        return obj;
      }
      return observable.array(
        obj.map((item) => makeEverythingObservable(item, excludeKeys, visited))
      ) as unknown as T;
    } else if (obj !== null && typeof obj === "object") {
      if (visited.has(obj)) {
        return obj;
      }
      visited.add(obj);

      if (isObservableObject(obj) || isObservableMap(obj)) {
        return obj;
      }

      // First, recursively make nested properties observable (excluding specified keys)
      const annotations: Record<string, any> = {};

      for (const key in obj) {
        if (Object.prototype.hasOwnProperty.call(obj, key)) {
          if (excludeKeys.has(key)) {
            // Skip excluded keys - don't add them to annotations
            // They will remain non-observable
            continue;
          }

          // Recursively make nested values observable
          const value: any = (obj as Record<string, unknown>)[key];
          (obj as Record<string, unknown>)[key] = makeEverythingObservable(
            value,
            excludeKeys,
            visited
          );

          // Add to annotations - only properties in annotations will be made observable
          annotations[key] = observable;
        }
      }

      // Use makeObservable with explicit annotations
      // Properties not in annotations (like _raw, operations) won't be made observable
      if (Object.keys(annotations).length > 0) {
        makeObservable(obj, annotations);
      }

      return obj;
    }
    return obj;
  } catch (error) {
    throw new Error("Error making object observable: " + error);
  }
};

/**
 * Deeply merges two objects, recursively merging nested objects.
 * @param target - The target object to merge into
 * @param source - The source object to merge from
 * @returns A new object with merged properties
 */
export function deepMerge(target: any, source: any) {
  for (const key in source) {
    if (source[key] instanceof Object && target[key]) {
      Object.assign(source[key], deepMerge(target[key], source[key]));
    }
  }
  return { ...target, ...source };
}

/**
 * Error message map for common CDF errors.
 * Provides consistent error messages across the CDF package.
 */
export const ERROR_MESSAGE_MAP = {
  NO_SDK_WITH_CAPABILITY: (capability: string) =>
    `No SDKs found with ${capability} capability`,
  NO_MORE_NODES_TO_FETCH: (sdkSource: string) =>
    `No more nodes to fetch from SDK ${sdkSource}`,
  NO_MORE_GROUPS_TO_FETCH: (sdkSource: string) =>
    `No more groups to fetch from SDK ${sdkSource}`,
  NODE_NOT_FOUND: (nodeId: string) => `Node with id ${nodeId} not found`,
  GROUP_NOT_FOUND: (groupId: string) => `Group with id ${groupId} not found`,
  SDK_ADAPTOR_ALREADY_EXISTS: (sdkIdentifier: string) =>
    `SDK Adaptor with identifier ${sdkIdentifier} already exists in registry`,
  SDK_ADAPTOR_NOT_FOUND: (sdkIdentifier: string) =>
    `SDK Adaptor with identifier ${sdkIdentifier} not found in registry`,
  SDK_ADAPTOR_METHOD_PROPERTY_NOT_IMPLEMENTED: (
    sdkIdentifier: string,
    propertyOrMethodName: string
  ) =>
    `SDK Adaptor with identifier ${sdkIdentifier} does not implement method or property ${propertyOrMethodName}`,
  CDF_CONFIG_MISSING: `CDF config is missing`,
  SDK_REGISTRY_MISSING: `SDK registry is missing`,
  NO_ACTIVE_ADAPTOR_SET: `No active SDK adaptor is set. Call registry.setActiveAdaptor(identifier) first or provide adaptorIdentifier in the request`,
};

/**
 * Checks if an object is empty (null, undefined, or has no keys).
 * @param obj - The object to check
 * @returns True if the object is null, undefined, or has no enumerable keys
 */
export function isEmptyObject(obj: any): boolean {
  return obj === null || obj === undefined || Object.keys(obj).length === 0;
}

/**
 * Partitions PromiseSettledResult array into successful and failed results.
 *
 * Used for batch operations where multiple promises are settled and need to be
 * categorized into successful and failed results.
 * @param results - Array of PromiseSettledResult containing arrays of results
 * @returns Object with successfulResults and failedResults arrays
 */
export function partitionBatchArrayResults<TSuccess, TError = unknown>(
  results: PromiseSettledResult<TSuccess[]>[]
): ESPCDFBatchOperationResult<TSuccess, TError> {
  const successfulResults = results
    .filter(
      (result): result is PromiseFulfilledResult<TSuccess[]> =>
        result.status === "fulfilled"
    )
    .flatMap((result) => result.value);

  const failedResults = results
    .filter(
      (result): result is PromiseRejectedResult => result.status === "rejected"
    )
    .map((result) => result.reason);

  return { successfulResults, failedResults };
}

/**
 * Compares two arrays of objects and checks if all objects in array1 exist in array2
 * @param array1 First array to compare
 * @param array2 Second array to compare against
 * @param key Optional key to use for faster comparison instead of full object comparison
 * @returns True if all objects in array1 exist in array2, false otherwise
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
  if (array1.length === 0) return true; // Empty array1 is always contained
  if (array2.length === 0) return false; // array2 empty → cannot contain array1

  if (key) {
    const set2 = new Set(array2.map((obj) => obj[key]));
    return array1.every((obj) => obj[key] !== undefined && set2.has(obj[key]));
  }

  return array1.every((obj1) =>
    array2.some((obj2) => JSON.stringify(obj1) === JSON.stringify(obj2))
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

  if (
    typeof a !== "object" ||
    typeof b !== "object" ||
    a === null ||
    b === null
  ) {
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

/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// main modules
import type { ESPRMGroup } from "@espressif/rainmaker-base-sdk";
import type { ESPRMNode } from "@espressif/rainmaker-base-sdk";
import type { ESPDevice } from "@espressif/rainmaker-base-sdk";
import type { ESPGroupSharingInfo } from "@espressif/rainmaker-base-sdk";
import type { ESPGroupSharingRequest } from "@espressif/rainmaker-base-sdk";
import type { ESPGroupSharingUserInfo } from "@espressif/rainmaker-base-sdk";
import type { ESPNodeSharingRequest } from "@espressif/rainmaker-base-sdk";
import type { ESPPlatformEndpoint } from "@espressif/rainmaker-base-sdk";
import type { ESPRMAttribute } from "@espressif/rainmaker-base-sdk";
import type { ESPRMConnectivityStatus } from "@espressif/rainmaker-base-sdk";
import type { ESPRMDevice } from "@espressif/rainmaker-base-sdk";
import type { ESPRMDeviceParam } from "@espressif/rainmaker-base-sdk";
import type { ESPRMNodeConfig } from "@espressif/rainmaker-base-sdk";
import type { ESPRMNodeInfo } from "@espressif/rainmaker-base-sdk";
import type { ESPRMService } from "@espressif/rainmaker-base-sdk";
import type { ESPRMServiceParam } from "@espressif/rainmaker-base-sdk";
import type { ESPRMUser } from "@espressif/rainmaker-base-sdk";
import type { ESPRMAuth } from "@espressif/rainmaker-base-sdk";
import type { ESPAutomation } from "@espressif/rainmaker-base-sdk";

// discovery
import type { ESPDiscoveryProtocol } from "@espressif/rainmaker-base-sdk";

// ESPModules
import type {
  ESPNodeSharingRequestInterface,
  ESPGroupSharingRequestInterface,
  ESPGroupSharingStatus,
  ESPPlatformEndpointInterface,
} from "@espressif/rainmaker-base-sdk";

// input
import type {
  ESPRMBaseConfig,
  SignUpRequest,
  ConfirmUserRequest,
  LoginWithPasswordRequest,
  LoginWithOTPRequest,
  SetNewPasswordRequest,
  UserTokensData,
  ChangePasswordRequest,
  LogoutRequest,
  GetUserInfoRequest,
  tokenName,
  CreateGroupRequest,
  ESPRMGroupInterface,
  GetUserNodesRequestParams,
  UpdateGroupInfoRequest,
  ShareGroupsRequest,
  TransferGroupsRequest,
  ShareWithRequest,
  TransferNodeRequest,
  FetchNodeSharingRequestsParam,
  EventCallbacks,
  GetGroupsRequestParams,
  GetGroupByIdRequestParams,
  CreateSubGroupRequest,
  GetGroupByNameRequestParams,
  ShareGroupRequest,
  TransferGroupRequest,
  ESPGroupSharingUserInfoInterface,
  ESPGroupSharingInfoInterface,
  GetSharingInfoRequest,
  FetchGroupSharingRequestsParam,
  CreatePlatformEndpointRequest,
  DeviceParams,
  NodePayload,
  MultipleNodePayload,
} from "@espressif/rainmaker-base-sdk";

// output
import type {
  ESPAPIResponse,
  ESPAPIError,
  LoginWithPasswordResponse,
  RequestLoginOTPResponse,
  LoginWithOTPResponse,
  GetUserInfoResponse,
  ESPRMUserInfo,
  ExtendSessionResponse,
  LoginWithOauthCodeResponse,
  CreateGroupAPIResponse,
  GetGroupsAPIResponse,
  GetGroupsResponse,
  GetNodesAPIResponse,
  ESPPaginatedNodesResponse,
  GetNodeDeatailsAPIResponse,
  GetNodeSharingRequestsAPIResponse,
  ESPNodeSharingResponse,
  ESPPaginatedGroupsResponse,
  CreateSubGroupAPIResponse,
  ESPGroupSharingResponse,
  GetGroupSharingRequestsAPIResponse,
} from "@espressif/rainmaker-base-sdk";

// node
import type {
  ESPRMNodeInterface,
  ESPRMConnectivityStatusInterface,
  ESPRMNodeConfigInterface,
  ESPRMNodeInfoInterface,
  ESPRMDeviceInterface,
  ESPRMAttributeInterface,
  ESPRMDeviceParamInterface,
  ESPRMServiceInterface,
  ESPRMServiceParamInterface,
} from "@espressif/rainmaker-base-sdk";

// provision
import type {
  ESPTransport,
  ESPSecurity,
  ESPProvisionStatus,
  ESPConnectStatus,
  ESPWifiList,
  ESPDeviceInterface,
  ESPProvisionAdapterInterface,
  ESPProvResponse,
  ESPProvResponseStatus,
} from "@espressif/rainmaker-base-sdk";

// storage
import type { ESPRMStorageAdapterInterface } from "@espressif/rainmaker-base-sdk";

//transport
import type {
  ESPTransportMode,
  ESPTransportConfig,
  ESPTransportInterface,
} from "@espressif/rainmaker-base-sdk";

// Automation enums
import {
  ESPAutomationConditionOperator,
  ESPAutomationEventOperator,
  ESPAutomationEventType,
  ESPWeatherParameter,
  ESPWeatherCondition,
  ESPDaylightEvent,
} from "@espressif/rainmaker-base-sdk";

// Automation types
import type {
  ESPAutomationEvent,
  ESPWeatherEvent,
  ESPAutomationAction,
  ESPAutomationDetails,
  ESPGeoCoordinates,
  ESPWeatherAutomationDetails,
  ESPDaylightAutomationDetails,
  ESPAutomationUpdateDetails,
  ESPAutomationInterface,
  ESPRawAutomationResponse,
  ESPPaginatedAutomationsResponse,
} from "@espressif/rainmaker-base-sdk";

import { CDF } from "../store";

// local imports
import { SceneOperation } from "../utils/constants";

type Interceptor = (
  originalFunction: Function,
  context: any,
  args: any[]
) => any;

type Action = (context: any, args: any[]) => void;
type Rollback = (context: any, prevContext: any) => void;
type OnSuccess = (result: any, args: any[], context: any) => Promise<any> | any;
type OnError = (error: any) => Promise<any> | any;

interface InterceptorConfig {
  action?: Action;
  rollback?: Rollback;
  onSuccess?: OnSuccess;
  onError?: OnError;
}

interface CDFconfig {
  autoSync?: boolean;
}

interface ESPRMAuthWithKeys extends ESPRMAuth {
  [key: string]: Function;
}

// ========================================================================
// Scene Interfaces
// ========================================================================

// Base Scene interface
interface Scene {
  id: string;
  name: string;
  info?: string;
  nodes: string[]; // Array of node IDs where scene is present
  actions: {
    // Configuration object
    [key: string]: {
      // Node-specific configuration
      [key: string]: {
        // Device-specific parameters
        [key: string]: any; // Parameter values
      };
    };
  };
  devicesCount: number;
  callbackUpdateOperation: { [key: string]: SceneOperation }; // Track operation types for each node
  add: () => Promise<ESPAPIResponse | undefined>;
  edit: ({
    name,
    actions,
    info,
  }: {
    name: string;
    actions: any;
    info?: string;
  }) => Promise<ESPAPIResponse | undefined>;
  remove: () => Promise<ESPAPIResponse | undefined>;
  activate: () => Promise<ESPAPIResponse | undefined>;
}

// ========================================================================
// Export Interfaces
// ========================================================================

export {
  ESPDevice,
  ESPGroupSharingInfo,
  ESPGroupSharingRequest,
  ESPGroupSharingUserInfo,
  ESPNodeSharingRequest,
  ESPPlatformEndpoint,
  ESPRMAttribute,
  ESPRMConnectivityStatus,
  ESPRMDevice,
  ESPRMDeviceParam,
  ESPRMNodeConfig,
  ESPRMNodeInfo,
  ESPRMService,
  ESPRMServiceParam,
  ESPRMUser,
  ESPDiscoveryProtocol,
  ESPNodeSharingRequestInterface,
  ESPGroupSharingRequestInterface,
  ESPGroupSharingStatus,
  ESPPlatformEndpointInterface,
  ESPRMBaseConfig,
  SignUpRequest,
  ConfirmUserRequest,
  LoginWithPasswordRequest,
  LoginWithOTPRequest,
  SetNewPasswordRequest,
  UserTokensData,
  ChangePasswordRequest,
  LogoutRequest,
  GetUserInfoRequest,
  tokenName,
  CreateGroupRequest,
  ESPRMGroupInterface,
  GetUserNodesRequestParams,
  UpdateGroupInfoRequest,
  ShareGroupsRequest,
  TransferGroupsRequest,
  ShareWithRequest,
  TransferNodeRequest,
  FetchNodeSharingRequestsParam,
  EventCallbacks,
  GetGroupsRequestParams,
  GetGroupByIdRequestParams,
  CreateSubGroupRequest,
  GetGroupByNameRequestParams,
  ShareGroupRequest,
  TransferGroupRequest,
  ESPGroupSharingUserInfoInterface,
  ESPGroupSharingInfoInterface,
  GetSharingInfoRequest,
  FetchGroupSharingRequestsParam,
  CreatePlatformEndpointRequest,
  DeviceParams,
  NodePayload,
  MultipleNodePayload,
  ESPAPIResponse,
  ESPAPIError,
  LoginWithPasswordResponse,
  RequestLoginOTPResponse,
  LoginWithOTPResponse,
  GetUserInfoResponse,
  ESPRMUserInfo,
  ExtendSessionResponse,
  LoginWithOauthCodeResponse,
  CreateGroupAPIResponse,
  GetGroupsAPIResponse,
  GetGroupsResponse,
  GetNodesAPIResponse,
  ESPPaginatedNodesResponse,
  GetNodeDeatailsAPIResponse,
  GetNodeSharingRequestsAPIResponse,
  ESPRMNodeInterface,
  ESPRMConnectivityStatusInterface,
  ESPRMNodeConfigInterface,
  ESPRMNodeInfoInterface,
  ESPRMDeviceInterface,
  ESPRMAttributeInterface,
  ESPRMDeviceParamInterface,
  ESPRMServiceInterface,
  ESPRMServiceParamInterface,
  ESPTransport,
  ESPSecurity,
  ESPProvisionStatus,
  ESPConnectStatus,
  ESPWifiList,
  ESPDeviceInterface,
  ESPProvisionAdapterInterface,
  ESPProvResponse,
  ESPProvResponseStatus,
  ESPRMStorageAdapterInterface,
  ESPTransportMode,
  ESPTransportConfig,
  ESPTransportInterface,
  ESPNodeSharingResponse,
  ESPPaginatedGroupsResponse,
  CreateSubGroupAPIResponse,
  ESPGroupSharingResponse,
  GetGroupSharingRequestsAPIResponse,
  ESPRMGroup,
  ESPRMNode,
  Interceptor,
  Action,
  Rollback,
  OnSuccess,
  OnError,
  InterceptorConfig,
  CDFconfig,
  ESPRMAuth,
  ESPRMAuthWithKeys,
  CDF,
  Scene,
  ESPAutomationConditionOperator,
  ESPAutomationEventOperator,
  ESPAutomationEventType,
  ESPWeatherParameter,
  ESPWeatherCondition,
  ESPDaylightEvent,
  ESPGeoCoordinates,
  ESPAutomationEvent,
  ESPWeatherEvent,
  ESPAutomationAction,
  ESPAutomationDetails,
  ESPWeatherAutomationDetails,
  ESPDaylightAutomationDetails,
  ESPAutomation,
  ESPAutomationUpdateDetails,
  ESPAutomationInterface,
  ESPRawAutomationResponse,
  ESPPaginatedAutomationsResponse,
};

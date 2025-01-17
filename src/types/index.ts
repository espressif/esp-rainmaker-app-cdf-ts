/*
 * SPDX-FileCopyrightText: 2025 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

// main modules
import type { ESPRMGroup } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMGroup";
import type { ESPRMNode } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMNode";
import type { ESPDevice } from "@espressif/rainmaker-base-sdk/dist/types/ESPDevice";
import type { ESPGroupSharingInfo } from "@espressif/rainmaker-base-sdk/dist/types/ESPGroupSharingInfo";
import type { ESPGroupSharingRequest } from "@espressif/rainmaker-base-sdk/dist/types/ESPGroupSharingRequest";
import type { ESPGroupSharingUserInfo } from "@espressif/rainmaker-base-sdk/dist/types/ESPGroupSharingUserInfo";
import type { ESPNodeSharingRequest } from "@espressif/rainmaker-base-sdk/dist/types/ESPNodeSharingRequest";
import type { ESPPlatformEndpoint } from "@espressif/rainmaker-base-sdk/dist/types/ESPPlatformEndpoint";
import type { ESPProvisionManager } from "@espressif/rainmaker-base-sdk/dist/types/ESPProvisionManager";
import type { ESPRMAttribute } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMAttribute";
import type { ESPRMConnectivityStatus } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMConnectivityStatus";
import type { ESPRMDevice } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMDevice";
import type { ESPRMDeviceParam } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMDeviceParam";
import type { ESPRMNodeConfig } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMNodeConfig";
import type { ESPRMNodeInfo } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMNodeInfo";
import type { ESPRMService } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMService";
import type { ESPRMServiceParam } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMServiceParam";
import type { ESPRMUser } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMUser";
import type { ESPRMAuth } from "@espressif/rainmaker-base-sdk/dist/types/ESPRMAuth";

// discovery
import type { ESPDiscoveryProtocol } from "@espressif/rainmaker-base-sdk/dist/types/types/discovery";

// ESPModules
import type {
  ESPNodeSharingRequestInterface,
  ESPGroupSharingRequestInterface,
  ESPGroupSharingStatus,
  ESPPlatformEndpointInterface,
} from "@espressif/rainmaker-base-sdk/dist/types/types/ESPModules";

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
} from "@espressif/rainmaker-base-sdk/dist/types/types/input";

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
} from "@espressif/rainmaker-base-sdk/dist/types/types/output";

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
} from "@espressif/rainmaker-base-sdk/dist/types/types/node";

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
} from "@espressif/rainmaker-base-sdk/dist/types/types/provision";

// storage
import type { ESPRMStorageAdapterInterface } from "@espressif/rainmaker-base-sdk/dist/types/types/storage";

//transport
import type {
  ESPTransportMode,
  ESPTransportConfig,
  ESPTransportInterface,
} from "@espressif/rainmaker-base-sdk/dist/types/types/transport";
import { CDF } from "../store";

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
// Export Interfaces
// ========================================================================

export {
  ESPDevice,
  ESPGroupSharingInfo,
  ESPGroupSharingRequest,
  ESPGroupSharingUserInfo,
  ESPNodeSharingRequest,
  ESPPlatformEndpoint,
  ESPProvisionManager,
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
};

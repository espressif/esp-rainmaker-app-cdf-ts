/*
 * SPDX-FileCopyrightText: 2026 Espressif Systems (Shanghai) CO LTD
 *
 * SPDX-License-Identifier: Apache-2.0
 */

import { ESPCDFUser } from "../entities/ESPCDFUser";
import {
  ESPCDFConfirmSignUpRequestPayload,
  ESPCDFForgotPasswordRequestPayload,
  ESPCDFGetSignUpCodeRequestPayload,
  ESPCDFLoginRequestPayload,
  ESPCDFLoginWithOauthRequestPayload,
  ESPCDFSetNewPasswordRequestPayload,
} from "./authService";

export interface ESPSDKAdaptorAPIRequest<REQUEST_DATA = any> {
  request?: REQUEST_DATA;
}

export interface ESPSDKAdaptorAPIResponse<RESPONSE_DATA = any> {
  status: string;
  description?: string;
  data?: RESPONSE_DATA;
}
export interface ESPSDKAdaptorAPIDataResponse<
  RESPONSE_DATA = any,
> extends ESPSDKAdaptorAPIResponse<RESPONSE_DATA> {
  data: RESPONSE_DATA;
}

export interface ESPSDKAdaptor {
  readonly _identifier: string;
  readonly config: Record<string, any>;
  login(
    request: ESPSDKAdaptorAPIRequest<ESPCDFLoginRequestPayload>
  ): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>>;
  getCurrentLoggedInUser(): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>>;
  loginWithOauth(
    request: ESPSDKAdaptorAPIRequest<ESPCDFLoginWithOauthRequestPayload>
  ): Promise<ESPSDKAdaptorAPIDataResponse<ESPCDFUser>>;
  getSignUpCode(
    request: ESPSDKAdaptorAPIRequest<ESPCDFGetSignUpCodeRequestPayload>
  ): Promise<ESPSDKAdaptorAPIResponse>;
  confirmSignUp(
    request: ESPSDKAdaptorAPIRequest<ESPCDFConfirmSignUpRequestPayload>
  ): Promise<ESPSDKAdaptorAPIResponse>;
  forgotPassword(
    request: ESPSDKAdaptorAPIRequest<ESPCDFForgotPasswordRequestPayload>
  ): Promise<ESPSDKAdaptorAPIResponse>;
  setNewPassword(
    request: ESPSDKAdaptorAPIRequest<ESPCDFSetNewPasswordRequestPayload>
  ): Promise<ESPSDKAdaptorAPIResponse>;
}

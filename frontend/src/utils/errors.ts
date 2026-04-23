
export enum ErrorCode {
  
  AUTH_INVALID_CREDENTIALS = 'AUTH_1001',
  AUTH_TOKEN_EXPIRED = 'AUTH_1002',
  AUTH_TOKEN_INVALID = 'AUTH_1003',
  AUTH_ACCOUNT_LOCKED = 'AUTH_1004',
  AUTH_INSUFFICIENT_PERMISSIONS = 'AUTH_1005',
  AUTH_SESSION_EXPIRED = 'AUTH_1006',

  VALIDATION_REQUIRED_FIELD = 'VAL_2001',
  VALIDATION_INVALID_FORMAT = 'VAL_2002',
  VALIDATION_OUT_OF_RANGE = 'VAL_2003',
  VALIDATION_DUPLICATE = 'VAL_2004',
  VALIDATION_CONSTRAINT = 'VAL_2005',
  VALIDATION_DATE_RANGE = 'VAL_2006',

  RESOURCE_NOT_FOUND = 'RES_3001',
  RESOURCE_ALREADY_EXISTS = 'RES_3002',
  RESOURCE_CONFLICT = 'RES_3003',
  RESOURCE_LOCKED = 'RES_3004',
  RESOURCE_DELETED = 'RES_3005',

  TRIP_INVALID_STATUS_TRANSITION = 'TRIP_4001',
  TRIP_ALREADY_ASSIGNED = 'TRIP_4002',
  TRIP_NO_AVAILABLE_TORPEDO = 'TRIP_4003',
  TRIP_TORPEDO_BUSY = 'TRIP_4004',
  TRIP_COMPLETED = 'TRIP_4005',
  TRIP_CANCELED = 'TRIP_4006',
  TRIP_STUCK = 'TRIP_4007',

  FLEET_IN_MAINTENANCE = 'FLEET_5001',
  FLEET_ALREADY_ASSIGNED = 'FLEET_5002',
  FLEET_NOT_AVAILABLE = 'FLEET_5003',

  PLAN_DATE_PASSED = 'PLAN_6001',
  PLAN_ALREADY_CONFIRMED = 'PLAN_6002',
  PLAN_CAPACITY_EXCEEDED = 'PLAN_6003',
  PLAN_OVERLAPPING = 'PLAN_6004',

  RATE_LIMIT_EXCEEDED = 'RATE_7001',

  SERVER_INTERNAL_ERROR = 'SRV_9001',
  SERVER_DATABASE_ERROR = 'SRV_9002',
  SERVER_EXTERNAL_SERVICE = 'SRV_9003',
  SERVER_TIMEOUT = 'SRV_9004',
}

export interface FieldError {
  field: string;
  message: string;
  code?: string;
}

export interface ApiErrorResponse {
  success: boolean;
  error: string;
  error_code: string;
  message: string;
  details?: Record<string, unknown>;
  field_errors?: FieldError[];
  request_id?: string;
}

export interface ParsedError {
  message: string;
  errorCode?: string;
  fieldErrors?: FieldError[];
  isRetryable: boolean;
  isAuthError: boolean;
  isValidationError: boolean;
  httpStatus?: number;
  details?: Record<string, unknown>;
}

const USER_FRIENDLY_MESSAGES: Record<string, string> = {
  
  [ErrorCode.AUTH_INVALID_CREDENTIALS]: 'Invalid username or password. Please try again.',
  [ErrorCode.AUTH_TOKEN_EXPIRED]: 'Your session has expired. Please log in again.',
  [ErrorCode.AUTH_TOKEN_INVALID]: 'Your session is invalid. Please log in again.',
  [ErrorCode.AUTH_ACCOUNT_LOCKED]: 'Your account has been locked. Please contact an administrator.',
  [ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS]: 'You do not have permission to perform this action.',
  [ErrorCode.AUTH_SESSION_EXPIRED]: 'Your session has expired. Please log in again.',

  [ErrorCode.VALIDATION_REQUIRED_FIELD]: 'Please fill in all required fields.',
  [ErrorCode.VALIDATION_INVALID_FORMAT]: 'Please check the format of your input.',
  [ErrorCode.VALIDATION_OUT_OF_RANGE]: 'The value is outside the allowed range.',
  [ErrorCode.VALIDATION_DUPLICATE]: 'This value already exists.',
  [ErrorCode.VALIDATION_CONSTRAINT]: 'The input does not meet the required constraints.',
  [ErrorCode.VALIDATION_DATE_RANGE]: 'The selected dates are invalid.',

  [ErrorCode.RESOURCE_NOT_FOUND]: 'The requested item was not found.',
  [ErrorCode.RESOURCE_ALREADY_EXISTS]: 'This item already exists.',
  [ErrorCode.RESOURCE_CONFLICT]: 'This action conflicts with the current state.',
  [ErrorCode.RESOURCE_LOCKED]: 'This item is currently locked by another process.',
  [ErrorCode.RESOURCE_DELETED]: 'This item has been deleted.',

  [ErrorCode.TRIP_INVALID_STATUS_TRANSITION]: 'This status change is not allowed.',
  [ErrorCode.TRIP_ALREADY_ASSIGNED]: 'This trip has already been assigned.',
  [ErrorCode.TRIP_NO_AVAILABLE_TORPEDO]: 'No torpedoes are currently available.',
  [ErrorCode.TRIP_TORPEDO_BUSY]: 'The selected torpedo is currently busy.',
  [ErrorCode.TRIP_COMPLETED]: 'This trip has already been completed.',
  [ErrorCode.TRIP_CANCELED]: 'This trip has been canceled.',
  [ErrorCode.TRIP_STUCK]: 'This trip appears to be stuck. Please investigate.',

  [ErrorCode.FLEET_IN_MAINTENANCE]: 'This torpedo is currently under maintenance.',
  [ErrorCode.FLEET_ALREADY_ASSIGNED]: 'This torpedo is already assigned to a trip.',
  [ErrorCode.FLEET_NOT_AVAILABLE]: 'This torpedo is not available.',

  [ErrorCode.PLAN_DATE_PASSED]: 'Cannot modify plans for past dates.',
  [ErrorCode.PLAN_ALREADY_CONFIRMED]: 'This plan has already been confirmed.',
  [ErrorCode.PLAN_CAPACITY_EXCEEDED]: 'The planned capacity exceeds available resources.',
  [ErrorCode.PLAN_OVERLAPPING]: 'This plan overlaps with an existing plan.',

  [ErrorCode.RATE_LIMIT_EXCEEDED]: 'Too many requests. Please wait a moment and try again.',

  [ErrorCode.SERVER_INTERNAL_ERROR]: 'An unexpected error occurred. Please try again later.',
  [ErrorCode.SERVER_DATABASE_ERROR]: 'A database error occurred. Please try again later.',
  [ErrorCode.SERVER_EXTERNAL_SERVICE]: 'An external service is unavailable. Please try again later.',
  [ErrorCode.SERVER_TIMEOUT]: 'The request timed out. Please try again.',
};

export function parseApiError(error: unknown, httpStatus?: number): ParsedError {
  
  if (isApiErrorResponse(error)) {
    const errorCode = error.error_code;
    const userMessage = USER_FRIENDLY_MESSAGES[errorCode] || error.message;

    return {
      message: userMessage,
      errorCode,
      fieldErrors: error.field_errors,
      isRetryable: isRetryableErrorCode(errorCode),
      isAuthError: isAuthErrorCode(errorCode),
      isValidationError: isValidationErrorCode(errorCode),
      httpStatus,
      details: error.details,
    };
  }

  if (error instanceof Error) {
    return {
      message: error.message || 'An unexpected error occurred.',
      isRetryable: isRetryableHttpStatus(httpStatus),
      isAuthError: httpStatus === 401,
      isValidationError: httpStatus === 422 || httpStatus === 400,
      httpStatus,
    };
  }

  if (typeof error === 'string') {
    return {
      message: error,
      isRetryable: false,
      isAuthError: false,
      isValidationError: false,
    };
  }

  return {
    message: 'An unexpected error occurred. Please try again.',
    isRetryable: true,
    isAuthError: false,
    isValidationError: false,
  };
}

function isApiErrorResponse(obj: unknown): obj is ApiErrorResponse {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'error_code' in obj &&
    'message' in obj
  );
}

function isRetryableErrorCode(code: string): boolean {
  return code.startsWith('SRV_') || code === ErrorCode.RATE_LIMIT_EXCEEDED;
}

function isAuthErrorCode(code: string): boolean {
  return code.startsWith('AUTH_');
}

function isValidationErrorCode(code: string): boolean {
  return code.startsWith('VAL_');
}

function isRetryableHttpStatus(status?: number): boolean {
  if (!status) return true;
  return status >= 500 || status === 429 || status === 408;
}

export function getErrorMessage(errorCode: string): string {
  return USER_FRIENDLY_MESSAGES[errorCode] || 'An unexpected error occurred.';
}

export function getFieldErrorsMap(fieldErrors?: FieldError[]): Record<string, string> {
  if (!fieldErrors || fieldErrors.length === 0) {
    return {};
  }

  return fieldErrors.reduce((acc, { field, message }) => {
    acc[field] = message;
    return acc;
  }, {} as Record<string, string>);
}

export function formatFieldErrors(fieldErrors?: FieldError[]): string {
  if (!fieldErrors || fieldErrors.length === 0) {
    return '';
  }

  return fieldErrors.map(({ field, message }) => `${field}: ${message}`).join('\n');
}

export type ErrorCategory = 'auth' | 'validation' | 'resource' | 'trip' | 'server' | 'unknown';

export function getErrorCategory(errorCode?: string): ErrorCategory {
  if (!errorCode) return 'unknown';

  if (errorCode.startsWith('AUTH_')) return 'auth';
  if (errorCode.startsWith('VAL_')) return 'validation';
  if (errorCode.startsWith('RES_')) return 'resource';
  if (errorCode.startsWith('TRIP_') || errorCode.startsWith('FLEET_') || errorCode.startsWith('PLAN_')) return 'trip';
  if (errorCode.startsWith('SRV_') || errorCode === ErrorCode.RATE_LIMIT_EXCEEDED) return 'server';

  return 'unknown';
}

export interface AsyncErrorOptions {
  showNotification?: (type: 'error' | 'warning', message: string) => void;
  onAuthError?: () => void;
  onRetry?: () => void;
  rethrow?: boolean;
}

export function withErrorHandling<T>(
  asyncFn: () => Promise<T>,
  options: AsyncErrorOptions = {}
): Promise<T | null> {
  const { showNotification, onAuthError, rethrow = false } = options;

  return asyncFn().catch((error) => {
    const parsed = parseApiError(error);

    if (parsed.isAuthError && onAuthError) {
      onAuthError();
    }

    if (showNotification) {
      showNotification(
        parsed.isRetryable ? 'warning' : 'error',
        parsed.message
      );
    }

    if (rethrow) {
      throw error;
    }

    return null;
  });
}

export function createApiHandler<T>(
  apiCall: () => Promise<T>,
  options: AsyncErrorOptions & {
    onSuccess?: (data: T) => void;
    onError?: (error: ParsedError) => void;
  } = {}
): () => Promise<{ success: boolean; data?: T; error?: ParsedError }> {
  return async () => {
    try {
      const data = await apiCall();
      options.onSuccess?.(data);
      return { success: true, data };
    } catch (error) {
      const parsed = parseApiError(error);

      if (parsed.isAuthError && options.onAuthError) {
        options.onAuthError();
      }

      if (options.showNotification) {
        options.showNotification(
          parsed.isRetryable ? 'warning' : 'error',
          parsed.message
        );
      }

      options.onError?.(parsed);

      return { success: false, error: parsed };
    }
  };
}

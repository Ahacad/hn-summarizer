/**
 * Error Handling Utilities
 * 
 * This module provides utilities for handling errors in a consistent way
 * throughout the application.
 */

/**
 * Application error codes
 */
export enum ErrorCode {
  // General errors
  UNKNOWN = 'UNKNOWN',
  INVALID_INPUT = 'INVALID_INPUT',
  NOT_FOUND = 'NOT_FOUND',
  
  // API errors
  API_ERROR = 'API_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  
  // Content errors
  EXTRACTION_FAILED = 'EXTRACTION_FAILED',
  CONTENT_NOT_FOUND = 'CONTENT_NOT_FOUND',
  
  // Storage errors
  DATABASE_ERROR = 'DATABASE_ERROR',
  STORAGE_ERROR = 'STORAGE_ERROR',
  
  // LLM errors
  SUMMARIZATION_FAILED = 'SUMMARIZATION_FAILED',
  
  // Notification errors
  NOTIFICATION_FAILED = 'NOTIFICATION_FAILED'
}

/**
 * Application error
 */
export class AppError extends Error {
  code: ErrorCode;
  statusCode: number;
  data?: any;
  
  /**
   * Create a new application error
   * 
   * @param message Error message
   * @param code Error code
   * @param statusCode HTTP status code
   * @param data Additional error data
   */
  constructor(
    message: string,
    code: ErrorCode = ErrorCode.UNKNOWN,
    statusCode: number = 500,
    data?: any
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.data = data;
  }
  
  /**
   * Convert to a JSON object
   */
  toJSON(): Record<string, any> {
    return {
      error: {
        message: this.message,
        code: this.code,
        ...(this.data ? { data: this.data } : {})
      }
    };
  }
  
  /**
   * Create a Response object from this error
   */
  toResponse(): Response {
    return new Response(JSON.stringify(this.toJSON()), {
      status: this.statusCode,
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }
}

/**
 * Create a not found error
 */
export function notFound(message = 'Resource not found', data?: any): AppError {
  return new AppError(message, ErrorCode.NOT_FOUND, 404, data);
}

/**
 * Create a bad request error
 */
export function badRequest(message = 'Invalid request', data?: any): AppError {
  return new AppError(message, ErrorCode.INVALID_INPUT, 400, data);
}

/**
 * Create an internal server error
 */
export function serverError(message = 'Internal server error', data?: any): AppError {
  return new AppError(message, ErrorCode.UNKNOWN, 500, data);
}

/**
 * Wrapper function for async route handlers
 */
export function asyncHandler(
  handler: (request: Request, env: any, ctx: ExecutionContext) => Promise<Response>
): (request: Request, env: any, ctx: ExecutionContext) => Promise<Response> {
  return async (request: Request, env: any, ctx: ExecutionContext) => {
    try {
      return await handler(request, env, ctx);
    } catch (error) {
      if (error instanceof AppError) {
        return error.toResponse();
      }
      
      // Convert regular errors to AppError
      const appError = new AppError(
        error.message || 'An unexpected error occurred',
        ErrorCode.UNKNOWN,
        500,
        { stack: error.stack }
      );
      
      return appError.toResponse();
    }
  };
}

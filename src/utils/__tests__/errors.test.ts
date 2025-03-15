import { 
  AppError, 
  ErrorCode, 
  notFound, 
  badRequest, 
  serverError,
  asyncHandler
} from '../errors';

describe('Error Utilities', () => {
  describe('AppError', () => {
    it('should create an error with the correct properties', () => {
      const error = new AppError(
        'Test error message',
        ErrorCode.API_ERROR,
        400,
        { details: 'Additional error details' }
      );
      
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe(ErrorCode.API_ERROR);
      expect(error.statusCode).toBe(400);
      expect(error.data).toEqual({ details: 'Additional error details' });
    });
    
    it('should use default values if not provided', () => {
      const error = new AppError('Test error message');
      
      expect(error.message).toBe('Test error message');
      expect(error.code).toBe(ErrorCode.UNKNOWN);
      expect(error.statusCode).toBe(500);
      expect(error.data).toBeUndefined();
    });
    
    it('should convert to JSON correctly', () => {
      const error = new AppError(
        'Test error message',
        ErrorCode.API_ERROR,
        400,
        { details: 'Additional error details' }
      );
      
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: {
          message: 'Test error message',
          code: ErrorCode.API_ERROR,
          data: { details: 'Additional error details' }
        }
      });
    });
    
    it('should exclude data from JSON if not provided', () => {
      const error = new AppError('Test error message', ErrorCode.API_ERROR, 400);
      
      const json = error.toJSON();
      
      expect(json).toEqual({
        error: {
          message: 'Test error message',
          code: ErrorCode.API_ERROR
        }
      });
    });
    
    it('should convert to Response correctly', () => {
      const error = new AppError(
        'Test error message',
        ErrorCode.API_ERROR,
        400,
        { details: 'Additional error details' }
      );
      
      const response = error.toResponse();
      
      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(400);
      expect(response.headers.get('Content-Type')).toBe('application/json');
    });
  });
  
  describe('Factory functions', () => {
    it('should create a not found error', () => {
      const error = notFound('Resource not found', { id: 123 });
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Resource not found');
      expect(error.code).toBe(ErrorCode.NOT_FOUND);
      expect(error.statusCode).toBe(404);
      expect(error.data).toEqual({ id: 123 });
    });
    
    it('should create a bad request error', () => {
      const error = badRequest('Invalid request', { field: 'email' });
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Invalid request');
      expect(error.code).toBe(ErrorCode.INVALID_INPUT);
      expect(error.statusCode).toBe(400);
      expect(error.data).toEqual({ field: 'email' });
    });
    
    it('should create a server error', () => {
      const error = serverError('Internal server error', { context: 'database' });
      
      expect(error).toBeInstanceOf(AppError);
      expect(error.message).toBe('Internal server error');
      expect(error.code).toBe(ErrorCode.UNKNOWN);
      expect(error.statusCode).toBe(500);
      expect(error.data).toEqual({ context: 'database' });
    });
    
    it('should use default messages if not provided', () => {
      expect(notFound().message).toBe('Resource not found');
      expect(badRequest().message).toBe('Invalid request');
      expect(serverError().message).toBe('Internal server error');
    });
  });
  
  describe('asyncHandler', () => {
    it('should pass through successful responses', async () => {
      // Create a handler that returns a successful response
      const successHandler = jest.fn().mockResolvedValue(
        new Response('Success', { status: 200 })
      );
      
      // Wrap the handler
      const wrappedHandler = asyncHandler(successHandler);
      
      // Create test request
      const request = new Request('https://example.com/test');
      const env = {};
      const ctx = new ExecutionContext();
      
      // Call the wrapped handler
      const response = await wrappedHandler(request, env, ctx);
      
      // Verify the original handler was called
      expect(successHandler).toHaveBeenCalledWith(request, env, ctx);
      
      // Verify the response is passed through
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('Success');
    });
    
    it('should convert AppError to Response', async () => {
      // Create a handler that throws an AppError
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new AppError('App error', ErrorCode.API_ERROR, 400);
      });
      
      // Wrap the handler
      const wrappedHandler = asyncHandler(errorHandler);
      
      // Call the wrapped handler
      const response = await wrappedHandler(
        new Request('https://example.com/test'),
        {},
        new ExecutionContext()
      );
      
      // Verify the response has the correct status
      expect(response.status).toBe(400);
      
      // Verify the response body
      const body = await response.json();
      expect(body.error.message).toBe('App error');
      expect(body.error.code).toBe(ErrorCode.API_ERROR);
    });
    
    it('should convert regular errors to AppError', async () => {
      // Create a handler that throws a regular Error
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Regular error');
      });
      
      // Wrap the handler
      const wrappedHandler = asyncHandler(errorHandler);
      
      // Call the wrapped handler
      const response = await wrappedHandler(
        new Request('https://example.com/test'),
        {},
        new ExecutionContext()
      );
      
      // Verify the response has status 500
      expect(response.status).toBe(500);
      
      // Verify the response body
      const body = await response.json();
      expect(body.error.message).toBe('Regular error');
      expect(body.error.code).toBe(ErrorCode.UNKNOWN);
    });
  });
});

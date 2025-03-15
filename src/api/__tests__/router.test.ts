import { Router } from '../router';
import { logger } from '../../utils/logger';

// Mock the logger
jest.mock('../../utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn()
  }
}));

describe('Router', () => {
  let router: Router;
  
  beforeEach(() => {
    // Create a new router instance for each test
    router = new Router();
    
    // Clear all mocks
    jest.clearAllMocks();
  });
  
  describe('add', () => {
    it('should add a route handler', async () => {
      // Create a mock handler
      const mockHandler = jest.fn().mockResolvedValue(
        new Response('Test response', { status: 200 })
      );
      
      // Add the route
      router.add('GET', '/test', mockHandler);
      
      // Create a test request
      const request = new Request('https://example.com/test', { method: 'GET' });
      const env = {};
      const ctx = new ExecutionContext();
      
      // Handle the request
      const response = await router.handle(request, env, ctx);
      
      // Verify the handler was called
      expect(mockHandler).toHaveBeenCalledWith(request, env, ctx);
      
      // Verify the response
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('Test response');
    });
    
    it('should support multiple routes', async () => {
      // Create mock handlers
      const handler1 = jest.fn().mockResolvedValue(
        new Response('Response 1', { status: 200 })
      );
      
      const handler2 = jest.fn().mockResolvedValue(
        new Response('Response 2', { status: 201 })
      );
      
      // Add the routes
      router.add('GET', '/route1', handler1);
      router.add('POST', '/route2', handler2);
      
      // Test route 1
      const request1 = new Request('https://example.com/route1', { method: 'GET' });
      const response1 = await router.handle(request1, {}, new ExecutionContext());
      
      // Verify handler 1 was called
      expect(handler1).toHaveBeenCalled();
      expect(handler2).not.toHaveBeenCalled();
      await expect(response1.text()).resolves.toBe('Response 1');
      
      // Test route 2
      const request2 = new Request('https://example.com/route2', { method: 'POST' });
      const response2 = await router.handle(request2, {}, new ExecutionContext());
      
      // Verify handler 2 was called
      expect(handler2).toHaveBeenCalled();
      await expect(response2.text()).resolves.toBe('Response 2');
    });
  });
  
  describe('handle', () => {
    it('should handle wildcards in routes', async () => {
      // Create a mock handler
      const mockHandler = jest.fn().mockResolvedValue(
        new Response('Wildcard response', { status: 200 })
      );
      
      // Add a wildcard route
      router.add('GET', '/users/*', mockHandler);
      
      // Create a test request
      const request = new Request('https://example.com/users/123', { method: 'GET' });
      
      // Handle the request
      const response = await router.handle(request, {}, new ExecutionContext());
      
      // Verify the handler was called
      expect(mockHandler).toHaveBeenCalled();
      
      // Verify the response
      expect(response.status).toBe(200);
      await expect(response.text()).resolves.toBe('Wildcard response');
    });
    
    it('should return 404 for unknown routes', async () => {
      // Create a test request for a route that doesn't exist
      const request = new Request('https://example.com/unknown', { method: 'GET' });
      
      // Handle the request
      const response = await router.handle(request, {}, new ExecutionContext());
      
      // Verify response is 404
      expect(response.status).toBe(404);
    });
    
    it('should handle CORS preflight requests', async () => {
      // Create a test OPTIONS request
      const request = new Request('https://example.com/api', { 
        method: 'OPTIONS',
        headers: {
          'Origin': 'https://example.org',
          'Access-Control-Request-Method': 'POST'
        }
      });
      
      // Handle the request
      const response = await router.handle(request, {}, new ExecutionContext());
      
      // Verify response is 204 (No Content)
      expect(response.status).toBe(204);
      
      // Check CORS headers
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect(response.headers.get('Access-Control-Allow-Methods')).toContain('POST');
    });
    
    it('should handle errors in route handlers', async () => {
      // Create a handler that throws
      const errorHandler = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });
      
      // Add the route
      router.add('GET', '/error', errorHandler);
      
      // Create a test request
      const request = new Request('https://example.com/error', { method: 'GET' });
      
      // Handle the request
      const response = await router.handle(request, {}, new ExecutionContext());
      
      // Verify error was logged
      expect(logger.error).toHaveBeenCalledWith(
        'Error handling route',
        expect.objectContaining({ 
          error: expect.any(Error),
          method: 'GET',
          path: '/error'
        })
      );
      
      // Verify response is 500
      expect(response.status).toBe(500);
    });
  });
});

/**
 * API Router
 * 
 * This module provides a router for handling API requests.
 * It routes requests to the appropriate handlers based on the path and method.
 */

import { logger } from '../utils/logger';
import { asyncHandler } from '../utils/errors';

/**
 * Route handler type
 */
export type RouteHandler = (
  request: Request,
  env: any,
  ctx: ExecutionContext
) => Promise<Response>;

/**
 * HTTP methods
 */
export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS';

/**
 * Route definition
 */
interface Route {
  method: HttpMethod;
  path: string;
  handler: RouteHandler;
}

/**
 * API Router
 */
export class Router {
  private routes: Route[] = [];
  
  /**
   * Add a route
   * 
   * @param method HTTP method
   * @param path Route path
   * @param handler Route handler
   */
  add(method: HttpMethod, path: string, handler: RouteHandler): void {
    this.routes.push({
      method,
      path,
      handler: asyncHandler(handler)
    });
  }
  
  /**
   * Handle a request
   * 
   * @param request Request object
   * @param env Environment
   * @param ctx Execution context
   * @returns Response
   */
  async handle(
    request: Request,
    env: any,
    ctx: ExecutionContext
  ): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method as HttpMethod;
    const path = url.pathname;
    
    logger.debug('Handling request', { method, path });
    
    // Find a matching route
    const route = this.routes.find(r => {
      return r.method === method && this.pathMatches(r.path, path);
    });
    
    if (route) {
      try {
        return await route.handler(request, env, ctx);
      } catch (error) {
        logger.error('Error handling route', { error, method, path });
        return new Response('Internal Server Error', { status: 500 });
      }
    }
    
    // Handle CORS preflight requests
    if (method === 'OPTIONS') {
      return this.handleCors(request);
    }
    
    // No matching route found
    return new Response('Not Found', { status: 404 });
  }
  
  /**
   * Check if a path matches a route pattern
   * 
   * @param routePath Route pattern
   * @param requestPath Request path
   * @returns Whether the path matches
   */
  private pathMatches(routePath: string, requestPath: string): boolean {
    // For now, just check for exact matches or simple wildcards
    if (routePath === requestPath) {
      return true;
    }
    
    // Handle simple wildcards
    if (routePath.endsWith('/*') && requestPath.startsWith(routePath.slice(0, -2))) {
      return true;
    }
    
    // Future enhancement: Handle path parameters
    
    return false;
  }
  
  /**
   * Handle CORS preflight requests
   * 
   * @param request Request object
   * @returns Response
   */
  private handleCors(request: Request): Response {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Max-Age': '86400'
      }
    });
  }
}

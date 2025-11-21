/**
 * Route Registry
 *
 * This file contains the definitions for route metadata and the helper function `defineRoute`.
 * It allows us to declare routes with their OpenAPI metadata inline with their implementation.
 */

import { RequestHandler } from 'express';

export type HttpMethod = 'get' | 'post' | 'put' | 'delete' | 'patch' | 'head' | 'options';

export interface RouteDescriptor<
  ReqBody = any,
  ResBody = any,
  QueryParams = any,
  PathParams = any
> {
  method: HttpMethod;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  request?: {
    body?: any; // Type reference or Zod schema (we'll use TS types mostly)
    query?: any;
    params?: any;
    headers?: any;
  };
  response?: {
    body?: any;
    status?: number;
    description?: string;
  };
  handler: RequestHandler<PathParams, ResBody, ReqBody, QueryParams>;
  // We keep track of the definition location for the generator
  __source?: string;
}

/**
 * Helper to define a route with metadata.
 * The generator will pick this up to build the OpenAPI spec.
 */
export function defineRoute<
  ReqBody = any,
  ResBody = any,
  QueryParams = any,
  PathParams = any
>(
  descriptor: Omit<RouteDescriptor<ReqBody, ResBody, QueryParams, PathParams>, 'handler'> & {
    handler: RequestHandler<PathParams, ResBody, ReqBody, QueryParams>;
  }
): RouteDescriptor<ReqBody, ResBody, QueryParams, PathParams> {
  return descriptor;
}

// Registry to hold route definitions at runtime if needed,
// though the generator works by static analysis.
export const routeRegistry: RouteDescriptor[] = [];

export function registerRoute(route: RouteDescriptor) {
  routeRegistry.push(route);
  return route;
}

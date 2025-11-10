/**
 * Simple API Key Authentication Middleware
 * 
 * Protects API endpoints with a simple API key header check.
 * Set API_KEY environment variable to configure the key.
 * 
 * Usage in headers:
 *   X-API-Key: your-api-key-here
 */

import type { Request, Response, NextFunction } from 'express';
import { config } from '../config.js';
import { logger } from '../utils/logger.js';

export function requireApiKey(req: Request, res: Response, next: NextFunction): void {
  // Skip auth check if disabled (for development)
  if (!config.requireAuth) {
    next();
    return;
  }

  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey) {
    logger.warn({
      category: 'api',
      action: 'auth_missing',
      message: 'API request without API key',
      details: {
        ip: req.ip,
        path: req.path,
        method: req.method
      }
    });
    
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'API key required. Include X-API-Key header.'
    });
    return;
  }
  
  if (apiKey !== config.apiKey) {
    logger.warn({
      category: 'api',
      action: 'auth_invalid',
      message: 'API request with invalid API key',
      details: {
        ip: req.ip,
        path: req.path,
        method: req.method,
        providedKey: String(apiKey).substring(0, 8) + '...'
      }
    });
    
    res.status(401).json({
      success: false,
      error: 'UNAUTHORIZED',
      message: 'Invalid API key'
    });
    return;
  }
  
  // Valid API key - proceed
  next();
}

/**
 * Optional auth middleware - allows requests but logs them
 */
export function optionalApiKey(req: Request, res: Response, next: NextFunction): void {
  const apiKey = req.headers['x-api-key'];
  
  if (!apiKey || apiKey !== config.apiKey) {
    logger.info({
      category: 'api',
      action: 'unauthenticated_request',
      message: 'API request without valid authentication',
      details: {
        ip: req.ip,
        path: req.path,
        method: req.method,
        hasKey: !!apiKey
      }
    });
  }
  
  next();
}

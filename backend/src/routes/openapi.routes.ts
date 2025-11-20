/**
 * OpenAPI Documentation Routes
 *
 * Serves the generated OpenAPI specification and Swagger UI.
 */

import { Router } from 'express';
import swaggerUi from 'swagger-ui-express';
import { readFileSync, existsSync } from 'fs';
import { resolve } from 'path';
import { logger } from '../utils/logger.js';

const OPENAPI_SPEC_PATH = resolve(__dirname, '../../../shared/api-contracts/dist/openapi.json');

export function createOpenApiRouter() {
  const router = Router();

  // Helper to load spec
  const loadSpec = () => {
    if (existsSync(OPENAPI_SPEC_PATH)) {
      try {
        return JSON.parse(readFileSync(OPENAPI_SPEC_PATH, 'utf-8'));
      } catch (error) {
        logger.error({
            category: 'api',
            action: 'load_openapi_spec_error',
            message: 'Failed to parse OpenAPI spec',
            error
        });
        return null;
      }
    }
    return null;
  };

  const spec = loadSpec();

  // Serve raw JSON
  router.get('/json', (_req, res) => {
    const currentSpec = loadSpec(); // Reload in case it changed
    if (!currentSpec) {
      return res.status(404).json({ error: 'OpenAPI specification not found' });
    }
    res.json(currentSpec);
  });

  // Serve Swagger UI
  if (spec) {
    router.use('/', swaggerUi.serve, swaggerUi.setup(spec));
  } else {
    router.get('/', (_req, res) => {
      res.send('OpenAPI specification not generated yet. Please run "pnpm generate:openapi".');
    });
  }

  return router;
}

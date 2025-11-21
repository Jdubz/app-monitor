import { Project, SyntaxKind, CallExpression, ObjectLiteralExpression } from 'ts-morph';
import { createGenerator, Config } from 'ts-json-schema-generator';
import { writeFileSync, mkdirSync, existsSync } from 'fs';
import { resolve, join } from 'path';
import * as glob from 'glob';

// Configuration
const BACKEND_ROOT = resolve(__dirname, '../../../backend');
const SHARED_ROOT = resolve(__dirname, '../../../shared/api-contracts');
const OUTPUT_DIR = resolve(SHARED_ROOT, 'dist');
const OUTPUT_FILE = join(OUTPUT_DIR, 'openapi.json');
const TSCONFIG_PATH = resolve(BACKEND_ROOT, 'tsconfig.json');

interface OpenApiRoute {
  method: string;
  path: string;
  summary: string;
  description?: string;
  tags?: string[];
  requestBodySchema?: any;
  responseBodySchema?: any;
  queryParamsSchema?: any;
  pathParamsSchema?: any;
}

async function generateOpenApi() {
  console.log('Starting OpenAPI generation...');

  // 1. Initialize ts-morph project
  const project = new Project({
    tsConfigFilePath: TSCONFIG_PATH,
  });

  // 2. Find all files in backend/src/routes
  const routeFiles = glob.sync('src/routes/**/*.ts', { cwd: BACKEND_ROOT, absolute: true });
  project.addSourceFilesAtPaths(routeFiles);

  const routes: OpenApiRoute[] = [];
  const schemaDefinitions: Record<string, any> = {};

  // 3. Initialize JSON Schema Generator
  const schemaConfig: Config = {
    path: resolve(SHARED_ROOT, 'index.ts'),
    tsconfig: resolve(SHARED_ROOT, 'tsconfig.json'),
    type: '*', // We'll specific types later
    skipTypeCheck: true,
    expose: "all",
    jsDoc: "extended",
  };

  // We create a generator instance but we will use it selectively or use a helper to resolve types
  // Actually, ts-json-schema-generator is good for generating schema for a specific type name.
  // But we need to extract the type name from the defineRoute call.

  const generator = createGenerator(schemaConfig);

  // 4. Scan for defineRoute calls
  for (const sourceFile of project.getSourceFiles()) {
    const defineRouteCalls = sourceFile.getDescendantsOfKind(SyntaxKind.CallExpression)
      .filter(call => {
        const identifier = call.getExpression();
        return identifier.getText() === 'defineRoute' || identifier.getText().endsWith('.defineRoute');
      });

    for (const call of defineRouteCalls) {
      try {
        const route = extractRouteInfo(call, generator, schemaDefinitions);
        if (route) {
          routes.push(route);
        }
      } catch (err) {
        console.warn(`Failed to extract route info in ${sourceFile.getFilePath()}:`, err);
      }
    }
  }

  // 5. Assemble OpenAPI Spec
  const openApiDoc = {
    openapi: '3.0.0',
    info: {
      title: 'App Monitor API',
      version: '1.0.0',
      description: 'Generated OpenAPI documentation for App Monitor',
    },
    servers: [
      {
        url: 'http://localhost:3001/api',
        description: 'Development server'
      },
      {
        url: 'https://api.app-monitor.com/api',
        description: 'Production server'
      }
    ],
    paths: {} as Record<string, any>,
    components: {
      schemas: schemaDefinitions,
      securitySchemes: {
        apiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'x-api-key',
        },
      },
    },
    security: [
      {
        apiKey: [],
      },
    ],
  };

  // Group routes by path
  for (const route of routes) {
    // Convert Express path params (:id) to OpenAPI ({id})
    const openApiPath = route.path.replace(/:([a-zA-Z0-9_]+)/g, '{$1}');

    if (!openApiDoc.paths[openApiPath]) {
      openApiDoc.paths[openApiPath] = {};
    }

    const operation: any = {
      summary: route.summary,
      description: route.description,
      tags: route.tags || ['default'],
      responses: {},
    };

    // Add Response Schema
    if (route.responseBodySchema) {
      operation.responses['200'] = {
        description: 'Successful response',
        content: {
          'application/json': {
            schema: route.responseBodySchema,
          },
        },
      };
    } else {
      operation.responses['200'] = {
        description: 'Successful response',
      };
    }

    // Add Request Body Schema
    if (route.requestBodySchema) {
      operation.requestBody = {
        content: {
          'application/json': {
            schema: route.requestBodySchema,
          },
        },
      };
    }

    // Add Parameters (Path, Query)
    const parameters: any[] = [];

    // Extract path parameters from the path string
    const pathParamMatches = route.path.matchAll(/:([a-zA-Z0-9_]+)/g);
    for (const match of pathParamMatches) {
      const paramName = match[1];
      parameters.push({
        name: paramName,
        in: 'path',
        required: true,
        schema: route.pathParamsSchema?.[paramName] || { type: 'string' },
      });
    }

    // Add query parameters if schema exists
    if (route.queryParamsSchema) {
      const querySchema = route.queryParamsSchema;
      if (querySchema.properties) {
        for (const [paramName, paramSchema] of Object.entries(querySchema.properties)) {
          parameters.push({
            name: paramName,
            in: 'query',
            required: querySchema.required?.includes(paramName) || false,
            schema: paramSchema,
          });
        }
      }
    }

    if (parameters.length > 0) {
      operation.parameters = parameters;
    }

    openApiDoc.paths[openApiPath][route.method] = operation;
  }

  // 6. Fix all $ref references in schema definitions to use components/schemas
  const fixedDoc = JSON.parse(
    JSON.stringify(openApiDoc).replace(/#\/definitions\//g, '#/components/schemas/')
  );

  // 7. Write Output
  if (!existsSync(OUTPUT_DIR)) {
    mkdirSync(OUTPUT_DIR, { recursive: true });
  }
  writeFileSync(OUTPUT_FILE, JSON.stringify(fixedDoc, null, 2));
  console.log(`OpenAPI spec generated at ${OUTPUT_FILE}`);
}

function extractRouteInfo(
  call: CallExpression,
  generator: any,
  definitions: Record<string, any>
): OpenApiRoute | null {
  const args = call.getArguments();
  if (args.length === 0) return null;

  const configObj = args[0];
  if (!ObjectLiteralExpression.isObjectLiteralExpression(configObj)) {
    return null;
  }

  // Helper to get property value
  const getProp = (name: string) => {
    const prop = configObj.getProperty(name);
    if (!prop || !prop.isKind(SyntaxKind.PropertyAssignment)) return null;
    return prop.getInitializer();
  };

  const methodNode = getProp('method');
  const pathNode = getProp('path');
  const summaryNode = getProp('summary');
  const descriptionNode = getProp('description');
  const tagsNode = getProp('tags');
  const responseNode = getProp('response'); // Object literal
  const requestNode = getProp('request'); // Object literal

  if (!methodNode || !pathNode || !summaryNode) return null;

  // Strip quotes
  const cleanString = (s: string) => s.replace(/^['"`]|['"`]$/g, '');

  const method = cleanString(methodNode.getText());
  const path = cleanString(pathNode.getText());
  const summary = cleanString(summaryNode.getText());
  const description = descriptionNode ? cleanString(descriptionNode.getText()) : undefined;

  // Extract tags array
  let tags: string[] | undefined;
  if (tagsNode && tagsNode.getKind() === SyntaxKind.ArrayLiteralExpression) {
    tags = tagsNode.getText()
      .replace(/^\[|\]$/g, '')
      .split(',')
      .map(t => cleanString(t.trim()))
      .filter(Boolean);
  }

  let responseSchema = null;
  let requestSchema = null;

  // Extract Response Type
  if (responseNode && ObjectLiteralExpression.isObjectLiteralExpression(responseNode)) {
    const bodyProp = responseNode.getProperty('body');
    if (bodyProp && bodyProp.isKind(SyntaxKind.PropertyAssignment)) {
      const bodyInitializer = bodyProp.getInitializer();

      // We look for "{} as TypeName" or just TypeName if possible,
      // but our pattern is `{} as HealthCheckApiResponse`
      const asExpression = bodyInitializer?.asKind(SyntaxKind.AsExpression);
      if (asExpression) {
        const typeNode = asExpression.getTypeNode();
        if (typeNode) {
            // We use the type checker or text to get the type name
            // Simple approach: get text and ask generator
            const typeName = typeNode.getText();
            // We try to get schema for this type
            try {
                const schema = generator.createSchema(typeName);
                if (schema.definitions) {
                   Object.assign(definitions, schema.definitions);
                   delete schema.definitions;
                }
                // Remove $schema property as it's not valid in OpenAPI
                if (schema.$schema) {
                  delete schema.$schema;
                }
                // Convert JSON Schema $ref to OpenAPI format
                const schemaJson = JSON.stringify(schema);
                const fixedSchema = JSON.parse(
                  schemaJson.replace(/#\/definitions\//g, '#/components/schemas/')
                );
                responseSchema = fixedSchema;
            } catch (e) {
                console.warn(`Could not generate schema for response type ${typeName}:`, e);
            }
        }
      }
    }
  }

  // Extract Request Type (similar logic)
  if (requestNode && ObjectLiteralExpression.isObjectLiteralExpression(requestNode)) {
    const bodyProp = requestNode.getProperty('body');
    if (bodyProp && bodyProp.isKind(SyntaxKind.PropertyAssignment)) {
      const bodyInitializer = bodyProp.getInitializer();
      const asExpression = bodyInitializer?.asKind(SyntaxKind.AsExpression);
      if (asExpression) {
        const typeNode = asExpression.getTypeNode();
        if (typeNode) {
          const typeName = typeNode.getText();
          try {
            const schema = generator.createSchema(typeName);
            if (schema.definitions) {
              Object.assign(definitions, schema.definitions);
              delete schema.definitions;
            }
            // Remove $schema property as it's not valid in OpenAPI
            if (schema.$schema) {
              delete schema.$schema;
            }
            // Convert JSON Schema $ref to OpenAPI format
            const schemaJson = JSON.stringify(schema);
            const fixedSchema = JSON.parse(
              schemaJson.replace(/#\/definitions\//g, '#/components/schemas/')
            );
            requestSchema = fixedSchema;
          } catch (e) {
            console.warn(`Could not generate schema for request type ${typeName}:`, e);
          }
        }
      }
    }
  }

  return {
    method,
    path,
    summary,
    description,
    tags,
    responseBodySchema: responseSchema,
    requestBodySchema: requestSchema
  };
}

generateOpenApi().catch(console.error);

/**
 * Custom ESLint Local Rules
 *
 * Local rules for enforcing architectural patterns specific to this project.
 */

module.exports = {
  'no-direct-db-in-routes': require('./eslint-local-rules/no-direct-db-in-routes.cjs'),
};

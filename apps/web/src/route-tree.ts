/**
 * Manual route tree wiring.
 *
 * TanStack Router file-based routing typically uses a code-gen plugin.
 * For the scaffold phase we wire routes manually so the build stays
 * simple. Replace with @tanstack/router-plugin when the route count grows.
 */
import { Route as rootRoute } from './routes/__root.js';
import { Route as indexRoute } from './routes/index.js';
import { Route as itemsIdRoute } from './routes/items/$id.js';
import { Route as itemsIndexRoute } from './routes/items/index.js';
import { Route as loginRoute } from './routes/login.js';
import { Route as settingsIndexRoute } from './routes/settings/index.js';
import { Route as tagsIndexRoute } from './routes/tags/index.js';

export const routeTree = rootRoute.addChildren([
  indexRoute,
  itemsIndexRoute,
  itemsIdRoute,
  loginRoute,
  tagsIndexRoute,
  settingsIndexRoute,
]);

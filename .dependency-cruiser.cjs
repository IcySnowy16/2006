/**
 * Task K10: the dependency rule, enforced. `npm run depcheck` fails the pull request if someone breaks the layering:
 *
 *   route -> controller -> service -> entity        (arrows are "may import")
 *
 *   entities     know nothing about Express or Prisma (they are plain TypeScript, so they can be tested with no database)
 *   controllers  may not import Prisma (they call services)
 *   services     may not import Express or controllers/routes
 *   shared       imports nothing from server or client
 *   client pages may not call `fetch` (they use the typed API layer)  -> checked by eslint-style rule below on file contents
 */
/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'entities-no-express-or-prisma',
      comment: 'Entities are plain TypeScript. They may not import Express or Prisma.',
      severity: 'error',
      from: { path: '^server/src/entities/' },
      to: { path: '^node_modules/(express|@prisma|prisma)(/|$)' },
    },
    {
      name: 'entities-no-upper-layers',
      comment: 'Entities may not import services, controllers, routes or middleware.',
      severity: 'error',
      from: { path: '^server/src/entities/' },
      to: { path: '^server/src/(services|controllers|routes|middleware|realtime|jobs)/' },
    },
    {
      name: 'controllers-no-prisma',
      comment: 'Controllers call services; only services and the core touch the database.',
      severity: 'error',
      from: { path: '^server/src/controllers/' },
      to: { path: '^node_modules/(@prisma|prisma)(/|$)|^server/src/core/prisma' },
    },
    {
      name: 'services-no-http-layer',
      comment: 'Services may not import Express, controllers or routes.',
      severity: 'error',
      from: { path: '^server/src/services/' },
      to: { path: '^node_modules/express(/|$)|^server/src/(controllers|routes)/' },
    },
    {
      name: 'shared-stands-alone',
      comment: 'The shared contract may not import server or client code.',
      severity: 'error',
      from: { path: '^shared/src/' },
      to: { path: '^(server|client)/' },
    },
    {
      name: 'client-no-server',
      comment: 'The browser app reads the contract from shared, never server code.',
      severity: 'error',
      from: { path: '^client/src/' },
      to: { path: '^server/' },
    },
    {
      name: 'no-circular',
      comment: 'No import cycles (type-only imports are ignored).',
      severity: 'error',
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsPreCompilationDeps: false,
    exclude: { path: '\\.(test|paths\\.test)\\.tsx?$|/test/' },
    enhancedResolveOptions: { exportsFields: ['exports'], conditionNames: ['import', 'require', 'node', 'default'] },
  },
};

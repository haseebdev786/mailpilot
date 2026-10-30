# Prisma

`schema.prisma` is the schema source of truth. The four committed migrations initialize an empty database.

- `npm run db:generate`: generate the standard `@prisma/client` into node_modules.
- `npm run db:deploy`: apply committed migrations using `DATABASE_URL_UNPOOLED`.
- `npm run db:migrate`: create a new development migration on an isolated development database.
- `npm run db:seed`: create/refresh the known demo account and sample data; only use for an intentional demo.

The runtime uses `DATABASE_URL`. The generator output changed from a source-directory client to the standard package to avoid Windows/Next.js tracing errors; this does not change database tables.

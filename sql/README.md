# SQL Setup (Premier Post)

Execute these scripts in Supabase SQL Editor in this order:

1. `sql/shema.sql`
2. `sql/arcs-schema.sql`
3. `sql/moderation.sql`
4. `sql/storage-init.sql`
5. `sql/content-live-type-fix.sql` (if you want to allow `type = 'live'`)

Then run:

6. `sql/first-post-preflight.sql`

Expected preflight booleans:

- `has_content_arc_id = true`
- `has_media_bucket = true`
- `has_content_moderation_columns = true`

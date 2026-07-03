-- Enforce unique professional page names and slugs.
-- Run this after resolving any existing duplicate professional_pages.name values.

create unique index if not exists professional_pages_slug_unique_idx
    on public.professional_pages (slug);

create unique index if not exists professional_pages_name_unique_idx
    on public.professional_pages (lower(trim(name)));

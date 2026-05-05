## Fresh Start

Use these files for a brand-new Supabase project instead of replaying the old migration history in [`supabase/migrations`](E:\GPT Code2\sophia\supabase\migrations).

### Files

- [00_fresh_schema.sql](E:\GPT Code2\sophia\supabase\fresh-start\00_fresh_schema.sql)
  Creates the current schema, helper functions, RLS policies, storage bucket, and default content row.

- [01_bootstrap_first_admin.sql](E:\GPT Code2\sophia\supabase\fresh-start\01_bootstrap_first_admin.sql)
  Promotes your signed-up user to `super_admin`, creates the first company and venue, creates your admin code, and seeds a few starter drink cards.

- [02_drink_card_images.sql](E:\GPT Code2\sophia\supabase\fresh-start\02_drink_card_images.sql)
  Adds the `image_url` column to `drink_cards` for projects that were created before drink-card image uploads were added.

- [03_owner_admin_cleanup.sql](E:\GPT Code2\sophia\supabase\fresh-start\03_owner_admin_cleanup.sql)
  Normalizes company admin rows so each company owner has an `admin` row and older non-owner company admin rows are removed.

- [04_signup_number_sequence.sql](E:\GPT Code2\sophia\supabase\fresh-start\04_signup_number_sequence.sql)
  Replaces the old `MAX(signup_number) + 1` signup numbering with a real database sequence so Stripe tier assignment stays safe under concurrent signups.

### Recommended order

1. Open Supabase `SQL Editor`.
2. Run [00_fresh_schema.sql](E:\GPT Code2\sophia\supabase\fresh-start\00_fresh_schema.sql).
3. Sign up your first real user in the app.
4. Edit the values at the top of [01_bootstrap_first_admin.sql](E:\GPT Code2\sophia\supabase\fresh-start\01_bootstrap_first_admin.sql).
5. Run [01_bootstrap_first_admin.sql](E:\GPT Code2\sophia\supabase\fresh-start\01_bootstrap_first_admin.sql).

### If your project already ran steps 1-5 before drink-card images existed

Run [02_drink_card_images.sql](E:\GPT Code2\sophia\supabase\fresh-start\02_drink_card_images.sql) once.

### If you want the owner-admin model cleaned up on an existing project

Run [03_owner_admin_cleanup.sql](E:\GPT Code2\sophia\supabase\fresh-start\03_owner_admin_cleanup.sql) once.

### If your project already existed before signup numbering moved to a real sequence

Run [04_signup_number_sequence.sql](E:\GPT Code2\sophia\supabase\fresh-start\04_signup_number_sequence.sql) once.

### Notes

- The old migrations are still kept for history, but they are no longer the easiest way to start a clean project.
- This fresh baseline removes old project-specific seeds like:
  - `tally@oldvineswinebar.com`
  - hardcoded image URLs from a previous Supabase project
  - one-off venue settings bootstrap steps
- The current app still has some legacy compatibility reads for `profiles`, `employees`, and older redemption data, so those tables are intentionally still included in the fresh schema.

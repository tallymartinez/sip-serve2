# Current To Target Migration Map

Last updated: 2026-05-03

## Purpose

This file maps the current Supabase schema and supporting app logic to the agreed target model.

It is intended to answer:

- what stays
- what gets renamed
- what gets merged
- what gets dropped
- what must change in code when each database change happens

This is a planning document only.

## Target Model Summary

Target core tables:

- `user_profiles`
- `companies`
- `venues`
- `user_roles`
- `drink_cards`
- `redemptions`

Target role model:

- `member`
- `server`
- `manager`
- `admin`
- `super_admin`

Key target rules:

- platform-wide member accounts
- company-wide drink limits
- venue-scoped server and manager assignments
- owner derived from `companies.owner_user_id`
- `drink_name` logged in `redemptions`
- `employees` and `manager_venues` folded into `user_roles`

## Current Schema Inventory

Current public tables relevant to the app:

- `admin_codes`
- `comp_memberships`
- `companies`
- `employees`
- `home_content`
- `manager_venues`
- `override_uses`
- `profiles`
- `redemptions`
- `referral_code_uses`
- `referral_codes`
- `subscriptions`
- `user_roles`
- `venues`

Current public functions relevant to the app:

- `drinks_remaining_today(_user_id)`
- `has_role(...)`
- `has_role_in_company(...)`
- `is_super_admin(...)`
- `is_venue_manager(...)`
- `manager_venue_ids(...)`
- `user_company_id(...)`
- `verify_admin_code(...)`
- referral and subscription helpers

## Table-By-Table Migration Decisions

### `profiles` -> `user_profiles`

Current purpose:

- app-level person record
- stores:
  - contact info
  - subscription status
  - Stripe/customer metadata
  - current `company_id`

Target purpose:

- person record only
- no company ownership or venue assignment

Decision:

- rename `profiles` to `user_profiles`

Keep these columns:

- `id`
- `email`
- `full_name`
- `phone`
- `subscription_status`
- `subscription_started_at`
- `subscription_price_cents`
- `stripe_customer_id`
- `stripe_subscription_id`
- `created_at`
- `updated_at`

Add or retain as needed:

- `date_of_birth`

Remove from meaning or drop later:

- `company_id`

Reason:

- members are platform-wide now
- company scope belongs in `companies`, `venues`, and `user_roles`

Code impact:

- every `.from("profiles")` becomes `.from("user_profiles")`
- all generated types referring to `profiles` must change

### `companies`

Current purpose:

- company-level settings
- includes:
  - `name`
  - `daily_drink_limit`
  - `redemptions_paused`
  - `paused_message`
  - `active`

Target purpose:

- same table remains
- becomes the owner/admin source of truth

Decision:

- keep `companies`
- add `owner_user_id`

Keep these columns:

- `id`
- `name`
- `daily_drink_limit`
- `redemptions_paused`
- `paused_message`
- `active`
- `created_at`
- `updated_at`

Add:

- `owner_user_id`

Reason:

- owner is derived from this table
- admins and owners are treated as the same effective company power level

Code impact:

- admin authorization checks must include `owner_user_id`
- company creation/edit UI must support owner assignment

### `venues`

Current purpose:

- company locations
- also currently contains `venue_pin`

Target purpose:

- company locations only
- no longer the main unlock mechanism for redemption

Decision:

- keep `venues`
- likely phase out `venue_pin` from core redemption flow

Keep these columns:

- `id`
- `company_id`
- `name`
- `address`
- `phone`
- `email`
- `active`
- `created_at`
- `updated_at`

Drop later if no longer needed:

- `venue_pin`

Reason:

- the new redemption workflow uses server code + venue selection, not venue PIN-first unlocking

Code impact:

- `/redeem/$memberId` should stop depending on `venue_pin`
- admin venue management can keep the rest of the venue fields

### `user_roles`

Current purpose:

- global role rows such as `admin`, `manager`, `employee`, `member`, `super_admin`

Current problem:

- does not fully carry venue-scoped assignment logic
- still uses `employee` instead of `server`
- manager venue assignment is split into another table

Target purpose:

- single assignment/permission table
- stores:
  - role
  - company scope
  - venue scope
  - server code

Decision:

- keep `user_roles`
- evolve it into the main role + assignment table

Required changes:

- replace role value `employee` with `server`
- add or standardize:
  - `company_id`
  - `venue_id`
  - `server_code`
  - `active`
  - timestamps if missing/inconsistent

Rows should represent:

- `member`
  - no company or venue scope

- `server`
  - one row per venue assignment
  - includes `server_code`

- `manager`
  - one row per venue assignment

- `admin`
  - company-wide

- `super_admin`
  - global

Reason:

- this replaces both `employees` and `manager_venues`
- it aligns permissions and assignments in one place

Code impact:

- `useAuth.tsx` role parsing changes
- `/admin`, `/manager`, `/staff`, and `/redeem/$memberId` all need to use `user_roles`

### `employees`

Current purpose:

- stores server/staff records with:
  - `employee_code`
  - `full_name`
  - `company_id`
  - `venue_id`
  - optional `user_id`

Target purpose:

- no separate table
- folded into `user_roles(role='server')`

Decision:

- remove `employees` after data migration

Migration mapping:

- `employees.user_id` -> `user_roles.user_id`
- role becomes `server`
- `employees.company_id` -> `user_roles.company_id`
- `employees.venue_id` -> `user_roles.venue_id`
- `employees.employee_code` -> `user_roles.server_code`
- `employees.active` -> `user_roles.active`

What is lost:

- dedicated `full_name` field on employee row

Replacement:

- server display name should come from `user_profiles.full_name`
- if a server display snapshot is needed historically, put that on `redemptions` later

Code impact:

- all `.from("employees")` calls must be rewritten
- admin employee panels become server panels
- redeem server lookup logic changes completely

### `manager_venues`

Current purpose:

- maps managers to venue IDs

Target purpose:

- no separate table
- manager venue assignment lives in `user_roles(role='manager')`

Decision:

- remove `manager_venues` after migration

Migration mapping:

- each `manager_venues` row becomes a `user_roles` row:
  - `user_id = manager_venues.user_id`
  - `role = 'manager'`
  - `venue_id = manager_venues.venue_id`
  - `company_id = venues.company_id`

Code impact:

- `manager_venue_ids(...)` helper becomes obsolete
- `/manager` and `/admin` manager tooling must query `user_roles`

### `redemptions`

Current purpose:

- stores redeemed drink events
- currently includes:
  - `user_id`
  - `employee_id`
  - `venue_id`
  - `drinks_redeemed`
  - `redeemed_at`
  - `redeemed_date`

Target purpose:

- permanent audit log
- store selected drink name for reporting
- link to server assignment through `user_role_id`

Decision:

- keep `redemptions`
- reshape it

Keep these columns:

- `id`
- `user_id`
- `venue_id`
- `drinks_redeemed`
- `redeemed_at`
- `redeemed_date`

Replace:

- `employee_id` -> `user_role_id`

Add:

- `drink_name`

Derived behavior:

- company comes from `venue_id -> venues.company_id`

Migration mapping:

- current `employee_id` should be translated to the corresponding server `user_roles.id`
- if no clean automatic join exists, migrate in batches after server role rows are created

Code impact:

- dashboard listeners continue to listen to `redemptions`
- all admin/manager redemption reporting queries need updated joins
- redemption creation should move to a validated helper/RPC

### `drink_cards`

Current status:

- does not exist yet

Target purpose:

- company-owned drink definitions shared to all venues

Decision:

- create `drink_cards`

Likely seed source:

- current homepage cocktail content in `home_content`

Fields:

- `company_id`
- `name`
- `description`
- `category`
- `price_label`
- `status`
- `sort_order`

Code impact:

- homepage drinks section can eventually read from this
- dashboard company sections depend on it
- admin needs CRUD UI for it

### `home_content`

Current purpose:

- global homepage content blob
- currently also carries drink-style content sections

Target purpose:

- remain as the global homepage shell content source
- stop being the main source of structured drink definitions

Decision:

- keep `home_content`
- narrow its responsibility

Keep:

- hero content
- gallery content
- welcome text
- closing CTA content

Move away from:

- cocktail inventory as primary structured product data

Code impact:

- homepage still reads from `home_content`
- the drinks list should gradually move to `drink_cards`

### `admin_codes`

Current purpose:

- admin personal override code system

Decision:

- keep for now only if admin override remains part of staff operations
- otherwise likely phase out later

Current fit with target:

- lower priority
- not part of the main server-code redemption flow

Code impact:

- if redeem flow fully moves to server code + venue selection, this may become optional legacy functionality

### `override_uses`

Current purpose:

- logs use of admin override codes

Decision:

- keep only if `admin_codes` stays
- otherwise can be retired later

Code impact:

- only admin/staff override flows depend on it

### `comp_memberships`

Current purpose:

- appears to model company membership grants

Conflict with target:

- target is platform-wide membership only for now

Decision:

- deprecate and remove from active logic

Reason:

- not aligned with the agreed membership model

Code impact:

- should not be used in the new dashboard/company ordering logic

### `subscriptions`

Current purpose:

- stores Stripe subscription records

Decision:

- keep

Reason:

- platform-wide membership still needs payment/subscription state

Current relationship to target:

- remains user-level, not company-level

Code impact:

- Stripe and dashboard subscription management can continue to use it

### `referral_codes` and `referral_code_uses`

Current purpose:

- referral workflow

Decision:

- keep for now

Reason:

- orthogonal to the org/location schema change

Note:

- if referral codes are company-specific later, revisit `company_id` semantics then

## Function-By-Function Migration Decisions

### `drinks_remaining_today(_user_id)`

Current behavior:

- counts drinks by user and date only

Target behavior:

- count by user, company, and date

Decision:

- replace with `drinks_remaining_today(_user_id, _company_id)`

Code impact:

- dashboard
- redeem flow
- admin/member stats

### `manager_venue_ids(_user_id)`

Current behavior:

- reads `manager_venues`

Decision:

- remove after migrating manager assignment into `user_roles`

Replacement:

- direct query or helper against `user_roles(role='manager')`

### `is_venue_manager(_user_id, _venue_id)`

Current behavior:

- checks `manager_venues`

Decision:

- rewrite to check `user_roles`

### `user_company_id(_user_id)`

Current behavior:

- depends on the old one-company-per-profile assumption

Decision:

- remove or replace

Reason:

- users are platform-wide
- managers and servers can span companies

Replacement options:

- `get_user_companies(_user_id)`
- direct company queries by role or redemption context

### `has_role_in_company(...)`

Current behavior:

- likely role/company scoped

Decision:

- keep concept
- update internals to reflect:
  - owner equivalence
  - new role values

### `verify_admin_code(...)`

Current behavior:

- supports admin override unlock flow

Decision:

- keep only if override flow survives
- otherwise retire from core redemption path

## Route And Code Dependency Map

### Must change immediately when schema changes

- [useAuth.tsx](E:\GPT Code2\sophia\src\hooks\useAuth.tsx)
- [dashboard.tsx](E:\GPT Code2\sophia\src\routes\dashboard.tsx)
- [redeem/$memberId.tsx](E:\GPT Code2\sophia\src\routes\redeem\$memberId.tsx)
- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)
- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)
- [staff.tsx](E:\GPT Code2\sophia\src\routes\staff.tsx)
- [index.tsx](E:\GPT Code2\sophia\src\routes\index.tsx)
- [types.ts](E:\GPT Code2\sophia\src\integrations\supabase\types.ts)

### Lower-risk areas that can stay mostly as-is initially

- [login.tsx](E:\GPT Code2\sophia\src\routes\login.tsx)
- [signup.tsx](E:\GPT Code2\sophia\src\routes\signup.tsx)
- Stripe payment routes and server helpers
- referral code logic

## Recommended Migration Sequence

### Phase 1. Foundation

1. Rename `profiles` to `user_profiles`.
2. Add `owner_user_id` to `companies`.
3. Expand `user_roles` to support:
   - `server`
   - `company_id`
   - `venue_id`
   - `server_code`
   - `active`
4. Add `drink_cards`.
5. Update `redemptions` to add:
   - `user_role_id`
   - `drink_name`

### Phase 2. Data move

1. Convert `employees` rows into `user_roles(role='server')`.
2. Convert `manager_venues` rows into `user_roles(role='manager')`.
3. Backfill `redemptions.user_role_id` from old `employee_id`.
4. Backfill initial `drink_cards` from current curated drink content if desired.

### Phase 3. Function move

1. Replace `drinks_remaining_today(_user_id)` with company-aware version.
2. Replace manager helper functions to read `user_roles`.
3. Add effective company admin helper.
4. Add validated redemption creation helper or RPC.

### Phase 4. App move

1. Update generated types.
2. Update auth helpers and route guards.
3. Update admin assignment tooling.
4. Update dashboard.
5. Update redeem flow.
6. Update manager views.
7. Update homepage drink rendering.

### Phase 5. Cleanup

1. Remove `employees` from code.
2. Remove `manager_venues` from code.
3. Remove old one-company member assumptions.
4. Remove or retire `venue_pin` flow if no longer needed.
5. Retire `comp_memberships` from active use.

## Migration Risks

### Risk 1. `profiles.company_id` is baked into old logic

Why it matters:

- old member/company assumptions will break the new multi-company dashboard model

### Risk 2. `employee_id` is used widely in reporting

Why it matters:

- admin and manager reporting code currently joins against `employees`

### Risk 3. Route guards still use old role naming

Why it matters:

- `employee` must become `server`
- manager and admin scoping must become more precise

### Risk 4. Dashboard and redemption flow need to change together

Why it matters:

- selected drink QR on dashboard and `drink_name` logging in redemption are linked

## Practical Next Document

After this map, the next useful planning artifact would be:

- a migration checklist with concrete SQL tasks and frontend file tasks grouped by phase

That would be the bridge from planning into actual implementation.

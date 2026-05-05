# Proposed Code Update Plan

Last updated: 2026-05-03

## Purpose

This file maps the agreed schema and workflow decisions onto the current website and proposes a step-by-step code update plan before implementation begins.

This is a planning document only. It does not change app behavior.

## Target Product Model

Confirmed target structure:

- `user_profiles`
- `companies`
- `venues`
- `user_roles`
- `drink_cards`
- `redemptions`

Confirmed role model:

- `member`
- `server`
- `manager`
- `admin`
- `super_admin`

Confirmed behavior highlights:

- members are platform-wide
- servers and managers can be assigned to multiple venues
- admins are effectively owners of a company
- owner is derived from `companies.owner_user_id`
- drink limits are per user, per day, per company
- dashboard should show company sections with `drink_cards`
- clicking a drink should produce the member QR for redemption
- redemptions log the human-readable drink name, but drink choice does not affect validation

## Existing Website Map

This section maps the current codebase to the new model.

### Home Page

Current file:

- [index.tsx](E:\GPT Code2\sophia\src\routes\index.tsx)

Current behavior:

- uses `home_content`
- renders global "Cocktails" content from `cocktailSections` and `supperClubSections`

Target behavior:

- keep one global homepage shell
- replace the current hardcoded/global cocktail section data with company-backed `drink_cards` where appropriate
- make "The list - Cocktails" feel more institutional and standardized

What changes:

- homepage shell remains
- content structure for drinks moves away from `home_content.cocktailSections`
- UI should render standardized `drink_cards`

### Auth and Role State

Current file:

- [useAuth.tsx](E:\GPT Code2\sophia\src\hooks\useAuth.tsx)

Current behavior:

- reads `user_roles`
- still uses old role names like `employee`
- exposes `isEmployee`, `isAdmin`, `isManager`, `isMember`

Target behavior:

- rename `employee` logic to `server`
- derive role capabilities from the new role model
- support venue-scoped server/manager assignments and company-scoped admin logic

What changes:

- `employee` references become `server`
- new auth helpers should understand:
  - whether the user is a server anywhere
  - whether the user manages specific venues
  - whether the user is an effective admin for a company

### Login and Signup

Current files:

- [login.tsx](E:\GPT Code2\sophia\src\routes\login.tsx)
- [signup.tsx](E:\GPT Code2\sophia\src\routes\signup.tsx)

Current behavior:

- sign in and sign up through Supabase auth
- member signup creates a person-level account

Target behavior:

- this mostly stays the same
- the backing profile table becomes `user_profiles`
- sign up still creates a platform member, not a company member

What changes:

- route behavior mostly stays
- profile reads/writes and generated types must switch from `profiles` to `user_profiles`

### Dashboard

Current file:

- [dashboard.tsx](E:\GPT Code2\sophia\src\routes\dashboard.tsx)

Current behavior:

- assumes one member card
- shows one QR on the page
- uses `drinks_remaining_today(_user_id)`
- does not show per-company drink sections

Target behavior:

- remove the default always-visible QR block
- render a full-width red company section for each company
- render that company's `drink_cards` under the section
- order companies by active membership first
- clicking a drink opens or generates the QR for that selected drink

What changes:

- dashboard data loader must become multi-company aware
- drink count must be requested per company
- QR should become interaction-driven instead of always visible

### Redemption Flow

Current file:

- [redeem/$memberId.tsx](E:\GPT Code2\sophia\src\routes\redeem\$memberId.tsx)

Current behavior:

- staff selects venue
- unlocks with venue PIN or admin override code
- enters employee code
- inserts into `redemptions` with:
  - `user_id`
  - `employee_id`
  - `venue_id`
  - `drinks_redeemed`

Target behavior:

- member clicks a drink card
- QR opens for that selected drink
- server scans it
- server enters 4-digit code
- server selects venue
- app validates:
  - server assignment and code
  - venue
  - member remaining drinks for that company/day
- selected drink is logged only
- app inserts a `redemptions` row containing:
  - `user_id`
  - `user_role_id`
  - `venue_id`
  - `drink_name`
  - `redeemed_at`
  - `drinks_redeemed`

What changes:

- remove dependence on venue PIN as the main unlock path
- replace employee lookup with server-role lookup
- include `drink_name` in redemption payload
- validate company/day remaining drinks by venue -> company

### Staff Terminal

Current file:

- [staff.tsx](E:\GPT Code2\sophia\src\routes\staff.tsx)

Current behavior:

- simple screen showing today's counts
- relies on old `isEmployee`

Target behavior:

- become server-facing terminal entry point
- use new `server` role language
- optionally guide staff into the QR scanning / redemption flow

What changes:

- rename UI from employee/staff logic to server terminology where needed
- update auth checks to use the new role model

### Manager Dashboard

Current file:

- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)

Current behavior:

- separate manager page
- venue scope comes from `manager_venues`
- read-only redemption views

Target behavior:

- managers only view venues and redeemed drinks
- manager scope should come from `user_roles`
- route may remain temporarily, but long term the manager experience should align with role-driven admin tabs

What changes:

- replace `manager_venues` queries with `user_roles`
- keep read-only venue/redemption functionality
- likely fold manager functionality into `/admin` tabs later

### Admin Dashboard

Current file:

- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)

Current behavior:

- already contains many company, venue, redemption, manager, and employee tools
- still uses old concepts:
  - `profiles`
  - `employees`
  - `manager_venues`
  - some company assumptions tied to the old schema

Target behavior:

- role-driven tabs
- company-wide admin functionality for owner/admin
- global controls for `super_admin`
- venue read-only behavior for managers
- add company-managed `drink_cards`
- admins and owners are effectively the same for company powers

What changes:

- employee panels become server panels
- manager assignment uses `user_roles`
- tab visibility should come from role and scope
- company settings remain here
- drink card management should be added here

### Supabase Functions, Migrations, and Types

Current files:

- [types.ts](E:\GPT Code2\sophia\src\integrations\supabase\types.ts)
- [supabase\migrations](E:\GPT Code2\sophia\supabase\migrations)

Current behavior:

- still reflects `profiles`, `employees`, `manager_venues`, and the old redemption function signatures

Target behavior:

- reflect the new schema
- add company-aware helper functions
- remove old table assumptions from generated types

What changes:

- new migrations
- regenerated Supabase types
- helper function replacements

## Proposed New Data/Helper Functions

These are the main helpers the code should evolve toward.

### `drinks_remaining_today(_user_id uuid, _company_id uuid)`

Purpose:

- return remaining daily drinks for one user in one company

Used by:

- dashboard company sections
- redeem validation
- admin/member summary views

### `get_user_companies(_user_id uuid)`

Purpose:

- return the companies relevant to the current member dashboard
- include company metadata needed for rendering

Used by:

- `/dashboard`

### `get_company_drink_cards(_company_id uuid)`

Purpose:

- return visible `drink_cards` for a company in display order

Used by:

- homepage sections if needed
- dashboard company sections
- admin drink-card management

### `validate_server_assignment(_user_role_id uuid, _venue_id uuid, _server_code text)`

Purpose:

- confirm the chosen server role row belongs to the selected venue
- confirm the 4-digit code matches and is active

Used by:

- `/redeem/$memberId`

### `create_redemption(...)`

Purpose:

- centralize redemption validation and insert logic

Suggested payload:

- `user_id`
- `user_role_id`
- `venue_id`
- `drink_name`
- `drinks_redeemed`

Used by:

- `/redeem/$memberId`

Recommended note:

- this is a good candidate for an RPC or server-side function so validation and insertion happen together

### `is_effective_company_admin(_user_id uuid, _company_id uuid)`

Purpose:

- treat a user as a company admin if they:
  - own the company
  - have an admin role row for the company
  - are `super_admin`

Used by:

- `/admin`
- company settings
- drink-card management
- server/manager assignment management

## Step-by-Step Update Plan

This is the proposed implementation order.

### Step 1. Freeze the product rules in docs

Goal:

- finish the planning documents before touching the schema

Files:

- [product-structure-decisions.md](E:\GPT Code2\sophia\docs\product-structure-decisions.md)
- [proposed-code-update-plan.md](E:\GPT Code2\sophia\docs\proposed-code-update-plan.md)

Output:

- one stable source of truth for schema, roles, tabs, dashboard flow, and redemption flow

### Step 2. Draft the migration set

Goal:

- plan how the old schema maps to the new schema

Main mapping:

- `profiles` -> `user_profiles`
- `employees` -> folded into `user_roles` as `server`
- `manager_venues` -> folded into `user_roles` as `manager`
- current `redemptions.employee_id` -> new `redemptions.user_role_id`
- current cocktail/home drink content -> `drink_cards`

Output:

- migration checklist with table-by-table changes

### Step 3. Create and migrate the new database schema

Goal:

- add the new tables/columns and compatibility layer

Database work:

- create or rename `user_profiles`
- update `user_roles`
- add `drink_cards`
- update `redemptions`
- add helper functions
- update RLS policies

Important approach:

- because nothing is live yet, the schema can move directly instead of needing a long backward-compatibility window

### Step 4. Regenerate Supabase types and update shared data helpers

Goal:

- get the frontend compiling cleanly against the new schema

Files likely affected:

- [types.ts](E:\GPT Code2\sophia\src\integrations\supabase\types.ts)
- [useAuth.tsx](E:\GPT Code2\sophia\src\hooks\useAuth.tsx)
- any shared Supabase helpers

Main changes:

- replace `employee` role naming with `server`
- replace `profiles` references with `user_profiles`
- add role/scope helpers

### Step 5. Update auth and route guards

Goal:

- make route access match the new role model

Files likely affected:

- [useAuth.tsx](E:\GPT Code2\sophia\src\hooks\useAuth.tsx)
- [login.tsx](E:\GPT Code2\sophia\src\routes\login.tsx)
- [staff.tsx](E:\GPT Code2\sophia\src\routes\staff.tsx)
- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)
- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)

Main changes:

- update role names
- update `isEmployee` to `isServer` or equivalent
- add effective company admin logic
- add manager venue-scope helpers

### Step 6. Build `drink_cards` management in admin

Goal:

- give company admins a real interface to manage shared company drinks

Files likely affected:

- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)

Main changes:

- add `Drink Cards` tab
- CRUD for drink cards
- support status values:
  - `included`
  - `not_included`
  - `inactive`

### Step 7. Replace old server and manager assignment logic

Goal:

- stop relying on `employees` and `manager_venues`

Files likely affected:

- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)
- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)
- [redeem/$memberId.tsx](E:\GPT Code2\sophia\src\routes\redeem\$memberId.tsx)

Main changes:

- server assignment becomes `user_roles(role='server')`
- manager assignment becomes `user_roles(role='manager')`
- server 4-digit code becomes venue-scoped and editable

### Step 8. Redesign the dashboard around companies and drink cards

Goal:

- move `/dashboard` from one card + one QR to company sections + drink cards

Files likely affected:

- [dashboard.tsx](E:\GPT Code2\sophia\src\routes\dashboard.tsx)

Main changes:

- remove always-visible QR area
- render one company section at a time
- show company drink count
- render company `drink_cards`
- clicking a drink launches the QR experience for that selected drink

### Step 9. Redesign the redemption flow

Goal:

- make redemption match the agreed major workflow

Files likely affected:

- [redeem/$memberId.tsx](E:\GPT Code2\sophia\src\routes\redeem\$memberId.tsx)
- possibly new shared helpers or RPC wrappers

Main changes:

- carry selected `drink_name` into the QR and redemption flow
- replace venue PIN-first unlock with server/venue validation flow
- validate remaining company drinks
- insert the new `redemptions` row shape

### Step 10. Refactor manager/admin UI into a role-driven tab model

Goal:

- make admin tabs visible by user level and scope

Files likely affected:

- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)
- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)

Main changes:

- manager uses venue-scoped read-only tabs
- admin uses company-wide tabs
- super admin gets global controls
- manager route can remain temporarily, but long term the UI should converge on one role-aware admin surface

### Step 11. Update the homepage drinks section

Goal:

- make "The list - Cocktails" feel more institutional and standardized

Files likely affected:

- [index.tsx](E:\GPT Code2\sophia\src\routes\index.tsx)
- any future drink-card presentation components

Main changes:

- replace hardcoded section-style drink presentation with standardized `drink_cards`
- preserve the global homepage shell

### Step 12. Refresh demo mode to match the new schema and UX

Goal:

- keep local development useful while backend work is in progress

Files likely affected:

- [demo.ts](E:\GPT Code2\sophia\src\lib\demo.ts)
- [useAuth.tsx](E:\GPT Code2\sophia\src\hooks\useAuth.tsx)
- [dashboard.tsx](E:\GPT Code2\sophia\src\routes\dashboard.tsx)
- [admin.tsx](E:\GPT Code2\sophia\src\routes\admin.tsx)
- [manager.tsx](E:\GPT Code2\sophia\src\routes\manager.tsx)
- [staff.tsx](E:\GPT Code2\sophia\src\routes\staff.tsx)
- [redeem/$memberId.tsx](E:\GPT Code2\sophia\src\routes\redeem\$memberId.tsx)

Main changes:

- update demo roles to `server`
- mock company sections and `drink_cards`
- mock the click-drink -> QR -> redeem flow

## Suggested Build Order

The safest implementation order is:

1. Schema and helper functions
2. Generated types and auth helpers
3. Admin assignment tooling
4. Drink-card management
5. Dashboard redesign
6. Redemption flow redesign
7. Manager/admin tab convergence
8. Homepage drink standardization
9. Demo mode refresh

## Major Risks To Watch

- `profiles.company_id` assumptions still exist in the current code and must be removed carefully
- many admin and manager queries still depend on `employees` and `manager_venues`
- current dashboard and redeem flow assume one QR path, not a selected-drink QR path
- redemptions currently do not log a drink name
- current generated Supabase types will become stale as soon as schema work begins

## Definition Questions To Keep Visible

These are the remaining design details worth confirming before implementation starts:

- exact QR UX after clicking a drink:
  - modal
  - inline expansion
  - separate route
- whether `/manager` remains as a separate route or gets folded into `/admin`
- whether admin tabs should hide completely or show disabled/locked states when out of scope

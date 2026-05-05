# Product Structure Decisions

Last updated: 2026-05-03

## Purpose

This file captures the current agreed structure for schema, roles, dashboard behavior, and related product rules before implementation changes begin.

## Core Tables

Current intended core structure:

- `user_profiles`
- `companies`
- `venues`
- `user_roles`
- `drink_cards`

Not planned for now:

- `company_memberships`

## Table Intent

### `user_profiles`

`user_profiles` describes who the person is.

Suggested responsibility:

- name
- email
- phone
- date of birth
- user-level identity fields

It should not be the place where company or venue permissions are defined.

### `user_roles`

`user_roles` describes what permissions or assignments a person has.

This table is intended to carry:

- role
- company scope when needed
- venue scope when needed
- server 4-digit code when needed

## Role Model

Defined roles:

- `member`
- `server`
- `manager`
- `admin`
- `super_admin`

### Role Rules

#### `member`

- no company scope
- no venue scope

#### `server`

- can belong to multiple venues
- can be assigned to venues in different companies
- one row in `user_roles` per venue assignment

#### `manager`

- can belong to multiple venues
- one row in `user_roles` per venue assignment
- managers only view venues and the drinks that are redeemed

#### `admin`

- company-wide
- can alter server and manager assignments and related admin functions
- owners and admins are the same thing in practice
- to be an admin, the user must own a company

#### `super_admin`

- can alter everything anywhere

## Owner Model

Owner is derived from:

- `companies.owner_user_id`

Rules:

- owner automatically has all admin powers for that company
- no separate owner row is needed in `user_roles`
- owners and admins are treated as the same effective privilege level for a company

## Multi-Venue Assignment

Agreed behavior:

- managers can belong to multiple venues
- servers can belong to multiple venues
- one `user_roles` row per assignment

## Server 4-Digit Code

Rules:

- exactly 4 digits
- unique per venue only
- a server can choose their own code
- an admin can assign the code
- the code can be changed later
- uniqueness per venue must still be enforced after changes

## Drink Limit Logic

Rules:

- `daily_drink_limit` is company-wide
- count is per user, per day, per company
- all venues in the same company share the count
- if a user visits Company A and Company B on the same day, they get separate drink counts

Implication:

- redemption logic must be company-aware

## Membership Model

Current decision:

- platform-wide membership only
- no `company_memberships` table for now
- all companies are equally active for a paid member

## Drink Cards

Use:

- `drink_cards`

Do not use:

- `drink_card_groups`

Rules:

- drink cards belong to a company
- a company's drink cards are shared across all of its venues

Visibility state is not a boolean. It is a 3-state value:

- `included`
- `not_included`
- `inactive`

Meaning:

- `included`: visible and included in the subscription
- `not_included`: visible but marked as not part of the subscription
- `inactive`: hidden from the site

## Homepage

Current decision:

- keep one global homepage shell
- postpone company-specific homepage content

## Dashboard

New dashboard layout:

- remove the QR from the main dashboard layout
- each company gets a full-width red company section
- that company's `drink_cards` show underneath
- then the next company section
- then the next company's `drink_cards`
- ordering is active membership first

Interaction rule:

- clicking a drink produces the QR that used to live on `/dashboard`

Current homepage behavior after login:

- homepage stays the same

## Admin UI

Role-driven visibility remains the goal.

Current agreed direction:

- managers only see venue/redemption viewing functionality
- admins/owners can manage company-wide administrative functionality
- super admins can manage everything globally

## Migration Flexibility

Current status:

- nothing is live yet
- schema and code structure can still be changed freely

## Proposed Schema Draft

This section is the current proposed schema draft based on the agreed product rules. It is still a draft and should be confirmed before implementation.

### Enums

Recommended enum: `app_role`

Values:

- `member`
- `server`
- `manager`
- `admin`
- `super_admin`

Recommended enum: `drink_card_status`

Values:

- `included`
- `not_included`
- `inactive`

### `user_profiles`

Purpose:

- stores who the person is
- one row per auth user

Proposed columns:

- `id uuid primary key`
  - references `auth.users(id)`
- `email text not null`
- `full_name text not null default ''`
- `phone text`
- `date_of_birth date`
- `subscription_status text not null default 'active'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints:

- `email` should be stored lowercase where possible
- `id` must match a real auth user

Recommended notes:

- do not store `company_id` here
- do not store venue assignment here
- do not store admin/manager/server permissions here
- platform-wide membership means subscription state can stay global for now

### `companies`

Purpose:

- company-level organization
- source of truth for owner/admin scope
- source of truth for company-wide drink limit

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `owner_user_id uuid not null`
  - references `user_profiles(id)`
- `daily_drink_limit integer not null default 2`
- `redemptions_paused boolean not null default false`
- `paused_message text`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints:

- `daily_drink_limit between 1 and 20`
- `owner_user_id` must reference a real user profile

Recommended notes:

- owner is derived from `owner_user_id`
- owner automatically has company admin powers
- no separate owner row is required in `user_roles`

### `venues`

Purpose:

- company locations

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
  - references `companies(id)`
- `name text not null`
- `address text`
- `phone text`
- `email text`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints:

- foreign key from `company_id` to `companies(id)`
- recommended unique index on `(company_id, lower(name))`

Recommended notes:

- venue PIN should no longer be the core unlock model if server/location-based code flow becomes the main path
- if venue unlock still exists later, that should be discussed separately

### `user_roles`

Purpose:

- stores what permissions or assignments a user has
- replaces separate `servers` and `manager_venues` tables

Recommended design choice:

- store `company_id` on rows even when it can be derived from `venue_id`

Why:

- simpler querying
- easier RLS and admin filtering
- easier uniqueness and validation rules
- avoids extra joins in many checks

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
  - references `user_profiles(id)`
- `role app_role not null`
- `company_id uuid`
  - references `companies(id)`
- `venue_id uuid`
  - references `venues(id)`
- `server_code text`
- `active boolean not null default true`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints:

- unique role assignment row:
  - unique on `(user_id, role, company_id, venue_id)`
- server code uniqueness:
  - unique on `(venue_id, server_code)`
  - only applies where `server_code is not null`
- 4-digit format:
  - `server_code ~ '^[0-9]{4}$'` when present

Recommended role constraints:

- if `role = 'member'`
  - `company_id is null`
  - `venue_id is null`
  - `server_code is null`

- if `role = 'server'`
  - `company_id is not null`
  - `venue_id is not null`
  - `server_code is not null`

- if `role = 'manager'`
  - `company_id is not null`
  - `venue_id is not null`
  - `server_code is null`

- if `role = 'admin'`
  - `company_id is not null`
  - `venue_id is null`
  - `server_code is null`

- if `role = 'super_admin'`
  - `company_id is null`
  - `venue_id is null`
  - `server_code is null`

Recommended consistency constraints:

- if `venue_id is not null`, the row's `company_id` must match the venue's `company_id`
- this likely needs a trigger or application-enforced validation, since a plain check constraint cannot compare across tables

Recommended notes:

- managers can have multiple rows for multiple venues
- servers can have multiple rows for multiple venues, including venues in different companies
- admins are company-wide only
- owner/admin equivalence is resolved in permission logic using `companies.owner_user_id`

### `drink_cards`

Purpose:

- company-scoped drink list shared across all venues in that company

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `company_id uuid not null`
  - references `companies(id)`
- `name text not null`
- `description text`
- `category text not null default 'Cocktails'`
- `price_label text`
- `status drink_card_status not null default 'included'`
- `sort_order integer not null default 0`
- `active boolean generated by status?`
  - do not actually create this if `status` exists; included here only as a reminder that `status` replaces the need for a separate active flag
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Recommended constraints:

- foreign key from `company_id` to `companies(id)`
- `sort_order >= 0`
- status must be one of:
  - `included`
  - `not_included`
  - `inactive`

Recommended notes:

- do not add a separate boolean `active`
- `inactive` already covers hidden state
- `included` and `not_included` are both visible on the site

### `redemptions`

Purpose:

- stores drink usage events
- serves as the permanent audit log for reporting, limits, and history

Current direction:

- keep this table
- make it company-aware through venue linkage

Proposed columns:

- `id uuid primary key default gen_random_uuid()`
- `user_id uuid not null`
  - references `user_profiles(id)`
- `user_role_id uuid`
  - references `user_roles(id)`
- `drink_name text not null`
- `venue_id uuid not null`
  - references `venues(id)`
- `drinks_redeemed integer not null`
- `redeemed_at timestamptz not null default now()`
- `redeemed_date date not null default current_date`

Recommended constraints:

- `drinks_redeemed > 0`
- recommended index on `(user_id, redeemed_date)`
- recommended index on `(venue_id, redeemed_date)`

Recommended notes:

- company should be derived from venue
- drink count logic should count by:
  - user
  - company
  - date
- `drink_name` is for human-readable logging only
- the selected drink does not affect redemption validation

## Redemption Workflow

Agreed future workflow:

1. Member clicks a drink card.
2. A QR opens for that selected drink.
3. Server scans it, enters their 4-digit code, and selects the venue.
4. App validates:
   - the server assignment and code
   - the selected venue
   - the member's remaining drinks for that company on that date
5. The selected drink itself is not used for validation. It is logged only.
6. App inserts a row into `redemptions`.
7. That row becomes the permanent audit log for reporting, limits, and history.

### Functions / Derived Logic

#### `drinks_remaining_today`

Recommended future signature:

- `drinks_remaining_today(_user_id uuid, _company_id uuid)`

Expected behavior:

- get company daily drink limit
- count all redemptions for that user on the same date across venues in that company
- return remaining drinks for that company only

#### Effective Company Admin Check

Recommended future helper:

- user is an admin for a company if either:
  - they have a `user_roles` row with `role = 'admin'` and matching `company_id`
  - or they are `companies.owner_user_id`
  - or they are `super_admin`

## Recommended Admin Tab Visibility Draft

This is the proposed initial tab visibility model based on the current decisions.

### `manager`

Visible tabs:

- `Overview`
- `Members`
- `Redemptions`
- `Venues`

Rules:

- venue-scoped view only
- read-only on venues
- no company settings
- no admin management

### `admin`

Visible tabs:

- `Overview`
- `Members`
- `Redemptions`
- `Venues`
- `Servers`
- `Managers`
- `Drink Cards`
- `Company Settings`

Rules:

- company-wide
- can alter server and manager assignments

### `super_admin`

Visible tabs:

- all admin tabs
- `Companies`
- global controls

Rules:

- full global access

### Owner Behavior In Tabs

Owner is not a separate tab role.

Instead:

- if `companies.owner_user_id = current_user_id`
- the user should receive the same tab access and powers as `admin` for that company
- if any future owner-only controls are added, they should be layered on top of admin visibility

## Still To Decide

These items still need explicit final definition before implementation:

- exact admin tab visibility matrix by role
- exact QR interaction UX after a user clicks a drink on `/dashboard`

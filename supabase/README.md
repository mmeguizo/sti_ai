# Supabase Data Model

## Recommended tables

- `app_users`: application users keyed by the Auth0 `sub` value
- `chats`: one row per conversation
- `chat_messages`: one row per message inside a chat

## Why these names

- `app_users` avoids confusion with Auth0 users and Supabase auth tables
- `chats` is short and clear for the conversation list
- `chat_messages` is explicit and scales better than a generic `messages` table if you add notifications later

## Current activation flow

1. User logs in with Auth0.
2. Backend reads Auth0 profile data.
3. Backend upserts `app_users` and sets new users to `status = 'active'` immediately.
4. Existing admin roles are preserved on later logins.
5. Disabled users remain disabled.

## Best-practice columns

### `app_users`

- `auth0_user_id text primary key`: Auth0 `sub` claim
- `email text unique not null`: stable login identifier
- `display_name text not null`: name shown in the UI
- `avatar_url text`: optional profile picture
- `auth_provider text not null default 'auth0'`: source of identity
- `role text not null default 'user'`: `user` or `admin`
- `status text not null default 'active'`: `pending`, `active`, or `disabled`
- `approved_by text`: admin who activated the account
- `approved_at timestamptz`: approval timestamp
- `last_login_at timestamptz`: useful for admin review
- `created_at timestamptz`: created timestamp
- `updated_at timestamptz`: updated timestamp

### `chats`

- `id uuid primary key`: chat identifier
- `user_id text not null`: owner from `app_users.auth0_user_id`
- `title text not null default 'New chat'`: label in the sidebar
- `status text not null default 'active'`: keep archiving simple
- `created_at timestamptz`: creation timestamp
- `updated_at timestamptz`: update timestamp
- `last_message_at timestamptz`: fast sort for recent chats

### `chat_messages`

- `id uuid primary key`: message identifier
- `chat_id uuid not null`: parent chat
- `sender_role text not null`: `user`, `assistant`, or `system`
- `sender_name text`: display name if needed in transcripts
- `content text not null`: raw message body
- `model text`: model used for assistant responses
- `token_count integer`: optional usage tracking later
- `metadata jsonb`: future-proof extra data
- `created_at timestamptz`: message timestamp

## Important implementation note

If you stay with Auth0 as the login system, save users through your Nest backend and use the Auth0 `sub` claim as the key. Do not write directly from the browser to Supabase with elevated credentials.

## Backend environment variables

Set these in your API `.env` file:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `AUTH0_ISSUER_BASE_URL` (example: `https://dev-tenant.au.auth0.com`)
- `AUTH0_CLIENT_ID`

## How user save now works

1. User logs in through Auth0 in Angular.
2. Frontend gets Auth0 ID token.
3. Frontend calls `POST /auth/sync-user` on Nest backend with Bearer token.
4. Backend verifies token signature and claims.
5. Backend upserts `app_users` in Supabase.
6. New users become `active` immediately unless you later mark them as `disabled`.

## Manual role change for your own account

Run in Supabase SQL editor after your first login row is created if you want to make yourself admin:

Set yourself as admin by email:

update public.app_users
set role = 'admin',
approved_at = now(),
approved_by = auth0_user_id
where email = 'your-email@example.com';

Set a user as admin by auth0 id:

update public.app_users
set role = 'admin',
approved_at = now(),
approved_by = 'google-oauth2|admin-sub-id'
where auth0_user_id = 'google-oauth2|target-sub-id';

Use helper function (alternative):

select public.activate_user_by_auth0_id(
'google-oauth2|target-sub-id',
'admin',
'google-oauth2|admin-sub-id'
);

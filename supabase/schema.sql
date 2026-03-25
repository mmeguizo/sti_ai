create extension if not exists pgcrypto;
create or replace function public.set_updated_at() returns trigger language plpgsql as $$ begin new.updated_at = now();
return new;
end;
$$;
create table if not exists public.app_users (
    auth0_user_id text primary key,
    email text,
    display_name text not null,
    avatar_url text,
    auth_provider text not null default 'auth0',
    role text not null default 'user' check (role in ('user', 'admin')),
    status text not null default 'active' check (status in ('pending', 'active', 'disabled')),
    approved_by text references public.app_users (auth0_user_id),
    approved_at timestamptz,
    last_login_at timestamptz,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
);
create unique index if not exists idx_app_users_email_unique_not_null on public.app_users (email)
where email is not null;
create table if not exists public.chats (
    id uuid primary key default gen_random_uuid(),
    user_id text not null references public.app_users (auth0_user_id) on delete cascade,
    title text not null default 'New chat',
    chat_type text not null default 'general' check (chat_type in ('general', 'ticket')),
    status text not null default 'active' check (status in ('active', 'archived')),
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now(),
    last_message_at timestamptz not null default now()
);
create table if not exists public.chat_messages (
    id uuid primary key default gen_random_uuid(),
    chat_id uuid not null references public.chats (id) on delete cascade,
    sender_role text not null check (sender_role in ('user', 'assistant', 'system')),
    sender_name text,
    content text not null,
    model text,
    token_count integer,
    metadata jsonb not null default '{}'::jsonb,
    created_at timestamptz not null default now()
);
create index if not exists idx_app_users_status on public.app_users (status);
create index if not exists idx_app_users_role on public.app_users (role);
create index if not exists idx_chats_user_id_updated_at on public.chats (user_id, updated_at desc);
create index if not exists idx_chat_messages_chat_id_created_at on public.chat_messages (chat_id, created_at asc);
drop trigger if exists trg_app_users_set_updated_at on public.app_users;
create trigger trg_app_users_set_updated_at before
update on public.app_users for each row execute function public.set_updated_at();
drop trigger if exists trg_chats_set_updated_at on public.chats;
create trigger trg_chats_set_updated_at before
update on public.chats for each row execute function public.set_updated_at();
create or replace function public.activate_user_by_auth0_id(
        p_auth0_user_id text,
        p_role text default 'user',
        p_approved_by text default null
    ) returns public.app_users language plpgsql security definer as $$
declare updated_user public.app_users;
begin
update public.app_users
set role = case
        when p_role in ('user', 'admin') then p_role
        else 'user'
    end,
    status = 'active',
    approved_by = p_approved_by,
    approved_at = now()
where auth0_user_id = p_auth0_user_id
returning * into updated_user;
return updated_user;
end;
$$;
comment on table public.app_users is 'Application-level users keyed by Auth0 subject values.';
comment on table public.chats is 'Chat sessions owned by one application user.';
comment on table public.chat_messages is 'Messages belonging to a chat session.';
comment on column public.app_users.auth0_user_id is 'Auth0 sub claim, for example auth0|abc123 or google-oauth2|abc123.';
comment on column public.app_users.status is 'Active users can access the app immediately. Disabled users stay blocked.';
comment on column public.chats.title is 'Short title shown in the chat list.';
comment on column public.chats.chat_type is 'general = freeform AI chat, ticket = IT support ticket NL-SQL chat.';
comment on column public.chat_messages.metadata is 'Optional message payload for future citations, tool calls, or structured output.';
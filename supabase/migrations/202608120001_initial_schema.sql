create extension if not exists pgcrypto;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  phone_e164 text not null unique check (phone_e164 ~ '^\\+[1-9][0-9]{7,14}$'),
  timezone text not null default 'Asia/Seoul',
  plan_code text not null default 'free' check (plan_code in ('free', 'pro', 'ai_pro')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  plan_code text not null check (plan_code in ('free', 'pro', 'ai_pro')),
  status text not null check (status in ('active', 'past_due', 'cancelled')),
  period_start timestamptz not null,
  period_end timestamptz not null check (period_end > period_start),
  provider_customer_id text,
  created_at timestamptz not null default now()
);

create table public.reservations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  scheduled_at timestamptz not null,
  duration_seconds integer not null check (duration_seconds in (60, 180, 300)),
  mode text not null default 'normal' check (mode in ('normal', 'ai')),
  status text not null default 'scheduled' check (status in ('scheduled', 'dispatching', 'dialing', 'ringing', 'connected', 'completed', 'cancelled', 'failed', 'missed')),
  idempotency_key uuid not null,
  provider text,
  provider_call_id text,
  attempt_count integer not null default 0 check (attempt_count >= 0),
  ringing_started_at timestamptz,
  connected_at timestamptz,
  ended_at timestamptz,
  failure_code text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, idempotency_key),
  unique nulls not distinct (provider, provider_call_id)
);

create index reservations_due_idx on public.reservations(status, scheduled_at) where status = 'scheduled';
create index reservations_user_recent_idx on public.reservations(user_id, created_at desc);

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  reservation_id uuid references public.reservations(id) on delete set null,
  event_type text not null check (event_type in ('reservation_created', 'call_connected', 'ai_seconds_used')),
  quantity integer not null default 1 check (quantity >= 0),
  occurred_at timestamptz not null default now()
);
create index usage_events_user_time_idx on public.usage_events(user_id, occurred_at desc);

create table public.provider_events (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  provider_event_id text not null,
  reservation_id uuid references public.reservations(id) on delete set null,
  payload jsonb not null,
  received_at timestamptz not null default now(),
  unique (provider, provider_event_id)
);

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_updated_at before update on public.profiles for each row execute function public.set_updated_at();
create trigger reservations_updated_at before update on public.reservations for each row execute function public.set_updated_at();

create or replace function public.assert_reservation_transition()
returns trigger language plpgsql as $$
begin
  if new.status = old.status then return new; end if;
  if (old.status = 'scheduled' and new.status in ('dispatching', 'cancelled'))
     or (old.status = 'dispatching' and new.status in ('dialing', 'failed'))
     or (old.status = 'dialing' and new.status in ('ringing', 'failed'))
     or (old.status = 'ringing' and new.status in ('connected', 'missed', 'failed'))
     or (old.status = 'connected' and new.status in ('completed', 'failed')) then
    return new;
  end if;
  raise exception 'Invalid reservation status transition: % -> %', old.status, new.status using errcode = '22023';
end;
$$;
create trigger reservation_status_transition before update of status on public.reservations for each row execute function public.assert_reservation_transition();

create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.phone is not null then
    insert into public.profiles (id, phone_e164) values (new.id, new.phone)
    on conflict (id) do nothing;
  end if;
  return new;
end;
$$;
create trigger on_auth_user_created after insert on auth.users for each row execute function public.handle_new_user();

create or replace function public.create_reservation(
  p_scheduled_at timestamptz,
  p_duration_seconds integer,
  p_mode text,
  p_idempotency_key uuid
)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare
  caller uuid := auth.uid();
  profile public.profiles;
  reservation public.reservations;
  daily_limit integer;
  monthly_limit integer;
  ai_limit integer;
  daily_count integer;
  monthly_count integer;
  ai_seconds integer;
  seoul_now timestamptz := now();
begin
  if caller is null then raise exception 'Unauthenticated' using errcode = '28000'; end if;
  if p_scheduled_at <= now() then raise exception 'scheduled_at must be in the future' using errcode = '22023'; end if;
  if p_duration_seconds not in (60, 180, 300) then raise exception 'unsupported duration' using errcode = '22023'; end if;
  if p_mode not in ('normal', 'ai') then raise exception 'unsupported mode' using errcode = '22023'; end if;
  select * into profile from public.profiles where id = caller for update;
  if not found then raise exception 'Verified phone profile is required' using errcode = '22023'; end if;

  select * into reservation from public.reservations where user_id = caller and idempotency_key = p_idempotency_key;
  if found then return reservation; end if;

  select case profile.plan_code when 'free' then 2 else 30 end,
         case profile.plan_code when 'free' then 20 else 300 end,
         case profile.plan_code when 'ai_pro' then 1800 else 0 end
    into daily_limit, monthly_limit, ai_limit;
  if p_mode = 'ai' and profile.plan_code <> 'ai_pro' then raise exception 'AI PRO plan is required' using errcode = 'P0001'; end if;

  select coalesce(sum(quantity), 0) into daily_count from public.usage_events
    where user_id = caller and event_type = 'reservation_created'
      and occurred_at >= date_trunc('day', seoul_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(sum(quantity), 0) into monthly_count from public.usage_events
    where user_id = caller and event_type = 'reservation_created'
      and occurred_at >= date_trunc('month', seoul_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  select coalesce(sum(quantity), 0) into ai_seconds from public.usage_events
    where user_id = caller and event_type = 'ai_seconds_used'
      and occurred_at >= date_trunc('month', seoul_now at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if daily_count >= daily_limit or monthly_count >= monthly_limit then raise exception 'Plan call limit exceeded' using errcode = 'P0001'; end if;
  if p_mode = 'ai' and ai_seconds >= ai_limit then raise exception 'AI monthly limit exceeded' using errcode = 'P0001'; end if;

  insert into public.reservations (user_id, scheduled_at, duration_seconds, mode, idempotency_key)
    values (caller, p_scheduled_at, p_duration_seconds, p_mode, p_idempotency_key) returning * into reservation;
  insert into public.usage_events (user_id, reservation_id, event_type) values (caller, reservation.id, 'reservation_created');
  return reservation;
end;
$$;

create or replace function public.cancel_reservation(p_reservation_id uuid)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare reservation public.reservations;
begin
  update public.reservations set status = 'cancelled', ended_at = now()
    where id = p_reservation_id and user_id = auth.uid() and status = 'scheduled'
    returning * into reservation;
  if not found then raise exception 'Reservation cannot be cancelled' using errcode = 'P0001'; end if;
  return reservation;
end;
$$;

create or replace function public.claim_due_reservations(p_limit integer default 25)
returns setof public.reservations
language plpgsql security definer set search_path = public as $$
begin
  return query
  with due as (
    select id from public.reservations
    where status = 'scheduled' and scheduled_at <= now()
    order by scheduled_at asc for update skip locked limit greatest(1, least(p_limit, 100))
  )
  update public.reservations r set status = 'dispatching', attempt_count = r.attempt_count + 1
  from due where r.id = due.id returning r.*;
end;
$$;

alter table public.profiles enable row level security;
alter table public.subscriptions enable row level security;
alter table public.reservations enable row level security;
alter table public.usage_events enable row level security;
alter table public.provider_events enable row level security;
create policy "profiles select own" on public.profiles for select using (auth.uid() = id);
create policy "subscriptions select own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "reservations select own" on public.reservations for select using (auth.uid() = user_id);
create policy "usage events select own" on public.usage_events for select using (auth.uid() = user_id);

revoke all on function public.create_reservation(timestamptz, integer, text, uuid) from public;
revoke all on function public.cancel_reservation(uuid) from public;
revoke all on function public.claim_due_reservations(integer) from public;
grant execute on function public.create_reservation(timestamptz, integer, text, uuid) to authenticated;
grant execute on function public.cancel_reservation(uuid) to authenticated;
grant execute on function public.claim_due_reservations(integer) to service_role;


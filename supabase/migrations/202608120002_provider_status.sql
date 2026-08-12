create or replace function public.apply_provider_status(
  p_provider_call_id text,
  p_status text,
  p_occurred_at timestamptz,
  p_failure_code text default null
)
returns public.reservations
language plpgsql security definer set search_path = public as $$
declare reservation public.reservations;
begin
  select * into reservation from public.reservations where provider_call_id = p_provider_call_id for update;
  if not found then raise exception 'Unknown provider call' using errcode = 'P0002'; end if;
  if reservation.status in ('completed', 'cancelled', 'failed', 'missed') then return reservation; end if;

  if p_status = 'ringing' then
    if reservation.status = 'dispatching' then update public.reservations set status = 'dialing' where id = reservation.id; end if;
    update public.reservations set status = 'ringing', ringing_started_at = coalesce(ringing_started_at, p_occurred_at) where id = reservation.id and status = 'dialing';
  elsif p_status = 'connected' then
    if reservation.status = 'dispatching' then update public.reservations set status = 'dialing' where id = reservation.id; end if;
    if reservation.status in ('dispatching', 'dialing') then update public.reservations set status = 'ringing', ringing_started_at = coalesce(ringing_started_at, p_occurred_at) where id = reservation.id; end if;
    update public.reservations set status = 'connected', connected_at = coalesce(connected_at, p_occurred_at) where id = reservation.id and status = 'ringing';
    insert into public.usage_events (user_id, reservation_id, event_type)
      select user_id, id, 'call_connected' from public.reservations where id = reservation.id and connected_at = p_occurred_at;
  elsif p_status = 'completed' then
    if reservation.status = 'dispatching' then update public.reservations set status = 'dialing' where id = reservation.id; end if;
    if reservation.status in ('dispatching', 'dialing') then update public.reservations set status = 'ringing', ringing_started_at = coalesce(ringing_started_at, p_occurred_at) where id = reservation.id; end if;
    if reservation.status = 'ringing' then
      update public.reservations set status = 'connected', connected_at = coalesce(connected_at, p_occurred_at) where id = reservation.id;
      insert into public.usage_events (user_id, reservation_id, event_type)
        select user_id, id, 'call_connected' from public.reservations where id = reservation.id and connected_at = p_occurred_at;
    end if;
    update public.reservations set status = 'completed', ended_at = p_occurred_at where id = reservation.id and status = 'connected';
  elsif p_status = 'missed' then
    if reservation.status = 'dispatching' then update public.reservations set status = 'dialing' where id = reservation.id; end if;
    if reservation.status = 'dialing' then update public.reservations set status = 'ringing', ringing_started_at = coalesce(ringing_started_at, p_occurred_at) where id = reservation.id; end if;
    update public.reservations set status = 'missed', ended_at = p_occurred_at where id = reservation.id and status = 'ringing';
  elsif p_status = 'failed' then
    update public.reservations set status = 'failed', failure_code = p_failure_code, ended_at = p_occurred_at
      where id = reservation.id and status in ('dispatching', 'dialing', 'ringing', 'connected');
  else
    raise exception 'Unknown provider status' using errcode = '22023';
  end if;
  select * into reservation from public.reservations where id = reservation.id;
  return reservation;
end;
$$;

create or replace function public.record_ai_seconds(p_reservation_id uuid, p_seconds integer)
returns void
language plpgsql security definer set search_path = public as $$
declare reservation public.reservations;
declare seconds_used integer;
begin
  if p_seconds < 1 or p_seconds > 60 then raise exception 'AI call seconds must be between 1 and 60' using errcode = '22023'; end if;
  select * into reservation from public.reservations where id = p_reservation_id for update;
  if not found or reservation.mode <> 'ai' or reservation.status <> 'connected' then raise exception 'AI usage requires a connected AI reservation' using errcode = '22023'; end if;
  select coalesce(sum(quantity), 0) into seconds_used from public.usage_events
    where user_id = reservation.user_id and event_type = 'ai_seconds_used'
      and occurred_at >= date_trunc('month', now() at time zone 'Asia/Seoul') at time zone 'Asia/Seoul';
  if seconds_used + p_seconds > 1800 then raise exception 'AI monthly limit exceeded' using errcode = 'P0001'; end if;
  insert into public.usage_events (user_id, reservation_id, event_type, quantity) values (reservation.user_id, reservation.id, 'ai_seconds_used', p_seconds);
end;
$$;

revoke all on function public.apply_provider_status(text, text, timestamptz, text) from public;
revoke all on function public.record_ai_seconds(uuid, integer) from public;
grant execute on function public.apply_provider_status(text, text, timestamptz, text) to service_role;
grant execute on function public.record_ai_seconds(uuid, integer) to service_role;


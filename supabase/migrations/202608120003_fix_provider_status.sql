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

  if p_status = 'failed' then
    update public.reservations set status = 'failed', failure_code = p_failure_code, ended_at = p_occurred_at
      where id = reservation.id and status in ('dispatching', 'dialing', 'ringing', 'connected');
    select * into reservation from public.reservations where id = reservation.id;
    return reservation;
  end if;

  -- Providers can omit intermediate callbacks. Promote through every legal state in order.
  if reservation.status = 'dispatching' then
    update public.reservations set status = 'dialing' where id = reservation.id;
    select * into reservation from public.reservations where id = reservation.id;
  end if;
  if reservation.status = 'dialing' then
    update public.reservations set status = 'ringing', ringing_started_at = coalesce(ringing_started_at, p_occurred_at) where id = reservation.id;
    select * into reservation from public.reservations where id = reservation.id;
  end if;
  if p_status in ('connected', 'completed') and reservation.status = 'ringing' then
    update public.reservations set status = 'connected', connected_at = coalesce(connected_at, p_occurred_at) where id = reservation.id;
    insert into public.usage_events (user_id, reservation_id, event_type) values (reservation.user_id, reservation.id, 'call_connected');
    select * into reservation from public.reservations where id = reservation.id;
  end if;
  if p_status = 'completed' and reservation.status = 'connected' then
    update public.reservations set status = 'completed', ended_at = p_occurred_at where id = reservation.id;
  elsif p_status = 'missed' and reservation.status = 'ringing' then
    update public.reservations set status = 'missed', ended_at = p_occurred_at where id = reservation.id;
  end if;
  select * into reservation from public.reservations where id = reservation.id;
  return reservation;
end;
$$;

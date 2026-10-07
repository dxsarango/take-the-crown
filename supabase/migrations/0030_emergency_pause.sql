-- Emergency pause (security audit, medium; docs/INCIDENTS.md). While app_config.paused is on,
-- nobody can lock the crown, admins included, so no new checkout starts; a payment for a lock taken
-- before the pause still settles as usual (crowns or refunds). The site stays up and readable.
-- Checked by a trigger so no path that creates a lock can skip it.

alter table app_config add column paused boolean not null default false;

create or replace function refuse_locks_while_paused()
returns trigger
language plpgsql set search_path = public
as $$
begin
  if (select paused from app_config) then
    raise exception 'paused';
  end if;
  return new;
end $$;

create trigger price_locks_paused before insert on price_locks
for each row execute function refuse_locks_while_paused();

revoke execute on function refuse_locks_while_paused() from public, anon, authenticated;

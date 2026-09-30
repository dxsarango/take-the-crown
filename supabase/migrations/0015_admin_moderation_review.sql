-- Admin review of quarantined content (decision 34): approve pending or rejected content (fixing
-- false positives), or reject pending content with a reason. Logged like every admin action.

create or replace function review_reign_moderation(
  p_reign_id bigint,
  p_approved boolean,
  p_reason text,
  p_admin_profile_id uuid
)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_from moderation_status;
begin
  select moderation_status into v_from from reigns where id = p_reign_id for update;
  if not found then
    raise exception 'reign_not_found';
  end if;
  if p_approved and v_from not in ('pending', 'rejected') then
    raise exception 'not_reviewable';
  end if;
  if not p_approved and v_from <> 'pending' then
    raise exception 'not_reviewable';
  end if;
  if not p_approved and coalesce(p_reason, '') = '' then
    raise exception 'reason_required';
  end if;

  update reigns
  set moderation_status = case when p_approved then 'approved' else 'rejected' end::moderation_status,
      moderation_reason = case when p_approved then null else p_reason end
  where id = p_reign_id;

  insert into admin_actions (admin_profile_id, action, target, details)
  values (
    p_admin_profile_id,
    case when p_approved then 'approve_content' else 'reject_content' end,
    p_reign_id::text,
    jsonb_build_object('from', v_from, 'reason', case when p_approved then null else p_reason end)
  );
end $$;

revoke execute on function review_reign_moderation(bigint, boolean, text, uuid) from public, anon, authenticated;

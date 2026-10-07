-- The active lock's id stays on the server (security audit, high). Anyone could read
-- crown_state.active_lock_id with the public anon key, through the REST API or Realtime, and the
-- lock id is all /api/locks/<id>/release needs: a griefer could release every buyer's lock while
-- they paid, so their payment arrived late and was refunded. Clients only need whether the crown
-- is locked and until when (public_crown_state). Realtime drops columns a role cannot select.

revoke select on crown_state from anon, authenticated;
grant select (id, season_id, current_reign_id, base_price_cents, base_set_at, active_lock_expires_at, updated_at)
  on crown_state to anon, authenticated;

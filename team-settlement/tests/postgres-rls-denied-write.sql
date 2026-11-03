\set ON_ERROR_STOP on
-- Disposable synthetic database only. GRANT + writes revert at ROLLBACK.
-- The preceding postgres-smoke.sql seeds group_a, group_b and team_smoke_reader.
BEGIN;
GRANT INSERT ON kts_team.counterparties TO team_smoke_reader;
SET LOCAL ROLE team_smoke_reader;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
DECLARE
  v_denied boolean := false;
  v_code text;
  v_message text;
BEGIN
  -- A working permitted same-workspace INSERT proves privileges, constraints,
  -- table/schema access and the grant are sufficient before the denial check.
  INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name)
    VALUES('group_a','synthetic_allowed','customer','Synthetic allowed');
  IF NOT EXISTS(SELECT 1 FROM kts_team.counterparties
                WHERE workspace_id='group_a' AND partner_id='synthetic_allowed') THEN
    RAISE EXCEPTION 'LOCAL_WORKSPACE_INSERT_NOT_VISIBLE';
  END IF;
  BEGIN
    INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name)
      VALUES('group_b','synthetic_denied','customer','Synthetic denied');
  EXCEPTION WHEN OTHERS THEN
    GET STACKED DIAGNOSTICS v_code = RETURNED_SQLSTATE,
      v_message = MESSAGE_TEXT;
    -- Privilege errors unrelated to RLS are NOT proof of RLS enforcement.
    IF v_code='42501' AND v_message LIKE '%row-level security policy%' THEN
      v_denied:=true;
      RAISE NOTICE 'SYNTHETIC_RLS_WRITE_DENIAL_SQLSTATE=%',v_code;
    ELSE
      RAISE;
    END IF;
  END;
  IF NOT v_denied THEN
    RAISE EXCEPTION 'CROSS_WORKSPACE_WRITE_NOT_DENIED_BY_RLS';
  END IF;
  -- A known seeded foreign row must remain hidden under the restricted role.
  IF EXISTS(SELECT 1 FROM kts_team.counterparties
            WHERE workspace_id='group_b' AND partner_id='customer_1') THEN
    RAISE EXCEPTION 'CROSS_WORKSPACE_READ_LEAK';
  END IF;
END;
$$;
ROLLBACK;
\echo SYNTHETIC_CROSS_WORKSPACE_WRITE_DENIED

\set ON_ERROR_STOP on
-- Disposable synthetic database only. Grants and attempted writes roll back.
BEGIN;
GRANT INSERT ON kts_team.counterparties TO team_smoke_reader;
SET LOCAL ROLE team_smoke_reader;
SELECT set_config('kts.workspace_id','group_a',true);
DO $$
BEGIN
  BEGIN
    INSERT INTO kts_team.counterparties(workspace_id,partner_id,partner_kind,display_name)
      VALUES('group_b','synthetic_denied','customer','Synthetic denied');
    RAISE EXCEPTION 'CROSS_WORKSPACE_WRITE_NOT_DENIED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  IF EXISTS(SELECT 1 FROM kts_team.counterparties WHERE workspace_id='group_b') THEN
    RAISE EXCEPTION 'CROSS_WORKSPACE_READ_LEAK';
  END IF;
END;
$$;
ROLLBACK;
\echo SYNTHETIC_CROSS_WORKSPACE_WRITE_DENIED

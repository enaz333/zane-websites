UPDATE task_executions
SET state = 'failed', failure_code = 'execution_failed',
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ','now'),
    finished_at = strftime('%Y-%m-%dT%H:%M:%fZ','now')
WHERE task_id = 'd8220ea5-6e14-4397-9fec-0e866f8c13d7'
  AND state = 'running'
  AND pr_number IS NULL AND failure_code IS NULL
  AND check_status IS NULL AND finished_at IS NULL
  AND EXISTS (
    SELECT 1 FROM studio_dispatch_environment
    WHERE id = 1 AND staging_id = 'b034fcf2-2420-4ddc-8adc-3a88a649d37d'
  )
  AND EXISTS (
    SELECT 1 FROM execution_dispatch d
    WHERE d.task_id = task_executions.task_id
      AND d.phase = 'prepare' AND d.attempts = 3
      AND d.base_sha = '9392762a0d3ef6e07bf1e3a6f221d4188e4b5265'
      AND d.month = '2026-11' AND d.reserved_micros = 262548
      AND d.lock_id = 'bf05d72c-20bc-47ed-9fa1-0ff597de445b'
      AND d.lock_until = '2026-11-13T22:01:48.694Z'
      AND d.lock_until <= strftime('%Y-%m-%dT%H:%M:%fZ','now')
      AND d.deadline = '2026-11-13T23:22:48.787Z'
      AND d.replacement IS NULL AND d.input_tokens IS NULL
      AND d.output_tokens IS NULL AND d.check_summary IS NULL
  );

-- SQLite raises integer overflow on this branch, aborting the import.
SELECT CASE WHEN changes() = 1 THEN 1 ELSE abs(-9223372036854775808) END;

UPDATE execution_dispatch
SET phase = 'done', lock_id = NULL, lock_until = NULL
WHERE task_id = 'd8220ea5-6e14-4397-9fec-0e866f8c13d7'
  AND phase = 'prepare' AND changes() = 1;

SELECT CASE WHEN changes() = 1 THEN 1 ELSE abs(-9223372036854775808) END;

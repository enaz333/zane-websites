"""Exercise the reviewed recovery SQL against the staging schema."""
import sqlite3
import sys
import unittest
from pathlib import Path
from subprocess import TimeoutExpired

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
import abort_studio_staging as recovery


class AbortStudioStagingTest(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        self.addCleanup(self.db.close)
        self.db.row_factory = sqlite3.Row
        self.db.create_function("strftime", 2, lambda *_: "2035-01-10T12:00:00.000Z")
        self.db.execute("CREATE TABLE tasks(id TEXT PRIMARY KEY, status TEXT, updated_at TEXT)")
        for name in ("0002_execution.sql", "0003_dispatch.sql"):
            self.db.executescript((recovery.ROOT / "sites/studio/migrations" / name).read_text())
        with self.db:
            self.db.execute("INSERT INTO tasks VALUES (?,'submitted','fixture')", (recovery.TASK,))
            self.db.execute(
                "INSERT INTO task_executions(task_id,priority,available_at,updated_at) VALUES (?,1,'fixture','fixture')",
                (recovery.TASK,),
            )
            self.db.execute("UPDATE task_executions SET state='running'")
            self.db.execute("INSERT INTO studio_dispatch_environment VALUES (1,?)", (recovery.STAGING,))
            self.db.execute(
                """INSERT INTO execution_dispatch
                   (task_id,base_sha,month,reserved_micros,phase,attempts,lock_id,lock_until,deadline)
                   VALUES (?,?,'2026-11',262548,'prepare',3,?,?,?)""",
                (recovery.TASK, recovery.BASE, recovery.LOCK, recovery.LOCK_UNTIL, recovery.DEADLINE),
            )

    def run_batch(self):
        # Wrangler imports the entire file with rollback on failure.
        with self.db:
            self.db.execute("BEGIN")
            for statement in recovery.SQL.read_text().split(";"):
                if statement.strip():
                    self.db.execute(statement).fetchall()

    def state(self):
        return tuple(self.db.execute(
            """SELECT state,failure_code,phase,lock_id,lock_until,reserved_micros
               FROM task_executions JOIN execution_dispatch USING(task_id)"""
        ).fetchone())

    def audit(self):
        return [tuple(row) for row in self.db.execute("SELECT state FROM execution_events ORDER BY id")]

    def test_success_preserves_reservation_and_audit(self):
        self.run_batch()
        self.assertEqual(self.state(), ("failed", "execution_failed", "done", None, None, 262548))
        self.assertEqual(self.audit(), [("queued",), ("running",), ("failed",)])

    def test_changed_lock_aborts_first_update(self):
        with self.db:
            self.db.execute("UPDATE execution_dispatch SET lock_id='different'")
        self.assert_unchanged_on_failure()

    def test_zero_second_update_rolls_back_first_update_and_audit(self):
        self.db.execute("""CREATE TRIGGER skip_dispatch BEFORE UPDATE ON execution_dispatch
                          BEGIN SELECT RAISE(IGNORE); END""")
        self.assert_unchanged_on_failure()

    def verify_import(self, *, commit, reply, read_error=False):
        def read(sql):
            return [dict(row) for row in self.db.execute(sql)]

        (before,) = read(recovery.SNAPSHOT)
        audit = read(recovery.AUDIT)
        calls = []

        def query(mode, target):
            calls.append(mode)
            if mode == "--file":
                if commit:
                    self.run_batch()
                if isinstance(reply, Exception):
                    raise reply
                return reply
            if read_error:
                raise ValueError("private fixture output")
            return read(target)

        try:
            return recovery.import_and_verify(query, before, audit)
        finally:
            self.assertEqual(calls.count("--file"), 1)
            self.assertGreaterEqual(calls.count("--command"), 1)

    def test_committed_import_verified_after_timeout_or_unexpected_result(self):
        for reply in (TimeoutExpired("fixture", 1), [{"changed": 2}]):
            with self.subTest(reply=reply):
                self.assertEqual(self.verify_import(commit=True, reply=reply),
                                 "recovery_import_verified_after_unclear_response")
                self.assertEqual(self.state(), ("failed", "execution_failed", "done", None, None, 262548))
                self.doCleanups()
                self.setUp()

    def test_verification_failure_reports_unknown_without_raw_error(self):
        with self.assertRaisesRegex(ValueError, "^recovery_verification_unavailable:") as error:
            self.verify_import(commit=True, reply=[{"Total queries executed": 4}], read_error=True)
        self.assertNotIn("private fixture", str(error.exception))
        self.assertEqual(self.state()[0], "failed")

    def test_ambiguous_response_with_original_state(self):
        with self.assertRaisesRegex(ValueError, "^recovery_original_state_observed:"):
            self.verify_import(commit=False, reply=ValueError("private fixture output"))
        self.assertEqual(self.state()[0], "running")

    def assert_unchanged_on_failure(self):
        before = self.state(), self.audit()
        with self.assertRaisesRegex(sqlite3.OperationalError, "integer overflow"):
            self.run_batch()
        self.assertEqual((self.state(), self.audit()), before)

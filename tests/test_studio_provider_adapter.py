import json
import unittest
from unittest.mock import Mock
from studio_engine.engine import FixtureProvider
from studio_engine.provider import Approval, ResponsesProvider
from studio_engine.runner import DockerRunner


class ProviderTests(unittest.TestCase):
    def test_disabled_cannot_send(self):
        transport = Mock()
        with self.assertRaisesRegex(ValueError, "activation_required"):
            ResponsesProvider(Approval("fixture-model", 1000, 64000, 100), "fixture",
                              transport).generate({}, {})
        transport.assert_not_called()

    def test_structured_artifact_and_usage(self):
        files = FixtureProvider().generate({}, {})
        response = {"id": "resp_fixture", "status": "completed",
                    "usage": {"input_tokens": 20, "output_tokens": 30},
                    "output": [{"type": "message", "content": [{"type": "output_text",
                        "text": json.dumps({"files": [{"path": k, "content": v} for k, v in files.items()]})}]}]}
        transport = Mock(return_value=response)
        provider = ResponsesProvider(Approval("fixture-model", 1000, 64000, 100, True), "fixture", transport)
        self.assertEqual(provider.generate({"description": "arbitrary brief"}, files), files)
        self.assertEqual(provider.result["job_id"], "resp_fixture")
        self.assertEqual(transport.call_args.args[0]["tools"], [])
        response["status"] = "incomplete"
        with self.assertRaisesRegex(ValueError, "invalid_response"):
            provider.generate({}, {})

    def test_lost_reply_never_retries(self):
        transport = Mock(side_effect=TimeoutError())
        provider = ResponsesProvider(Approval("fixture-model", 1000, 64000, 100, True), "fixture", transport)
        with self.assertRaisesRegex(ValueError, "outcome_unknown"):
            provider.generate({}, {})
        self.assertEqual(transport.call_count, 1)

    def test_mutable_image_is_rejected(self):
        with self.assertRaisesRegex(ValueError, "immutable"):
            DockerRunner("node:latest")

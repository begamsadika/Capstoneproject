import unittest

import config


class LLMConfigurationTests(unittest.TestCase):
    def test_live_chat_timeouts_are_disabled(self):
        self.assertIsNone(config.OLLAMA_REQUEST_TIMEOUT_SECONDS)
        self.assertIsNone(config.OLLAMA_FIRST_RESPONSE_TIMEOUT_SECONDS)
        self.assertIsNone(config.OLLAMA_STREAM_IDLE_TIMEOUT_SECONDS)
        self.assertIsNone(config.OLLAMA_TOTAL_RESPONSE_TIMEOUT_SECONDS)

    def test_model_is_kept_resident_between_requests(self):
        self.assertEqual(config.OLLAMA_KEEP_ALIVE, "30m")
        self.assertEqual(config.llm.keep_alive, "30m")

    def test_model_warmup_is_enabled(self):
        self.assertTrue(config.OLLAMA_WARMUP_ENABLED)
        self.assertGreater(config.OLLAMA_WARMUP_TIMEOUT_SECONDS, 0)


if __name__ == "__main__":
    unittest.main()

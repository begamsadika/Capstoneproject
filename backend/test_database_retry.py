import unittest
from unittest.mock import Mock, patch

from sqlalchemy.exc import OperationalError

from app.core.config import DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS
from app.database import engine, get_db, run_database_operation_with_retry


def _operational_error(message: str) -> OperationalError:
    return OperationalError("SELECT 1", {}, Exception(message))


class DatabaseStartupRetryTests(unittest.TestCase):
    def test_transient_login_timeout_is_retried(self):
        operation = Mock(side_effect=[
            _operational_error("08001 Login timeout expired; Timeout error [258]"),
            None,
        ])

        with (
            patch("app.database.time.sleep") as sleep,
            patch("app.database.engine.dispose") as dispose,
        ):
            run_database_operation_with_retry(
                operation,
                max_attempts=3,
                base_delay_seconds=0.25,
            )

        self.assertEqual(operation.call_count, 2)
        sleep.assert_called_once_with(0.25)
        dispose.assert_called_once()

    def test_non_transient_database_error_is_not_retried(self):
        operation = Mock(side_effect=_operational_error("42000 syntax error"))

        with (
            patch("app.database.time.sleep") as sleep,
            patch("app.database.engine.dispose") as dispose,
            self.assertRaises(OperationalError),
        ):
            run_database_operation_with_retry(operation, max_attempts=5)

        operation.assert_called_once()
        sleep.assert_not_called()
        dispose.assert_called_once()

    def test_encryption_configuration_error_is_not_retried(self):
        operation = Mock(side_effect=_operational_error(
            "08001 Encryption not supported on the client"
        ))

        with (
            patch("app.database.time.sleep") as sleep,
            patch("app.database.engine.dispose"),
            self.assertRaises(OperationalError),
        ):
            run_database_operation_with_retry(operation, max_attempts=5)

        operation.assert_called_once()
        sleep.assert_not_called()

    def test_development_engine_explicitly_sets_encrypt_option(self):
        query = {key.lower(): value for key, value in engine.url.query.items()}
        self.assertEqual(query["encrypt"].lower(), "no")

    def test_retry_count_must_be_positive(self):
        with self.assertRaises(ValueError):
            run_database_operation_with_retry(lambda: None, max_attempts=0)

    def test_request_dependency_does_not_run_redundant_validation_query(self):
        session = Mock()
        with patch("app.database.SessionLocal", return_value=session) as factory:
            dependency = get_db()
            self.assertIs(next(dependency), session)
            dependency.close()

        factory.assert_called_once_with()
        session.execute.assert_not_called()
        session.close.assert_called_once_with()

    def test_backend_proxy_allows_cpu_model_first_token_budget(self):
        self.assertIsNone(DIET_CHAT_STREAM_READ_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()

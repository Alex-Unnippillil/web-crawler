# Unit tests for the optional POSIX monitoring and email-report helper.

import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch, MagicMock
spec = importlib.util.spec_from_file_location('monitor', Path(__file__).parents[1] / 'scripts/monitor.py')
monitor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(monitor)
class MonitorTests(unittest.TestCase):
    def test_timings_do_not_trigger_changes(self):
        a = [{'url': 'https://example.com/', 'duration_ms': 12}]
        b = [{'url': 'https://example.com/', 'duration_ms': 55}]
        self.assertEqual(monitor.fingerprint(a, {}), monitor.fingerprint(b, {}))
    def test_content_changes_trigger_changes(self):
        self.assertNotEqual(monitor.fingerprint([{'heading': 'A'}], {}), monitor.fingerprint([{'heading': 'B'}], {}))
    def test_environment_file_permissions(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / 'config'
            path.write_text('SMTP_HOST=mail.example.com\n')
            path.chmod(0o644)
            with self.assertRaises(ValueError): monitor.load_config(str(path))
            path.chmod(0o600)
            self.assertEqual(monitor.load_config(str(path))['SMTP_HOST'], 'mail.example.com')
    def test_plaintext_email_is_rejected(self):
        with self.assertRaises(ValueError):
            monitor.send_email({'SMTP_HOST':'example.com','SMTP_FROM':'a@example.com','SMTP_TO':'b@example.com','SMTP_SECURITY':'none'}, 's', 'b', None)
    def test_starttls_and_recipient_routing(self):
        smtp = MagicMock()
        smtp.__enter__.return_value = smtp
        with patch.object(monitor.smtplib, 'SMTP', return_value=smtp):
            monitor.send_email({'SMTP_HOST':'example.com','SMTP_FROM':'a@example.com','SMTP_TO':'b@example.com,c@example.com'},'s','b',None)
        smtp.starttls.assert_called_once()
        self.assertEqual(smtp.send_message.call_args.kwargs['to_addrs'], ['b@example.com','c@example.com'])
if __name__ == '__main__': unittest.main()

import hashlib
import hmac
import json
import time
import unittest
from vm2_agent import canonical_bytes, verify_request

KEY = 'T' * 64


def envelope(now=None):
    now = int(time.time()) if now is None else now
    payload = {'schema': 'violet-soc-vm2-v1', 'request_id': 17, 'action': 'block',
               'target_ip': '198.51.100.7', 'approved_by': 'admin',
               'decided_at': '2026-11-26T10:00:00+09:00', 'issued_at': now,
               'expires_at': now + 300}
    return {'payload': payload, 'signature': hmac.new(KEY.encode(), canonical_bytes(payload), hashlib.sha256).hexdigest()}


class VerifyTests(unittest.TestCase):
    def test_valid(self):
        env = envelope(1700000000)
        result, target = verify_request(env, KEY, now=1700000005)
        self.assertEqual(result['action'], 'block')
        self.assertEqual(str(target), '198.51.100.7')

    def test_tampered_ip(self):
        env = envelope(1700000000)
        env['payload']['target_ip'] = '192.168.56.140'
        with self.assertRaisesRegex(ValueError, 'signature'):
            verify_request(env, KEY, now=1700000005)

    def test_expired(self):
        with self.assertRaisesRegex(ValueError, 'Expired'):
            verify_request(envelope(1700000000), KEY, now=1700002000)

    def test_bad_schema(self):
        env = envelope(1700000000)
        env['payload']['schema'] = 'wrong'
        with self.assertRaisesRegex(ValueError, 'schema'):
            verify_request(env, KEY, now=1700000005)

    def test_noncanonical_ipv4(self):
        env = envelope(1700000000)
        env['payload']['target_ip'] = '01.2.3.4'
        env['signature'] = hmac.new(KEY.encode(), canonical_bytes(env['payload']), hashlib.sha256).hexdigest()
        with self.assertRaises(ValueError):
            verify_request(env, KEY, now=1700000005)


if __name__ == '__main__':
    unittest.main()

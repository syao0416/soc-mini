"""Export one already-approved SOC block/unblock decision as a signed short-lived request.

Does not connect to VM2 and does not execute a firewall command.
"""
import hashlib
import hmac
import ipaddress
import json
import os
from datetime import timedelta
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.utils import timezone
from monitoring.models import ResponseRequest
from operations.policy import is_eligible_for_block


class Command(BaseCommand):
    help = 'Generate a signed, short-lived VM2 action file from an approved Django request (NO execution).'

    def add_arguments(self, parser):
        parser.add_argument('--request-id', required=True, type=int)
        parser.add_argument('--output', required=True)
        parser.add_argument('--ttl', type=int, default=300, help='Seconds, 30-600; default 300')

    def handle(self, *args, **options):
        secret = os.getenv('SOC_VM2_SIGNING_KEY', '')
        if len(secret.encode('utf-8')) < 32:
            raise CommandError('SOC_VM2_SIGNING_KEY is not configured or is shorter than 32 bytes.')
        ttl = options['ttl']
        if not 30 <= ttl <= 600:
            raise CommandError('--ttl must be 30-600 seconds')
        record = ResponseRequest.objects.select_related('decided_by','created_by').filter(pk=options['request_id']).first()
        if record is None:
            raise CommandError('Request not found')
        if record.status != ResponseRequest.Status.APPROVED or not record.decided_by or not record.decided_by.is_superuser or not record.decided_at:
            raise CommandError('An active Django superuser must have approved this request first')
        if record.action not in (ResponseRequest.Action.BLOCK, ResponseRequest.Action.UNBLOCK):
            raise CommandError('Unsupported action')
        try:
            target_ip = str(ipaddress.IPv4Address(record.target_ip))
        except ipaddress.AddressValueError:
            raise CommandError('This VM2 demo agent supports IPv4 only') from None
        if record.action == ResponseRequest.Action.BLOCK:
            allowed, reason = is_eligible_for_block(target_ip)
            if not allowed:
                raise CommandError(f'Protected IP: {reason}')
        now = timezone.now()
        payload = {
            'schema': 'violet-soc-vm2-v1',
            'request_id': record.pk,
            'action': record.action,
            'target_ip': target_ip,
            'approved_by': record.decided_by.username,
            'decided_at': record.decided_at.isoformat(),
            'issued_at': int(now.timestamp()),
            'expires_at': int((now + timedelta(seconds=ttl)).timestamp()),
        }
        canonical = json.dumps(payload, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
        signature = hmac.new(secret.encode('utf-8'), canonical, hashlib.sha256).hexdigest()
        envelope = {'payload': payload, 'signature': signature}
        path = Path(options['output']).resolve()
        # Prevent overwriting previously issued requests; approved JSON is sensitive operational data.
        try:
            with path.open('x', encoding='utf-8') as f:
                json.dump(envelope, f, ensure_ascii=False, indent=2)
                f.write('\n')
        except FileExistsError:
            raise CommandError('Output already exists. Specify a new filename.') from None
        except OSError as exc:
            raise CommandError(f'Cannot create output: {exc.__class__.__name__}') from None
        try:
            os.chmod(path, 0o600)
        except OSError:
            pass
        self.stdout.write(self.style.SUCCESS(f'Created approved action file: {path}'))
        self.stdout.write('No firewall command was executed. Copy the file securely to VM2 and preview it there.')

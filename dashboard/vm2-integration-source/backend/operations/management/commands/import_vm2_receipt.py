"""Persist a cryptographically verified VM2 execution receipt in the Django account DB."""
import hashlib
import hmac
import ipaddress
import json
import os
from datetime import datetime, timezone
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction
from monitoring.models import ResponseRequest
from operations.models import FirewallExecutionReceipt


class Command(BaseCommand):
    help = 'Validate and import a signed VM2 firewall execution receipt; no firewall commands.'

    def add_arguments(self, parser):
        parser.add_argument('--file', required=True)

    def handle(self, *args, **options):
        secret = os.getenv('SOC_VM2_SIGNING_KEY', '')
        if len(secret.encode()) < 32:
            raise CommandError('SOC_VM2_SIGNING_KEY is missing or too short.')
        try:
            envelope = json.loads(Path(options['file']).read_text(encoding='utf-8'))
            data, signature = envelope['payload'], envelope['signature']
            if set(envelope) != {'payload', 'signature'} or set(data) != {'schema','request_id','action','target_ip','result','timestamp'}:
                raise ValueError('Invalid receipt fields')
            if data['schema'] != 'violet-soc-vm2-receipt-v1' or type(data['request_id']) is not int or type(data['timestamp']) is not int:
                raise ValueError('Invalid receipt metadata')
            if data['action'] not in ('block','unblock') or data['result'] not in ('blocked','already_blocked','unblocked','already_unblocked'):
                raise ValueError('Invalid action or result')
            if data['action'] == 'block' and data['result'] not in ('blocked','already_blocked'):
                raise ValueError('Mismatched action result')
            if data['action'] == 'unblock' and data['result'] not in ('unblocked','already_unblocked'):
                raise ValueError('Mismatched action result')
            target = str(ipaddress.IPv4Address(data['target_ip']))
            if target != data['target_ip']:
                raise ValueError('Invalid address canonicalization')
            canonical = json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')
            if not hmac.compare_digest(hmac.new(secret.encode('utf-8'),canonical,hashlib.sha256).hexdigest(),signature):
                raise ValueError('Invalid receipt signature')
            timestamp = datetime.fromtimestamp(data['timestamp'], tz=timezone.utc)
        except (ValueError, KeyError, TypeError, OSError, UnicodeError) as exc:
            raise CommandError(f'Invalid signed VM2 receipt ({type(exc).__name__})') from None
        with transaction.atomic():
            record = ResponseRequest.objects.select_for_update().filter(pk=data['request_id']).first()
            if (not record or record.status != ResponseRequest.Status.APPROVED or
                record.action != data['action'] or str(record.target_ip) != target or not record.decided_at):
                raise CommandError('Receipt does not match an approved Django response request')
            if data['timestamp'] < int(record.decided_at.timestamp()) - 30:
                raise CommandError('Receipt timestamp predates approval')
            receipt, created = FirewallExecutionReceipt.objects.get_or_create(
                response=record,
                defaults={'action': data['action'], 'target_ip': target, 'result': data['result'], 'executed_at': timestamp},
            )
            if not created and (receipt.action != data['action'] or receipt.target_ip != target or receipt.result != data['result']):
                raise CommandError('Different receipt already imported; do not overwrite audit trail')
        self.stdout.write(self.style.SUCCESS(f'Receipt {"imported" if created else "already known"}: #{record.pk}, {data["result"]}'))

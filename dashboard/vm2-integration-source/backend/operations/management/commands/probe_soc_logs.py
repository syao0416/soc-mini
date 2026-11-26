"""Read-only health probe for the configured SOC event database."""
import json
from datetime import datetime
from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.db import connections


class Command(BaseCommand):
    help = 'Check SOC logs DB connection and read current event count. Never changes tables.'

    def handle(self, *args, **options):
        if 'soc_logs' not in connections:
            raise CommandError('soc_logs alias is not configured')
        db = settings.DATABASES['soc_logs']
        try:
            with connections['soc_logs'].cursor() as cursor:
                cursor.execute('SELECT COUNT(*), MAX(inserted_at) FROM events')
                count, latest = cursor.fetchone()
                cursor.execute('SELECT log_type, COUNT(*) FROM events GROUP BY log_type ORDER BY COUNT(*) DESC LIMIT 10')
                types = dict(cursor.fetchall())
        except Exception as exc:
            raise CommandError(f'SOC DB connection/query failed: {exc.__class__.__name__}. Check network, SELECT grants and SOC_LOGS_* values.') from None
        result = {
            'status': 'ok', 'mode': 'remote' if settings.DATABASES['soc_logs']['HOST'] != settings.DATABASES['default']['HOST'] else 'possibly_local',
            'host': db['HOST'], 'database': db['NAME'], 'total_events': count,
            'newest_inserted_at': latest.isoformat() if isinstance(latest, datetime) else str(latest) if latest else None,
            'by_log_type': types,
            'read_only_query': True,
        }
        self.stdout.write(json.dumps(result, ensure_ascii=False, indent=2))
        self.stdout.write('이벤트 건수는 한 번만 조회한 결과입니다. 신규 로그 유입 여부는 수초 후 재실행하여 확인해 주세요.')

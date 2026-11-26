import time
from django.core.management.base import BaseCommand, CommandError
from operations.email_service import send_new_alerts


class Command(BaseCommand):
    help = 'Poll newly inserted SOC DB events and email threshold alerts. No firewall commands.'

    def add_arguments(self, parser):
        parser.add_argument('--loop', action='store_true', help='Repeat until interrupted.')
        parser.add_argument('--interval', type=int, default=60, help='Polling interval in seconds (minimum 30).')

    def handle(self, *args, **options):
        while True:
            try:
                result = send_new_alerts()
                self.stdout.write(str(result))
            except Exception as exc:
                # Do not log SMTP usernames, passwords, or event contents.
                self.stderr.write(f'알림 작업이 실패했습니다 ({exc.__class__.__name__}). 서버 SMTP/DB 설정을 확인해 주세요.')
                if not options['loop']:
                    raise CommandError('알림 작업이 실패했습니다.') from exc
            if not options['loop']:
                return
            time.sleep(max(30, options['interval']))

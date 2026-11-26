import os

from django.conf import settings
from django.core.mail import send_mail
from django.db.models import Q

from monitoring.models import SocEvent
from .models import NotificationCursor, NotificationDelivery, SocConfiguration


def smtp_ready():
    # No credentials are returned through the API. Anonymous relays are opt-in.
    return bool(settings.EMAIL_HOST and settings.DEFAULT_FROM_EMAIL and
                (settings.EMAIL_HOST_USER or os.getenv('SOC_SMTP_ALLOW_ANONYMOUS', '').lower() == 'true'))


def baseline_cursor():
    """Ignore historical snapshots when alerts are enabled (or re-enabled)."""
    latest = SocEvent.objects.using('soc_logs').order_by('-inserted_at', '-event_id').values('inserted_at', 'event_id').first()
    cursor, _ = NotificationCursor.objects.get_or_create(pk=1)
    cursor.last_inserted_at = latest['inserted_at'] if latest else None
    cursor.last_event_id = latest['event_id'] if latest else ''
    cursor.save(update_fields=['last_inserted_at', 'last_event_id', 'updated_at'])


def send_new_alerts(limit=30):
    """Poll newer events. Run explicitly/scheduled; never executes automatically on app startup."""
    config = SocConfiguration.objects.filter(pk=1).first()
    if not config or not config.mail_enabled:
        return {'processed': 0, 'sent': 0, 'reason': '알림이 비활성화되어 있습니다.'}
    if not smtp_ready() or not config.recipients.strip():
        return {'processed': 0, 'sent': 0, 'reason': 'SMTP 또는 수신자 설정이 없습니다.'}
    cursor = NotificationCursor.objects.filter(pk=1).first()
    if cursor is None:
        baseline_cursor()
        return {'processed': 0, 'sent': 0, 'reason': '기존 로그를 기준점으로 등록했습니다.'}
    qs = SocEvent.objects.using('soc_logs').order_by('inserted_at', 'event_id')
    if cursor.last_inserted_at is not None:
        qs = qs.filter(Q(inserted_at__gt=cursor.last_inserted_at) | Q(inserted_at=cursor.last_inserted_at, event_id__gt=cursor.last_event_id))
    else:
        # Empty source when enabled: no watermark. Future rows are included.
        pass
    sent = 0
    processed = 0
    recipients = [x.strip() for x in config.recipients.split(',') if x.strip()]
    for event in qs[:max(1, min(limit, 100))]:
        if event.severity_level >= config.min_severity and not NotificationDelivery.objects.filter(event_id=event.event_id).exists():
            safe_type = str(event.log_type).replace("\r", " ").replace("\n", " ")[:48]
            title = f'[VIOLET SOC] {event.severity.upper()} 이벤트: {safe_type}'
            message = '\n'.join([
                '새 보안 이벤트가 수집되었습니다.',
                f'이벤트 ID: {event.event_id}',
                f'위험도: {event.severity}',
                f'로그 종류: {event.log_type}',
                f'출발지 IP: {event.src_ip or "미상"}',
                f'발생 시각(DB): {event.event_time}',
                f'요약: {(event.message or "")[:400]}',
                '', '이 메일만으로 공격 여부를 확정하지 마시고 SOC에서 원본 로그를 확인해 주세요.',
            ])
            # If SMTP fails, do not advance the cursor. Retry on the next run.
            actual_count = send_mail(title, message, settings.DEFAULT_FROM_EMAIL, recipients, fail_silently=False)
            if actual_count != 1:
                raise RuntimeError("SMTP가 메일 발송을 확인하지 못했습니다.")
            NotificationDelivery.objects.create(event_id=event.event_id, sent_to=', '.join(recipients))
            sent += 1
        cursor.last_inserted_at = event.inserted_at
        cursor.last_event_id = event.event_id
        cursor.save(update_fields=['last_inserted_at', 'last_event_id', 'updated_at'])
        processed += 1
    return {'processed': processed, 'sent': sent}

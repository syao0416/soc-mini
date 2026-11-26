import ipaddress
import json
from datetime import timedelta

from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.mail import send_mail
from django.core.validators import validate_email
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_http_methods

from .email_service import baseline_cursor, smtp_ready
from .models import SettingsAudit, SocConfiguration
from .policy import is_eligible_for_block


def admin_error(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return JsonResponse({'detail': '로그인이 필요합니다.'}, status=401)
    if not request.user.is_superuser:
        return JsonResponse({'detail': '관리자 계정에서만 설정할 수 있습니다.'}, status=403)
    return None


def input_json(request):
    try:
        data = json.loads(request.body.decode('utf-8'))
    except (ValueError, UnicodeDecodeError):
        return None
    return data if isinstance(data, dict) else None


def show_config(config):
    return {
        'mail_enabled': config.mail_enabled,
        'recipients': config.recipients,
        'min_severity': config.min_severity,
        'protected_networks': config.protected_networks,
        'smtp_configured': smtp_ready(),
        'smtp_host': settings.EMAIL_HOST or '',
        'smtp_sender': settings.DEFAULT_FROM_EMAIL or '',
        'smtp_port': settings.EMAIL_PORT,
        'firewall_execution_enabled': False,
        'firewall_note': '승인 및 정책 검토까지만 지원합니다. VM2 방화벽 실행 에이전트는 연결되지 않았습니다.',
    }


@csrf_protect
@require_http_methods(['GET', 'PUT'])
def configuration(request):
    if (denied := admin_error(request)) is not None:
        return denied
    config, _ = SocConfiguration.objects.get_or_create(pk=1)
    if request.method == 'GET':
        return JsonResponse(show_config(config))
    body = input_json(request)
    if body is None or type(body.get('mail_enabled')) is not bool:
        return JsonResponse({'detail': 'mail_enabled는 참/거짓 값이어야 합니다.'}, status=400)
    try:
        level = int(body.get('min_severity'))
        if level < 0 or level > 4:
            raise ValueError()
    except (TypeError, ValueError):
        return JsonResponse({'detail': '위험도는 0부터 4까지 지정해 주세요.'}, status=400)
    raw_recipients = body.get('recipients', '')
    if not isinstance(raw_recipients, str) or len(raw_recipients) > 1024:
        return JsonResponse({'detail': '수신자 목록이 너무 깁니다.'}, status=400)
    recipients = list(dict.fromkeys(v.strip() for v in raw_recipients.replace('\n', ',').split(',') if v.strip()))
    if len(recipients) > 5:
        return JsonResponse({'detail': '수신자는 최대 5명까지 설정할 수 있습니다.'}, status=400)
    try:
        for email in recipients:
            validate_email(email)
    except ValidationError:
        return JsonResponse({'detail': '수신자 이메일 형식이 올바르지 않습니다.'}, status=400)
    raw_networks = body.get('protected_networks', '')
    if not isinstance(raw_networks, str) or len(raw_networks) > 2000:
        return JsonResponse({'detail': '보호 IP 대역은 최대 2000자까지 입력할 수 있습니다.'}, status=400)
    networks = [line.strip() for line in raw_networks.splitlines() if line.strip()]
    if len(networks) > 30:
        return JsonResponse({'detail': '보호 IP 대역은 최대 30개까지 설정할 수 있습니다.'}, status=400)
    try:
        networks = [str(ipaddress.ip_network(v, strict=False)) for v in networks]
    except ValueError:
        return JsonResponse({'detail': '보호 IP 대역을 CIDR 형식으로 입력해 주세요.'}, status=400)
    if body['mail_enabled'] and (not recipients or not smtp_ready()):
        return JsonResponse({'detail': '알림을 켜기 전에 SMTP와 수신자를 설정해 주세요.'}, status=400)

    should_baseline = body['mail_enabled'] and not config.mail_enabled
    config.mail_enabled = body['mail_enabled']
    config.recipients = ','.join(recipients)
    config.min_severity = level
    config.protected_networks = '\n'.join(networks)
    if should_baseline:
        # A baseline is set before enabling the poller; existing snapshot rows are skipped.
        try:
            baseline_cursor()
        except Exception:
            return JsonResponse({'detail': 'SOC 로그 DB에서 기준 시점을 확인하지 못했습니다. 메일 알림을 활성화하지 않았습니다.'}, status=503)
    config.save()
    SettingsAudit.objects.create(
        changed_by=request.user,
        description=f'알림 {"사용" if config.mail_enabled else "중지"}, 최소 위험도 {level}, 수신자 {len(recipients)}명, 보호 대역 {len(networks)}개',
    )
    return JsonResponse(show_config(config))


@csrf_protect
@require_http_methods(['POST'])
def smtp_test(request):
    if (denied := admin_error(request)) is not None:
        return denied
    if not smtp_ready():
        return JsonResponse({'detail': '서버의 SMTP 환경변수 설정이 필요합니다.'}, status=400)
    body = input_json(request)
    if body is None or not isinstance(body.get('email'), str):
        return JsonResponse({'detail': '테스트 수신자 이메일이 필요합니다.'}, status=400)
    target = body['email'].strip()
    try:
        validate_email(target)
    except ValidationError:
        return JsonResponse({'detail': '올바른 이메일 주소를 입력해 주세요.'}, status=400)
    # DB-backed basic throttle for test-send; avoids accidental rapid sends.
    recent = SettingsAudit.objects.filter(
        changed_by=request.user,
        description='SMTP 테스트 메일 발송',
        changed_at__gte=timezone.now() - timedelta(seconds=60),
    ).exists()
    if recent:
        return JsonResponse({'detail': '테스트 메일은 1분 후 다시 발송할 수 있습니다.'}, status=429)
    try:
        sent = send_mail(
            '[VIOLET SOC] SMTP 발송 테스트',
            'VIOLET SOC Django 서버에서 보낸 테스트 메일입니다. SMTP 설정이 작동하고 있습니다.',
            settings.DEFAULT_FROM_EMAIL,
            [target],
            fail_silently=False,
        )
    except Exception:
        # Avoid disclosing SMTP credentials or exception detail over the API.
        return JsonResponse({'detail': 'SMTP 발송에 실패했습니다. 서버 로그와 메일 공급자 설정을 확인해 주세요.'}, status=502)
    if sent != 1:
        return JsonResponse({'detail': 'SMTP 발송이 완료되지 않았습니다.'}, status=502)
    SettingsAudit.objects.create(changed_by=request.user, description='SMTP 테스트 메일 발송')
    return JsonResponse({'ok': True, 'detail': '테스트 메일 발송 요청을 완료했습니다. 수신함을 확인해 주세요.'})


@csrf_protect
@require_http_methods(['POST'])
def preview_block(request):
    if (denied := admin_error(request)) is not None:
        return denied
    body = input_json(request)
    if body is None or not isinstance(body.get('ip'), str):
        return JsonResponse({'detail': '검토할 IP 주소가 필요합니다.'}, status=400)
    eligible, reason = is_eligible_for_block(body['ip'].strip())
    return JsonResponse({'eligible': eligible, 'reason': reason, 'executed': False})

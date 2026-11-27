import ipaddress
import json
import re

from django.db.models import Count, Q
from django.http import JsonResponse
from django.utils import timezone
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods

from .models import EventReview, ResponseRequest, SocEvent

UUID36 = re.compile(r'^[a-fA-F0-9]{8}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{4}-[a-fA-F0-9]{12}$')


def auth_error(request):
    if not request.user.is_authenticated or not request.user.is_active:
        return JsonResponse({'detail': '로그인이 필요합니다.'}, status=401)
    return None


def check_event_id(event_id):
    return bool(UUID36.fullmatch(event_id))


def parse_body(request):
    try:
        value = json.loads(request.body.decode('utf-8'))
        if isinstance(value, dict):
            return value
    except (ValueError, UnicodeDecodeError):
        pass
    return None


def event_exists(event_id):
    return SocEvent.objects.using('soc_logs').filter(event_id=event_id).exists()


def dt(value):
    return value.isoformat() if value else None


def event_item(event, reviews):
    review = reviews.get(event.event_id)
    return {
        'event_id': event.event_id,
        'event_time': dt(event.event_time),
        'source_vm': event.source_vm,
        'source_tag': event.source_tag,
        'log_type': event.log_type,
        'event_category': event.event_category,
        'event_type': event.event_type,
        'severity': event.severity,
        'severity_level': event.severity_level,
        'src_ip': event.src_ip,
        'src_port': event.src_port,
        'dst_ip': event.dst_ip,
        'dst_port': event.dst_port,
        'protocol': event.protocol,
        'message': event.message,
        'review_status': review.status if review else EventReview.Status.NEW,
        'review_note': review.note if review else '',
        'reviewed_by': review.updated_by_id if review else None,
        'reviewed_at': dt(review.updated_at) if review else None,
    }


@require_GET
def event_list(request):
    denied = auth_error(request)
    if denied: return denied

    try:
        limit = min(max(int(request.GET.get('limit', '30')), 1), 100)
        offset = max(int(request.GET.get('offset', '0')), 0)
        if offset > 1000000: raise ValueError()
    except ValueError:
        return JsonResponse({'detail': 'limit 또는 offset 값이 올바르지 않습니다.'}, status=400)

    records = SocEvent.objects.using('soc_logs').all()
    for field in ['severity', 'log_type', 'source_vm']:
        if request.GET.get(field):
            records = records.filter(**{field: request.GET[field][:80]})
    q = request.GET.get('q', '').strip()[:100]
    if q:
        records = records.filter(Q(message__icontains=q) | Q(src_ip__icontains=q) | Q(dst_ip__icontains=q) | Q(event_type__icontains=q))
    total = records.count()
    page = list(records.order_by('-event_time', '-normalized_at')[offset:offset + limit])
    review_map = EventReview.objects.filter(event_id__in=[e.event_id for e in page]).in_bulk(field_name='event_id')
    return JsonResponse({'total': total, 'limit': limit, 'offset': offset, 'results': [event_item(e, review_map) for e in page]})


@require_GET
def event_stats(request):
    denied = auth_error(request)
    if denied: return denied
    base = SocEvent.objects.using('soc_logs')
    return JsonResponse({
        'total_events': base.count(),
        'by_log_type': {r['log_type']: r['n'] for r in base.values('log_type').annotate(n=Count('event_id'))},
        'by_severity': {r['severity']: r['n'] for r in base.values('severity').annotate(n=Count('event_id'))},
        'by_source_vm': {r['source_vm']: r['n'] for r in base.values('source_vm').annotate(n=Count('event_id'))},
        'review_records': EventReview.objects.count(),  # stored in separate Django DB
    })


@require_GET
def event_detail(request, event_id):
    denied = auth_error(request)
    if denied: return denied
    if not check_event_id(event_id):
        return JsonResponse({'detail': '잘못된 이벤트 ID입니다.'}, status=400)
    event = SocEvent.objects.using('soc_logs').filter(event_id=event_id).first()
    if not event:
        return JsonResponse({'detail': '이벤트를 찾을 수 없습니다.'}, status=404)
    review = EventReview.objects.filter(event_id=event_id).first()
    result = event_item(event, {event_id: review} if review else {})
    try:
        details = json.loads(event.details)
    except (TypeError, ValueError):
        details = event.details
    result.update({'details': details, 'raw_log': event.raw_log, 'severity_reason': event.severity_reason})
    return JsonResponse(result)


@csrf_protect
@require_http_methods(['POST'])
def review_event(request, event_id):
    denied = auth_error(request)
    if denied: return denied
    if not check_event_id(event_id):
        return JsonResponse({'detail': '잘못된 이벤트 ID입니다.'}, status=400)
    if not event_exists(event_id):
        return JsonResponse({'detail': '이벤트를 찾을 수 없습니다.'}, status=404)
    body = parse_body(request)
    if body is None or body.get('status') not in EventReview.Status.values:
        return JsonResponse({'detail': '올바른 status 값이 필요합니다.'}, status=400)
    note = body.get('note', '')
    if not isinstance(note, str) or len(note) > 2000:
        return JsonResponse({'detail': 'note는 최대 2000자입니다.'}, status=400)
    review, _ = EventReview.objects.update_or_create(
        event_id=event_id,
        defaults={'status': body['status'], 'note': note, 'updated_by': request.user},
    )
    return JsonResponse({'ok': True, 'event_id': event_id, 'status': review.status, 'updated_at': dt(review.updated_at)})


def response_item(record):
    receipt = getattr(record, 'firewall_receipt', None)
    return {
        'id': record.pk,
        'event_id': record.event_id,
        'target_ip': record.target_ip,
        'action': record.action,
        'reason': record.reason,
        'status': record.status,
        'created_by': record.created_by.username,
        'created_at': dt(record.created_at),
        'decided_by': record.decided_by.username if record.decided_by else None,
        'decided_at': dt(record.decided_at),
        'executed': receipt is not None,
        'execution_result': receipt.result if receipt else None,
    }


@csrf_protect
@require_http_methods(['GET', 'POST'])
def response_list_create(request):
    denied = auth_error(request)
    if denied: return denied
    if request.method == 'GET':
        items = ResponseRequest.objects.select_related('created_by', 'decided_by')[:100]
        return JsonResponse({'results': [response_item(r) for r in items]})
    body = parse_body(request)
    if body is None or body.get('action') not in ResponseRequest.Action.values:
        return JsonResponse({'detail': 'action은 block 또는 unblock이어야 합니다.'}, status=400)
    event_id = body.get('event_id', '')
    if not isinstance(event_id, str) or not check_event_id(event_id) or not event_exists(event_id):
        return JsonResponse({'detail': '유효한 이벤트 ID가 필요합니다.'}, status=400)
    try:
        target_ip = str(ipaddress.ip_address(body.get('target_ip', '')))
    except ValueError:
        return JsonResponse({'detail': '올바른 IPv4/IPv6 주소를 입력하세요.'}, status=400)
    reason = body.get('reason', '')
    if not isinstance(reason, str) or len(reason) > 2000:
        return JsonResponse({'detail': 'reason은 최대 2000자입니다.'}, status=400)
    record = ResponseRequest.objects.create(event_id=event_id, target_ip=target_ip, action=body['action'], reason=reason, created_by=request.user)
    return JsonResponse(response_item(record), status=201)


@csrf_protect
@require_http_methods(['POST'])
def decide_response(request, response_id):
    denied = auth_error(request)
    if denied: return denied
    if not request.user.is_superuser:
        return JsonResponse({'detail': '관리자만 승인·반려할 수 있습니다.'}, status=403)
    body = parse_body(request)
    if body is None or body.get('decision') not in ['approved', 'rejected']:
        return JsonResponse({'detail': 'decision은 approved 또는 rejected여야 합니다.'}, status=400)
    from django.db import transaction
    with transaction.atomic():
        record = ResponseRequest.objects.select_for_update().select_related('created_by', 'decided_by').filter(pk=response_id).first()
        if record is None:
            return JsonResponse({'detail': '대응 요청을 찾을 수 없습니다.'}, status=404)
        if record.status != ResponseRequest.Status.PENDING:
            return JsonResponse({'detail': '이미 승인 또는 반려된 요청입니다.'}, status=409)
        record.status = body['decision']
        record.decided_by = request.user
        record.decided_at = timezone.now()
        record.save(update_fields=['status', 'decided_by', 'decided_at'])
    if record.status == ResponseRequest.Status.APPROVED:
        from operations.remote_firewall import execute_firewall_response
        import logging

        try:
            execute_firewall_response(record.pk)
        except Exception:
            logging.getLogger(__name__).exception(
                "Firewall execution not confirmed: response_id=%s",
                record.pk,
            )
            record.refresh_from_db()
            data = response_item(record)
            data['execution_error'] = '방화벽 적용 결과를 확인하지 못했습니다.'
            return JsonResponse(data)

        record.refresh_from_db()

    return JsonResponse(response_item(record))

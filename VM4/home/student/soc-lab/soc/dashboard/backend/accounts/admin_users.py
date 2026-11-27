"""Admin-only SOC user management endpoints.

Uses Django's built-in User table: no additional database tables/migrations.
Only active Django superusers may access these endpoints.
"""
import json

from django.contrib.auth import get_user_model
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from django.db import IntegrityError, transaction
from django.http import JsonResponse
from django.views.decorators.csrf import csrf_protect
from django.views.decorators.http import require_GET, require_http_methods, require_POST


def _error(message, status=400):
    return JsonResponse({'detail': message}, status=status)


def _admin_error(request):
    if not request.user.is_authenticated:
        return _error('로그인이 필요합니다.', 401)
    if not request.user.is_active or not request.user.is_superuser:
        return _error('관리자 권한이 필요합니다.', 403)
    return None


def _parse_body(request):
    try:
        result = json.loads(request.body.decode('utf-8'))
        return result if isinstance(result, dict) else None
    except (UnicodeDecodeError, ValueError):
        return None


def _valid_str(value, max_length):
    return isinstance(value, str) and len(value) <= max_length


def _serialize(user):
    return {
        'id': user.pk,
        'username': user.get_username(),
        'email': user.email,
        'first_name': user.first_name,
        'role': 'admin' if user.is_superuser else 'analyst',
        'is_active': user.is_active,
        'is_self': False,  # filled below where requester is known
        'last_login': user.last_login.isoformat() if user.last_login else None,
    }


def _serialize_for(user, requester):
    value = _serialize(user)
    value['is_self'] = user.pk == requester.pk
    return value


@require_http_methods(['GET', 'POST'])
@csrf_protect
def users_view(request):
    denied = _admin_error(request)
    if denied is not None:
        return denied
    User = get_user_model()

    if request.method == 'GET':
        users = User.objects.order_by('id')[:500]
        return JsonResponse({'users': [_serialize_for(u, request.user) for u in users]})

    data = _parse_body(request)
    if data is None:
        return _error('요청 데이터는 JSON 객체여야 합니다.')

    username = data.get('username', '')
    password = data.get('password', '')
    email = data.get('email', '')
    first_name = data.get('first_name', '')
    role = data.get('role', 'analyst')
    if not _valid_str(username, 150) or not username.strip():
        return _error('아이디를 확인해 주세요.')
    if not _valid_str(password, 128) or not password:
        return _error('비밀번호를 확인해 주세요.')
    if not _valid_str(email, 254) or not _valid_str(first_name, 150):
        return _error('입력한 이름이나 이메일이 너무 깁니다.')
    if role not in ('admin', 'analyst'):
        return _error('알 수 없는 권한입니다.')

    username = username.strip()
    if User.objects.filter(username__iexact=username).exists():
        return _error('이미 사용 중인 아이디입니다.', 409)

    proposed = User(username=username, email=email.strip(), first_name=first_name.strip())
    try:
        proposed.full_clean(exclude=['password'], validate_unique=False)
        validate_password(password, user=proposed)
    except ValidationError as exc:
        return _error(' '.join(exc.messages))

    try:
        with transaction.atomic():
            user = User.objects.create_user(
                username=username, password=password,
                email=email.strip(), first_name=first_name.strip(),
            )
            user.is_staff = role == 'admin'
            user.is_superuser = role == 'admin'
            user.save(update_fields=['is_staff', 'is_superuser'])
    except IntegrityError:
        return _error('이미 사용 중인 아이디입니다.', 409)
    return JsonResponse({'user': _serialize_for(user, request.user)}, status=201)


@require_http_methods(['PATCH'])
@csrf_protect
def user_detail_view(request, user_id):
    denied = _admin_error(request)
    if denied is not None:
        return denied
    data = _parse_body(request)
    if data is None:
        return _error('요청 데이터는 JSON 객체여야 합니다.')
    allowed = {'role', 'is_active', 'email', 'first_name'}
    if not data or set(data) - allowed:
        return _error('수정할 수 없는 필드가 포함되어 있습니다.')

    if 'role' in data and data['role'] not in ('admin', 'analyst'):
        return _error('권한은 admin 또는 analyst만 가능합니다.')
    if 'is_active' in data and not isinstance(data['is_active'], bool):
        return _error('계정 활성화 값이 올바르지 않습니다.')
    if 'email' in data and not _valid_str(data['email'], 254):
        return _error('이메일이 너무 깁니다.')
    if 'first_name' in data and not _valid_str(data['first_name'], 150):
        return _error('이름이 너무 깁니다.')

    User = get_user_model()
    try:
        with transaction.atomic():
            target = User.objects.select_for_update().get(pk=user_id)
            if target.pk == request.user.pk:
                if (data.get('is_active') is False or data.get('role') == 'analyst'):
                    return _error('자신의 관리자 권한을 해제하거나 계정을 비활성화할 수 없습니다.', 403)

            if target.is_superuser and (
                data.get('role') == 'analyst' or data.get('is_active') is False
            ):
                n_admins = User.objects.filter(is_active=True, is_superuser=True).count()
                if n_admins <= 1:
                    return _error('마지막 관리자는 비활성화하거나 권한을 해제할 수 없습니다.', 403)

            if 'role' in data:
                is_admin = data['role'] == 'admin'
                target.is_superuser = is_admin
                target.is_staff = is_admin
            if 'is_active' in data:
                target.is_active = data['is_active']
            if 'email' in data:
                target.email = data['email'].strip()
            if 'first_name' in data:
                target.first_name = data['first_name'].strip()
            try:
                target.full_clean(exclude=['password'])
            except ValidationError as exc:
                return _error(' '.join(exc.messages))
            target.save()
            payload = _serialize_for(target, request.user)
    except User.DoesNotExist:
        return _error('해당 사용자가 없습니다.', 404)
    return JsonResponse({'user': payload})


@require_POST
@csrf_protect
def reset_password_view(request, user_id):
    denied = _admin_error(request)
    if denied is not None:
        return denied
    data = _parse_body(request)
    if data is None or not isinstance(data.get('password'), str):
        return _error('새 비밀번호를 입력해 주세요.')
    password = data['password']
    if len(password) > 128:
        return _error('비밀번호가 너무 깁니다.')
    User = get_user_model()
    try:
        target = User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return _error('해당 사용자가 없습니다.', 404)
    if target.pk == request.user.pk:
        return _error('본인 비밀번호 변경은 Django 관리자 페이지에서 진행해 주세요.', 403)
    try:
        validate_password(password, user=target)
    except ValidationError as exc:
        return _error(' '.join(exc.messages))
    target.set_password(password)
    target.save(update_fields=['password'])
    return JsonResponse({'ok': True})

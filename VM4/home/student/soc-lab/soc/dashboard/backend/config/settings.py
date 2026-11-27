import os
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
SECRET_KEY = os.environ['DJANGO_SECRET_KEY']
DEBUG = os.getenv('DJANGO_DEBUG', 'false').lower() == 'true'
ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    'api',
    '192.168.56.140'
]
# 개발 중 Vite의 프록시를 통해 요청하므로 브라우저 Origin은 5173 포트가 됩니다.
CSRF_TRUSTED_ORIGINS = [
    'http://localhost:5173',
    'http://127.0.0.1:5173',
    'http://192.168.56.140:5173'
]

INSTALLED_APPS = [
    'django.contrib.admin',
    'django.contrib.auth',
    'django.contrib.contenttypes',
    'django.contrib.sessions',
    'django.contrib.messages',
    'django.contrib.staticfiles',
    'rest_framework',
    'accounts',
    'monitoring',
]
MIDDLEWARE = [
    'django.middleware.security.SecurityMiddleware',
    'django.contrib.sessions.middleware.SessionMiddleware',
    'django.middleware.common.CommonMiddleware',
    'django.middleware.csrf.CsrfViewMiddleware',
    'django.contrib.auth.middleware.AuthenticationMiddleware',
    'django.contrib.messages.middleware.MessageMiddleware',
    'django.middleware.clickjacking.XFrameOptionsMiddleware',
]
ROOT_URLCONF = 'config.urls'
TEMPLATES = [{
    'BACKEND': 'django.template.backends.django.DjangoTemplates',
    'DIRS': [],
    'APP_DIRS': True,
    'OPTIONS': {'context_processors': [
        'django.template.context_processors.debug',
        'django.template.context_processors.request',
        'django.contrib.auth.context_processors.auth',
        'django.contrib.messages.context_processors.messages',
    ]},
}]
WSGI_APPLICATION = 'config.wsgi.application'

DATABASES = {
    'default': {
        'ENGINE': 'django.db.backends.mysql',
        'NAME': os.environ['DB_NAME'],
        'USER': os.environ['DB_USER'],
        'PASSWORD': os.environ['DB_PASSWORD'],
        'HOST': os.environ.get('DB_HOST', 'db'),
        'PORT': os.environ.get('DB_PORT', '3306'),
        'OPTIONS': {'charset': 'utf8mb4'},
    }
}

REST_FRAMEWORK = {
    'DEFAULT_AUTHENTICATION_CLASSES': [
        'rest_framework.authentication.SessionAuthentication',
    ],
    'DEFAULT_PERMISSION_CLASSES': [
        'rest_framework.permissions.IsAuthenticated',
    ],
}

# 로컬 개발 환경 설정. 실제 VM4/HTTPS 배포 시 변경하세요.
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = 'Lax'
SESSION_COOKIE_SECURE = not DEBUG
CSRF_COOKIE_HTTPONLY = True
CSRF_COOKIE_SAMESITE = 'Lax'
CSRF_COOKIE_SECURE = not DEBUG

AUTH_PASSWORD_VALIDATORS = [
    {'NAME': 'django.contrib.auth.password_validation.UserAttributeSimilarityValidator'},
    {'NAME': 'django.contrib.auth.password_validation.MinimumLengthValidator'},
    {'NAME': 'django.contrib.auth.password_validation.CommonPasswordValidator'},
    {'NAME': 'django.contrib.auth.password_validation.NumericPasswordValidator'},
]
LANGUAGE_CODE = 'ko-kr'
TIME_ZONE = 'Asia/Seoul'
USE_I18N = True
USE_TZ = True
STATIC_URL = 'static/'
DEFAULT_AUTO_FIELD = 'django.db.models.BigAutoField'

# Read-only source database imported from the team's socdb_dump.sql.
# No migrations are run on this alias. Access via .using('soc_logs').
DATABASES['soc_logs'] = {
    'ENGINE': 'django.db.backends.mysql',
    'NAME': os.environ.get('SOC_LOGS_DB', 'socdb'),
    'USER': os.environ['DB_USER'],
    'PASSWORD': os.environ['DB_PASSWORD'],
    'HOST': os.environ.get('DB_HOST', 'db'),
    'PORT': os.environ.get('DB_PORT', '3306'),
    'OPTIONS': {'charset': 'utf8mb4'},
}

# VIOLET SOC OPERATIONS CONFIG -- added by install-operations.ps1
INSTALLED_APPS.append('operations')

EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = os.getenv('SOC_SMTP_HOST', '')
EMAIL_PORT = int(os.getenv('SOC_SMTP_PORT', '587'))
EMAIL_HOST_USER = os.getenv('SOC_SMTP_USER', '')
EMAIL_HOST_PASSWORD = os.getenv('SOC_SMTP_PASSWORD', '')
EMAIL_USE_TLS = os.getenv('SOC_SMTP_STARTTLS', 'true').lower() == 'true'
EMAIL_USE_SSL = os.getenv('SOC_SMTP_SSL', 'false').lower() == 'true'
EMAIL_TIMEOUT = 10
DEFAULT_FROM_EMAIL = os.getenv('SOC_SMTP_FROM', '')
if EMAIL_USE_TLS and EMAIL_USE_SSL:
    raise ValueError('SOC_SMTP_STARTTLS and SOC_SMTP_SSL cannot both be true')

# Optional VM4 read-only MariaDB link. Leave all SOC_LOGS_* variables unset for local snapshot.
# Do not replace the Django account database: only 'soc_logs' points to the team events database.
if 'soc_logs' in DATABASES:
    for key, env_name in (
        ('HOST', 'SOC_LOGS_HOST'), ('PORT', 'SOC_LOGS_PORT'),
        ('NAME', 'SOC_LOGS_DB'), ('USER', 'SOC_LOGS_USER'),
        ('PASSWORD', 'SOC_LOGS_PASSWORD'),
    ):
        if os.getenv(env_name):
            DATABASES['soc_logs'][key] = os.environ[env_name]

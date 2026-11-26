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

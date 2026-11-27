from django.conf import settings
from django.db import models


class SocConfiguration(models.Model):
    """Single admin-managed policy row in soc_dashboard (not the team events DB)."""
    mail_enabled = models.BooleanField(default=False)
    recipients = models.TextField(blank=True, default='')  # comma separated, server validated
    min_severity = models.PositiveSmallIntegerField(default=2)
    protected_networks = models.TextField(
        default='127.0.0.0/8\n::1/128\n169.254.0.0/16\nfe80::/10\n192.168.56.140/32'
    )
    updated_at = models.DateTimeField(auto_now=True)


class NotificationCursor(models.Model):
    """Persisted high-water mark; enabling alerts starts AFTER existing DB rows."""
    last_inserted_at = models.DateTimeField(null=True, blank=True)
    last_event_id = models.CharField(max_length=36, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)


class NotificationDelivery(models.Model):
    event_id = models.CharField(max_length=36, unique=True)
    sent_to = models.TextField()
    sent_at = models.DateTimeField(auto_now_add=True)


class SettingsAudit(models.Model):
    changed_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, on_delete=models.SET_NULL)
    description = models.TextField()
    changed_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-changed_at']


class FirewallExecutionReceipt(models.Model):
    """Verified record of a manually executed VM2 command in the Django DB."""
    response = models.OneToOneField('monitoring.ResponseRequest', on_delete=models.PROTECT, related_name='firewall_receipt')
    action = models.CharField(max_length=10)
    target_ip = models.GenericIPAddressField(protocol='IPv4')
    result = models.CharField(max_length=32)
    executed_at = models.DateTimeField()
    received_at = models.DateTimeField(auto_now_add=True)

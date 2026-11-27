from django.conf import settings
from django.db import models


class SocEvent(models.Model):
    """Team-supplied socdb.events. Read-only: owned by the ingestion pipeline."""
    event_id = models.CharField(max_length=36, primary_key=True)
    schema_version = models.CharField(max_length=20)
    event_time = models.DateTimeField(null=True)
    normalized_at = models.DateTimeField()
    source_vm = models.CharField(max_length=20)
    source_tag = models.CharField(max_length=100, null=True)
    log_type = models.CharField(max_length=30)
    event_category = models.CharField(max_length=100)
    event_type = models.CharField(max_length=100)
    severity = models.CharField(max_length=20)
    severity_level = models.PositiveSmallIntegerField()
    severity_reason = models.TextField(null=True)
    src_ip = models.CharField(max_length=45, null=True)
    src_port = models.PositiveSmallIntegerField(null=True)
    dst_ip = models.CharField(max_length=45, null=True)
    dst_port = models.PositiveSmallIntegerField(null=True)
    protocol = models.CharField(max_length=30, null=True)
    message = models.TextField(null=True)
    details = models.TextField()
    raw_log = models.TextField()
    inserted_at = models.DateTimeField()

    class Meta:
        managed = False  # NEVER alter team-managed events table through Django migrations
        db_table = 'events'
        ordering = ['-event_time']


class EventReview(models.Model):
    class Status(models.TextChoices):
        NEW = 'new', 'New'
        INVESTIGATING = 'investigating', 'Investigating'
        RESOLVED = 'resolved', 'Resolved'
        FALSE_POSITIVE = 'false_positive', 'False positive'

    event_id = models.CharField(max_length=36, primary_key=True)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.NEW)
    note = models.TextField(blank=True, default='')
    updated_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = 'soc_event_reviews'


class ResponseRequest(models.Model):
    class Action(models.TextChoices):
        BLOCK = 'block', 'Request block'
        UNBLOCK = 'unblock', 'Request unblock'

    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        APPROVED = 'approved', 'Approved (NOT executed)'
        REJECTED = 'rejected', 'Rejected'

    event_id = models.CharField(max_length=36)
    target_ip = models.GenericIPAddressField(protocol='both')
    action = models.CharField(max_length=10, choices=Action.choices)
    reason = models.TextField(blank=True, default='')
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    created_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.PROTECT, related_name='response_requests')
    created_at = models.DateTimeField(auto_now_add=True)
    decided_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, related_name='response_decisions', null=True, blank=True)
    decided_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        db_table = 'soc_response_requests'
        ordering = ['-created_at']

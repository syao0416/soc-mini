from django.contrib import admin
from .models import EventReview, ResponseRequest


@admin.register(EventReview)
class EventReviewAdmin(admin.ModelAdmin):
    list_display = ('event_id', 'status', 'updated_by', 'updated_at')
    list_filter = ('status',)
    search_fields = ('event_id',)


@admin.register(ResponseRequest)
class ResponseRequestAdmin(admin.ModelAdmin):
    list_display = ('id', 'event_id', 'target_ip', 'action', 'status', 'created_by', 'created_at')
    list_filter = ('status', 'action')
    search_fields = ('target_ip', 'event_id')

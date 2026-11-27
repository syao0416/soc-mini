from django.urls import path
from . import views

urlpatterns = [
    path('events/', views.event_list, name='soc-event-list'),
    path('events/stats/', views.event_stats, name='soc-event-stats'),
    path('events/<str:event_id>/', views.event_detail, name='soc-event-detail'),
    path('events/<str:event_id>/review/', views.review_event, name='soc-event-review'),
    path('responses/', views.response_list_create, name='soc-response-list'),
    path('responses/<int:response_id>/decision/', views.decide_response, name='soc-response-decision'),
]

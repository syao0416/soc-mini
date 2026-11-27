from django.urls import path
from . import views

urlpatterns = [
    path('settings/', views.configuration, name='operations-settings'),
    path('test-email/', views.smtp_test, name='operations-test-email'),
    path('block-preview/', views.preview_block, name='operations-block-preview'),
]

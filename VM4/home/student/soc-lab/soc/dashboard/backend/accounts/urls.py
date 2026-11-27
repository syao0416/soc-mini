from django.urls import path
from . import views
from . import admin_users

urlpatterns = [
    path('csrf/', views.csrf_view, name='auth-csrf'),
    path('login/', views.login_view, name='auth-login'),
    path('me/', views.me_view, name='auth-me'),
    path('logout/', views.logout_view, name='auth-logout'),
    path('users/', admin_users.users_view, name='auth-users'),
    path('users/<int:user_id>/', admin_users.user_detail_view, name='auth-user-detail'),
    path('users/<int:user_id>/reset-password/', admin_users.reset_password_view, name='auth-user-reset'),
]
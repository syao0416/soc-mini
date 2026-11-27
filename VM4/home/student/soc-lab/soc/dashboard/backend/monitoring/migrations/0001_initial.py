from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    initial = True
    dependencies = [migrations.swappable_dependency(settings.AUTH_USER_MODEL)]

    operations = [
        migrations.CreateModel(
            name='SocEvent',
            fields=[
                ('event_id', models.CharField(max_length=36, primary_key=True, serialize=False)),
                ('schema_version', models.CharField(max_length=20)),
                ('event_time', models.DateTimeField(null=True)),
                ('normalized_at', models.DateTimeField()),
                ('source_vm', models.CharField(max_length=20)),
                ('source_tag', models.CharField(max_length=100, null=True)),
                ('log_type', models.CharField(max_length=30)),
                ('event_category', models.CharField(max_length=100)),
                ('event_type', models.CharField(max_length=100)),
                ('severity', models.CharField(max_length=20)),
                ('severity_level', models.PositiveSmallIntegerField()),
                ('severity_reason', models.TextField(null=True)),
                ('src_ip', models.CharField(max_length=45, null=True)),
                ('src_port', models.PositiveSmallIntegerField(null=True)),
                ('dst_ip', models.CharField(max_length=45, null=True)),
                ('dst_port', models.PositiveSmallIntegerField(null=True)),
                ('protocol', models.CharField(max_length=30, null=True)),
                ('message', models.TextField(null=True)),
                ('details', models.TextField()),
                ('raw_log', models.TextField()),
                ('inserted_at', models.DateTimeField()),
            ],
            options={'db_table': 'events', 'managed': False, 'ordering': ['-event_time']},
        ),
        migrations.CreateModel(
            name='EventReview',
            fields=[
                ('event_id', models.CharField(max_length=36, primary_key=True, serialize=False)),
                ('status', models.CharField(choices=[('new', 'New'), ('investigating', 'Investigating'), ('resolved', 'Resolved'), ('false_positive', 'False positive')], default='new', max_length=20)),
                ('note', models.TextField(blank=True, default='')),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('updated_by', models.ForeignKey(null=True, on_delete=django.db.models.deletion.SET_NULL, to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'soc_event_reviews'},
        ),
        migrations.CreateModel(
            name='ResponseRequest',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('event_id', models.CharField(max_length=36)),
                ('target_ip', models.GenericIPAddressField()),
                ('action', models.CharField(choices=[('block', 'Request block'), ('unblock', 'Request unblock')], max_length=10)),
                ('reason', models.TextField(blank=True, default='')),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('approved', 'Approved (NOT executed)'), ('rejected', 'Rejected')], default='pending', max_length=10)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('decided_at', models.DateTimeField(blank=True, null=True)),
                ('created_by', models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name='response_requests', to=settings.AUTH_USER_MODEL)),
                ('decided_by', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='response_decisions', to=settings.AUTH_USER_MODEL)),
            ],
            options={'db_table': 'soc_response_requests', 'ordering': ['-created_at']},
        ),
    ]

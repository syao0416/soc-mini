from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):
    dependencies = [('operations', '0001_initial'), ('monitoring', '0001_initial')]

    operations = [
        migrations.CreateModel(
            name='FirewallExecutionReceipt',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('action', models.CharField(max_length=10)),
                ('target_ip', models.GenericIPAddressField(protocol='IPv4')),
                ('result', models.CharField(max_length=32)),
                ('executed_at', models.DateTimeField()),
                ('received_at', models.DateTimeField(auto_now_add=True)),
                ('response', models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name='firewall_receipt', to='monitoring.responserequest')),
            ],
        ),
    ]

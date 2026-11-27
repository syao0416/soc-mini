import io
import json
import subprocess
import tempfile
from pathlib import Path

from django.core.management import call_command


def execute_firewall_response(response_id):
    with tempfile.TemporaryDirectory(prefix='soc-firewall-') as directory:
        approval = Path(directory) / 'approval.json'
        receipt = Path(directory) / 'receipt.json'

        call_command(
            'export_vm2_approval',
            request_id=response_id,
            output=str(approval),
            stdout=io.StringIO(),
        )

        result = subprocess.run(
            [
                '/usr/bin/ssh',
                '-T',
                '-i', '/run/soc-agent/id_ed25519',
                '-o', 'UserKnownHostsFile=/run/soc-agent/known_hosts',
                '-o', 'StrictHostKeyChecking=yes',
                '-o', 'IdentitiesOnly=yes',
                '-o', 'BatchMode=yes',
                '-o', 'ConnectTimeout=5',
                'soc-agent@192.168.56.120',
            ],
            input=approval.read_bytes(),
            capture_output=True,
            timeout=20,
            check=True,
        )

        envelope = json.loads(result.stdout)

        if envelope['payload']['request_id'] != response_id:
            raise ValueError('Receipt request ID mismatch')

        receipt.write_bytes(result.stdout)

        call_command(
            'import_vm2_receipt',
            file=str(receipt),
            stdout=io.StringIO(),
        )

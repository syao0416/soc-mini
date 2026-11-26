#!/usr/bin/env python3
"""Opt-in, human-operated VM2 FORWARD-chain block executor (IPv4 only).

No network service or daemon. Requires signed, unexpired Django superuser approval.
Dry-run by default. Actual mutation requires root + --apply --confirm APPLY.
"""
import argparse
import fcntl
import hashlib
import hmac
import ipaddress
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time

CHAIN = 'VIOLET_SOC'
SCHEMA = 'violet-soc-vm2-v1'
BASE_PROTECTED = ['127.0.0.0/8', '0.0.0.0/32', '169.254.0.0/16', '224.0.0.0/4', '192.168.56.140/32']


def canonical_bytes(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':')).encode('utf-8')


def verify_request(envelope, key, now=None):
    if not isinstance(envelope, dict) or set(envelope) != {'payload', 'signature'}:
        raise ValueError('Invalid envelope shape')
    payload, signature = envelope['payload'], envelope['signature']
    if not isinstance(payload, dict) or not isinstance(signature, str):
        raise ValueError('Invalid approval format')
    required = {'schema', 'request_id', 'action', 'target_ip', 'approved_by', 'decided_at', 'issued_at', 'expires_at'}
    if set(payload) != required or payload['schema'] != SCHEMA:
        raise ValueError('Unsupported signed request schema')
    if type(payload['request_id']) is not int or payload['request_id'] < 1:
        raise ValueError('Invalid request ID')
    if payload['action'] not in ('block', 'unblock'):
        raise ValueError('Invalid requested action')
    if not isinstance(payload['approved_by'], str) or not payload['approved_by'] or not isinstance(payload['decided_at'], str):
        raise ValueError('Missing approval details')
    if type(payload['issued_at']) is not int or type(payload['expires_at']) is not int:
        raise ValueError('Invalid validity time')
    now = int(time.time() if now is None else now)
    if payload['issued_at'] > now + 30 or payload['expires_at'] <= now or payload['expires_at'] - payload['issued_at'] > 600:
        raise ValueError('Expired, future, or overlong approval')
    if len(key.encode('utf-8')) < 32:
        raise ValueError('Weak or missing signing key')
    expected = hmac.new(key.encode('utf-8'), canonical_bytes(payload), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(signature, expected):
        raise ValueError('Invalid approval signature')
    try:
        ip = ipaddress.IPv4Address(payload['target_ip'])
    except ipaddress.AddressValueError:
        raise ValueError('Only a valid IPv4 address may be used') from None
    if str(ip) != payload['target_ip']:
        raise ValueError('Non-canonical target IP')
    return payload, ip


def host_ipv4_addresses():
    """Protect VM2's own local interface IPs. If discovery fails, refuse block execution."""
    raw = subprocess.run(['ip', '-j', '-4', 'addr', 'show'], capture_output=True, text=True, check=True)
    values = []
    for interface in json.loads(raw.stdout):
        for info in interface.get('addr_info', []):
            if info.get('family') == 'inet' and info.get('local'):
                values.append(ipaddress.IPv4Network(info['local'] + '/32'))
    if not values:
        raise ValueError('Could not discover VM2 interface IPs')
    return values


def protected(ip, extra):
    networks = [ipaddress.IPv4Network(x) for x in BASE_PROTECTED] + host_ipv4_addresses()
    for field in (os.getenv('SSH_CLIENT', ''), os.getenv('SSH_CONNECTION', '')):
        tokens = field.split()
        if tokens:
            try:
                networks.append(ipaddress.IPv4Network(str(ipaddress.IPv4Address(tokens[0])) + '/32'))
            except ipaddress.AddressValueError:
                pass
    for cidr in extra:
        networks.append(ipaddress.IPv4Network(cidr, strict=False))
    return any(ip in net for net in networks)


def run_iptables(*args, check=True):
    return subprocess.run(['iptables', '-w', *args], check=check, capture_output=True, text=True)


def rule_exists(chain, cidr):
    code = run_iptables('-C', chain, '-s', cidr, '-j', 'DROP', check=False).returncode
    return code == 0


def apply_action(payload, ip):
    action, cidr = payload['action'], f'{ip}/32'
    # A dedicated chain avoids removing arbitrary rules maintained by team members.
    chk = run_iptables('-L', CHAIN, '-n', check=False)
    if chk.returncode != 0:
        run_iptables('-N', CHAIN)
    branch = run_iptables('-C', 'FORWARD', '-j', CHAIN, check=False)
    if branch.returncode != 0:
        run_iptables('-I', 'FORWARD', '1', '-j', CHAIN)
    exists = rule_exists(CHAIN, cidr)
    if action == 'block':
        if exists:
            return 'already_blocked'
        run_iptables('-A', CHAIN, '-s', cidr, '-j', 'DROP')
        return 'blocked'
    if not exists:
        return 'already_unblocked'
    run_iptables('-D', CHAIN, '-s', cidr, '-j', 'DROP')
    return 'unblocked'


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--file', required=True, help='Approved request JSON copied securely to VM2')
    parser.add_argument('--secret-file', default='/etc/violet-soc/vm2_signing_key', help='VM2 root-owned signing secret file')
    parser.add_argument('--protect', action='append', default=[], help='Extra protected CIDR; repeat as needed')
    parser.add_argument('--journal', default='/var/lib/violet-soc/applied.jsonl')
    parser.add_argument('--apply', action='store_true', help='Actually change firewall (dry-run otherwise)')
    parser.add_argument('--receipt', help='Write signed execution receipt JSON to this new path (required with --apply)')
    parser.add_argument('--confirm', default='', help='Must equal APPLY to allow mutation')
    args = parser.parse_args()
    try:
        key = Path(args.secret_file).read_text(encoding='utf-8').strip()
        envelope = json.loads(Path(args.file).read_text(encoding='utf-8'))
        payload, target = verify_request(envelope, key)
        if payload['action'] == 'block' and protected(target, args.protect):
            raise ValueError('Refusing to block a protected or local VM2 management address')
        print(json.dumps({'verified': True, 'id': payload['request_id'], 'action': payload['action'],
                          'target': str(target), 'mode': 'apply' if args.apply else 'dry-run'}, ensure_ascii=False))
        if not args.apply:
            print('DRY-RUN: VM2 방화벽을 변경하지 않았습니다. 실제 적용은 명시적인 --apply --confirm APPLY가 필요합니다.')
            return 0
        if not args.receipt:
            raise ValueError('Specify --receipt for signed execution audit output')
        if args.confirm != 'APPLY' or os.geteuid() != 0:
            raise ValueError('Firewall mutation requires root and --apply --confirm APPLY')
        if not shutil.which('iptables'):
            raise ValueError('iptables command not installed on VM2')
        os.umask(0o077)
        journal = Path(args.journal)
        journal.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
        # Exclusive lock to keep idempotence across concurrent manual executions.
        with open(str(journal) + '.lock', 'a', encoding='utf-8') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            already = set()
            if journal.exists():
                for line in journal.read_text(encoding='utf-8').splitlines():
                    try:
                        row = json.loads(line)
                        already.add((row['request_id'], row['action']))
                    except (ValueError, KeyError):
                        raise ValueError('Audit journal corruption; refusing to apply') from None
            token = (payload['request_id'], payload['action'])
            if token in already:
                print('이미 처리한 승인 요청입니다. 방화벽을 다시 변경하지 않았습니다.')
                return 0
            result = apply_action(payload, target)
            receipt_data = {'schema': 'violet-soc-vm2-receipt-v1', 'request_id': payload['request_id'], 'action': payload['action'], 'target_ip': str(target), 'result': result, 'timestamp': int(time.time())}
            receipt_signature = hmac.new(key.encode('utf-8'), canonical_bytes(receipt_data), hashlib.sha256).hexdigest()
            with Path(args.receipt).open('x', encoding='utf-8') as receipt_file:
                json.dump({'payload': receipt_data, 'signature': receipt_signature}, receipt_file, ensure_ascii=False, indent=2)
                receipt_file.write('\n')
            os.chmod(args.receipt, 0o600)
            with journal.open('a', encoding='utf-8') as out:
                out.write(json.dumps({'request_id': token[0], 'action': token[1], 'target': str(target),
                                      'result': result, 'timestamp': int(time.time())}, sort_keys=True) + '\n')
                out.flush()
                os.fsync(out.fileno())
            print(f'VM2 적용 결과: {result}. 확인: sudo iptables -S {CHAIN}')
            print('서명된 실행 결과 파일: ' + args.receipt)
            return 0
    except (ValueError, OSError, json.JSONDecodeError, subprocess.CalledProcessError) as exc:
        print(f'ERROR: {exc}', file=sys.stderr)
        return 1


if __name__ == '__main__':
    sys.exit(main())

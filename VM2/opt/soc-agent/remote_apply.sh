#!/bin/bash
set -euo pipefail
umask 077

WORKDIR=$(mktemp -d /tmp/soc-agent.XXXXXXXX)
trap 'rm -rf "$WORKDIR"' EXIT

head -c 65537 > "$WORKDIR/request.json"

if [ "$(wc -c < "$WORKDIR/request.json")" -gt 65536 ]; then
    exit 1
fi

/usr/bin/python3 /opt/soc-agent/vm2_agent.py \
    --file "$WORKDIR/request.json" \
    --secret-file /etc/violet-soc/vm2_signing_key \
    --protect 192.168.56.1/32 \
    --protect 192.168.56.130/32 \
    --apply \
    --confirm APPLY \
    --receipt "$WORKDIR/receipt.json" >&2

cat "$WORKDIR/receipt.json"

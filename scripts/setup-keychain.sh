#!/bin/bash
# Celesのログイン情報を macOS Keychain に登録する（.env に平文で置かないため）。
set -euo pipefail
SERVICE="celes-order-pdf"

for k in CELES_USER CELES_PASS; do
  printf "%s: " "$k"
  read -rs value
  echo
  [ -z "$value" ] && { echo "  skip"; continue; }
  security add-generic-password -U -s "$SERVICE" -a "$k" -w "$value"
  echo "  登録しました"
done

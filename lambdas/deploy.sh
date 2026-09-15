#!/usr/bin/env bash
# Deploy the Lambda stack. Always use this instead of a bare `sam deploy`.
#
# Why: samconfig.toml is committed, so the Google service-account key can't
# be saved there — but the template's GoogleServiceAccountJson parameter
# defaults to '' and any deploy that doesn't pass it would silently wipe the
# credentials from every Lambda (breaking Sheets + Calendar sync). This
# script reads the key from the git-ignored service-account.json next to it
# and merges it with the non-secret overrides saved in samconfig.toml.
#
# The two auth secrets (SupabaseServiceRoleKey, QrCheckinJwtSecret) aren't
# passed at all — SAM sends UsePreviousValue for them, so they're kept.
set -euo pipefail
cd "$(dirname "$0")"

KEY_FILE="${SERVICE_ACCOUNT_JSON_PATH:-service-account.json}"
if [[ ! -f "$KEY_FILE" ]]; then
  echo "Missing $KEY_FILE — download the service account key from Google Cloud" >&2
  echo "(IAM & Admin → Service Accounts → akpsi-portal-backend → Keys) and save it there." >&2
  exit 1
fi

TMP="$(mktemp)"
trap 'rm -f "$TMP"' EXIT
python3 - "$KEY_FILE" "$TMP" <<'PY'
import json, re, sys
toml = open("samconfig.toml").read()
saved = re.search(r'parameter_overrides = "(.*)"', toml).group(1)
# Saved as Key=\"value\" pairs inside a TOML basic string.
params = dict(re.findall(r'(\w+)=\\"([^\\]*)\\"', saved))
params["GoogleServiceAccountJson"] = json.dumps(json.load(open(sys.argv[1])), separators=(",", ":"))
# SAM's shorthand parser: double-quote each value, escape only inner quotes.
with open(sys.argv[2], "w") as f:
    f.write(" ".join(f'{k}="{v.replace(chr(34), chr(92) + chr(34))}"' for k, v in params.items()))
PY
OVERRIDES="$(cat "$TMP")"

sam build
# Redact the key from SAM's "parameter overrides" echo so it never hits a log.
sam deploy --no-confirm-changeset --no-fail-on-empty-changeset \
  --parameter-overrides "$OVERRIDES" "$@" \
  2>&1 | sed -E 's/"private_key":"[^"]*"/"private_key":"<redacted>"/g'

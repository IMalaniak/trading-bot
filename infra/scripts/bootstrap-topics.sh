#!/usr/bin/env bash
set -euo pipefail

brokers="${REDPANDA_BROKERS:-redpanda:9092}"
topic_file="${REDPANDA_TOPIC_FILE:-/etc/redpanda/topics.txt}"
partitions="${REDPANDA_TOPIC_PARTITIONS:-3}"
replicas="${REDPANDA_TOPIC_REPLICAS:-1}"
topic_config="${REDPANDA_TOPIC_CONFIG:-cleanup.policy=delete}"

if [[ ! -f "${topic_file}" ]]; then
  echo "Topic file not found: ${topic_file}" >&2
  exit 1
fi

while IFS= read -r raw_topic; do
  topic="$(printf '%s' "${raw_topic}" | xargs)"
  if [[ -z "${topic}" || "${topic}" == \#* ]]; then
    continue
  fi

  if rpk -X brokers="${brokers}" topic describe "${topic}" >/dev/null 2>&1; then
    echo "Topic already exists: ${topic}"
    continue
  fi

  echo "Creating topic: ${topic}"
  rpk -X brokers="${brokers}" topic create "${topic}" \
    --partitions "${partitions}" \
    --replicas "${replicas}" \
    -c "${topic_config}"
done < "${topic_file}"

echo
echo "Provisioned topics:"
rpk -X brokers="${brokers}" topic list

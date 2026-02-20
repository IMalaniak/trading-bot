#!/usr/bin/env bash
# This script starts Structurizr Lite: https://structurizr.com/help/lite/getting-started

SCRIPT_DIR=$( cd -- "$( dirname -- "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )

docker run -it --rm -p 8080:8080 -v ${SCRIPT_DIR}/../docs/architecture/c4:/usr/local/structurizr structurizr/lite

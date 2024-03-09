#!/bin/bash

tmp() {
  local file="browser-tab-grouper.zip"

  if [[ -f "./${file}" ]]; then
    \rm -i "./${file}"
    if [[ -f "./${file}" ]]; then
      echo >&2 "./${file}"
      exit 1
    fi
  fi

  echo "Zipping..."
  zip -r -q "./${file}" res/ src/ manifest.json
}

tmp
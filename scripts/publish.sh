#!/bin/bash
npm run build && cd lib && jq 'del(.scripts,.private)' package.json > package.tmp && mv package.tmp package.json && npm publish

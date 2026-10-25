#!/bin/sh
# 發布前執行：重新產生 seed.json，並更新 index.html 的 ?v= 與 sw.js 的 VERSION，讓已安裝的手機抓到新版。
set -e
cd "$(dirname "$0")/.."
V=$(date +%Y%m%d%H%M)
node tools/export_seed.js
sed -i.bak -E "s/\?v=[0-9a-z]+/?v=$V/g" index.html && rm index.html.bak
sed -i.bak -E "s/^const VERSION = '[^']+';/const VERSION = 'v$V';/" sw.js && rm sw.js.bak
echo "version $V"

from pathlib import Path

path = Path('src/server.js')
source = path.read_text()
needle = 'import express from "express";\n'
insert = 'import "./intelligence/liveServerTelemetryPreloadV1.js";\nimport express from "express";\n'
if insert not in source:
    if needle not in source:
        raise SystemExit('server express import anchor missing')
    source = source.replace(needle, insert, 1)
path.write_text(source)
print('wired live publication preload directly into src/server.js')

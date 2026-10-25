#!/usr/bin/env python3
"""把 index.html + styles.css + data.js + app.js 合併成單一 HTML。

用法：
  python3 tools/build_single.py            # 產生 dist/北越十日-單檔版.html（完整文件，可直接用瀏覽器開啟）
  python3 tools/build_single.py --artifact <輸出路徑>   # 產生不含 <html>/<head> 外殼的版本（供 Claude Artifact 發布）
"""
import pathlib, re, sys

ROOT = pathlib.Path(__file__).resolve().parent.parent
html = (ROOT / 'index.html').read_text(encoding='utf-8')
css = (ROOT / 'styles.css').read_text(encoding='utf-8')
data = (ROOT / 'data.js').read_text(encoding='utf-8')
app = (ROOT / 'app.js').read_text(encoding='utf-8')

def guard(js):
    # 避免內嵌時出現 </script> 提早結束
    return js.replace('</script', '<\\/script')

html = html.replace('<link rel="stylesheet" href="styles.css">', '<style>\n' + css + '\n</style>')
html = html.replace('<script src="data.js"></script>', '<script>\n' + guard(data) + '\n</script>')
html = html.replace('<script src="app.js"></script>', '<script>\n' + guard(app) + '\n</script>')
# 單檔版不需要 PWA 檔案連結
html = re.sub(r'\s*<link rel="manifest"[^>]*>', '', html)
html = re.sub(r'\s*<link rel="(icon|apple-touch-icon)"[^>]*>', '', html)

if len(sys.argv) >= 3 and sys.argv[1] == '--artifact':
    head = re.search(r'<head>(.*?)</head>', html, re.S).group(1)
    body = re.search(r'<body>(.*?)</body>', html, re.S).group(1)
    keep = []
    for line in head.splitlines():
        t = line.strip()
        if t.startswith('<meta charset') or t.startswith('<meta name="viewport"') or 'apple-' in t or 'mobile-web-app' in t or 'format-detection' in t or 'theme-color' in t or 'color-scheme' in t:
            continue
        keep.append(line)
    out = '\n'.join(keep).strip() + '\n' + body.strip() + '\n'
    pathlib.Path(sys.argv[2]).write_text(out, encoding='utf-8')
    print('artifact ->', sys.argv[2], len(out), 'bytes')
else:
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    out = dist / '北越十日-單檔版.html'
    out.write_text(html, encoding='utf-8')
    print('single ->', out, len(html), 'bytes')

# -*- coding: utf-8 -*-
"""회차 JSON을 구글시트 백엔드에 올린다.

    python data/push_round.py round-final-03.json 7452

시험지 내용은 공개 저장소에 올리지 않고 이 경로로만 서버에 넣는다.
"""
import json, sys, re, os, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))


def script_url():
    src = open(os.path.join(HERE, '..', 'js', 'config.js'), encoding='utf-8').read()
    m = re.search(r"SCRIPT_URL:\s*'([^']*)'", src)
    if not m or not m.group(1):
        sys.exit('js/config.js 의 SCRIPT_URL 이 비어 있습니다.')
    return m.group(1)


def push(path, pin):
    round_ = json.load(open(path, encoding='utf-8'))
    body = json.dumps({'pin': pin, 'action': 'saveRound', 'round': round_}, ensure_ascii=False)
    req = urllib.request.Request(
        script_url(), data=body.encode('utf-8'),
        headers={'Content-Type': 'text/plain;charset=utf-8'})
    with urllib.request.urlopen(req, timeout=120) as r:
        res = r.read().decode('utf-8')
    print(res)


if __name__ == '__main__':
    if len(sys.argv) < 3:
        sys.exit('사용법: python data/push_round.py <회차.json> <PIN>')
    p = sys.argv[1]
    if not os.path.isabs(p):
        p = os.path.join(HERE, p) if os.path.exists(os.path.join(HERE, p)) else p
    push(p, sys.argv[2])

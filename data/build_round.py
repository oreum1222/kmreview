# -*- coding: utf-8 -*-
"""HWPX 시험지 -> 검수 시스템 회차 JSON"""
import zipfile, re, json, sys, os

def hwpx_paras(path):
    z = zipfile.ZipFile(path)
    names = sorted(n for n in z.namelist() if re.match(r'Contents/section\d+\.xml$', n))
    out = []
    for n in names:
        x = z.read(n).decode('utf-8')
        for para in re.findall(r'<hp:p\b.*?</hp:p>|<hp:p\b[^>]*/>', x, re.S):
            ts = re.findall(r'<hp:t>(.*?)</hp:t>', para, re.S)
            s = ''.join(ts)
            s = (s.replace('&lt;', '<').replace('&gt;', '>').replace('&amp;', '&')
                   .replace('&quot;', '"').replace('&apos;', "'"))
            out.append(s.strip())
    return out

SUB = re.compile(r'^\((\d)\)\s*(.+)$')
SCORE = re.compile(r'\(([\d.]+)\s*점\)\s*$')

def kind_of(balmun):
    if re.search(r'찾아\s*(?:\S+\s*)?쓰', balmun):
        return '찾기'
    if re.search(r'고르고|밝히고|해당하는지', balmun):
        return '판별'
    if re.search(r'<보기>|〈보기〉|ⓐ|ⓑ', balmun):
        return '보기적용'
    return '서술'

def jogeon_of(balmun):
    j = []
    for pat in [r'\d+\s*음절', r'\d+\s*어절', r'\d+\s*자\s*(?:내외|이내|이하)', r'한\s*문장', r'한\s*단어']:
        m = re.search(pat, balmun)
        if m:
            j.append(m.group(0))
    return ', '.join(j)

def parse_questions(L, start, end, gyeyeol):
    """문제 블록들을 뽑는다."""
    heads = [i for i in range(start, end) if re.fullmatch(r'문제\s*\d+', L[i].strip())]
    qs = []
    for k, h in enumerate(heads):
        stop = heads[k + 1] if k + 1 < len(heads) else end
        no = int(re.search(r'\d+', L[h]).group())
        body = list(range(h + 1, stop))
        subidx = [i for i in body if SUB.match(L[i].strip())]
        pstart = h + 1
        pend = subidx[0] if subidx else stop
        passage = '\n'.join(x for x in (L[i].strip() for i in range(pstart, pend))
                            if x and x != '다음 글을 읽고 물음에 답하시오.')
        subs = []
        for j, si in enumerate(subidx):
            raw = L[si].strip()
            m = SUB.match(raw)
            n, txt = m.group(1), m.group(2).strip()
            sm = SCORE.search(txt)
            score = float(sm.group(1)) if sm else None
            balmun = SCORE.sub('', txt).strip()
            nxt = subidx[j + 1] if j + 1 < len(subidx) else stop
            lines = [x for x in (L[i].strip() for i in range(si + 1, nxt)) if x]
            # 문제지에는 소문항마다 '선행학습보고서 ... 변형' 다음 줄에 답이 적혀 있다
            cut = next((k for k, x in enumerate(lines)
                        if x.startswith('선행학습보고서') or x.startswith('출제 근거')), None)
            if cut is None:
                bogi, note, paper = '\n'.join(lines), '', ''
            else:
                bogi = '\n'.join(lines[:cut])
                note = lines[cut]
                paper = '\n'.join(lines[cut + 1:]).strip()
            subs.append({
                'no': '(%s)' % n, 'balmun': balmun, 'score': score,
                'kind': kind_of(balmun), 'jogeon': jogeon_of(balmun),
                'bogi': bogi, 'sourceNote': note, 'paperAnswer': paper,
            })
        qs.append({'no': no, 'gyeyeol': gyeyeol,
                   'passages': [{'label': '', 'text': passage}], 'subs': subs})
    return qs

def parse_haeseol(L, start, end):
    """정답 및 채점 기준 블록 -> [{'(1)': {...}}, ...] (등장 순서)"""
    heads = [i for i in range(start, end) if L[i].strip() == '정답 및 채점 기준']
    blocks = []
    for k, h in enumerate(heads):
        stop = heads[k + 1] if k + 1 < len(heads) else end
        seg = [L[i].strip() for i in range(h, stop)]
        res, mode = {}, None
        i = 0
        while i < len(seg):
            s = seg[i]
            if s == '정답':
                mode = 'answer'
            elif s == '해설':
                mode = 'haeseol'
            elif s in ('채점 기준', '채점기준'):
                mode = 'rubric'
            elif mode and re.fullmatch(r'\(\d\)', s):
                key = s
                if mode == 'haeseol':
                    i += 1
                    continue
                val = ''
                j = i + 1
                while j < len(seg) and not seg[j]:
                    j += 1
                if j < len(seg) and not re.fullmatch(r'\(\d\)', seg[j]) and seg[j] not in ('해설', '채점 기준', '채점기준'):
                    val = seg[j]
                    i = j
                res.setdefault(key, {})[mode] = val
            elif mode == 'haeseol':
                m = re.match(r'^\((\d)\)\s*(.+)$', s)
                if m:
                    res.setdefault('(%s)' % m.group(1), {})['haeseol'] = m.group(2).strip()
            i += 1
        blocks.append(res)
    return blocks

def build(path, rid, title, date):
    L = hwpx_paras(path)
    # 구간 경계
    def find(pred, frm=0):
        for i in range(frm, len(L)):
            if pred(L[i].strip()):
                return i
        return len(L)

    inmun_q = find(lambda s: s == '인문계열')
    jayeon_q = find(lambda s: s == '자연계열', inmun_q + 1)
    hae_in = find(lambda s: s == '논술고사해설지', jayeon_q + 1)
    hae_ja = find(lambda s: s == '논술고사해설지', hae_in + 1)

    qs = parse_questions(L, inmun_q, jayeon_q, '인문')
    qs += parse_questions(L, jayeon_q, hae_in, '자연')

    hb = parse_haeseol(L, hae_in, hae_ja) + parse_haeseol(L, hae_ja, len(L))
    for q, blk in zip(qs, hb):
        for s in q['subs']:
            d = blk.get(s['no'], {})
            s['haeseolAnswer'] = d.get('answer', '')
            s['haeseol'] = d.get('haeseol', '')
            s['rubricText'] = d.get('rubric', '')
            # 채점 기준은 문제지에 적힌 답이 우선이다. 해설지가 아직 안 고쳐진 회차가 있다.
            s['answer'] = s.get('paperAnswer') or s['haeseolAnswer']
    return {'id': rid, 'title': title, 'date': date, 'items': qs}

if __name__ == '__main__':
    src = r'C:\Users\김가경\OneDrive\바탕 화면\문서\카카오톡 받은 파일\2027_CSM_국민대_파이널_3회_0908 가경T 수정완.hwpx'
    r = build(src, 'final-03', '국민대 파이널 3회 (인문 8문항, 자연 2문항)', '2026-09-08')
    print('문항', len(r['items']))
    for q in r['items']:
        tot = sum(s['score'] or 0 for s in q['subs'])
        print('문제%2d %s 소문항%d 합%.1f  정답채움%d/%d' % (
            q['no'], q['gyeyeol'], len(q['subs']), tot,
            sum(1 for s in q['subs'] if s['answer']), len(q['subs'])))
    out = os.path.join(os.path.dirname(__file__), 'round-final-03.json')
    open(out, 'w', encoding='utf-8').write(json.dumps(r, ensure_ascii=False, indent=1))
    print('->', out)

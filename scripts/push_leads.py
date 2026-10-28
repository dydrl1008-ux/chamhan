# -*- coding: utf-8 -*-
"""
rank-ykad(네이버쇼핑랭크 폴더) → 워크허브 콜 리스트 푸시
  · rankings.db : 키워드별 순위 스냅샷 → 「1페이지(≤40위)에 있다가 밀린 몰」 = 하락 리드
  · contacts    : 몰별 전화 (010 만, 차단·거절 제외)
  · ads.db      : 광고주 목록 → 광고 집행 중 표시 (점수 +30)
워크허브에서 같은 몰은 하나로 합쳐지고(전화 > 몰명), 점수 = 광고 +30 · 하락 +25 · 전화 +10 → 매일 아침 직원에게 배분

사용:  python push_leads.py                → 하락 리드 전송
       python push_leads.py --days 7      → 7일 전과 비교 (기본 1일 = 어제 대비)
       python push_leads.py --no-gone     → 200위 밖으로 사라진 건 제외 (노출 중 하락만)
       python push_leads.py --dry         → 보내지 않고 목록만 출력
       python push_leads.py --all-ads     → 하락 여부 상관없이 전화 있는 광고주 전부 (처음 한 번 채울 때)
환경변수: WORKHUB_CRON_SECRET (Vercel CRON_SECRET), WORKHUB_URL (기본 https://chamhan.vercel.app)
.env 에 WORKHUB_CRON_SECRET=... 넣어도 읽음
"""
import json, os, re, sqlite3, sys, urllib.request
from collections import defaultdict

HERE = os.path.dirname(os.path.abspath(__file__))
RANK_DB = os.path.join(HERE, 'rankings.db'); ADS_DB = os.path.join(HERE, 'ads.db')
PAGE1 = 40          # 1페이지 = 40위 안
MIN_DROP = 10       # 이만큼 이상 밀렸을 때 (미노출은 무조건)
GONE_RANK = 200     # 스냅샷에 없으면 미노출 → 200위로 기록
MIN_ROWS = 40       # 스냅샷에 이만큼은 있어야 '제대로 수집된 것'으로 봄 (적으면 비교 안 함)
MAX_AGE = 30        # 마지막 완료 스냅샷이 이 일수보다 오래된 키워드는 건너뜀 (수집은 순차라 당일 완료 안 돼도 됨)
LIMIT = 5000        # 한 번에 보낼 최대 건수
FRESH_DAYS = 3      # 최신 스냅샷이 이보다 오래된 키워드는 제외 (수집 중단)
MIN_ROWS = 40       # 최신 스냅샷 행 수가 이보다 적으면 수집 실패로 보고 제외
MAX_GONE_RATIO = 0.5  # 1페이지 몰 중 절반 넘게 사라졌으면 수집 이상으로 보고 제외

def env(k, d=''):
    v = os.environ.get(k)
    if v: return v
    p = os.path.join(HERE, '.env')
    if os.path.exists(p):
        for line in open(p, encoding='utf-8', errors='ignore'):
            if line.strip().startswith(k + '='): return line.split('=', 1)[1].strip().strip('"\'')
    return d

def store_base(url):
    """상품 URL → 스토어 주소. 네이버쇼핑 결과의 'smartstore.naver.com/main/…' 은 스토어명이 아니라서 제외 → 그땐 빈값(전화번호로 중복 판정)"""
    m = re.match(r'^(https?://(?:m\.)?(?:smartstore|brand)\.naver\.com/([^/?#]+))', url or '')
    if not m or m.group(2).lower() in ('main', 'inflow', 'products'): return ''
    return m.group(1)

def phone_ok(p):
    d = re.sub(r'\D', '', p or '')
    return d if d.startswith('010') and len(d) == 11 else ''

def load_contacts(conn):
    blocked = {re.sub(r'\D', '', r[0] or '') for r in conn.execute('select phone from blocked_phones')}
    out = {}
    for name, phone, status in conn.execute('select mall_name, coalesce(phone, ftc_phone), call_status from contacts'):
        d = phone_ok(phone)
        if not d or d in blocked: continue
        if (status or '') in ('rejected', '거절', 'blocked'): continue
        out[name] = d
    return out

def load_ad_malls():
    if not os.path.exists(ADS_DB): return set(), {}
    c = sqlite3.connect(f'file:{ADS_DB}?mode=ro', uri=True, timeout=30)
    names = set(); phones = {}
    for key, name, phone in c.execute('select a.ad_key, a.name, c.phone from ads a left join contacts c on c.ad_key = a.ad_key'):
        if name: names.add(name.strip())
        d = phone_ok(phone)
        if name and d: phones[name.strip()] = d
    return names, phones

def best_rank_by_mall(conn, snapshot_id):
    """스냅샷 안에서 몰별 최고 순위 (rank, url, 상품명, product_id) + 상품ID→순위 맵 + 스냅샷 최대 순위"""
    out = {}; by_pid = {}; max_rank = 0
    for rank, mall, url, pname, pid in conn.execute('select rank, mall_name, url, product_name, product_id from rankings where snapshot_id = ? order by rank', (snapshot_id,)):
        max_rank = max(max_rank, rank or 0)
        if pid and pid not in by_pid: by_pid[pid] = rank
        if not mall: continue
        if mall not in out: out[mall] = (rank, url or '', pname or '', pid or '')
    return out, by_pid, max_rank

def drop_leads(days, diag=False):
    import datetime as dt
    print('rankings.db 여는 중…', flush=True)
    conn = sqlite3.connect(f'file:{RANK_DB}?mode=ro', uri=True, timeout=30)   # 읽기 전용 (serve.py 와 안 부딪힘)
    contacts = load_contacts(conn); ad_names, ad_phones = load_ad_malls(); print(f'연락처 {len(contacts)} · 광고주 {len(ad_names)}', flush=True)
    today = dt.date.today().isoformat(); rows = {}; stat = dict(kw=0, stale=0, thin=0, used=0, gone_total=0, no_phone=0)
    allsnaps = defaultdict(list)
    for sid, kw, slot, d in conn.execute('select id, keyword, slot, date from snapshots'):
        allsnaps[kw].append((sid, d, 1 if slot == 'PM' else 0))
    kws = sorted(allsnaps); print(f'키워드 {len(kws)}개 비교 중… (전체 집계 없이 스냅샷별로만 조회)', flush=True)
    def rows_of(sid):   # 스냅샷 한 개 크기 (snapshot_id 로만 조회 → 전체 스캔 안 함)
        return conn.execute('select count(*) from rankings where snapshot_id = ?', (sid,)).fetchone()[0]
    def pick(cands, cond):   # 조건 맞는 스냅샷 중 제대로 수집된(≥MIN_ROWS) 첫 번째. 최대 6개만 확인
        tried = 0
        for sid, d, _ in cands:
            if not cond(d): continue
            tried += 1
            if tried > 6: return None
            n = rows_of(sid)
            if n >= MIN_ROWS: return (sid, d, n)
        return None
    for i, kw in enumerate(kws, 1):
        if i % 50 == 0: print(f'  {i}/{len(kws)}', flush=True)
        stat['kw'] += 1
        cands = sorted(allsnaps[kw], key=lambda x: (x[1], x[2]), reverse=True)
        if not cands or cands[0][1] < _shift(today, -MAX_AGE): stat['stale'] += 1; continue   # 30일 넘게 안 돈 키워드
        cur = pick(cands, lambda d: True)
        if cur is None: stat['thin'] += 1; continue
        cur_id, cur_date, cur_n = cur
        old = pick(cands, lambda d: d <= _shift(cur_date, -days))
        if old is None: stat['thin'] += 1; continue
        stat['used'] += 1
        now, now_pid, max_now = best_rank_by_mall(conn, cur_id); before, _, _ = best_rank_by_mall(conn, old[0])
        if max_now < 100: continue                                   # 최신 스냅샷이 100위도 안 담겼으면 '사라짐' 판정 못 믿음 → 건너뜀
        for mall, (prank, purl, pname, ppid) in before.items():
            if prank > PAGE1: continue
            if ppid and ppid in now_pid: nrank = now_pid[ppid]        # 같은 상품이 있으면 그 순위 (몰명 바뀌어도 OK)
            elif mall in now: nrank = now[mall][0]                   # 상품은 바뀌었지만 같은 몰이 있으면 그 몰 최고 순위
            else: nrank = max_now + 1; stat['gone_total'] += 1       # 스냅샷 범위(보통 200위) 밖
            if nrank > PAGE1 * 5 and nrank != max_now + 1: pass
            gone = nrank == max_now + 1
            if not gone and nrank - prank < MIN_DROP: continue
            phone = contacts.get(mall) or ad_phones.get(mall) or ''
            if not phone: stat['no_phone'] += 1; continue
            r = rows.get(phone)
            if r is None or (nrank - prank) > (r['rank_now'] - r['rank_prev']):
                rows[phone] = dict(store_name=mall, store_url=store_base(purl), product_url=(purl or '').split('?')[0][:500], keyword=kw, phone=phone, ad_running=mall in ad_names,
                                   rank_now=nrank, rank_prev=prank, category=pname[:40] if pname else '', _cov=max_now, _at=cur_date)
    if diag:
        print(f"키워드 {stat['kw']} · 비교 사용 {stat['used']} · 최신 스냅샷 {MAX_AGE}일 넘어 제외 {stat['stale']} · 스냅샷 부족 {stat['thin']} · 사라진 몰 {stat['gone_total']} · 전화 없어 제외 {stat['no_phone']}")
        # 최근 스냅샷 상태 한눈에
        for sid, kw, d in conn.execute('select id, keyword, date from snapshots order by date desc, id desc limit 8'):
            print(f'  최근 스냅샷: {kw[:16]:16} {d}  {rows_of(sid)}행')
    out = list(rows.values())
    for r in out: r.pop('_cov', None)
    return out   # _at = 그 키워드 수집 완료일 (정렬용, 전송 전 제거)

def all_ad_leads():
    conn = sqlite3.connect(RANK_DB); contacts = load_contacts(conn); ad_names, ad_phones = load_ad_malls()
    out = {}
    for name in ad_names:
        phone = ad_phones.get(name) or contacts.get(name)
        if phone and phone not in out: out[phone] = dict(store_name=name, store_url='', keyword='', phone=phone, ad_running=True, rank_now=None, rank_prev=None, category='')
    return list(out.values())

def _shift(date, d):
    import datetime as dt
    return (dt.date.fromisoformat(date) + dt.timedelta(days=d)).isoformat()

def push(rows, source):
    url = env('WORKHUB_URL', 'https://chamhan.vercel.app'); secret = env('WORKHUB_CRON_SECRET')
    if not secret: raise SystemExit('WORKHUB_CRON_SECRET 없음 (.env 또는 환경변수)')
    tot = dict(added=0, updated=0, skipped=0)
    for i in range(0, len(rows), 500):
        body = json.dumps({'source': source, 'rows': rows[i:i + 500]}, ensure_ascii=False).encode('utf-8')
        req = urllib.request.Request(f'{url}/api/cron/leads-import', data=body, method='POST', headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {secret}'})
        with urllib.request.urlopen(req, timeout=90) as r: res = json.loads(r.read().decode('utf-8'))
        if not res.get('ok'): raise SystemExit('워크허브 오류: ' + str(res.get('msg')))
        for k in tot: tot[k] += int(res.get(k, 0))
    return tot

if __name__ == '__main__':
    args = sys.argv[1:]; days = int(args[args.index('--days') + 1]) if '--days' in args else 1
    if '--all-ads' in args: rows, src = all_ad_leads(), 'rank-ykad 광고주 전체'
    else: rows, src = drop_leads(days, diag=True), 'rank-ykad 1페이지 하락 (' + ('어제' if days == 1 else f'{days}일 전') + ' 대비)'
    if '--no-gone' in args: rows = [r for r in rows if r['rank_now'] < 200]
    # 정렬: 최근 수집된 키워드 → 아직 노출 중인 하락(확실) → 사라진 것(리워드 종료 추정) → 광고 → 하락폭
    rows.sort(key=lambda r: (r.get('_at', ''), r['rank_now'] < 200, r['ad_running'], (r['rank_now'] or 0) - (r['rank_prev'] or 0)), reverse=True)
    limit = int(args[args.index('--limit') + 1]) if '--limit' in args else LIMIT
    if len(rows) > limit: print(f'{len(rows)}건 중 상위 {limit}건만 (광고 집행 → 하락폭 순, --limit 로 조정)'); rows = rows[:limit]
    print(f'{src}: {len(rows)}건')
    for r in rows[:30]: print(f"  {r.get('_at', '')[5:]:5} {r['store_name'][:20]:20} {r['keyword'][:14]:14} {r['rank_prev']}→{r['rank_now']}{'  [광고]' if r['ad_running'] else ''}  {r['phone'][:3]}-****-{r['phone'][-4:]}")
    if len(rows) > 30: print(f'  … 외 {len(rows) - 30}건')
    if '--dry' in args or not rows: sys.exit(0)
    for r in rows: r.pop('_at', None)
    print('전송:', push(rows, src))

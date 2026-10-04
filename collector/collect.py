"""낚시광 데이터 수집기
매일 공공데이터포털 API 4종을 받아 data/ 폴더에 JSON으로 저장한다.
  - 국립해양조사원 조석예보(고, 저조)     → data/tide.json   (예보지점 166곳 × 15일, 음력 날짜 포함. 오전 실행 때만 받음)
  - 국립해양조사원 조위관측소 최신 관측   → data/obs.json    (관측소 55곳: 수온·바람·기온·기압·조위)
  - 기상청 단기예보                     → data/wx.json     (항·포구·갯바위가 있는 5 km 격자: 풍향·풍속·파고)
  - 실행 기록                           → data/meta.json
인증키는 환경변수 DATA_GO_KR_KEY (공공데이터포털 일반 인증키, Decoding)에서 읽는다. 코드나 저장소에 키를 적지 않는다.
한 원천이 통째로 실패하면 그 파일은 덮어쓰지 않는다 (지난 자료 유지).
"""
import json, os, sys, time, datetime as dt
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
import requests

KEY = os.environ.get('DATA_GO_KR_KEY', '').strip()
ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'data'
PTS = json.loads((Path(__file__).parent / 'points.json').read_text(encoding='utf-8'))
KST = dt.timezone(dt.timedelta(hours=9))
NOW = dt.datetime.now(KST)
DAYS = int(os.environ.get('TIDE_DAYS', '15'))   # 사리~조금 한 주기(약 15일)가 있어야 물때 세기를 계산할 수 있다
LIMIT = int(os.environ.get('LIMIT', '0'))   # 시험용: 0이면 전체, 숫자면 원천마다 그 개수만
S = requests.Session()
S.headers['User-Agent'] = 'naksigwang-collector/1.0'
LOG = {'errors': []}


def get(url, params, tries=4):
    """JSON 응답의 body를 돌려준다. 실패하면 예외."""
    p = dict(params, serviceKey=KEY)
    last = None
    for k in range(tries):
        try:
            r = S.get(url, params=p, timeout=30)
            t = r.text.strip()
            if not t.startswith('{'):
                raise RuntimeError(f'HTTP {r.status_code}: {t[:160]}')
            j = r.json()
            if 'OpenAPI_ServiceResponse' in j:      # 인증·한도 오류는 이 모양으로 온다
                raise RuntimeError(json.dumps(j, ensure_ascii=False)[:200])
            res = j.get('response', j)
            h = res.get('header', {})
            if str(h.get('resultCode')) not in ('00', '0'):
                if str(h.get('resultCode')) == '03':    # NODATA
                    return {'items': {'item': []}, 'totalCount': 0}
                raise RuntimeError(f"{h.get('resultCode')} {h.get('resultMsg')}")
            return res.get('body', {})
        except Exception as e:
            last = e
            time.sleep(1.5 * (k + 1))
    raise last


def items(body):
    it = (body.get('items') or {})
    it = it.get('item', []) if isinstance(it, dict) else it
    return [it] if isinstance(it, dict) else (it or [])


def pmap(fn, xs, workers=6):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, xs))


def lim(xs):
    return xs[:LIMIT] if LIMIT else xs


# ── 1. 조석예보(고, 저조) ─────────────────────────────────
def tide():
    url = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService'
    dates = [(NOW + dt.timedelta(days=i)).strftime('%Y%m%d') for i in range(-1, DAYS)]   # 어제도 받아 오늘 새벽 조위 곡선을 이어 그림
    jobs = [(c, n, d) for c, n in lim(PTS['tide']) for d in dates]

    def one(job):
        c, n, d = job
        try:
            return job, items(get(url, {'obsCode': c, 'reqDate': d, 'type': 'json', 'numOfRows': 20}))
        except Exception as e:
            LOG['errors'].append(f'tide {c} {d}: {e}')
            return job, None
    out = {}
    for (c, n, d), rows in pmap(one, jobs, workers=8):
        if rows is None:
            continue
        o = out.setdefault(c, {'name': n, 'days': {}})
        for r in rows:
            o['lat'], o['lon'] = float(r['lat']), float(r['lot'])
            hh = r['predcDt'][11:16]
            # extrSe: 1 오전 고조, 2 오전 저조, 3 오후 고조, 4 오후 저조
            o['days'].setdefault(r['predcDt'][:10], []).append([hh, round(float(r['predcTdlvVl'])), 'H' if str(r['extrSe']) in ('1', '3') else 'L'])
    for o in out.values():
        for d, v in o['days'].items():
            o['days'][d] = sorted(set(map(tuple, v)))
    # 음력 날짜 (한국천문연구원 음양력 표 기반 korean_lunar_calendar)
    from korean_lunar_calendar import KoreanLunarCalendar
    cal, lunar = KoreanLunarCalendar(), {}
    for i in range(DAYS):
        x = NOW + dt.timedelta(days=i)
        cal.setSolarDate(x.year, x.month, x.day)
        lunar[x.strftime('%Y-%m-%d')] = [cal.lunarMonth, cal.lunarDay, int(cal.isIntercalation)]
    return {'from': NOW.strftime('%Y-%m-%d'), 'lunar': lunar, 'st': out}, len(jobs)


def tide_needed():
    """조석 예측은 하루 동안 바뀌지 않으므로 오전 실행이나, 파일이 없거나 오늘 것이 아닐 때만 받는다"""
    if os.environ.get('FORCE_TIDE') == '1' or NOW.hour < 12:
        return True
    try:
        return json.loads((OUT / 'tide.json').read_text(encoding='utf-8')).get('from') != NOW.strftime('%Y-%m-%d')
    except Exception:
        return True


# ── 2. 조위관측소 최신 관측 ───────────────────────────────
def obs():
    url = 'https://apis.data.go.kr/1192136/dtRecent/GetDTRecentApiService'
    F = {'wtem': 'sst', 'wndrct': 'wdir', 'wspd': 'wspd', 'maxMmntWspd': 'gust', 'artmp': 'air', 'atmpr': 'pres', 'bscTdlvHgt': 'tide', 'slntQty': 'sal', 'crdir': 'cdir', 'crsp': 'csp'}

    def one(cn):
        c, n = cn
        rows = []
        for d in (NOW, NOW - dt.timedelta(days=1)):     # 새벽에는 오늘 자료가 적어 어제도 본다
            try:
                rows += items(get(url, {'obsCode': c, 'reqDate': d.strftime('%Y%m%d'), 'min': 60, 'type': 'json', 'numOfRows': 300}))
            except Exception as e:
                LOG['errors'].append(f'obs {c} {d:%Y%m%d}: {e}')
            if rows:
                break
        if not rows:
            return c, None
        rows.sort(key=lambda r: r.get('obsrvnDt', ''))
        o = {'name': n, 'lat': float(rows[-1]['lat']), 'lon': float(rows[-1]['lot'])}
        for k, nk in F.items():                          # 항목마다 가장 최근의 값이 있는 시각
            for r in reversed(rows):
                v = r.get(k)
                if v not in (None, '', '-'):
                    try:
                        o[nk] = [float(v), r['obsrvnDt']]
                    except ValueError:
                        pass
                    break
        return c, o
    out = {c: o for c, o in pmap(one, lim(PTS['obs'])) if o}
    return out, len(lim(PTS['obs']))


# ── 3. 기상청 단기예보 (바다 격자: 풍향 VEC, 풍속 WSD, 파고 WAV) ─────
def base_time():
    """가장 최근에 나온 발표 (02·05·08·11·14·17·20·23시, 10분 뒤부터 제공)"""
    t = NOW - dt.timedelta(minutes=15)
    for h in (23, 20, 17, 14, 11, 8, 5, 2):
        if t.hour >= h:
            return t.strftime('%Y%m%d'), f'{h:02d}00'
    y = t - dt.timedelta(days=1)
    return y.strftime('%Y%m%d'), '2300'


def wx():
    url = 'https://apis.data.go.kr/1360000/VilageFcstInfoService_2.0/getVilageFcst'
    bd, bt = base_time()
    cells = lim(PTS['cells'])

    def one(cell):
        nx, ny = cell
        rows, page = [], 1
        try:
            while True:
                b = get(url, {'base_date': bd, 'base_time': bt, 'nx': nx, 'ny': ny, 'dataType': 'JSON', 'numOfRows': 1000, 'pageNo': page})
                rows += items(b)
                if page * 1000 >= int(b.get('totalCount') or 0):
                    break
                page += 1
        except Exception as e:
            LOG['errors'].append(f'wx {nx},{ny}: {e}')
            return cell, None
        o = {}
        for r in rows:
            c = r['category']
            if c not in ('VEC', 'WSD', 'WAV'):
                continue
            k = r['fcstDate'] + r['fcstTime'][:2]
            try:
                v = float(r['fcstValue'])
            except ValueError:
                v = None                                 # 연장 기간 풍속은 정성 코드라 숫자로 못 씀
            if v is not None and v <= -900:              # 결측 (-999 등)
                v = None
            o.setdefault(k, [None, None, None])[('VEC', 'WSD', 'WAV').index(c)] = v
        return cell, o
    out = {f'{nx},{ny}': o for (nx, ny), o in pmap(one, cells) if o}
    # 오늘 이미 지난 시각은 새 발표에 없으므로 이전 파일의 값을 남겨 둔다 (오늘 00시 이후만)
    try:
        prev = json.loads((OUT / 'wx.json').read_text(encoding='utf-8'))['cells']
        today = NOW.strftime('%Y%m%d') + '00'
        for k, o in out.items():
            for h, v in (prev.get(k) or {}).items():
                if h >= today and h not in o:
                    o[h] = v
            out[k] = dict(sorted(o.items()))
    except Exception:
        pass
    return {'base': bd + bt, 'cells': out}, len(cells)


def save(name, data, n_ok, n_all):
    if n_ok == 0:
        LOG['errors'].append(f'{name}: 받은 자료가 없어 이전 파일을 그대로 둠')
        return
    (OUT / name).write_text(json.dumps(data, ensure_ascii=False, separators=(',', ':')), encoding='utf-8')
    LOG[name] = {'ok': n_ok, 'requested': n_all}


def main():
    if not KEY:
        sys.exit('DATA_GO_KR_KEY 환경변수가 없습니다.')
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    if tide_needed():
        td, n = tide(); save('tide.json', td, len(td['st']), len(lim(PTS['tide'])))
    else:
        LOG['tide.json'] = 'skipped (오늘 자료 있음)'
    ob, n = obs(); save('obs.json', ob, len(ob), n)
    w, n = wx(); save('wx.json', w, len(w['cells']), n)
    LOG['generated'] = NOW.isoformat(timespec='minutes')
    LOG['seconds'] = round(time.time() - t0)
    LOG['error_count'] = len(LOG['errors'])
    LOG['errors'] = LOG['errors'][:50]
    (OUT / 'meta.json').write_text(json.dumps(LOG, ensure_ascii=False, indent=1), encoding='utf-8')
    print(json.dumps({k: v for k, v in LOG.items() if k != 'errors'}, ensure_ascii=False))
    for e in LOG['errors'][:10]:
        print('  !', e)
    if not any(k in LOG for k in ('tide.json', 'obs.json', 'wx.json')):
        sys.exit(1)


if __name__ == '__main__':
    main()

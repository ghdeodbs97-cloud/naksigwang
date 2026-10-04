"""낚시광 데이터 수집기
매일 공공데이터포털 API 4종을 받아 data/ 폴더에 JSON으로 저장한다.
  - 국립해양조사원 조석예보(고, 저조)     → data/tide.json   (예보지점 166곳 × 15일, 음력 날짜 포함. 오전 실행 때만 받음)
  - 국립해양조사원 조위관측소 최신 관측   → data/obs.json    (관측소 55곳: 수온·바람·기온·기압·조위)
  - 기상청 단기예보                     → data/wx.json     (항·포구·갯바위가 있는 5 km 격자: 풍향·풍속·파고)
  - 실행 기록                           → data/meta.json
인증키는 환경변수 DATA_GO_KR_KEY (공공데이터포털 일반 인증키, Decoding)에서 읽는다. 코드나 저장소에 키를 적지 않는다.
한 원천이 통째로 실패하면 그 파일은 덮어쓰지 않는다 (지난 자료 유지).
"""
import json, os, sys, time, tempfile, math, datetime as dt
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
LIMIT = int(os.environ.get('LIMIT', '0'))   # 시험용: 0이면 전체, 숫자면 원천마다 그 개수만 (LIMIT>0이면 운영 data 파일은 쓰지 않음)
MIN_FRESH_RATIO = float(os.environ.get('MIN_FRESH_RATIO', '0.90'))   # 이 비율 미만이면 새 파일을 공개하지 않음
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
            r.raise_for_status()
            t = r.text.strip()
            if not t.startswith('{'):
                raise RuntimeError(f'HTTP {r.status_code}')
            j = r.json()
            if 'OpenAPI_ServiceResponse' in j:      # 인증·한도 오류는 이 모양으로 온다
                raise RuntimeError('API 인증 또는 한도 오류')
            res = j.get('response', j)
            h = res.get('header', {})
            if str(h.get('resultCode')) not in ('00', '0'):
                if str(h.get('resultCode')) == '03':    # NODATA
                    return {'items': {'item': []}, 'totalCount': 0}
                raise RuntimeError('API 응답 오류')
            return res.get('body', {})
        except Exception as e:
            last = e
            time.sleep(1.5 * (k + 1))
    # requests 예외에는 인증키가 들어간 URL이 포함될 수 있어 원문을 기록하지 않는다.
    raise RuntimeError(type(last).__name__) from None


def items(body):
    it = (body.get('items') or {})
    it = it.get('item', []) if isinstance(it, dict) else it
    return [it] if isinstance(it, dict) else (it or [])


def pmap(fn, xs, workers=6):
    with ThreadPoolExecutor(workers) as ex:
        return list(ex.map(fn, xs))


def lim(xs):
    return xs[:LIMIT] if LIMIT else xs


def read_prev(name):
    """이전 정상 파일을 읽는다. 없거나 깨졌으면 None."""
    try:
        doc = json.loads((OUT / name).read_text(encoding='utf-8'))
        return doc if valid_doc(name, doc) else None
    except Exception:
        return None


def finite(v):
    return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)


def valid_doc(name, doc):
    """파일 존재 여부 대신 앱에서 사용할 수 있는 자료인지 검사한다."""
    if not isinstance(doc, dict) or not doc:
        return False
    if name == 'obs.json':
        return all(isinstance(o, dict) and finite(o.get('lat')) and finite(o.get('lon'))
                   and all(isinstance(v, list) and len(v) == 2 and finite(v[0]) and isinstance(v[1], str)
                           for k, v in o.items() if k not in ('name', 'lat', 'lon'))
                   for o in doc.values())
    if name == 'wx.json':
        cells = doc.get('cells')
        return isinstance(doc.get('base'), str) and isinstance(cells, dict) and bool(cells) and all(
            isinstance(o, dict) and bool(o) and all(isinstance(v, list) and len(v) == 3
            and all(x is None or finite(x) for x in v) for v in o.values()) for o in cells.values())
    if name == 'tide.json':
        lunar, stations = doc.get('lunar'), doc.get('st')
        return (isinstance(doc.get('from'), str) and isinstance(lunar, dict) and bool(lunar)
                and all(isinstance(v, list) and len(v) == 3 for v in lunar.values())
                and isinstance(stations, dict) and bool(stations) and all(
                    isinstance(o, dict) and finite(o.get('lat')) and finite(o.get('lon'))
                    and isinstance(o.get('days'), dict) and any(o['days'].get(d) for d in lunar)
                    and all(isinstance(events, list) and all(
                        isinstance(e, (list, tuple)) and len(e) == 3 and isinstance(e[0], str)
                        and finite(e[1]) and e[2] in ('H', 'L') for e in events)
                        for events in o['days'].values()) for o in stations.values()))
    return False


def write_json_atomic(path, data, *, pretty=False):
    """같은 폴더의 고유 임시 파일을 동기화한 뒤 원자적으로 교체한다."""
    tmp = None
    try:
        with tempfile.NamedTemporaryFile(mode='w', encoding='utf-8', dir=path.parent,
                                         prefix=path.name + '.', suffix='.tmp', delete=False) as f:
            tmp = Path(f.name)
            json.dump(data, f, ensure_ascii=False, allow_nan=False,
                      indent=1 if pretty else None, separators=None if pretty else (',', ':'))
            f.flush()
            os.fsync(f.fileno())
        os.replace(tmp, path)
    finally:
        if tmp is not None:
            tmp.unlink(missing_ok=True)


def stat(fresh, fallback, requested):
    return {'fresh': fresh, 'fallback': fallback, 'requested': requested}


# ── 1. 조석예보(고, 저조) ─────────────────────────────────
def tide():
    url = 'https://apis.data.go.kr/1192136/tideFcstHghLw/GetTideFcstHghLwApiService'
    dates = [(NOW + dt.timedelta(days=i)).strftime('%Y%m%d') for i in range(-1, DAYS)]   # 어제도 받아 오늘 새벽 조위 곡선을 이어 그림
    jobs = [(c, n, d) for c, n in lim(PTS['tide']) for d in dates]

    def one(job):
        c, n, d = job
        try:
            rows = items(get(url, {'obsCode': c, 'reqDate': d, 'type': 'json', 'numOfRows': 20}))
            if not rows:
                raise ValueError('빈 조석 응답')
            day = f'{d[:4]}-{d[4:6]}-{d[6:8]}'
            o = {'name': n, 'days': {day: []}}
            for r in rows:
                o['lat'], o['lon'] = float(r['lat']), float(r['lot'])
                when = dt.datetime.fromisoformat(r['predcDt'])
                if when.strftime('%Y-%m-%d') != day:
                    raise ValueError('요청 날짜와 다른 조석 응답')
                height = float(r['predcTdlvVl'])
                if not all(map(math.isfinite, (o['lat'], o['lon'], height))) or str(r['extrSe']) not in ('1', '2', '3', '4'):
                    raise ValueError('잘못된 조석 값')
                o['days'][day].append([when.strftime('%H:%M'), round(height), 'H' if str(r['extrSe']) in ('1', '3') else 'L'])
            return job, o
        except Exception as e:
            LOG['errors'].append(f'tide {c} {d}: {type(e).__name__}')
            return job, None

    out, failed = {}, []
    fresh = 0
    for (c, n, d), result in pmap(one, jobs, workers=8):
        if result is None:
            failed.append((c, n, d))
            continue
        fresh += 1
        o = out.setdefault(c, {'name': n, 'days': {}})
        o.update(lat=result['lat'], lon=result['lon'])
        o['days'].update(result['days'])
    for o in out.values():
        for d, v in o['days'].items():
            o['days'][d] = [list(e) for e in sorted(set(map(tuple, v)))]

    # 실패·빈 응답 지점의 요청 날짜만 이전 파일에서 복구한다.
    fallback = 0
    prev = read_prev('tide.json') or {}
    pst = prev.get('st') or {}
    for c, n, d in failed:
        old = pst.get(c)
        day = f'{d[:4]}-{d[4:6]}-{d[6:8]}'
        if not old or not (old.get('days') or {}).get(day):
            continue
        o = out.setdefault(c, {'name': old.get('name', n), 'days': {}})
        if 'lat' not in o and 'lat' in old:
            o['lat'] = old['lat']; o['lon'] = old['lon']
        if day not in o['days']:
            o['days'][day] = old['days'][day]
            fallback += 1

    # 음력 날짜 (한국천문연구원 음양력 표 기반 korean_lunar_calendar)
    from korean_lunar_calendar import KoreanLunarCalendar
    cal, lunar = KoreanLunarCalendar(), {}
    for i in range(DAYS):
        x = NOW + dt.timedelta(days=i)
        cal.setSolarDate(x.year, x.month, x.day)
        lunar[x.strftime('%Y-%m-%d')] = [cal.lunarMonth, cal.lunarDay, int(cal.isIntercalation)]
    return {'from': NOW.strftime('%Y-%m-%d'), 'lunar': lunar, 'st': out}, stat(fresh, fallback, len(jobs))


def read_meta_status():
    try:
        return json.loads((OUT / 'meta.json').read_text(encoding='utf-8'))['tide.json']['status']
    except (OSError, ValueError, KeyError, TypeError):
        return None


def guard_station(fn, source):
    """한 지점의 잘못된 응답이 다른 지점 수집을 멈추지 않게 한다."""
    def guarded(target):
        try:
            return fn(target)
        except Exception as e:
            LOG['errors'].append(f'{source} {target[0]}: {type(e).__name__}')
            return (target[0] if source == 'obs' else target), None
    return guarded


def tide_needed():
    """조석 예측은 하루 동안 바뀌지 않으므로 오전 실행이나, 파일이 없거나 오늘 것이 아닐 때만 받는다"""
    if os.environ.get('FORCE_TIDE') == '1' or NOW.hour < 12:
        return True
    try:
        previous = read_prev('tide.json')
        return not previous or previous.get('from') != NOW.strftime('%Y-%m-%d') or (read_meta_status() not in ('fresh', 'skipped_today_data_exists'))
    except Exception:
        return True


# ── 2. 조위관측소 최신 관측 ───────────────────────────────
def obs():
    url = 'https://apis.data.go.kr/1192136/dtRecent/GetDTRecentApiService'
    F = {'wtem': 'sst', 'wndrct': 'wdir', 'wspd': 'wspd', 'maxMmntWspd': 'gust', 'artmp': 'air', 'atmpr': 'pres', 'bscTdlvHgt': 'tide', 'slntQty': 'sal', 'crdir': 'cdir', 'crsp': 'csp'}
    targets = lim(PTS['obs'])

    def one(cn):
        c, n = cn
        rows = []
        for d in (NOW, NOW - dt.timedelta(days=1)):     # 새벽에는 오늘 자료가 적어 어제도 본다
            try:
                rows += items(get(url, {'obsCode': c, 'reqDate': d.strftime('%Y%m%d'), 'min': 60, 'type': 'json', 'numOfRows': 300}))
            except Exception as e:
                LOG['errors'].append(f'obs {c} {d:%Y%m%d}: {type(e).__name__}')
            if rows:
                break
        if not rows:
            raise ValueError('빈 관측 응답')
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
        if not valid_doc('obs.json', {c: o}) or len(o) <= 3:
            raise ValueError('사용 가능한 관측값 없음')
        return c, o

    fresh_out = {c: o for c, o in pmap(guard_station(one, 'obs'), targets) if o}
    out = dict(fresh_out)
    prev = read_prev('obs.json') or {}
    fallback = 0
    for c, _ in targets:
        if c not in out and c in prev:
            out[c] = prev[c]
            fallback += 1
    return out, stat(len(fresh_out), fallback, len(targets))


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
            LOG['errors'].append(f'wx {nx},{ny}: {type(e).__name__}')
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
        if not valid_doc('wx.json', {'base': bd + bt, 'cells': {'cell': o}}) or not any(any(v is not None for v in vs) for vs in o.values()):
            raise ValueError('사용 가능한 기상값 없음')
        return cell, o

    fresh_out = {f'{nx},{ny}': o for (nx, ny), o in pmap(guard_station(one, 'wx'), cells) if o}
    out = dict(fresh_out)
    prev_doc = read_prev('wx.json') or {}
    prev = prev_doc.get('cells') or {}
    today = NOW.strftime('%Y%m%d') + '00'

    # 성공한 격자는 새 발표에 없는 오늘의 지난 시각만 이전 값으로 보완한다.
    for k, o in list(out.items()):
        first_hour = min(o)
        for h, v in (prev.get(k) or {}).items():
            if today <= h < first_hour and h not in o:
                o[h] = v
        out[k] = dict(sorted(o.items()))

    # 요청 자체가 실패한 격자는 이전 격자를 통째로 유지한다.
    fallback = 0
    for nx, ny in cells:
        k = f'{nx},{ny}'
        if k not in out and k in prev:
            out[k] = prev[k]
            fallback += 1
    return {'base': bd + bt, 'cells': out}, stat(len(fresh_out), fallback, len(cells))


def save(name, data, stats):
    """신선 데이터 비율이 너무 낮으면 기존 정상 파일을 보존한다."""
    fresh, fallback, requested = stats['fresh'], stats['fallback'], stats['requested']
    ratio = fresh / requested if requested else 0
    info = dict(stats, fresh_ratio=round(ratio, 4),
                error=sum(e.startswith(name[:-5] + ' ') for e in LOG['errors']))

    # workflow_dispatch의 LIMIT은 시험용이다. 운영 data/*.json을 절대 덮어쓰지 않는다.
    if LIMIT:
        info['status'] = 'test_only_not_saved'
        LOG[name] = info
        return False

    path = OUT / name
    if read_prev(name) is not None and (ratio < MIN_FRESH_RATIO or fresh + fallback < requested or not valid_doc(name, data)):
        info['status'] = 'kept_previous_low_fresh_ratio' if ratio < MIN_FRESH_RATIO else 'kept_previous_incomplete'
        info['minimum_ratio'] = MIN_FRESH_RATIO
        LOG[name] = info
        LOG['errors'].append(f'{name}: 신선 데이터 {fresh}/{requested} ({ratio:.1%}) — 기준 {MIN_FRESH_RATIO:.0%} 또는 자료 완전성 미달로 이전 파일 유지')
        return False
    if fresh == 0 or ratio < MIN_FRESH_RATIO or not valid_doc(name, data):
        info['status'] = 'no_data_to_save'
        LOG[name] = info
        LOG['errors'].append(f'{name}: 새 자료의 양 또는 형식이 기준에 못 미쳐 저장하지 않음')
        return False

    write_json_atomic(path, data)
    info['status'] = 'merged_fallback' if fallback else 'fresh'
    LOG[name] = info
    return True


def main():
    if not KEY:
        sys.exit('DATA_GO_KR_KEY 환경변수가 없습니다.')
    if DAYS < 1 or LIMIT < 0 or not 0 < MIN_FRESH_RATIO <= 1:
        sys.exit('TIDE_DAYS, LIMIT, MIN_FRESH_RATIO 설정을 확인해 주세요.')
    LOG.clear()
    LOG['errors'] = []
    OUT.mkdir(exist_ok=True)
    t0 = time.time()
    if LIMIT:
        LOG['test_limit'] = LIMIT

    if tide_needed():
        td, st = tide(); save('tide.json', td, st)
    else:
        LOG['tide.json'] = dict(stat(0, 0, 0), error=0, status='skipped_today_data_exists')
    ob, st = obs(); save('obs.json', ob, st)
    w, st = wx(); save('wx.json', w, st)

    LOG['generated'] = NOW.isoformat(timespec='minutes')
    LOG['seconds'] = round(time.time() - t0)
    LOG['error_count'] = len(LOG['errors'])
    LOG['errors'] = LOG['errors'][:50]

    # LIMIT 실행은 운영 데이터 확인용 시험이므로 저장소의 data/meta.json도 바꾸지 않는다.
    if not LIMIT:
        write_json_atomic(OUT / 'meta.json', LOG, pretty=True)
    print(json.dumps({k: v for k, v in LOG.items() if k != 'errors'}, ensure_ascii=False))
    for e in LOG['errors'][:10]:
        print('  !', e)

    # 앱의 필수 자료인 조석 파일이 실제로 있어야 운영 실행을 성공으로 본다.
    if not LIMIT and read_prev('tide.json') is None:
        sys.exit(1)



if __name__ == '__main__':
    main()

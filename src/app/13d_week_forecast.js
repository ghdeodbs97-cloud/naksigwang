// 13d_week_forecast.js — 선택 포인트의 7일 보완 예보와 물때 날씨 요약 (입질·지도 계산과 분리)
const WEEK_FORECAST = { cache:new Map(), revision:0 };
const WEEK_FIELDS = { air:['wind_speed_10m','wind_direction_10m','relative_humidity_2m'], sea:['wave_height','sea_surface_temperature','ocean_current_velocity','ocean_current_direction'] };
const weekPointKey = p => p.lat.toFixed(3)+','+p.lon.toFixed(3);
function parseWeekForecast(raw, kind, point) {
  if(!raw || raw.utc_offset_seconds!==32400 || !Number.isFinite(raw.latitude) || !Number.isFinite(raw.longitude) || gdist(point,{lat:raw.latitude,lon:raw.longitude})>25)throw Error('예보 격자 확인 실패');
  const times=raw.hourly?.time,units=raw.hourly_units||{};
  if(!Array.isArray(times)||!times.length||times.length>400||new Set(times).size!==times.length||times.some(t=>!/^\d{4}-\d{2}-\d{2}T\d{2}:00$/.test(t)))throw Error('예보 시각 확인 실패');
  const ranges={wind_speed_10m:[0,100],wind_direction_10m:[0,360],relative_humidity_2m:[0,100],wave_height:[0,40],sea_surface_temperature:[-3,45],ocean_current_velocity:[0,15],ocean_current_direction:[0,360]};
  const rows=new Map(times.map(t=>[t,{}]));
  for(const name of WEEK_FIELDS[kind]){
    const values=raw.hourly[name],unit=units[name];
    if(!Array.isArray(values)||values.length!==times.length)throw Error('예보 항목 누락');
    let factor=1;
    if(name==='wind_speed_10m'||name==='ocean_current_velocity'){
      if(unit==='km/h')factor=1/3.6;else if(unit==='kn')factor=1/1.943844;else if(unit!=='m/s')throw Error('유속·풍속 단위 확인 실패');
    }else if(name==='wave_height'&&unit!=='m'||name==='sea_surface_temperature'&&unit!=='°C'||name==='relative_humidity_2m'&&unit!=='%'||name.endsWith('direction')&&unit!=='°'||name==='wind_direction_10m'&&unit!=='°')throw Error('예보 단위 확인 실패');
    const [lo,hi]=ranges[name];
    values.forEach((v,i)=>{const n=typeof v==='number'&&Number.isFinite(v)?v*factor:null;rows.get(times[i])[name]=n!==null&&n>=lo&&n<=hi?n:null;});
  }
  return {rows,km:gdist(point,{lat:raw.latitude,lon:raw.longitude}),lat:raw.latitude,lon:raw.longitude};
}
async function fetchWeekForecast(kind,point,signal) {
  const url=new URL(kind==='air'?'https://api.open-meteo.com/v1/forecast':'https://marine-api.open-meteo.com/v1/marine');
  const args={latitude:point.lat.toFixed(3),longitude:point.lon.toFixed(3),hourly:WEEK_FIELDS[kind].join(','),forecast_days:'7',timezone:'Asia/Seoul',wind_speed_unit:'ms'};
  if(kind==='sea')args.cell_selection='sea';
  for(const [k,v] of Object.entries(args))url.searchParams.set(k,v);
  const response=await fetch(url,{signal,credentials:'omit',referrerPolicy:'no-referrer'});
  if(!response.ok)throw Error('보완 예보 응답 실패');
  return parseWeekForecast(await response.json(),kind,point);
}
async function requestWeekForecast() {
  if(TAB!=='today'&&TAB!=='tide')return;
  const p=POINTS[S.pt]||STATIONS[S.st],key=weekPointKey(p),old=WEEK_FORECAST.cache.get(key);
  if(old&&(old.status==='loading'||Date.now()-old.at<(old.status==='error'?60000:30*60000)))return;
  const entry={at:Date.now(),status:'loading',air:null,sea:null};
  WEEK_FORECAST.cache.delete(key);WEEK_FORECAST.cache.set(key,entry);
  while(WEEK_FORECAST.cache.size>8)WEEK_FORECAST.cache.delete(WEEK_FORECAST.cache.keys().next().value);
  const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),12000);
  try{
    await Promise.allSettled(['air','sea'].map(async kind=>{entry[kind]=await fetchWeekForecast(kind,p,controller.signal);}));
    entry.status=entry.air&&entry.sea?'ready':entry.air||entry.sea?'partial':'error';
  }finally{
    clearTimeout(timer);WEEK_FORECAST.revision++;RENDER.readKey='';
    if(TAB==='today')updateTodaySummary();
  }
}
function weekForecastAt(p,day,h) {
  const entry=WEEK_FORECAST.cache.get(weekPointKey(p));
  if(!entry||Date.now()-entry.at>30*60000)return {status:entry?.status||'idle'};
  const time=dateAdd(DAY0,day)+'T'+String(Math.floor(h)).padStart(2,'0')+':00';
  return {status:entry.status,air:entry.air?.rows.get(time),sea:entry.sea?.rows.get(time),airKm:entry.air?.km,seaKm:entry.sea?.km,at:entry.at};
}
function tideWeatherAt(st,p,day,h) {
  const kma=wxAt(st,day,h,p),extra=weekForecastAt(p,day,h),a=extra.air||{},m=extra.sea||{},ob=day===TODAY_IDX?sstForLocation(p):null;
  const field=(value,source,km)=>({value,source,km});
  const pick=(value,other,kmaKm,modelKm)=>Number.isFinite(value)?field(value,'기상청 예보',kmaKm):field(other??null,'Open-Meteo 모델',modelKm);
  const speed=pick(kma?.sp,a.wind_speed_10m,kma?.km,extra.airKm),direction=pick(kma?.deg,a.wind_direction_10m,kma?.km,extra.airKm),wave=pick(kma?.wave,m.wave_height,kma?.km,extra.seaKm),humidity=pick(kma?.humidity,a.relative_humidity_2m,kma?.km,extra.airKm);
  const sst=ob?field(ob.value,ob.name+' 현재 관측',ob.km):field(m.sea_surface_temperature??null,'해수면 수온 모델',extra.seaKm);
  const nc=CR.ready?nearestCrnt(p.lat,p.lon):null,r=nc&&nc.km<=CR_NEAR?crntAt(nc.c,day*24+h):null;
  const current=r?{value:r.sp/100,direction:r.dir,source:'KHOA '+nc.c.name+' 예보',km:nc.km,nc}: {value:m.ocean_current_velocity??null,direction:m.ocean_current_direction??null,source:'해류 모델 · 연안 정밀 조류 아님',km:extra.seaKm};
  return {speed,direction,wave,humidity,sst,current,extra,kma,ob,nc};
}
function weatherValue(o,unit,digits=1) {return Number.isFinite(o.value)?o.value.toFixed(digits)+' '+unit:'자료 없음';}
function weatherSource(o) {return o.source+(Number.isFinite(o.km)?' · 격자/지점 '+o.km.toFixed(0)+' km':'');}
function updateWeatherDashboard(st,p) {
  const w=tideWeatherAt(st,p,S.day,S.t),day=st.days[S.day],has=v=>Number.isFinite(v);
  setText('weatherWhen',day.date+' · '+String(Math.floor(S.t)).padStart(2,'0')+'시 기준');
  setText('wxDirection',has(w.direction.value)?dirName16(w.direction.value)+'풍':'자료 없음');
  setText('wxWind',weatherValue(w.speed,'m/s'));
  setText('wxWave',weatherValue(w.wave,'m'));
  setText('wxHumidity',weatherValue(w.humidity,'%',0));
  setText('wxSst',weatherValue(w.sst,'℃'));
  setText('weatherCurrent',Number.isFinite(w.current.value)?(w.current.value*1.943844).toFixed(1)+' kn':'자료 없음');
  setText('weatherCurrentNote',(Number.isFinite(w.current.direction)?dirName16(w.current.direction)+'쪽 · ':'')+weatherSource(w.current));
  setText('wxSstLabel',w.ob?'현재 수온':'수온 예측');
  for(const [id,field] of [['wxDirectionNote',w.direction],['wxWindNote',w.speed],['wxWaveNote',w.wave],['wxHumidityNote',w.humidity],['wxSstNote',w.sst]])setText(id,weatherSource(field));
  if(!Number.isFinite(w.sst.value))setText('wxSstNote',S.day===TODAY_IDX?'50 km 안 최근 관측 없음 · 수온 모델 자료 없음':'이 시각 수온 모델 자료 없음');
  const wind=w.direction.value;
  $('windCompass').style.transform=has(wind)?`rotate(${wind+180}deg)`:'none';$('windCompass').hidden=!has(wind);
  const localSource=w.kma?w.kma.from:!wxCell(p.lat,p.lon)?'기상청 예보 격자 자료 없음':'선택한 시각의 기상청 예보 없음';
  const extraState=w.extra.status==='loading'?'7일 보완 예보 불러오는 중…':w.extra.status==='error'?'보완 예보 연결 실패':w.extra.status==='partial'?'일부 보완 예보만 사용':'7일 모델 보완 · 예보는 바뀔 수 있습니다';
  setText('wxSlot',localSource+' · '+extraState);
  return w;
}

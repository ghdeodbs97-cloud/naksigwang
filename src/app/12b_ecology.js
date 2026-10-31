// 12b_ecology.js — 어종별 보수적 생태 가정과 월별 조건, 우럭 별칭 공유
// 수치들은 어획 확률이 아니다. TEMP_PREF 이외의 범위는 넓은 생태 가정이며 현장 검증 전이다.
const ECO_GROUPS = {
 reef: {depth:[3,30,0,70],habitat:{rock:1,breakwater:.85,harbor:.45,sand:.15,openSea:.65,deepEdge:.75},current:[.35,.5,.6],light:[.85,.35,1,.9],tide:[.85,.7,.45,.4],weather:[.25,.35,1.2]},
 flat: {depth:[3,35,0,100],habitat:{rock:.2,breakwater:.4,harbor:.6,sand:1,mud:.85,openSea:.65},current:[.3,.5,.6],light:[.8,1,.75,.3],tide:[.8,.9,.5,.5],weather:[.3,.25,.9]},
 pelagic: {depth:[15,70,2,150],habitat:{rock:.65,breakwater:.75,harbor:.2,sand:.35,openSea:1,deepEdge:1},current:[.8,.6,1],light:[1,.8,.9,.2],tide:[.9,.8,.2,.7],weather:[.15,.7,1.5]},
 harbor: {depth:[1,12,0,40],habitat:{rock:.35,breakwater:.75,harbor:1,sand:.8,mud:.8,openSea:.25},current:[.2,.5,.4],light:[.7,1,.8,.25],tide:[.75,.65,.8,.25],weather:[.5,.15,.7]},
 squid: {depth:[3,30,0,80],habitat:{rock:.8,breakwater:1,harbor:.7,sand:.6,openSea:.75},current:[.35,.5,.8],light:[.8,.3,1,1],tide:[.85,.65,.4,.5],weather:[.55,.2,.8]},
 octopus: {depth:[3,35,0,100],habitat:{rock:1,breakwater:.85,harbor:.65,sand:.5,mud:.5,openSea:.5},current:[.2,.45,.7],light:[.65,.6,.9,1],tide:[.6,.85,.75,.3],weather:[.2,.2,1]},
 eel: {depth:[5,50,0,150],habitat:{rock:.8,breakwater:.8,harbor:.75,sand:.85,mud:.9,openSea:.5},current:[.25,.5,.5],light:[.45,.1,.85,1],tide:[.7,.9,.6,.3],weather:[.15,.3,1.2]}
};
// [이름, 환경군, 월별 단계값(0~4), 선호 수심(선택), 독립 시간대(선택)]
const ECO_ROWS = [
 ['감성돔','reef','122333344443',null,[1,.6,.9,.25]],['볼락','reef','443322112334'],
 ['벵에돔','reef','112233444432',null,[.8,1,.7,.2]],['농어','reef','112344444432',[2,20,0,60],[.9,.45,1,.85]],
 ['우럭','reef','333444333443'],['광어','flat','222344443432'],['노래미','reef','443332223344',null,[.7,1,.6,.3]],
 ['삼치','pelagic','111223344443',null,[1,.6,.85,.1]],['고등어','pelagic','112233444443',[5,60,0,150],[.9,.7,1,.55]],
 ['참돔','reef','112344444432',[15,60,2,120],[1,.75,.9,.3]],['잿방어','pelagic','111223444432'],
 ['부시리','pelagic','112233444443'],['대구','flat','443211111234',[30,100,5,200],[.6,1,.6,.4]],
 ['숭어','harbor','223344444332'],['전갱이','pelagic','112233444432',[5,45,0,100],[.9,.45,1,.85]],
 ['돌돔','reef','111233444432',[5,35,0,80],[.8,1,.7,.2]],['백조기','flat','111223444321'],['전어','harbor','111223344432'],
 ['독가시치','reef','111223444432',null,[.6,1,.7,.2]],['방어','pelagic','432211233444',[20,80,2,150],[1,.85,.8,.25]],
 ['문치가자미','flat','444321111234',[2,25,0,70]],['학공치','harbor','221112344443',[1,8,0,25],[1,.9,.75,.1]],
 ['무늬오징어','squid','111223344443'],['피문어','octopus','222222222222',[20,80,3,200]],
 ['용가자미','flat','222222222222',[15,70,2,150]],['참가자미','flat','222222222222',[5,40,0,100]],
 ['참문어','octopus','222334444432'],['갑오징어','squid','112344234432',[3,25,0,70],[.8,.7,1,.85]],
 ['갈치','pelagic','111223444443',[20,100,2,200],[.55,.15,.9,1]],['가숭어','harbor','223344444332'],
 ['민어','flat','111123444321',[10,50,0,120],[.7,.5,1,.9]],['벤자리','reef','111233444432',[10,50,0,100],[1,.85,.8,.3]],
 ['붕장어','eel','222334444432'],['살오징어','squid','223333444433',[20,100,2,200],[.6,.2,.85,1]],
 ['자바리','reef','111223444432',[5,50,0,100],[.7,.5,1,.8]],['쭈꾸미','octopus','123443234432',[2,20,0,50],[.8,1,.7,.5]],
 ['한치','squid','111234443211',[10,60,1,150],[.6,.15,.9,1]],['호래기','squid','443211112344',[1,15,0,40],[.5,.2,.85,1]]
];
for(const [name,group,months,depth,light] of ECO_ROWS){
 const fish=FISH.find(f=>f.n===name), base=ECO_GROUPS[group],temp=TEMP_PREF[name];
 fish.ecology={...structuredClone(base),group,depth:depth||base.depth,light:light||base.light,seasonByMonth:[...months].map(Number).map(x=>x/4),regionPrior:fish.reg||null,temperature:temp?.[2]?[temp[0],temp[1],Math.max(0,temp[0]-5),temp[1]+5]:null,confidence:fish.reg?.55:.35,provenance:{temperature:temp?.[2]?'legacy-derived TEMP_PREF':'unknown',season:months==='222222222222'?'unknown (neutral)':'broad ecological prior',habitat:'broad ecological prior',depth:'broad ecological prior',current:'broad ecological prior',light:'broad ecological prior',tide:'broad ecological prior',weather:'broad ecological prior',region:fish.reg?'legacy-derived':'unknown'}};
 fish.modelStatus='partial';
}
FISH.find(f=>f.n==='조피볼락').ecology=FISH.find(f=>f.n==='우럭').ecology;
FISH.find(f=>f.n==='조피볼락').modelStatus='partial';
function ecologySeason(profile,date){
 const d=new Date(date+'T12:00:00+09:00'),m=d.getUTCMonth(),days=new Date(Date.UTC(d.getUTCFullYear(),m+1,0)).getUTCDate();
 const f=(d.getUTCDate()-1)/days;return profile.seasonByMonth[m]*(1-f)+profile.seasonByMonth[(m+1)%12]*f;
}
function ecologyRange(value,range){
 if(!Number.isFinite(value)||!range)return .5;
 const [a,b,lo,hi]=range;if(value>=a&&value<=b)return 1;
 return value<a?clamp((value-lo)/Math.max(.01,a-lo),0,1):clamp((hi-value)/Math.max(.01,hi-b),0,1);
}
function ecologyLight(profile,h,sr,ss){
 const [dawn,day,dusk,night]=profile.light,knots=[[0,night],[Math.max(0,sr-1.5),night],[sr,dawn],[sr+1.5,day],[ss-1.5,day],[ss,dusk],[ss+1.5,night],[24,night]];
 for(let i=1;i<knots.length;i++)if(h<=knots[i][0]){const [a,x]=knots[i-1],[b,y]=knots[i];return x+(y-x)*clamp((h-a)/(b-a),0,1);}return night;
}
function ecologyLightName(f){const names=['해뜰녘','낮','해질녘','밤'],v=f.ecology.light;return names.filter((_,i)=>v[i]>=Math.max(...v)-.1).join('·');}

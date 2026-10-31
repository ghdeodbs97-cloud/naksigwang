// 13c_bite_layers.js — 서식과 선택 날짜의 활동 조건을 분리하는 점수 조합
const BITE_HABITAT_KEYS=new Set(['season','region','depth','habitat','target']);
const BITE_DYNAMIC_KEYS=new Set(['light','temperature','current','tide','wind','wave']);
function biteLayerScores(factors){
 let habitat=0,dynamic=0;
 for(const factor of factors){
  factor.layerEffect=factor.effect;
  if(BITE_HABITAT_KEYS.has(factor.key)){factor.layer='habitat';habitat+=factor.effect;factor.effect*=.45*100/54;}
  else if(BITE_DYNAMIC_KEYS.has(factor.key)){factor.layer='dynamic';dynamic+=factor.effect;factor.effect*=.55;}
  else factor.layer='neutral';
 }
 return {habitatScore:clamp(50+habitat*100/54,0,100),dynamicScore:clamp(50+dynamic,0,100)};
}
function combineBiteScores(habitat,dynamic,personal=1){return clamp((.45*habitat+.55*dynamic)*personal,0,99);}

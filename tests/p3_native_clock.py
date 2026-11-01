"""자료 날짜만 고정한다. RAF·performance·timer는 브라우저 원본을 유지한다."""
import datetime as dt
import json


def fixed_date_script(iso_date):
    milliseconds = dt.datetime.fromisoformat(iso_date).timestamp() * 1000
    return """(() => {
      const NativeDate=Date, fixed=%s;
      window.Date=new Proxy(NativeDate,{
        apply:()=>new NativeDate(fixed).toString(),
        construct:(target,args,newTarget)=>Reflect.construct(target,args.length?args:[fixed],newTarget),
        get:(target,key,receiver)=>key==='now'?()=>fixed:Reflect.get(target,key,receiver)
      });
    })();""" % json.dumps(milliseconds)

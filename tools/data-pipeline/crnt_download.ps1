$key = Read-Host 'Paste your data.go.kr service key (Decoding)'
$enc = [uri]::EscapeDataString($key.Trim())
$out = Join-Path ([Environment]::GetFolderPath('Desktop')) 'crnt_fcst.jsonl'
if (Test-Path $out) { Remove-Item $out }
$codes = @('06SA18','06YME1','06YS04','06YS09','18MTC10','01MP-2','01SR-1','02JJ-1','03DS-1','03PT-1','05GH-5','06GH01','06GH07','06GS07','06JD01','06SA01','06SA10','06YME4','06YME5','06YME6','06YME8','06YS03','07DS02','07GG03','07GG06','07GG11','07JB12','07JB14','07KS01','07TA03','07TA04','07TA05','08GA01','08GY-5','08JJ03','08JJ07','09IC01','09IC07','10GD03','10MP07','11JD02','11JD09','12JB11','12JB14','12YS08','13PT01','13WD01','14BP01','14IC03','14IC04','14JD03','15HD05','15LTC01','15LTC02','15LTC03','15LTC04','17LTC01','17LTC05','17LTC09','17LTC13','17MTC14','17MTC19','17MTC20','18LTC11','98HG-1','15LTC05','15LTC06','15LTC07','15LTC08','15LTC09','15LTC10','15SE01','16DJ04','16LTC01','16LTC02','16LTC03','16LTC04','16LTC05','16LTC06','16LTC07','16LTC08','16LTC09','16LTC10','16LTC11','16LTC12','16LTC13','16LTC14','16MTC01','16MTC16','17LTC02','17LTC03','17LTC04','17LTC06','17LTC07','17LTC08','17LTC10','17LTC11','17LTC12','17LTC14','18LTC01','18LTC02','18LTC03','18LTC04','18LTC05','18LTC06','18LTC07','18LTC08','18LTC09','18LTC10','18LTC12','18LTC13','18LTC14','19LTC01','19LTC02','19LTC03','19LTC04','19LTC05','19LTC06','19LTC07','19LTC08','19LTC09','19LTC10','19LTC11','19LTC12','19LTC13','19LTC14','JejuStrait','20LTC01','20LTC02','20LTC03','20LTC04','20LTC05','20LTC06','20LTC07','20LTC08','20LTC09','20LTC11','20LTC12','20LTC13','20LTC14','20LTC15','Gwangyanghang','21LTC01','21LTC02','21LTC03','21LTC04','21LTC05','21LTC06','21LTC07','21LTC08','21LTC09','21LTC10','21LTC11','21LTC12','21LTC13','21LTC14','22EW01','22LTC01','22LTC02','22LTC03','22LTC04','22LTC05','22LTC06','22LTC07','22LTC08','22LTC09','22LTC10','22LTC12','22LTC13','22LTC14','22LTC15','22MTC03','23GA01','23LTC01','23LTC02','23LTC03','23LTC04','23LTC05','23LTC06','23LTC07','23LTC08','23LTC09','23YG03','24GW02','24LTC01','24LTC02','24LTC03','24LTC04','24LTC05','24LTC06','24LTC07','24LTC08','24LTC09','24LTC10','24LTC11','24TJ02','24TJ04','24TJ05','MyeongYang_Sudo')
$n = 0
foreach ($c in $codes) {
  $n++; $page = 1; $total = 1
  do {
    $u = "https://apis.data.go.kr/1192136/crntFcstFldEbb/GetCrntFcstFldEbbApiService?serviceKey=$enc&obsCode=$c&type=json&numOfRows=300&pageNo=$page"
    try { $t = (Invoke-WebRequest -Uri $u -UseBasicParsing -TimeoutSec 60).Content } catch { Write-Host "$c page $page failed: $($_.Exception.Message)"; break }
    Add-Content -Path $out -Value $t -Encoding UTF8
    if ($t -match '"totalCount"\s*:\s*"?(\d+)') { $total = [int]$Matches[1] } else { Write-Host "$c : $($t.Substring(0,[Math]::Min(200,$t.Length)))"; break }
    $page++
  } while (($page - 1) * 300 -lt $total)
  Write-Host "[$n/$($codes.Count)] $c total=$total"
}
Write-Host "Done -> $out"

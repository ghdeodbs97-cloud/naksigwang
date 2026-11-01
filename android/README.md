# 낚시광 안드로이드 테스트 앱

기존 홈페이지 `https://ghdeodbs97-cloud.github.io/naksigwang/#today`를 Android WebView로 연다.
지도·수심·입질 계산 코드를 복제하거나 변경하지 않는다. 홈페이지 배포가 앱에도 반영된다.
NAVER 웹 SDK는 기존 HTTPS 출처를 사용한다. APK에 별도 키나 로컬 브라우저 설정을 넣지 않는다.
어신을 참고한 기능 흐름과 다음 작업 범위는 [벤치마킹 방향](BENCHMARK.md)에 정리했다.

## 설치와 확인

GitHub Actions **Android APK**의 `naksigwang-debug-<SHA>` 산출물을 받아 압축을 푼다.
`naksigwang-debug.apk`는 Android 8.0 이상 휴대폰에 설치하는 **테스트용**이다.
파일을 연 앱에 한해 Android의 ‘알 수 없는 앱 설치’를 허용한다.
앱 이름은 **낚시광 (테스트)**, 패키지는 `io.github.ghdeodbs97cloud.naksigwang.debug`다.
출시용 앱과 분리되어 설치된다. CI의 임시 debug 서명은 빌드마다 달라질 수 있어
업데이트 설치가 거부될 수 있다. 기록이 있다면 무작정 앱을 삭제하지 말고 먼저 보존한다.

실제 휴대폰에서 다음을 확인한다. 컴파일/단위 검사만으로 기기 검증 성공을 주장하지 않는다.

1. 다섯 탭, NAVER 위성, 지도 1~2분 pan/zoom, 항·갯바위·조류 overlay, 수심 hover·A/B.
2. 화면 회전·키보드·상하 시스템 바가 탭/카드를 가리지 않는지.
3. 뒤로 가기: 다른 탭 → 오늘 → 앱을 배경으로. 다시 열면 지도·기록 유지.
4. 자료 가져오기에서 CSV/JSON/Excel 파일 선택·취소. 파일 형식 파싱은 기존 웹 기능을 따른다.
5. 외부 출처 링크는 브라우저로 열림. 인터넷을 끊고 첫 실행하면 오류 안내와 다시 시도.
6. 기록 작성 → 앱 종료/재실행 후 유지. Chrome 기록과 앱 기록은 별도 저장소다.

debug 앱만 PC Chrome `chrome://inspect/#devices`로 검사할 수 있다.
앱 WebView Console에서 `naksigwangMapLoadDiagnostic()`를 실행해
`apiReady`, `initStatus`, `providerActive`를 확인한다. 키·localStorage 값은 공유하지 않는다.
현재 인터넷 연결이 필요하며 지도/페이지 오프라인 다운로드 기능은 없다.

## 로컬 빌드

JDK 17, Android SDK platform 36, build-tools 36.0.0을 설치하고 SDK 라이선스를 직접 확인한다.
`android/local.properties`에 개인 SDK 경로를 넣거나 `ANDROID_HOME`을 설정한다.

```powershell
cd android
.\gradlew.bat testDebugUnitTest lintDebug assembleDebug
```

출력: `app/build/outputs/apk/debug/app-debug.apk`.
Gradle 8.13 wrapper와 배포 ZIP은 공식 SHA256을 확인한다.
CI는 사전 설치된 SDK를 이용하며 실제 NAVER API/인증키를 사용한 검사를 하지 않는다.
CI의 debug 서명은 테스트 전용이며 개인키를 산출물/저장소에 내보내지 않는다.

## 앱 경계와 자료

- 인터넷 권한만 사용. 위치·카메라·연락처·전체 저장소 권한 및 네이티브 JS 브리지 없음.
- 사용자가 고른 문서는 Android 문서 선택기로 읽기 권한만 전달한다.
- HTTPS만 사용. 인증서 오류를 무시하지 않는다. 지도 타일 오류는 웹의 기존 복구 정책을 따른다.
- 앱 내부 이동은 정확한 홈페이지 경로만 허용. 외부 링크는 사용자 동작일 때만 다른 앱으로 연다.
- 기록은 앱 WebView의 기기 저장소에만 보관. 앱 삭제/데이터 삭제 시 소실된다.
- 출처 표시는 홈페이지 기록 탭의 기존 OSM·GEBCO·공공자료 표시를 그대로 사용한다.
- 앱 아이콘은 저장소의 단순 벡터 도안이며 최종 스토어용 홍보 이미지는 별도 준비한다.

## 스토어 다음 단계 (이번 작업에서 제출/출시하지 않음)

Play Store: 최종 패키지명 확정 → 소유자 관리 업로드 키/Play App Signing → 서명된 release AAB →
실기기/테스터 검증 → 개인정보처리방침·Data safety·등급·설명·스크린샷 → 심사.
현재 `targetSdk=36`. release에는 서명 설정이 없으며 debug APK를 제출용으로 쓰지 않는다.
업로드 키/암호/keystore는 저장소에 추가하지 않는다.

App Store: 공통 웹 기능을 유지하면서 iOS WKWebView 앱과 파일 선택·뒤로 가기·저장소 처리를 별도 구현하고,
Mac/Xcode·Apple Developer 계정·서명·실기기 검증·개인정보 표시·심사를 준비한다.
Android APK로 iPhone에 설치할 수 없다. 단순 웹 포장만으로 스토어 승인이 보장되지 않는다.

참고: [Android WebView](https://developer.android.com/develop/ui/views/layout/webapps/webview),
[Play target SDK](https://developer.android.com/google/play/requirements/target-sdk),
[Apple 최소 기능 기준](https://developer.apple.com/app-store/review/guidelines/#minimum-functionality).

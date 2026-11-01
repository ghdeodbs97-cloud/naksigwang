package io.github.ghdeodbs97cloud.naksigwang;

import java.net.URI;
import java.net.URISyntaxException;
import java.util.Locale;

/** 앱 내부 이동과 사용자 요청 외부 링크를 구분한다. */
final class AppUrls {
    static final String HOME = "https://ghdeodbs97-cloud.github.io/naksigwang/#today";
    enum Route { INTERNAL, WEB, MAIL, TEL, GEO, BLOCKED }

    static Route route(String value) {
        if (value == null) return Route.BLOCKED;
        try {
            URI uri = new URI(value);
            String scheme = uri.getScheme();
            if (scheme == null || uri.getRawUserInfo() != null) return Route.BLOCKED;
            scheme = scheme.toLowerCase(Locale.ROOT);
            if (scheme.equals("https") || scheme.equals("http")) {
                if (uri.getHost() == null) return Route.BLOCKED;
                String path = uri.getRawPath();
                if (scheme.equals("https") && uri.getHost().equalsIgnoreCase("ghdeodbs97-cloud.github.io")
                        && (uri.getPort() == -1 || uri.getPort() == 443)
                        && ("/naksigwang/".equals(path) || "/naksigwang".equals(path)
                        || "/naksigwang/index.html".equals(path))) return Route.INTERNAL;
                return Route.WEB;
            }
            switch (scheme) {
                case "mailto": return Route.MAIL;
                case "tel": return Route.TEL;
                case "geo": return Route.GEO;
                default: return Route.BLOCKED;
            }
        } catch (URISyntaxException e) { return Route.BLOCKED; }
    }
    private AppUrls() { }
}

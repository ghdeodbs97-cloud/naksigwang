package io.github.ghdeodbs97cloud.naksigwang;

import org.junit.Test;
import static org.junit.Assert.*;

public class AppUrlsTest {
    @Test public void onlyExactAppPagesStayInside() {
        for (String tail : new String[]{"", "/", "/#map", "/index.html?mode=1#today"})
            assertEquals(AppUrls.Route.INTERNAL, AppUrls.route("https://ghdeodbs97-cloud.github.io/naksigwang" + tail));
        for (String value : new String[]{"https://ghdeodbs97-cloud.github.io.evil.test/naksigwang/",
                "http://ghdeodbs97-cloud.github.io/naksigwang/", "https://ghdeodbs97-cloud.github.io/other/",
                "https://ghdeodbs97-cloud.github.io/naksigwang/../other/",
                "https://ghdeodbs97-cloud.github.io/naksigwang/%2e%2e/other/",
                "https://ghdeodbs97-cloud.github.io:444/naksigwang/"})
            assertEquals(AppUrls.Route.WEB, AppUrls.route(value));
    }
    @Test public void privilegedOrMalformedLinksAreBlocked() {
        for (String value : new String[]{null, "", "#map", "https://user@ghdeodbs97-cloud.github.io/naksigwang/",
                "javascript:alert(1)", "file:///sdcard/x", "data:text/html,test", "intent://test", "https://", "bad url"})
            assertEquals(AppUrls.Route.BLOCKED, AppUrls.route(value));
    }
    @Test public void explicitUserActionsHaveSeparateRoutes() {
        assertEquals(AppUrls.Route.WEB, AppUrls.route("https://example.com"));
        assertEquals(AppUrls.Route.MAIL, AppUrls.route("mailto:test@example.com"));
        assertEquals(AppUrls.Route.TEL, AppUrls.route("tel:01012345678"));
        assertEquals(AppUrls.Route.GEO, AppUrls.route("geo:38,128"));
    }
}

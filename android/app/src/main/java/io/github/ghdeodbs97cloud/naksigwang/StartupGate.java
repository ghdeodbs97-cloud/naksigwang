package io.github.ghdeodbs97cloud.naksigwang;

/** 시작 그림은 최소 2초 표시하고, 로딩이 멈추면 재시도 화면으로 안내한다. */
final class StartupGate {
    static final long MIN_MS = 2_000;
    static final long TIMEOUT_MS = 30_000;
    enum Decision { WAIT, CONTENT, ERROR }
    private final long shownAt;

    StartupGate(long shownAt) { this.shownAt = shownAt; }

    Decision decide(long now, boolean contentReady, boolean failed) {
        long elapsed = Math.max(0, now - shownAt);
        if (elapsed < MIN_MS) return Decision.WAIT;
        if (failed) return Decision.ERROR;
        if (contentReady) return Decision.CONTENT;
        return elapsed >= TIMEOUT_MS ? Decision.ERROR : Decision.WAIT;
    }
}

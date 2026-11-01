package io.github.ghdeodbs97cloud.naksigwang;

import org.junit.Test;
import static org.junit.Assert.assertEquals;

public class StartupGateTest {
    private final StartupGate gate = new StartupGate(1_000);

    @Test public void fastLoadStillShowsPictureForTwoSeconds() {
        assertEquals(StartupGate.Decision.WAIT, gate.decide(1_001, true, false));
        assertEquals(StartupGate.Decision.WAIT, gate.decide(2_999, true, false));
        assertEquals(StartupGate.Decision.CONTENT, gate.decide(3_000, true, false));
    }
    @Test public void slowLoadKeepsPictureAfterMinimum() {
        assertEquals(StartupGate.Decision.WAIT, gate.decide(3_000, false, false));
        assertEquals(StartupGate.Decision.WAIT, gate.decide(7_000, false, false));
        assertEquals(StartupGate.Decision.CONTENT, gate.decide(7_100, true, false));
    }
    @Test public void failedLoadAlsoHonorsMinimumThenShowsRetry() {
        assertEquals(StartupGate.Decision.WAIT, gate.decide(2_000, false, true));
        assertEquals(StartupGate.Decision.ERROR, gate.decide(3_000, false, true));
    }
    @Test public void missingFinishCallbackCannotHidePictureForever() {
        assertEquals(StartupGate.Decision.WAIT, gate.decide(30_999, false, false));
        assertEquals(StartupGate.Decision.ERROR, gate.decide(31_000, false, false));
    }
    @Test public void errorOverridesStaleReadyCallback() {
        assertEquals(StartupGate.Decision.ERROR, gate.decide(4_000, true, true));
    }
    @Test public void readyContentAtDeadlineIsNotAnError() {
        assertEquals(StartupGate.Decision.CONTENT, gate.decide(31_000, true, false));
    }
}

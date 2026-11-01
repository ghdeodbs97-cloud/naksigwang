package io.github.ghdeodbs97cloud.naksigwang;
import org.junit.Test;
import static org.junit.Assert.*;
public class FileTypeHintsTest {
    @Test public void importedDataExtensionsBecomeMimeTypes() {
        assertArrayEquals(new String[]{"text/csv", "application/json", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"},
                FileTypeHints.mimeTypes(new String[]{".csv,.json", ".xlsx", ".csv"}));
    }
    @Test public void emptyAndUnknownHintsRemainSelectable() {
        assertArrayEquals(new String[]{"*/*"}, FileTypeHints.mimeTypes(null));
        assertArrayEquals(new String[]{"*/*"}, FileTypeHints.mimeTypes(new String[]{".unknown", ""}));
        assertArrayEquals(new String[]{"image/*"}, FileTypeHints.mimeTypes(new String[]{"image/*"}));
    }
}

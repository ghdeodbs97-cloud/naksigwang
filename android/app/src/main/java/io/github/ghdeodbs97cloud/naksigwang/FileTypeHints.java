package io.github.ghdeodbs97cloud.naksigwang;

import java.util.LinkedHashSet;
import java.util.Locale;
import java.util.Set;

/** HTML 파일 입력의 확장자 목록을 안드로이드 문서 선택기에 전달한다. */
final class FileTypeHints {
    static String[] mimeTypes(String[] accepts) {
        Set<String> types = new LinkedHashSet<>();
        if (accepts != null) for (String entry : accepts) {
            if (entry == null) continue;
            for (String part : entry.split(",")) {
                String type = part.trim().toLowerCase(Locale.ROOT);
                switch (type) {
                    case ".csv": type = "text/csv"; break;
                    case ".tsv": type = "text/tab-separated-values"; break;
                    case ".txt": type = "text/plain"; break;
                    case ".json": case ".geojson": type = "application/json"; break;
                    case ".xls": type = "application/vnd.ms-excel"; break;
                    case ".xlsx": type = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"; break;
                    default: break;
                }
                if (type.matches("[a-z0-9.+*-]+/[a-z0-9.+*-]+")) types.add(type);
            }
        }
        if (types.isEmpty() || types.contains("*/*")) return new String[]{"*/*"};
        return types.toArray(new String[0]);
    }
    private FileTypeHints() { }
}

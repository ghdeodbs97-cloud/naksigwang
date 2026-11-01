package io.github.ghdeodbs97cloud.naksigwang;

import android.annotation.SuppressLint;
import android.content.ActivityNotFoundException;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.net.http.SslError;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.webkit.SslErrorHandler;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.ProgressBar;
import android.widget.TextView;
import android.widget.Toast;
import androidx.activity.ComponentActivity;
import androidx.activity.OnBackPressedCallback;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.contract.ActivityResultContracts;
import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;

/** 검증된 공개 홈페이지를 같은 HTTPS 출처로 사용하는 안드로이드 화면. */
public final class MainActivity extends ComponentActivity {
    private WebView web;
    private ProgressBar progress;
    private LinearLayout errorPanel;
    private boolean pageFailed;
    private ValueCallback<Uri[]> fileResult;
    private final ActivityResultLauncher<Intent> filePicker = registerForActivityResult(
            new ActivityResultContracts.StartActivityForResult(), result -> {
                if (fileResult == null) return;
                fileResult.onReceiveValue(WebChromeClient.FileChooserParams.parseResult(
                        result.getResultCode(), result.getData()));
                fileResult = null;
            });

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightStatusBars(false);
        WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView()).setAppearanceLightNavigationBars(false);
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(11, 20, 32));
        ViewCompat.setOnApplyWindowInsetsListener(root, (view, insets) -> {
            Insets edges = insets.getInsets(WindowInsetsCompat.Type.systemBars()
                    | WindowInsetsCompat.Type.displayCutout() | WindowInsetsCompat.Type.ime());
            view.setPadding(edges.left, edges.top, edges.right, edges.bottom);
            return WindowInsetsCompat.CONSUMED;
        });
        web = new WebView(this);
        root.addView(web, new FrameLayout.LayoutParams(-1, -1));
        progress = new ProgressBar(this, null, android.R.attr.progressBarStyleHorizontal);
        root.addView(progress, new FrameLayout.LayoutParams(-1, dp(3), Gravity.TOP));
        errorPanel = new LinearLayout(this);
        errorPanel.setOrientation(LinearLayout.VERTICAL);
        errorPanel.setGravity(Gravity.CENTER);
        errorPanel.setPadding(dp(24), dp(24), dp(24), dp(24));
        errorPanel.setBackgroundColor(Color.rgb(11, 20, 32));
        TextView title = new TextView(this);
        title.setText(R.string.connection_title);
        title.setTextSize(21);
        title.setTextColor(Color.WHITE);
        title.setGravity(Gravity.CENTER);
        errorPanel.addView(title);
        TextView hint = new TextView(this);
        hint.setText(R.string.connection_hint);
        hint.setTextColor(Color.LTGRAY);
        hint.setGravity(Gravity.CENTER);
        hint.setPadding(0, dp(16), 0, dp(20));
        errorPanel.addView(hint);
        Button retry = new Button(this);
        retry.setText(R.string.retry);
        retry.setOnClickListener(v -> web.loadUrl(AppUrls.HOME));
        errorPanel.addView(retry);
        Button browser = new Button(this);
        browser.setText(R.string.open_browser);
        browser.setOnClickListener(v -> openExternal(AppUrls.HOME));
        errorPanel.addView(browser);
        errorPanel.setVisibility(View.GONE);
        root.addView(errorPanel, new FrameLayout.LayoutParams(-1, -1));
        setContentView(root);
        configureWeb();
        getOnBackPressedDispatcher().addCallback(this, new OnBackPressedCallback(true) {
            @Override public void handleOnBackPressed() {
                if (!pageFailed && AppUrls.route(web.getUrl()) == AppUrls.Route.INTERNAL) {
                    web.evaluateJavascript("(()=>{if(location.hash&&location.hash!=='#today'){location.replace('#today');return true;}return false;})()",
                            value -> { if (!"true".equals(value)) backOrBackground(); });
                } else backOrBackground();
            }
        });
        if (state == null || web.restoreState(state) == null) web.loadUrl(AppUrls.HOME);
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void configureWeb() {
        /* 지도와 분석에 필요한 JS는 공개 앱 출처에서만 실행한다. 네이티브 JS 브리지는 제공하지 않는다. */
        WebSettings settings = web.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_NEVER_ALLOW);
        settings.setSafeBrowsingEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(true);
        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG);
        web.setWebViewClient(new WebViewClient() {
            @Override public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                if (!request.isForMainFrame()) return false;
                String url = request.getUrl().toString();
                AppUrls.Route route = AppUrls.route(url);
                if (route == AppUrls.Route.INTERNAL) return false;
                if (request.hasGesture() && route != AppUrls.Route.BLOCKED) openExternal(url);
                return true;
            }
            @Override public void onPageStarted(WebView view, String url, android.graphics.Bitmap icon) {
                pageFailed = false;
                errorPanel.setVisibility(View.GONE);
                progress.setVisibility(View.VISIBLE);
            }
            @Override public void onPageFinished(WebView view, String url) {
                progress.setVisibility(View.GONE);
            }
            @Override public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) showConnectionError();
            }
            @Override public void onReceivedHttpError(WebView view, WebResourceRequest request, WebResourceResponse response) {
                if (request.isForMainFrame() && response.getStatusCode() >= 400) showConnectionError();
            }
            @Override public void onReceivedSslError(WebView view, SslErrorHandler handler, SslError error) {
                handler.cancel();
                /* 하위 지도 타일 오류로 앱 전체를 가리지 않는다. 인증서 검증은 항상 유지한다. */
                if (java.util.Objects.equals(error.getUrl(), view.getUrl())) showConnectionError();
            }
        });
        web.setWebChromeClient(new WebChromeClient() {
            @Override public void onProgressChanged(WebView view, int value) { progress.setProgress(value); }
            @Override public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileResult != null) fileResult.onReceiveValue(null);
                fileResult = callback;
                String[] types = FileTypeHints.mimeTypes(params.getAcceptTypes());
                Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                intent.addCategory(Intent.CATEGORY_OPENABLE);
                intent.setType(types.length == 1 ? types[0] : "*/*");
                if (types.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, types);
                intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE);
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                try { filePicker.launch(Intent.createChooser(intent, getString(R.string.choose_file))); }
                catch (ActivityNotFoundException e) { fileResult.onReceiveValue(null); fileResult = null; }
                return true;
            }
        });
    }
    private int dp(int value) { return Math.round(value * getResources().getDisplayMetrics().density); }
    private void showConnectionError() {
        pageFailed = true;
        progress.setVisibility(View.GONE);
        errorPanel.setVisibility(View.VISIBLE);
    }
    private void openExternal(String url) {
        AppUrls.Route route = AppUrls.route(url);
        if (route == AppUrls.Route.BLOCKED) return;
        Intent intent = new Intent(route == AppUrls.Route.TEL ? Intent.ACTION_DIAL : Intent.ACTION_VIEW, Uri.parse(url));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        try { startActivity(intent); }
        catch (ActivityNotFoundException e) { Toast.makeText(this, R.string.no_handler, Toast.LENGTH_SHORT).show(); }
    }
    private void backOrBackground() { if (web.canGoBack() && !pageFailed) web.goBack(); else moveTaskToBack(true); }
    @Override protected void onSaveInstanceState(Bundle state) { web.saveState(state); super.onSaveInstanceState(state); }
    @Override protected void onPause() { web.onPause(); super.onPause(); }
    @Override protected void onResume() { super.onResume(); if (web != null) web.onResume(); }
    @Override protected void onDestroy() {
        if (fileResult != null) { fileResult.onReceiveValue(null); fileResult = null; }
        web.stopLoading();
        web.destroy();
        super.onDestroy();
    }
}

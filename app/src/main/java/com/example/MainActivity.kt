package com.example

import android.annotation.SuppressLint
import android.content.pm.ActivityInfo
import android.os.Build
import android.os.Bundle
import android.util.Base64
import android.view.View
import android.view.WindowInsets
import android.view.WindowInsetsController
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import androidx.activity.ComponentActivity
import androidx.activity.addCallback
import androidx.webkit.WebViewAssetLoader
import androidx.webkit.WebViewClientCompat
import java.io.File

class MainActivity : ComponentActivity() {
    private lateinit var gameView: WebView
    private lateinit var assetLoader: WebViewAssetLoader

    inner class AndroidLevelBridge {
        private val levelsRoot: File by lazy {
            File(filesDir, "levels").apply { if (!exists()) mkdirs() }
        }

        private fun safeLevelDir(levelId: String): File? {
            if (!Regex("^fase_0[1-7]$").matches(levelId)) return null
            return File(levelsRoot, levelId)
        }

        @JavascriptInterface
        fun isPersistentStorageReady(): Boolean = levelsRoot.exists() || levelsRoot.mkdirs()

        @JavascriptInterface
        fun saveLevelZipBase64(levelId: String, base64Zip: String, metadataJson: String): Boolean {
            val dir = safeLevelDir(levelId) ?: return false
            return try {
                if (!dir.exists()) dir.mkdirs()
                val bytes = Base64.decode(base64Zip, Base64.DEFAULT)
                File(dir, "$levelId.zip").writeBytes(bytes)
                File(dir, "meta.json").writeText(metadataJson)
                true
            } catch (_: Exception) {
                false
            }
        }

        @JavascriptInterface
        fun deleteLevelData(levelId: String): Boolean {
            val dir = safeLevelDir(levelId) ?: return false
            return if (dir.exists()) dir.deleteRecursively() else true
        }

        @JavascriptInterface
        fun getStoredLevelBytes(levelId: String): Long {
            val dir = safeLevelDir(levelId) ?: return 0L
            val zip = File(dir, "$levelId.zip")
            return if (zip.exists()) zip.length() else 0L
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_FULL_SENSOR

        assetLoader = WebViewAssetLoader.Builder()
            .addPathHandler("/assets/", WebViewAssetLoader.AssetsPathHandler(this))
            .build()

        gameView = WebView(this).apply {
            setBackgroundColor(android.graphics.Color.rgb(7, 9, 13))
            settings.javaScriptEnabled = true
            settings.domStorageEnabled = true
            settings.databaseEnabled = true
            settings.mediaPlaybackRequiresUserGesture = false
            settings.allowFileAccess = false
            settings.allowContentAccess = false
            settings.setSupportZoom(false)
            settings.builtInZoomControls = false
            settings.displayZoomControls = false
            settings.javaScriptCanOpenWindowsAutomatically = false
            addJavascriptInterface(AndroidLevelBridge(), "AndroidLevelBridge")
            webViewClient = object : WebViewClientCompat() {
                override fun shouldInterceptRequest(
                    view: WebView,
                    request: WebResourceRequest
                ): WebResourceResponse? {
                    return assetLoader.shouldInterceptRequest(request.url)
                }
            }
            webChromeClient = WebChromeClient()
            isFocusable = true
            isFocusableInTouchMode = true
        }

        WebView.setWebContentsDebuggingEnabled(BuildConfig.DEBUG)
        setContentView(gameView)
        hideSystemUi()
        gameView.loadUrl("https://appassets.androidplatform.net/assets/game/index.html")

        onBackPressedDispatcher.addCallback(this) {
            gameView.evaluateJavascript(
                "window.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',code:'Escape',bubbles:true}))",
                null
            )
        }
    }

    @Suppress("DEPRECATION")
    private fun hideSystemUi() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            window.setDecorFitsSystemWindows(false)
            window.insetsController?.let { controller ->
                controller.hide(WindowInsets.Type.statusBars() or WindowInsets.Type.navigationBars())
                controller.systemBarsBehavior =
                    WindowInsetsController.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
            }
        } else {
            window.decorView.systemUiVisibility = (
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY or
                    View.SYSTEM_UI_FLAG_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                    View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                    View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                )
        }
    }

    override fun onWindowFocusChanged(hasFocus: Boolean) {
        super.onWindowFocusChanged(hasFocus)
        if (hasFocus) hideSystemUi()
    }

    override fun onDestroy() {
        if (::gameView.isInitialized) {
            gameView.loadUrl("about:blank")
            gameView.stopLoading()
            gameView.destroy()
        }
        super.onDestroy()
    }
}

package com.example

import android.os.Bundle
import android.view.View
import android.webkit.WebChromeClient
import android.webkit.WebView
import android.webkit.WebViewClient
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback

class MainActivity : ComponentActivity() {
  private lateinit var gameView: WebView

  @Suppress("DEPRECATION")
  private fun hideSystemUi() {
    window.decorView.systemUiVisibility = (
      View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        or View.SYSTEM_UI_FLAG_FULLSCREEN
        or View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
        or View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
        or View.SYSTEM_UI_FLAG_LAYOUT_STABLE
    )
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    hideSystemUi()

    gameView = WebView(this).apply {
      settings.javaScriptEnabled = true
      settings.domStorageEnabled = true
      settings.databaseEnabled = true
      settings.allowFileAccess = true
      settings.allowContentAccess = true
      settings.mediaPlaybackRequiresUserGesture = false
      settings.setSupportZoom(false)
      settings.builtInZoomControls = false
      settings.displayZoomControls = false
      webChromeClient = WebChromeClient()
      webViewClient = WebViewClient()
      setBackgroundColor(android.graphics.Color.BLACK)
    }
    setContentView(gameView)

    if (savedInstanceState == null) {
      gameView.loadUrl("file:///android_asset/web/index.html")
    } else {
      gameView.restoreState(savedInstanceState)
    }

    onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
      override fun handleOnBackPressed() {
        // O jogo controla a navegação; voltar não deve fechar a sessão por acidente.
        if (gameView.canGoBack()) gameView.goBack() else {
          isEnabled = false
          onBackPressedDispatcher.onBackPressed()
        }
      }
    })
  }

  override fun onSaveInstanceState(outState: Bundle) {
    gameView.saveState(outState)
    super.onSaveInstanceState(outState)
  }

  @Suppress("DEPRECATION")
  override fun onWindowFocusChanged(hasFocus: Boolean) {
    super.onWindowFocusChanged(hasFocus)
    if (hasFocus) hideSystemUi()
  }

  override fun onDestroy() {
    if (::gameView.isInitialized) {
      gameView.stopLoading()
      gameView.destroy()
    }
    super.onDestroy()
  }
}

package expo.modules.inboxreader

import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Bundle
import android.util.Log
import android.view.ActionMode
import android.view.Menu
import android.view.MenuItem
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.Fragment
import androidx.fragment.app.FragmentActivity
import androidx.fragment.app.commitNow
import androidx.fragment.app.FragmentContainerView
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import org.readium.r2.navigator.DecorableNavigator
import org.readium.r2.navigator.Decoration
import org.readium.r2.navigator.HyperlinkNavigator
import org.readium.r2.navigator.epub.EpubDefaults
import org.readium.r2.navigator.epub.EpubNavigatorFactory
import org.readium.r2.navigator.epub.EpubNavigatorFragment
import org.readium.r2.navigator.epub.EpubPreferences
import org.readium.r2.navigator.html.HtmlDecorationTemplates
import org.readium.r2.navigator.input.DragEvent
import org.readium.r2.navigator.input.InputListener
import org.readium.r2.navigator.input.KeyEvent
import org.readium.r2.navigator.input.TapEvent
import org.readium.r2.navigator.preferences.Color as ReadiumColor
import org.readium.r2.navigator.preferences.FontFamily
import org.readium.r2.navigator.preferences.Theme
import org.readium.r2.navigator.util.BaseActionModeCallback
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.Link
import org.readium.r2.shared.publication.Locator
import org.readium.r2.shared.publication.Publication
import org.readium.r2.shared.publication.allAreHtml
import org.readium.r2.shared.publication.services.isRestricted
import org.readium.r2.shared.publication.services.protectionError
import org.readium.r2.shared.util.AbsoluteUrl
import org.readium.r2.shared.util.Url
import org.readium.r2.shared.util.asset.AssetRetriever
import org.readium.r2.shared.util.getOrElse
import org.readium.r2.shared.util.http.DefaultHttpClient
import org.readium.r2.shared.util.toAbsoluteUrl
import org.readium.r2.streamer.PublicationOpener
import org.readium.r2.streamer.parser.DefaultPublicationParser
import java.io.File

private const val TAG = "InboxReader"
private const val DECORATION_GROUP = "inbox-reader"

@OptIn(ExperimentalReadiumApi::class)
class InboxReaderModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("InboxReader")

    Function("getEngineInfo") {
      mapOf(
        "platform" to "android",
        "name" to "Readium",
        "version" to READIUM_VERSION
      )
    }

    View(InboxReaderView::class) {
      Prop("fileUri") { view: InboxReaderView, value: String? ->
        view.fileUri = value
      }
      Prop("initialLocator") { view: InboxReaderView, value: String? ->
        view.initialLocator = value
      }
      Prop("initialReadingOrderIndex") { view: InboxReaderView, value: Int? ->
        view.initialReadingOrderIndex = value
      }
      Prop("initialProgression") { view: InboxReaderView, value: Double? ->
        view.initialProgression = value
      }
      Prop("preferences") { view: InboxReaderView, value: Map<String, Any?>? ->
        view.preferences = value
      }
      Prop("decorations") { view: InboxReaderView, value: List<Map<String, Any?>>? ->
        view.decorations = value ?: emptyList()
      }
      Events("onReady", "onLocationChange", "onSelectionChange", "onError", "onExternalLink", "onTap", "onDecorationPress")
      OnViewDidUpdateProps { view: InboxReaderView ->
        view.loadIfNeeded()
        view.applyDecorations(view.decorations)
      }
      OnViewDestroys { view: InboxReaderView ->
        view.dispose()
      }

      AsyncFunction("goForward") { view: InboxReaderView, animated: Boolean? ->
        view.goForward(animated ?: true)
      }
      AsyncFunction("goBackward") { view: InboxReaderView, animated: Boolean? ->
        view.goBackward(animated ?: true)
      }
      AsyncFunction("goToLocator") { view: InboxReaderView, locator: String, animated: Boolean? ->
        view.goToLocator(locator, animated ?: false)
      }
      AsyncFunction("goToReadingOrder") { view: InboxReaderView, index: Int, progression: Double?, animated: Boolean? ->
        view.goToReadingOrder(index, progression, animated ?: false)
      }
      AsyncFunction("submitPreferences") { view: InboxReaderView, preferences: Map<String, Any?> ->
        view.submitPreferences(preferences)
      }
      AsyncFunction("getCurrentSelection") Coroutine { view: InboxReaderView ->
        view.getCurrentSelection()
      }
      AsyncFunction("clearSelection") { view: InboxReaderView ->
        view.clearSelection()
      }
    }
  }

  private companion object {
    const val READIUM_VERSION = "3.3.0"
  }
}

@OptIn(ExperimentalReadiumApi::class)
class InboxReaderView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  override val shouldUseAndroidLayout = true

  var fileUri: String? = null
  var initialLocator: String? = null
  var initialReadingOrderIndex: Int? = null
  var initialProgression: Double? = null
  var preferences: Map<String, Any?>? = null
  var decorations: List<Map<String, Any?>> = emptyList()

  private val onReady by EventDispatcher()
  private val onLocationChange by EventDispatcher()
  private val onSelectionChange by EventDispatcher()
  private val onError by EventDispatcher()
  private val onExternalLink by EventDispatcher()
  private val onTap by EventDispatcher()
  private val onDecorationPress by EventDispatcher()

  private val container = FragmentContainerView(context).also {
    it.id = View.generateViewId()
    it.setBackgroundColor(Color.TRANSPARENT)
    addView(it, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  private val readium = InboxReadium(context.applicationContext)
  private var loadJob: Job? = null
  private var loadedUri: String? = null
  private var fragmentTag: String? = null
  private var currentPublication: Publication? = null
  private var currentFragment: InboxReadiumFragment? = null
  private var pendingDecorations: List<Map<String, Any?>> = emptyList()

  override fun onAttachedToWindow() {
    super.onAttachedToWindow()
    loadIfNeeded()
  }

  fun loadIfNeeded() {
    val nextUri = fileUri?.takeIf { it.isNotBlank() } ?: return
    if (!isAttachedToWindow || loadedUri == nextUri) {
      currentFragment?.submitPreferences(preferences.toEpubPreferences())
      return
    }

    val activity = appContext.currentActivity as? FragmentActivity
    if (activity == null) {
      Log.e(TAG, "Current activity cannot host Readium: ${appContext.currentActivity?.javaClass?.name}")
      emitError("Current Android activity cannot host Readium.")
      return
    }

    loadJob?.cancel()
    loadJob = appContext.backgroundCoroutineScope.launch {
      runCatching {
        readium.open(nextUri)
      }.onSuccess { publication ->
        withContext(Dispatchers.Main) {
          mount(activity, nextUri, publication)
        }
      }.onFailure {
        withContext(Dispatchers.Main) {
          Log.e(TAG, "Failed to open publication", it)
          emitError(it.message ?: "Readium failed to open publication.")
        }
      }
    }
  }

  fun dispose() {
    loadJob?.cancel()
    loadJob = null
    val activity = appContext.currentActivity as? FragmentActivity
    val tag = fragmentTag
    if (activity != null && tag != null) {
      activity.supportFragmentManager.findFragmentByTag(tag)?.let { fragment ->
        activity.supportFragmentManager.commitNow(allowStateLoss = true) {
          remove(fragment)
        }
      }
    }
    currentFragment = null
    fragmentTag = null
    loadedUri = null
    currentPublication?.close()
    currentPublication = null
  }

  fun goForward(animated: Boolean): Boolean =
    currentFragment?.goForward(animated) ?: false

  fun goBackward(animated: Boolean): Boolean =
    currentFragment?.goBackward(animated) ?: false

  fun goToLocator(locator: String, animated: Boolean): Boolean {
    val parsed = runCatching { Locator.fromJSON(JSONObject(locator)) }.getOrNull() ?: return false
    return currentFragment?.goToLocator(parsed, animated) ?: false
  }

  fun goToReadingOrder(index: Int, progression: Double?, animated: Boolean): Boolean =
    currentFragment?.goToReadingOrder(index, progression, animated) ?: false

  fun submitPreferences(nextPreferences: Map<String, Any?>) {
    preferences = nextPreferences
    currentFragment?.submitPreferences(nextPreferences.toEpubPreferences())
  }

  suspend fun getCurrentSelection(): Map<String, Any?>? =
    currentFragment?.getCurrentSelection()

  fun clearSelection() {
    currentFragment?.clearSelection()
  }

  fun applyDecorations(decorations: List<Map<String, Any?>>) {
    pendingDecorations = decorations
    currentFragment?.applyDecorations(decorations)
  }

  private fun mount(activity: FragmentActivity, uri: String, publication: Publication) {
    dispose()

    val tag = "InboxReadiumFragment-${container.id}"
    val fragment = InboxReadiumFragment().also {
      it.publication = publication
      it.initialLocator = initialLocatorForPublication(publication)
      it.initialPreferences = preferences.toEpubPreferences()
      it.onReady = { onReady(emptyMap<String, Any>()) }
      it.onError = { emitError(it) }
      it.onExternalLink = { url -> onExternalLink(mapOf<String, Any>("url" to url.toString())) }
      it.onTap = { zone, x, y -> onTap(mapOf<String, Any>("zone" to zone, "x" to x, "y" to y)) }
      it.onDecorationActivated = { id -> onDecorationPress(mapOf<String, Any>("id" to id)) }
      it.onSelectionChange = { selection ->
        onSelectionChange(selection ?: mapOf<String, Any>("selectedText" to ""))
      }
      it.onLocationChange = { locator ->
        val payload = mutableMapOf<String, Any>("locator" to locator.toJSON().toString())
        locator.locations.progression?.let { progression -> payload["progression"] = progression }
        locator.locations.totalProgression?.let { progression -> payload["totalProgression"] = progression }
        locator.locations.position?.let { position -> payload["position"] = position }
        onLocationChange(payload)
      }
    }

    activity.supportFragmentManager.commitNow(allowStateLoss = true) {
      replace(container.id, fragment, tag)
    }

    currentPublication = publication
    currentFragment = fragment
    fragmentTag = tag
    loadedUri = uri
    fragment.applyDecorations(pendingDecorations)
    requestLayout()
  }

  private fun emitError(message: String) {
    Log.e(TAG, message)
    onError(mapOf<String, Any>("message" to message))
  }

  override fun onLayout(changed: Boolean, left: Int, top: Int, right: Int, bottom: Int) {
    super.onLayout(changed, left, top, right, bottom)
    container.layout(0, 0, right - left, bottom - top)
  }

  private fun initialLocatorForPublication(publication: Publication): Locator? {
    val readingOrderLocator = initialReadingOrderIndex
      ?.let { index -> publication.readingOrder.getOrNull(index) }
      ?.let { link -> publication.locatorFromLink(link) }
      ?.withProgression(initialProgression)
    if (readingOrderLocator != null) {
      return readingOrderLocator
    }

    return initialLocator
      ?.let { raw -> runCatching { Locator.fromJSON(JSONObject(raw)) }.getOrNull() }
      ?.withProgression(initialProgression)
  }
}

@OptIn(ExperimentalReadiumApi::class)
class InboxReadiumFragment : Fragment(), EpubNavigatorFragment.Listener {
  var publication: Publication? = null
  var initialLocator: Locator? = null
  var initialPreferences: EpubPreferences = EpubPreferences()
  var onReady: () -> Unit = {}
  var onError: (String) -> Unit = {}
  var onExternalLink: (AbsoluteUrl) -> Unit = {}
  var onLocationChange: (Locator) -> Unit = {}
  var onSelectionChange: (Map<String, Any>?) -> Unit = {}
  var onTap: (String, Float, Float) -> Unit = { _, _, _ -> }
  var onDecorationActivated: (String) -> Unit = {}

  private var navigator: EpubNavigatorFragment? = null
  private var containerId: Int = View.NO_ID
  private var pendingDecorations: List<Map<String, Any?>> = emptyList()
  private var selectionJob: Job? = null
  private var decorationJob: Job? = null
  private var lastDecoratedHref: String? = null
  private var latestLocatorHref: String? = null
  private val decorationListener = object : DecorableNavigator.Listener {
    override fun onDecorationActivated(event: DecorableNavigator.OnActivatedEvent): Boolean {
      this@InboxReadiumFragment.onDecorationActivated(event.decoration.id)
      return true
    }
  }

  override fun onCreate(savedInstanceState: Bundle?) {
    val currentPublication = publication
    childFragmentManager.fragmentFactory =
      if (currentPublication == null) {
        EpubNavigatorFragment.createDummyFactory()
      } else {
        EpubNavigatorFactory(
          publication = currentPublication,
          configuration = EpubNavigatorFactory.Configuration(
            defaults = EpubDefaults(
              fontSize = initialPreferences.fontSize,
              lineHeight = initialPreferences.lineHeight,
              pageMargins = initialPreferences.pageMargins,
              scroll = initialPreferences.scroll
            )
          )
        ).createFragmentFactory(
          initialLocator = initialLocator,
          initialPreferences = initialPreferences,
          listener = this,
          configuration = EpubNavigatorFragment.Configuration(
            decorationTemplates = HtmlDecorationTemplates.defaultTemplates(
              Color.parseColor("#F6D46A"),
              4,
              4,
              0.72
            ),
            selectionActionModeCallback = object : BaseActionModeCallback() {
              override fun onCreateActionMode(mode: ActionMode, menu: Menu): Boolean {
                syncSelectionLater(80)
                return true
              }

              override fun onPrepareActionMode(mode: ActionMode, menu: Menu): Boolean {
                syncSelectionLater(80)
                return false
              }

              override fun onActionItemClicked(mode: ActionMode, item: MenuItem): Boolean {
                syncSelectionLater(80)
                return false
              }

              override fun onDestroyActionMode(mode: ActionMode) {
                syncSelectionLater(80)
              }
            }
          )
        )
      }

    super.onCreate(savedInstanceState)
  }

  override fun onCreateView(
    inflater: android.view.LayoutInflater,
    container: ViewGroup?,
    savedInstanceState: Bundle?,
  ): View {
    containerId = View.generateViewId()
    return FrameLayout(requireContext()).also {
      it.id = containerId
      it.layoutParams = ViewGroup.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.MATCH_PARENT
      )
    }
  }

  override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
    super.onViewCreated(view, savedInstanceState)
    if (publication == null) {
      onError("Readium publication was not restored.")
      return
    }

    if (savedInstanceState == null) {
      childFragmentManager.commitNow {
        add(containerId, EpubNavigatorFragment::class.java, Bundle(), NAVIGATOR_TAG)
      }
    }

    navigator = childFragmentManager.findFragmentByTag(NAVIGATOR_TAG) as? EpubNavigatorFragment
    val currentNavigator = navigator ?: run {
      onError("Readium navigator was not created.")
      return
    }

    currentNavigator.addInputListener(object : InputListener {
      override fun onTap(event: TapEvent): Boolean {
        val width = view.width.toFloat().coerceAtLeast(1f)
        val zone = when {
          event.point.x < width * 0.33f -> "left"
          event.point.x > width * 0.67f -> "right"
          else -> "center"
        }
        onTap(zone, event.point.x, event.point.y)
        syncSelectionLater()
        return true
      }

      override fun onDrag(event: DragEvent): Boolean {
        if (event.type == DragEvent.Type.End) {
          syncSelectionLater()
        }
        return false
      }

      override fun onKey(event: KeyEvent): Boolean = false
    })
    currentNavigator.addDecorationListener(DECORATION_GROUP, decorationListener)

    onReady()
    viewLifecycleOwner.lifecycleScope.launch {
      viewLifecycleOwner.repeatOnLifecycle(Lifecycle.State.STARTED) {
        currentNavigator.currentLocator.collectLatest { locator ->
          onLocationChange(locator)
          val href = locator.href.toString()
          latestLocatorHref = href
          if (pendingDecorations.isNotEmpty() && href != lastDecoratedHref) {
            lastDecoratedHref = href
            syncDecorationsLater(120)
          }
        }
      }
    }
  }

  override fun onDestroyView() {
    decorationJob?.cancel()
    selectionJob?.cancel()
    decorationJob = null
    selectionJob = null
    navigator?.removeDecorationListener(decorationListener)
    super.onDestroyView()
  }

  fun submitPreferences(preferences: EpubPreferences) {
    initialPreferences = preferences
    navigator?.submitPreferences(preferences)
  }

  fun goForward(animated: Boolean): Boolean =
    navigator?.goForward(animated) ?: false

  fun goBackward(animated: Boolean): Boolean =
    navigator?.goBackward(animated) ?: false

  fun goToLocator(locator: Locator, animated: Boolean): Boolean =
    navigator?.go(locator, animated) ?: false

  fun goToReadingOrder(index: Int, progression: Double?, animated: Boolean): Boolean {
    val currentPublication = publication ?: return false
    val link = currentPublication.readingOrder.getOrNull(index) ?: return false
    val baseLocator = currentPublication.locatorFromLink(link) ?: return false
    val targetLocator = baseLocator.withProgression(progression)
    val didGo = navigator?.go(targetLocator, animated) ?: false
    if (didGo) {
      onLocationChange(targetLocator)
      latestLocatorHref = targetLocator.href.toString()
      syncDecorationsLater(160)
    }
    return didGo
  }

  suspend fun getCurrentSelection(): Map<String, Any>? =
    currentSelectionPayload()

  private suspend fun currentSelectionPayload(): Map<String, Any>? {
    val selection = navigator?.currentSelection() ?: return null
    val locator = selection.locator
    val rect = selection.rect
    val payload = mutableMapOf<String, Any>(
      "locator" to locator.toJSON().toString(),
      "selectedText" to (locator.text.highlight ?: ""),
      "before" to (locator.text.before ?: ""),
      "after" to (locator.text.after ?: ""),
      "href" to locator.href.toString()
    )
    rect?.let {
      val density = resources.displayMetrics.density.takeIf { value -> value > 0f } ?: 1f
      payload["x"] = it.centerX() / density
      payload["y"] = it.centerY() / density
      payload["width"] = it.width() / density
      payload["height"] = it.height() / density
    }
    return payload
  }

  fun clearSelection() {
    navigator?.clearSelection()
    selectionJob?.cancel()
    onSelectionChange(null)
  }

  private fun syncSelectionLater(delayMs: Long = 140) {
    selectionJob?.cancel()
    selectionJob = viewLifecycleOwner.lifecycleScope.launch {
      delay(delayMs)
      onSelectionChange(currentSelectionPayload())
    }
  }

  fun applyDecorations(decorations: List<Map<String, Any?>>) {
    pendingDecorations = decorations
    lastDecoratedHref = null
    syncDecorationsLater(160)
  }

  private fun syncDecorationsLater(delayMs: Long = 0) {
    decorationJob?.cancel()
    val currentNavigator = navigator ?: return
    if (latestLocatorHref == null) {
      return
    }
    decorationJob = viewLifecycleOwner.lifecycleScope.launch {
      if (delayMs > 0) {
        delay(delayMs)
      }
      val decorations = pendingDecorations.mapNotNull { it.toDecoration() }
      if (BuildConfig.DEBUG) {
        Log.d(TAG, "Apply decorations count=${decorations.size} currentHref=$latestLocatorHref sample=${decorations.debugSummary()}")
      }
      for (retryDelay in listOf(0L, 240L, 700L, 1400L, 2600L)) {
        if (retryDelay > 0) {
          delay(retryDelay)
        }
        runCatching {
          val result = currentNavigator.evaluateJavascript(readiumDecorationScript(decorations))
          if (BuildConfig.DEBUG && retryDelay == 700L) {
            Log.d(TAG, "Inbox decorations $result")
          }
        }.onFailure {
          Log.d(TAG, "Decoration apply deferred: ${it.message}")
        }
      }
    }
  }

  override fun onExternalLinkActivated(url: AbsoluteUrl) {
    onExternalLink(url)
  }

  override fun shouldFollowInternalLink(link: Link, context: HyperlinkNavigator.LinkContext?): Boolean =
    true

  override fun onResourceLoadFailed(href: Url, error: org.readium.r2.shared.util.data.ReadError) {
    Log.e(TAG, "Resource load failed href=$href message=${error.message}")
    onError(error.message)
  }

  companion object {
    private const val NAVIGATOR_TAG = "InboxEpubNavigator"
  }
}

private fun Map<String, Any?>.toDecoration(): Decoration? {
  val id = this["id"] as? String ?: return null
  val locator = (this["locator"] as? String)
    ?.let { raw -> runCatching { Locator.fromJSON(JSONObject(raw)) }.getOrNull() }
    ?: return null
  val style = when (this["type"] as? String) {
    "note" -> Decoration.Style.Underline(Color.parseColor("#8FB8FF"), true)
    else -> Decoration.Style.Highlight(Color.parseColor("#F6D46A"), true)
  }
  return Decoration(id, locator, style, emptyMap())
}

private fun readiumDecorationScript(decorations: List<Decoration>): String {
  val payload = JSONArray().apply {
    decorations.forEach { decoration ->
      val styleName = when (decoration.style) {
        is Decoration.Style.Underline -> "inboxUnderline"
        else -> "inboxHighlight"
      }
      val element = when (decoration.style) {
        is Decoration.Style.Underline ->
          "<div style=\"position:relative;width:100%;height:100%;box-sizing:border-box;overflow:visible;\"><div style=\"position:absolute;left:0;right:0;bottom:-.3em;border-bottom:2px dotted rgba(96,122,190,.95);\"></div></div>"
        else ->
          "<div style=\"position:relative;width:100%;height:100%;box-sizing:border-box;overflow:visible;\"><div style=\"position:absolute;left:0;right:0;bottom:-.28em;border-bottom:2px solid rgba(47,107,79,.82);\"></div></div>"
      }
      put(
        JSONObject()
          .put("id", decoration.id)
          .put("locator", decoration.locator.toJSON())
          .put("style", styleName)
          .put("element", element)
      )
    }
  }.toString()
  val group = JSONObject.quote(DECORATION_GROUP)

  return """
    (function(decorations) {
      if (!window.readium || !readium.getDecorations || !readium.registerDecorationTemplates) {
        return JSON.stringify({ items: -1, missingReadium: true });
      }
      readium.registerDecorationTemplates({
        inboxHighlight: { layout: "boxes", width: "wrap" },
        inboxUnderline: { layout: "boxes", width: "wrap" }
      });
      var group = readium.getDecorations($group);
      group.clear();
      decorations.forEach(function(decoration) {
        group.add(decoration);
      });
      group.requestLayout();
      return JSON.stringify({ items: group.items.length });
    })($payload);
  """.trimIndent()
}

private fun List<Decoration>.debugSummary(): String =
  take(4).joinToString(separator = " | ") { decoration ->
    val href = decoration.locator.href.toString()
    val selector = decoration.locator.locations["cssSelector"] as? String ?: "-"
    val text = decoration.locator.text
    val highlight = text.highlight ?: "-"
    val beforeLength = text.before?.length ?: 0
    val afterLength = text.after?.length ?: 0
    "${decoration.id}:$href:$selector:$highlight:b$beforeLength/a$afterLength"
  }

private class InboxReadium(context: Context) {
  private val httpClient = DefaultHttpClient()
  private val assetRetriever = AssetRetriever(context.contentResolver, httpClient)
  private val publicationOpener = PublicationOpener(
    publicationParser = DefaultPublicationParser(
      context = context,
      httpClient = httpClient,
      assetRetriever = assetRetriever,
      pdfFactory = null
    )
  )

  @OptIn(ExperimentalReadiumApi::class)
  suspend fun open(fileUri: String): Publication {
    val uri = Uri.parse(fileUri)
    val asset = if (uri.scheme == "file" || uri.scheme.isNullOrBlank()) {
      val file = File(uri.path ?: fileUri)
      if (!file.isFile) {
        error("Publication file does not exist: ${file.path}")
      }
      assetRetriever.retrieve(file).getOrElse {
        error(it.message)
      }
    } else {
      val url = uri.toAbsoluteUrl()
        ?: error("Invalid publication URI.")
      assetRetriever.retrieve(url).getOrElse {
        error(it.message)
      }
    }
    val publication = publicationOpener.open(asset, allowUserInteraction = false).getOrElse {
      error(it.message)
    }
    if (publication.isRestricted) {
      error(publication.protectionError?.message ?: "Publication is protected.")
    }
    if (!publication.conformsTo(Publication.Profile.EPUB) && !publication.readingOrder.allAreHtml) {
      publication.close()
      error("Only reflowable EPUB publications are supported by this reader.")
    }
    return publication
  }
}

@OptIn(ExperimentalReadiumApi::class)
private fun Map<String, Any?>?.toEpubPreferences(): EpubPreferences {
  val map = this ?: emptyMap()
  val readerTheme = map["readerTheme"] as? String
  val readingMode = map["readingMode"] as? String

  return EpubPreferences(
    backgroundColor = readerTheme.backgroundColor(),
    textColor = readerTheme.textColor(),
    fontFamily = (map["fontFamily"] as? String).fontFamily(),
    fontSize = map.double("fontSize")?.let { (it / 19.0).coerceIn(0.7, 2.4) },
    lineHeight = map.double("lineHeight")?.coerceIn(1.0, 2.4),
    pageMargins = map.double("margin")?.let { (it / 22.0).coerceIn(0.2, 3.0) },
    publisherStyles = false,
    scroll = readingMode == "scroll",
    theme = when (readerTheme) {
      "night" -> Theme.DARK
      "sepia" -> Theme.SEPIA
      else -> Theme.LIGHT
    }
  )
}

private fun Map<String, Any?>.double(key: String): Double? =
  when (val value = this[key]) {
    is Number -> value.toDouble()
    is String -> value.toDoubleOrNull()
    else -> null
  }

private fun Locator.withProgression(progression: Double?): Locator {
  val targetProgression = progression
    ?.takeUnless { it.isNaN() }
    ?.coerceIn(0.0, 0.999)
  return if (targetProgression == null) {
    this
  } else {
    copyWithLocations(progression = targetProgression)
  }
}

@OptIn(ExperimentalReadiumApi::class)
private fun String?.fontFamily(): FontFamily? =
  when (this) {
    "serif" -> FontFamily.SERIF
    "sans" -> FontFamily.SANS_SERIF
    "kai" -> FontFamily.CURSIVE
    else -> null
  }

private fun String?.backgroundColor(): ReadiumColor? =
  when (this) {
    "night" -> ReadiumColor(Color.parseColor("#101411"))
    "sepia" -> ReadiumColor(Color.parseColor("#F4E7D0"))
    "eink" -> ReadiumColor(Color.parseColor("#FAFAF7"))
    else -> ReadiumColor(Color.parseColor("#FFF8F0"))
  }

private fun String?.textColor(): ReadiumColor? =
  when (this) {
    "night" -> ReadiumColor(Color.parseColor("#EAF1E8"))
    else -> ReadiumColor(Color.parseColor("#2B2118"))
  }

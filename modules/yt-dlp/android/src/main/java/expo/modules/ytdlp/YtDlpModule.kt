package expo.modules.ytdlp
import android.util.Log
import android.content.Context
import com.yausername.ffmpeg.FFmpeg
import com.yausername.youtubedl_android.YoutubeDL
import com.yausername.youtubedl_android.YoutubeDLRequest
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.Exceptions
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import kotlin.concurrent.thread

class YtDlpModule : Module() {
  @Volatile private var ready = false
  private val lock = Any()

  private val context: Context
    get() = appContext.reactContext ?: throw Exceptions.ReactContextLost()

  // Unpacks Python + yt-dlp + ffmpeg on first use
  private fun ensureInit() {
    if (ready) return
    synchronized(lock) {
      if (ready) return
      YoutubeDL.getInstance().init(context)
      FFmpeg.getInstance().init(context)
      ready = true
    }
  }

    private fun describe(e: Throwable): String =
    generateSequence(e) { it.cause }
      .joinToString(" <- ") { "${it.javaClass.simpleName}: ${it.message}" }

  override fun definition() = ModuleDefinition {
    Name("YtDlp")
    Events("onProgress")

     AsyncFunction("init") { promise: Promise ->
      thread {
        try {
          ensureInit()
          promise.resolve(null)
        } catch (e: Throwable) {
          Log.e("YtDlp", "init failed", e)
          promise.reject("INIT_FAILED", describe(e), e)
        }
      }
    }

    // Updates yt-dlp to the latest version (keeps YouTube working)
    AsyncFunction("update") { promise: Promise ->
      thread {
        try {
          ensureInit()
          val status = YoutubeDL.getInstance().updateYoutubeDL(context)
          promise.resolve(status?.name ?: "UNKNOWN")
        } catch (e: Throwable) {
          promise.reject("UPDATE_FAILED", e.message ?: "Update failed", e)
        }
      }
    }

    // Returns yt-dlp's full JSON info for a link
    AsyncFunction("getInfo") { url: String, promise: Promise ->
      thread {
        try {
          ensureInit()
          val request = YoutubeDLRequest(url).apply {
            addOption("--dump-single-json")
            addOption("--no-playlist")
            addOption("--no-warnings")
          }
          promise.resolve(YoutubeDL.getInstance().execute(request).out)
        } catch (e: Throwable) {
          promise.reject("INFO_FAILED", e.message ?: "Could not read this link", e)
        }
      }
    }

    // Downloads with the given yt-dlp args, sends progress, returns file path
    AsyncFunction("download") { url: String, args: List<String>, processId: String, promise: Promise ->
      thread {
        val dir = File(context.cacheDir, "ytdlp/$processId").apply {
          deleteRecursively()
          mkdirs()
        }
        try {
          ensureInit()
          val request = YoutubeDLRequest(url).apply {
            addOption("--no-playlist")
            addOption("--restrict-filenames")
            addOption("-o", File(dir, "%(title).60s.%(ext)s").absolutePath)
            addCommands(args)
          }
          YoutubeDL.getInstance().execute(
            request,
            processId = processId,
            callback = { progress, eta, _ ->
              sendEvent("onProgress", mapOf("id" to processId, "progress" to progress.toDouble(), "eta" to eta))
            }
          )
          val file = dir.listFiles()
            ?.filter { it.isFile && !it.name.endsWith(".part") && !it.name.endsWith(".ytdl") }
            ?.maxByOrNull { it.length() }
            ?: throw Exception("File was not created")
          promise.resolve(file.absolutePath)
        } catch (e: YoutubeDL.CanceledException) {
          dir.deleteRecursively()
          promise.reject("CANCELLED", "Download cancelled", e)
        } catch (e: Throwable) {
          dir.deleteRecursively()
          promise.reject("DOWNLOAD_FAILED", e.message ?: "Download failed", e)
        }
      }
    }

    Function("cancel") { processId: String ->
      YoutubeDL.getInstance().destroyProcessById(processId)
    }
  }
}
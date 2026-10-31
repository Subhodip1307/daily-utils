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
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min



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

      private val ffmpegProcesses = ConcurrentHashMap<String, Process>()
  private val cancelledFfmpeg = ConcurrentHashMap.newKeySet<String>()

  // Runs the ffmpeg binary that youtubedl-android bundles
  private fun ffmpegCommand(args: List<String>): ProcessBuilder {
    val bin = File(context.applicationInfo.nativeLibraryDir, "libffmpeg.so")
    if (!bin.exists()) throw Exception("ffmpeg binary not found")
    val packages = File(context.noBackupFilesDir, "youtubedl-android/packages")
    val libDirs = (packages.listFiles() ?: emptyArray())
      .map { File(it, "usr/lib") }
      .filter { it.isDirectory }
      .map { it.absolutePath }
    return ProcessBuilder(listOf(bin.absolutePath) + args).apply {
      environment()["LD_LIBRARY_PATH"] =
        (libDirs + context.applicationInfo.nativeLibraryDir).joinToString(":")
    }
  }

  override fun definition() = ModuleDefinition {
    Name("YtDlp")
        Events("onProgress", "onFfmpegProgress")

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
        // Run any ffmpeg command; sends progress as "time=" seconds
    AsyncFunction("ffmpeg") { args: List<String>, processId: String, promise: Promise ->
      thread {
        try {
          ensureInit()
          val process = ffmpegCommand(listOf("-hide_banner", "-nostdin", "-y") + args)
            .redirectErrorStream(true)
            .start()
          ffmpegProcesses[processId] = process

          val lastLines = ArrayDeque<String>()
          val timeRe = Regex("time=(\\d+):(\\d+):(\\d+(?:\\.\\d+)?)")
          process.inputStream.bufferedReader().forEachLine { line ->
            lastLines.addLast(line)
            if (lastLines.size > 15) lastLines.removeFirst()
            timeRe.findAll(line).lastOrNull()?.let { m ->
              val (h, mi, s) = m.destructured
              sendEvent(
                "onFfmpegProgress",
                mapOf("id" to processId, "time" to h.toDouble() * 3600 + mi.toDouble() * 60 + s.toDouble())
              )
            }
          }

          val code = process.waitFor()
          ffmpegProcesses.remove(processId)
          when {
            cancelledFfmpeg.remove(processId) -> promise.reject("CANCELLED", "Cancelled", null)
            code == 0 -> promise.resolve(null)
            else -> promise.reject("FFMPEG_FAILED", lastLines.joinToString("\n"), null)
          }
        } catch (e: Throwable) {
          ffmpegProcesses.remove(processId)
          promise.reject("FFMPEG_FAILED", describe(e), e)
        }
      }
    }

    Function("cancelFfmpeg") { processId: String ->
      cancelledFfmpeg.add(processId)
      ffmpegProcesses[processId]?.destroy()
    }

    // Returns `buckets` peak values (0..1) for drawing a waveform
    AsyncFunction("waveform") { path: String, buckets: Int, promise: Promise ->
      thread {
        try {
          ensureInit()
          val process = ffmpegCommand(
            listOf("-hide_banner", "-nostdin", "-v", "error", "-i", path,
              "-vn", "-ac", "1", "-ar", "2000", "-f", "s16le", "-")
          ).start()
          thread { process.errorStream.readBytes() } // drain stderr
          val bytes = process.inputStream.readBytes()
          process.waitFor()

          val samples = bytes.size / 2
          if (samples == 0) throw Exception("No audio found")
          val buf = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN).asShortBuffer()
          val per = max(1, samples / buckets)
          val peaks = DoubleArray(buckets)
          var top = 1.0
          for (b in 0 until buckets) {
            val from = b * per
            if (from >= samples) break
            val to = min(samples, from + per)
            var peak = 0
            for (i in from until to) {
              val v = abs(buf.get(i).toInt())
              if (v > peak) peak = v
            }
            peaks[b] = peak.toDouble()
            if (peak > top) top = peak.toDouble()
          }
          promise.resolve(peaks.map { it / top })
        } catch (e: Throwable) {
          promise.reject("WAVEFORM_FAILED", describe(e), e)
        }
      }
    }


  }
}
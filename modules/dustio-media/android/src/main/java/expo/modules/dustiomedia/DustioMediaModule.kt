package expo.modules.dustiomedia

import android.content.ContentUris
import android.content.Context
import android.net.Uri
import android.os.Build
import android.provider.MediaStore
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class DustioMediaModule : Module() {
  override fun definition() = ModuleDefinition {
    Name("DustioMedia")

    Function("canManageMedia") {
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@Function false
      }
      MediaStore.canManageMedia(requireContext())
    }

    AsyncFunction("deleteAsset") { assetId: String, mediaKind: String ->
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
        return@AsyncFunction false
      }

      val context = requireContext()
      if (!MediaStore.canManageMedia(context)) {
        return@AsyncFunction false
      }

      context.contentResolver.delete(assetUri(assetId, mediaKind), null, null) > 0
    }
  }

  private fun requireContext(): Context = requireNotNull(appContext.reactContext)

  private fun assetUri(assetId: String, mediaKind: String): Uri {
    if (assetId.startsWith("content://")) {
      return Uri.parse(assetId)
    }

    val collection = when (mediaKind) {
      "photo" -> MediaStore.Images.Media.EXTERNAL_CONTENT_URI
      "video" -> MediaStore.Video.Media.EXTERNAL_CONTENT_URI
      "audio" -> MediaStore.Audio.Media.EXTERNAL_CONTENT_URI
      else -> MediaStore.Files.getContentUri("external")
    }
    val numericId = assetId.toLongOrNull()
      ?: throw IllegalArgumentException("Identificador de mídia inválido.")
    return ContentUris.withAppendedId(collection, numericId)
  }
}

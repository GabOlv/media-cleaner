import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Library from "expo-media-library/legacy";
import * as FileSystem from "expo-file-system/legacy";
import {
  Folder,
  isProtected,
  MediaFile,
  MediaKind,
  normalizePath,
  Preferences,
} from "./model";

export function libraryUnavailable(types: MediaKind[]): string | null {
  return Platform.OS === "android" && Constants.executionEnvironment === "storeClient" && types.some((kind) => kind !== "audio")
    ? "O Expo Go no Android não permite acessar fotos e vídeos. Instale a versão Android do MediaCleaner para revisar seus arquivos."
    : null;
}

export async function permission(
  request = false,
  types: MediaKind[] = ["photo", "video", "audio"],
): Promise<boolean> {
  if (Platform.OS === "web") return false;
  const selected = [...new Set(types)];
  if (!selected.length) return false;
  const expoGo = Platform.OS === "android" && Constants.executionEnvironment === "storeClient";
  const unavailable = libraryUnavailable(selected);
  if (unavailable) throw new Error(unavailable);
  try {
    const response = request
      ? await Library.requestPermissionsAsync(false, selected)
      : await Library.getPermissionsAsync(false, selected);
    if (!response.granted && response.canAskAgain === false) {
      throw new Error("O acesso às mídias está bloqueado. Abra as configurações do celular e permita os tipos selecionados para este aplicativo.");
    }
    return response.granted;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const manifestMissing = /not declared in AndroidManifest/i.test(detail);
    const error = new Error(
      manifestMissing
        ? "Esta versão do aplicativo não inclui a permissão para os tipos de mídia selecionados. Instale uma versão Android com essas permissões configuradas."
        : `Não foi possível ${request ? "solicitar" : "consultar"} o acesso às mídias. ${expoGo ? "Instale a versão Android do MediaCleaner para acessar seus arquivos. " : ""}Confira as permissões nas configurações do celular e tente novamente.`,
    );
    Object.assign(error, { cause });
    throw error;
  }
}
async function resolve(asset: Library.Asset): Promise<MediaFile> {
  let uri = asset.uri;
  if (!uri.startsWith("file://")) {
    try {
      uri =
        (
          await Library.getAssetInfoAsync(asset, {
            shouldDownloadFromNetwork: false,
          })
        ).localUri || uri;
    } catch {
      /* Unknown path is handled conservatively by the scanner. */
    }
  }
  const path = uri.startsWith("file://")
    ? normalizePath(uri.slice(0, uri.lastIndexOf("/")))
    : undefined;
  return {
    id: asset.id,
    uri: Platform.OS === "ios" ? asset.uri : uri,
    filename: asset.filename,
    kind: asset.mediaType as MediaFile["kind"],
    created: asset.creationTime,
    path,
    albumId: asset.albumId,
  };
}
export async function scan(
  preferences: Preferences,
  reviewed: string[],
  limit: number,
  signal?: AbortSignal,
): Promise<{ files: MediaFile[]; unknown: number }> {
  if (!preferences.types.length || limit <= 0) return { files: [], unknown: 0 };
  if (!(await permission(false, preferences.types)))
    throw new Error("Permita o acesso às mídias para começar.");
  const files: MediaFile[] = [];
  let after: string | undefined;
  let unknown = 0;
  const seen = new Set(reviewed);
  if (!preferences.types.length || limit <= 0) return { files, unknown };
  do {
    if (signal?.aborted) throw new Error("Busca cancelada.");
    const page = await Library.getAssetsAsync({
      first: 200,
      after,
      mediaType: preferences.types,
      sortBy: [[Library.SortBy.creationTime, true]],
    });
    for (const asset of page.assets) {
      if (signal?.aborted) throw new Error("Busca cancelada.");
      if (seen.has(asset.id)) continue;
      seen.add(asset.id);
      const file = await resolve(asset);
      if (!file.path && preferences.protectedPaths.length) {
        unknown++;
        continue;
      }
      if (isProtected(file.path, preferences.protectedPaths)) continue;
      try {
        const info = await FileSystem.getInfoAsync(file.uri);
        if (info.exists && "size" in info) file.bytes = info.size;
      } catch {
        /* Unknown size stays unknown. */
      }
      files.push(file);
      if (files.length >= limit) return { files, unknown };
    }
    if (!page.hasNextPage || page.endCursor === after) break;
    after = page.endCursor;
  } while (after);
  return { files, unknown };
}
export async function discover(signal?: AbortSignal, types: MediaKind[] = ["photo", "video", "audio"]): Promise<Folder[]> {
  if (!types.length) return [];
  if (!(await permission(false, types)))
    throw new Error("Permita o acesso às mídias para encontrar suas pastas.");
  const folders = new Map<string, number>();
  let after: string | undefined;
  do {
    const page = await Library.getAssetsAsync({
      first: 200,
      after,
      mediaType: types,
    });
    for (const asset of page.assets) {
      if (signal?.aborted) throw new Error("Busca cancelada.");
      const { path } = await resolve(asset);
      if (!path) continue;
      let current = path;
      while (
        current &&
        current !== "/storage/emulated/0" &&
        current !== "/storage" &&
        current !== "/storage/emulated"
      ) {
        folders.set(current, (folders.get(current) || 0) + 1);
        current = current.slice(0, current.lastIndexOf("/"));
      }
    }
    if (!page.hasNextPage || page.endCursor === after) break;
    after = page.endCursor;
  } while (after);
  return [...folders]
    .map(([path, count]) => ({ path, count }))
    .sort((a, b) => a.path.localeCompare(b.path));
}
export async function remove(file: MediaFile): Promise<boolean> {
  if (file.demo || Platform.OS === "web")
    throw new Error("Arquivos de demonstração não podem ser apagados.");
  return Library.deleteAssetsAsync([file.id]);
}

export const demoFiles: MediaFile[] = Array.from({ length: 10 }, (_, i) => ({
  id: `demo-${i}`,
  uri: "",
  filename: [
    "Uma foto do passeio.jpg",
    "Print que ficou para depois.png",
    "Lembrança de domingo.jpg",
    "Receita enviada no grupo.jpg",
    "Foto repetida do jardim.jpg",
  ][i % 5],
  kind: "photo",
  created: new Date(2020, i, 8).getTime(),
  path:
    i % 2
      ? "/storage/emulated/0/Pictures/Screenshots"
      : "/storage/emulated/0/DCIM/Camera",
  bytes: (i + 1) * 420000,
  demo: true,
}));

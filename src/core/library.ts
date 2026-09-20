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
import { candidateWindow, selectWeighted } from "./selection";

export function libraryUnavailable(types: MediaKind[]): string | null {
  return Platform.OS === "android" && Constants.executionEnvironment === "storeClient" && types.some((kind) => kind !== "audio")
    ? "O Expo Go no Android não permite acessar fotos e vídeos. Instale a versão Android do Dustio para revisar seus arquivos."
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
        : `Não foi possível ${request ? "solicitar" : "consultar"} o acesso às mídias. ${expoGo ? "Instale a versão Android do Dustio para acessar seus arquivos. " : ""}Confira as permissões nas configurações do celular e tente novamente.`,
    );
    Object.assign(error, { cause });
    throw error;
  }
}
async function resolve(asset: Library.Asset): Promise<MediaFile> {
  // Keep the URI returned by getAssetsAsync. Resolving full asset info reads
  // EXIF metadata on Android and requires ACCESS_MEDIA_LOCATION, which Dustio
  // does not need for review or deletion.
  const uri = asset.uri || (asset as any).localUri || "";
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

async function addSize(file: MediaFile): Promise<MediaFile> {
  try {
    const info = await FileSystem.getInfoAsync(file.uri);
    if (info.exists && "size" in info) file.bytes = info.size;
  } catch {
    /* Unknown size stays unknown. */
  }
  return file;
}

export async function scan(
  preferences: Preferences,
  reviewed: string[],
  limit: number,
  signal?: AbortSignal,
  seed = "dustio",
): Promise<{ files: MediaFile[]; unknown: number }> {
  if (!preferences.types.length || limit <= 0) return { files: [], unknown: 0 };
  if (!(await permission(false, preferences.types)))
    throw new Error("Permita o acesso às mídias para começar.");
  const files: MediaFile[] = [];
  const window = candidateWindow(limit);
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
      files.push(file);
    }
    if (files.length >= window) break;
    if (!page.hasNextPage || page.endCursor === after) break;
    after = page.endCursor;
  } while (after);
  const selected = selectWeighted(files, limit, seed);
  return { files: await Promise.all(selected.map(addSize)), unknown };
}

/** Rehydrates the small persisted daily queue without requesting EXIF metadata. */
export async function loadQueued(
  preferences: Preferences,
  ids: string[],
  signal?: AbortSignal,
): Promise<{ files: MediaFile[]; missing: string[]; unknown: number }> {
  if (!ids.length || !preferences.types.length)
    return { files: [], missing: [...ids], unknown: 0 };
  if (!(await permission(false, preferences.types)))
    throw new Error("Permita o acesso às mídias para continuar a revisão.");

  const wanted = new Set(ids);
  const files = new Map<string, MediaFile>();
  let unknown = 0;
  let after: string | undefined;
  do {
    if (signal?.aborted) throw new Error("Busca cancelada.");
    const page = await Library.getAssetsAsync({
      first: 200,
      after,
      mediaType: preferences.types,
      sortBy: [[Library.SortBy.creationTime, true]],
    });
    for (const asset of page.assets) {
      if (!wanted.has(asset.id) || files.has(asset.id)) continue;
      const file = await resolve(asset);
      if (!file.path && preferences.protectedPaths.length) {
        unknown++;
        continue;
      }
      if (isProtected(file.path, preferences.protectedPaths)) continue;
      if (!preferences.types.includes(file.kind)) continue;
      files.set(asset.id, await addSize(file));
    }
    if (files.size >= wanted.size || !page.hasNextPage || page.endCursor === after) break;
    after = page.endCursor;
  } while (after);

  return {
    files: ids.map((id) => files.get(id)).filter((file): file is MediaFile => !!file),
    missing: ids.filter((id) => !files.has(id)),
    unknown,
  };
}

/** Checks the asset immediately before a destructive operation. */
export async function exists(file: MediaFile): Promise<boolean> {
  if (file.demo || Platform.OS === "web") return true;
  try {
    let after: string | undefined;
    do {
      const page = await Library.getAssetsAsync({
        first: 200,
        after,
        mediaType: [file.kind],
        sortBy: [[Library.SortBy.creationTime, true]],
      });
      if (page.assets.some((asset) => asset.id === file.id)) return true;
      if (!page.hasNextPage || page.endCursor === after) return false;
      after = page.endCursor;
    } while (after);
    return false;
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    if (/not found|does not exist|no asset|unknown asset|deleted/i.test(detail)) return false;
    throw cause;
  }
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

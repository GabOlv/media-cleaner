import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { demoFiles, discover, libraryUnavailable, permission, remove, scan } from "./library";
import { loadJournal, saveJournal } from "./journal";
import {
  Folder,
  freshJournal,
  isProtected,
  Journal,
  localDay,
  MediaFile,
  Preferences,
  record,
  today,
} from "./model";
import { schedule } from "./reminders";

export type Tab = "home" | "mission" | "folders" | "more";

export function errorText(error: unknown): string {
  return error instanceof Error ? error.message : "Algo não deu certo. Tente novamente.";
}

export function useCleaner() {
  const [journal, setJournal] = useState<Journal | null>(null);
  const state = useRef<Journal | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [demo, setDemo] = useState(false);
  const demoRef = useRef(false);
  const real = useRef<Journal | null>(null);
  const [granted, setGranted] = useState(false);
  const [reduced, setReduced] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [message, setMessage] = useState("");
  const [files, setFiles] = useState<MediaFile[]>([]);
  const [searched, setSearched] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [folderLoading, setFolderLoading] = useState(false);
  const [folderError, setFolderError] = useState("");
  const [unsaved, setUnsaved] = useState(false);
  const abort = useRef<AbortController | null>(null);
  const folderAbort = useRef<AbortController | null>(null);
  const pending = useRef<Journal | null>(null);

  const publish = (next: Journal) => {
    state.current = next;
    setJournal(next);
  };

  const commit = async (next: Journal) => {
    if (!demoRef.current) await saveJournal(next);
    publish(next);
  };

  const initialize = useCallback(async () => {
    try {
      const loaded = await loadJournal();
      publish(loaded);
      if (Platform.OS !== "web")
        schedule(loaded.preferences).catch(() =>
          setMessage("O lembrete não pôde ser atualizado. Confira os Ajustes."),
        );
      const unavailable = libraryUnavailable(loaded.preferences.types);
      setGranted(false);
      if (!unavailable) setGranted(await permission(false, loaded.preferences.types));
    } catch (error) {
      setMessage(errorText(error));
    }
  }, []);

  useEffect(() => {
    initialize();
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const resume = AppState.addEventListener("change", async (value) => {
      if (value !== "active" || lock.current || demoRef.current) return;
      if (state.current && state.current.mission.date !== localDay()) {
        publish(today(state.current));
        setFiles([]);
        setSearched(false);
      }
      try {
        const types = state.current?.preferences.types ?? freshJournal().preferences.types;
        setGranted(false);
        if (!libraryUnavailable(types)) setGranted(await permission(false, types));
      } catch (error) {
        setGranted(false);
        setMessage(errorText(error));
      }
    });
    return () => {
      motion.remove();
      resume.remove();
      abort.current?.abort();
      folderAbort.current?.abort();
    };
  }, [initialize]);

  useEffect(() => {
    if (Platform.OS === "web") return;
    let dispose: (() => void) | undefined;
    let canceled = false;
    import("expo-notifications")
      .then(async (n) => {
        if (canceled) return;
        const sub = n.addNotificationResponseReceivedListener(() => setTab("mission"));
        dispose = () => sub.remove();
        const response = await n.getLastNotificationResponseAsync();
        if (!canceled && response) {
          setTab("mission");
          await n.clearLastNotificationResponseAsync();
        }
      })
      .catch(() => {});
    return () => {
      canceled = true;
      dispose?.();
    };
  }, []);

  async function access() {
    if (lock.current) return;
    lock.current = true;
    setBusy(true);
    try {
      setMessage("");
      const ok = await permission(true, state.current?.preferences.types);
      setGranted(ok);
      if (!ok) setMessage("O acesso não foi liberado. Confira as permissões do aplicativo.");
    } catch (error) {
      setGranted(false);
      setMessage(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function startMission() {
    if (lock.current || !state.current || pending.current) return;
    if (state.current.preferences.legacyPaths?.length) {
      setMessage("Confira as pastas da versão antiga antes da primeira revisão.");
      setTab("folders");
      return;
    }
    lock.current = true;
    setBusy(true);
    setMessage("");
    setTab("mission");
    const controller = new AbortController();
    abort.current = controller;
    try {
      const next = today(state.current);
      await commit(next);
      const remaining = Math.max(0, next.mission.target - next.mission.reviewed.length);
      const excluded = [...new Set([...next.ignoredIds, ...next.mission.reviewed])];
      const result = demoRef.current
        ? {
            files: demoFiles
              .filter(
                (file) =>
                  !excluded.includes(file.id) &&
                  !isProtected(file.path, next.preferences.protectedPaths),
              )
              .slice(0, remaining),
            unknown: 0,
          }
        : await scan(next.preferences, excluded, remaining, controller.signal);
      if (controller.signal.aborted) return;
      const available = next.mission.reviewed.length + result.files.length;
      if (available > 0 && available < next.mission.target)
        await commit({ ...next, mission: { ...next.mission, target: available } });
      setFiles(result.files);
      setSearched(true);
      if (result.unknown)
        setMessage("Alguns arquivos sem pasta identificável ficaram fora para respeitar suas proteções.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function completeReview(selectedIds: string[]) {
    if (lock.current || !state.current || pending.current) return;
    const selected = files.filter((file) => selectedIds.includes(file.id));
    const ignored = files.filter((file) => !selectedIds.includes(file.id));
    lock.current = true;
    setBusy(true);
    setDeleting(selected.length > 0);
    let next = state.current;
    const failed: MediaFile[] = [];
    let deletedCount = 0;
    let firstError = "";
    try {
      for (const file of selected) {
        try {
          const removed = demoRef.current || (await remove(file));
          if (!removed) {
            failed.push(file);
            continue;
          }
          next = record(next, file, true);
          deletedCount++;
        } catch (error) {
          failed.push(file);
          if (!firstError) firstError = errorText(error);
        }
      }
      for (const file of ignored) next = record(next, file, false);
      try {
        await commit(next);
      } catch (error) {
        pending.current = next;
        publish(next);
        setUnsaved(true);
        setFiles(failed);
        throw error;
      }
      setFiles(failed);
      setSearched(true);
      if (failed.length) {
        setMessage(firstError || `${failed.length} arquivo(s) não foram excluídos e continuam na lista.`);
      } else if (deletedCount) {
        setMessage(`${deletedCount} arquivo(s) excluído(s).`);
      } else {
        setMessage(`${ignored.length} arquivo(s) ignorado(s) nesta revisão.`);
      }
    } catch (error) {
      if (pending.current) setMessage("A operação foi concluída, mas o progresso não foi salvo. Toque em Salvar novamente.");
      else if (!firstError) setMessage(errorText(error));
    } finally {
      setDeleting(false);
      lock.current = false;
      setBusy(false);
    }
  }

  async function resetIgnored() {
    if (!state.current || lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    try {
      await commit({ ...state.current, ignoredIds: [] });
      setFiles([]);
      setSearched(false);
      setMessage("A lista de itens ignorados foi redefinida.");
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function updatePreferences(change: Partial<Preferences>) {
    if (!state.current || lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    try {
      let next: Journal = {
        ...state.current,
        preferences: { ...state.current.preferences, ...change },
      };
      if (change.batchSize && next.mission.reviewed.length === 0)
        next = { ...next, mission: { ...next.mission, target: change.batchSize } };
      if (
        (change.reminder !== undefined ||
          change.reminderTimes !== undefined ||
          change.batchSize !== undefined) &&
        !demoRef.current && Platform.OS !== "web"
      ) {
        const ok = await schedule(next.preferences, change.reminder === true);
        if (!ok && next.preferences.reminder) {
          next = { ...next, preferences: { ...next.preferences, reminder: false } };
          setMessage("Ative as notificações nas configurações do celular para usar os lembretes.");
        }
      }
      await commit(next);
      if (change.protectedPaths || change.types || change.batchSize) {
        setFiles([]);
        setSearched(false);
      }
      if (change.types && !demoRef.current) {
        setGranted(false);
        if (!libraryUnavailable(next.preferences.types))
          setGranted(await permission(false, next.preferences.types));
      }
    } catch (error) {
      setMessage(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function loadFolders() {
    setFolderError("");
    setFolderLoading(true);
    setFolders([]);
    folderAbort.current?.abort();
    const controller = new AbortController();
    folderAbort.current = controller;
    try {
      const list = demoRef.current
        ? [
            { path: "/storage/emulated/0/Music", count: 32 },
            { path: "/storage/emulated/0/DCIM", count: 5 },
            { path: "/storage/emulated/0/DCIM/Camera", count: 5 },
            { path: "/storage/emulated/0/Pictures/Screenshots", count: 5 },
          ]
        : await discover(controller.signal, state.current?.preferences.types);
      if (!controller.signal.aborted) setFolders(list);
    } catch (error) {
      if (!controller.signal.aborted) setFolderError(errorText(error));
    } finally {
      if (!controller.signal.aborted) setFolderLoading(false);
    }
  }

  function switchDemo() {
    if (lock.current || pending.current) return;
    if (demoRef.current) {
      demoRef.current = false;
      setDemo(false);
      if (real.current) publish(today(real.current));
    } else {
      real.current = state.current;
      demoRef.current = true;
      setDemo(true);
      publish(freshJournal());
    }
    setFiles([]);
    setSearched(false);
    setMessage("");
    setTab("home");
  }

  async function retrySave() {
    try {
      if (pending.current) await saveJournal(pending.current);
      pending.current = null;
      setUnsaved(false);
      setMessage("Progresso salvo.");
    } catch (error) {
      setMessage(errorText(error));
    }
  }

  return {
    journal,
    tab,
    setTab,
    demo,
    granted,
    reduced,
    busy,
    message,
    setMessage,
    files,
    searched,
    deleting,
    libraryUnavailable: libraryUnavailable(journal?.preferences.types ?? freshJournal().preferences.types),
    folders,
    folderLoading,
    folderError,
    unsaved,
    retrySave,
    initialize,
    access,
    startMission,
    completeReview,
    resetIgnored,
    updatePreferences,
    loadFolders,
    switchDemo,
    cancelScan: () => abort.current?.abort(),
    cancelFolders: () => folderAbort.current?.abort(),
  };
}

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
export function errorText(error: unknown) {
  return error instanceof Error
    ? error.message
    : "Algo não deu certo. Tente novamente.";
}
export function useCleaner() {
  const [journal, setJournal] = useState<Journal | null>(null),
    state = useRef<Journal | null>(null);
  const [tab, setTab] = useState<Tab>("home");
  const [demo, setDemo] = useState(false),
    demoRef = useRef(false),
    real = useRef<Journal | null>(null);
  const [granted, setGranted] = useState(false),
    [reduced, setReduced] = useState(false);
  const [busy, setBusy] = useState(false),
    lock = useRef(false);
  const [message, setMessage] = useState(""),
    [files, setFiles] = useState<MediaFile[]>([]),
    [searched, setSearched] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [folders, setFolders] = useState<Folder[]>([]),
    [folderLoading, setFolderLoading] = useState(false),
    [folderError, setFolderError] = useState("");
  const abort = useRef<AbortController | null>(null),
    folderAbort = useRef<AbortController | null>(null);
  const pending = useRef<Journal | null>(null),
    [unsaved, setUnsaved] = useState(false);
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
          setMessage("Seu lembrete não pôde ser agendado. Confira os Ajustes."),
        );
      const unavailable = libraryUnavailable(loaded.preferences.types);
      setGranted(false);
      if (!unavailable)
        setGranted(await permission(false, loaded.preferences.types));
    } catch (error) {
      setMessage(errorText(error));
    }
  }, []);
  useEffect(() => {
    initialize();
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const motion = AccessibilityInfo.addEventListener(
      "reduceMotionChanged",
      setReduced,
    );
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
    let dispose: (() => void) | undefined,
      canceled = false;
    import("expo-notifications")
      .then(async (n) => {
        if (canceled) return;
        const sub = n.addNotificationResponseReceivedListener(() =>
          setTab("mission"),
        );
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
      if (!ok)
        setMessage(
          "O acesso não foi liberado. Você pode autorizá-lo nas configurações do celular.",
        );
    } catch (e) {
      setGranted(false);
      setMessage(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function startMission() {
    if (lock.current || !state.current || pending.current) return;
    if (state.current.preferences.legacyPaths?.length) {
      setMessage('Confira as pastas da versão antiga antes da primeira revisão.');
      setTab('folders');
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
      const remaining = Math.max(
        0,
        next.mission.target - next.mission.reviewed.length,
      );
      const result = demoRef.current
        ? {
            files: demoFiles
              .filter(
                (f) =>
                  !next.reviewed.includes(f.id) &&
                  !isProtected(f.path, next.preferences.protectedPaths),
              )
              .slice(0, remaining),
            unknown: 0,
          }
        : await scan(
            next.preferences,
            next.reviewed,
            remaining,
            controller.signal,
          );
      if (controller.signal.aborted) return;
      // A small library still gets a finishable mission; tomorrow uses the chosen batch size again.
      const available = next.mission.reviewed.length + result.files.length;
      if (available > 0 && available < next.mission.target) {
        await commit({
          ...next,
          mission: { ...next.mission, target: available },
        });
      }
      setFiles(result.files);
      setSearched(true);
      if (result.unknown)
        setMessage(
          "Alguns arquivos sem pasta identificável foram deixados de fora para respeitar suas pastas protegidas.",
        );
    } catch (e) {
      if (!controller.signal.aborted) setMessage(errorText(e));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  async function decide(file: MediaFile, deletion: boolean) {
    if (lock.current || !state.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    let removed = false;
    try {
      if (deletion) {
        setDeleting(true);
        removed = demoRef.current || (await remove(file));
        if (!removed) {
          setMessage("Exclusão cancelada. O arquivo continua aqui.");
          return;
        }
      }
      const next = record(state.current, file, deletion);
      try {
        await commit(next);
      } catch (e) {
        if (removed) {
          pending.current = next;
          publish(next);
          setUnsaved(true);
          setFiles((list) => list.filter((f) => f.id !== file.id));
        }
        throw e;
      }
      setFiles((list) => list.filter((f) => f.id !== file.id));
      setMessage(
        deletion
          ? "Arquivo excluído."
          : "Arquivo mantido.",
      );
    } catch (e) {
      setMessage(
        removed
          ? "O arquivo foi excluído, mas não consegui salvar o progresso. Toque em Salvar novamente."
          : errorText(e),
      );
    } finally {
      setDeleting(false);
      lock.current = false;
      setBusy(false);
    }
  }
  async function updatePreferences(change: Partial<Preferences>) {
    if (!state.current || lock.current || pending.current) return;
    lock.current = true;
    setBusy(true);
    try {
      const next = {
        ...state.current,
        preferences: { ...state.current.preferences, ...change },
      };
      if (change.batchSize && next.mission.reviewed.length === 0)
        next.mission = { ...next.mission, target: change.batchSize };
      if (
        (change.reminder !== undefined ||
          change.time !== undefined ||
          change.batchSize !== undefined) &&
        !demoRef.current
      ) {
        const ok = await schedule(next.preferences, change.reminder === true);
        if (!ok && next.preferences.reminder) {
          next.preferences.reminder = false;
          setMessage(
            "Ative as notificações nos ajustes do celular para receber seu lembrete.",
          );
        }
      }
      await commit(next);
      if (change.protectedPaths || change.types || change.batchSize) {
        setFiles([]);
        setSearched(false);
      }
      if (change.types && !demoRef.current) {
        setGranted(false);
        setMessage("");
        setGranted(await permission(false, next.preferences.types));
      }
    } catch (e) {
      setMessage(errorText(e));
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
    } catch (e) {
      if (!controller.signal.aborted) setFolderError(errorText(e));
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
    } catch (e) {
      setMessage(errorText(e));
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
    decide,
    updatePreferences,
    loadFolders,
    switchDemo,
    cancelScan: () => abort.current?.abort(),
    cancelFolders: () => folderAbort.current?.abort(),
  };
}

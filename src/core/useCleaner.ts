import { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, AppState, Platform } from "react-native";
import { demoFiles, discover, exists, libraryUnavailable, loadQueued, permission, pickFolder as pickNativeFolder, remove, scan } from "./library";
import { hasMediaManagementAccess, openMediaManagementSettings, promptMediaManagementAccess, supportsMediaManagement } from "./devicePermissions";
import { loadJournal, saveJournal } from "./journal";
import {
  Folder,
  freshJournal,
  isProtected,
  Journal,
  localDay,
  MediaFile,
  newReview,
  Preferences,
  record,
  removeFromQueue,
  setQueue,
  today,
} from "./model";
import { selectWeighted } from "./selection";
import { syncReminders } from "./reminders";

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
  const [notificationGranted, setNotificationGranted] = useState<boolean | null>(null);
  const [mediaManagementGranted, setMediaManagementGranted] = useState<boolean | null>(null);
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

  function missionSeed(journal: Journal): string {
    return [
      journal.mission.date,
      journal.preferences.types.join(","),
      journal.preferences.protectedPaths.join("|"),
    ].join(":");
  }

  function demoQueue(ids: string[], journal: Journal, remaining: number): MediaFile[] {
    const available = demoFiles.filter(
      (file) =>
        !journal.ignoredIds.includes(file.id) &&
        !journal.mission.reviewed.includes(file.id) &&
        !isProtected(file.path, journal.preferences.protectedPaths),
    );
    const byId = new Map(available.map((file) => [file.id, file]));
    const queued = ids.map((id) => byId.get(id)).filter((file): file is MediaFile => !!file);
    if (queued.length >= remaining) return queued.slice(0, remaining);
    const excluded = new Set([...ids, ...queued.map((file) => file.id)]);
    return [
      ...queued,
      ...selectWeighted(
        available.filter((file) => !excluded.has(file.id)),
        remaining - queued.length,
        missionSeed(journal),
      ),
    ];
  }

  async function refreshMission(
    source: Journal,
    signal?: AbortSignal,
  ): Promise<{ journal: Journal; files: MediaFile[]; missing: number; unknown: number }> {
    const base = today(source);
    const remaining = Math.max(0, base.mission.target - base.mission.reviewed.length);
    if (!remaining) {
      return { journal: setQueue(base, []), files: [], missing: 0, unknown: 0 };
    }

    let files: MediaFile[] = [];
    let missing = 0;
    let unknown = 0;
    if (demoRef.current) {
      files = demoQueue(base.mission.queueIds, base, remaining);
      missing = Math.max(0, base.mission.queueIds.length - files.length);
    } else if (base.mission.queueIds.length) {
      const hydrated = await loadQueued(base.preferences, base.mission.queueIds, signal);
      files = hydrated.files;
      missing = hydrated.missing.length;
      unknown = hydrated.unknown;
    }

    const excluded = [
      ...base.ignoredIds,
      ...base.mission.reviewed,
      ...base.mission.queueIds,
      ...files.map((file) => file.id),
    ];
    const slots = Math.max(0, remaining - files.length);
    if (slots) {
      const result = demoRef.current
        ? {
            files: demoQueue(excluded, base, slots),
            unknown: 0,
          }
        : await scan(base.preferences, excluded, slots, signal, missionSeed(base));
      files = [...files, ...result.files].slice(0, remaining);
      unknown += result.unknown;
    }

    const available = base.mission.reviewed.length + files.length;
    const target = files.length < remaining ? available : base.mission.target;
    const next = setQueue(
      {
        ...base,
        mission: { ...base.mission, target },
      },
      files.map((file) => file.id),
    );
    return { journal: next, files, missing, unknown };
  }

  const initialize = useCallback(async () => {
    let loaded: Journal;
    try {
      loaded = await loadJournal();
      publish(loaded);
      if (Platform.OS !== "web") {
        const reminder = await syncReminders(loaded.preferences);
        setNotificationGranted(reminder.permissionGranted);
        if (loaded.preferences.reminder && !reminder.permissionGranted)
          setMessage("As notificações estão desativadas no Android. Confira os Ajustes.");
      }
      const unavailable = libraryUnavailable(loaded.preferences.types);
      setGranted(false);
      let mediaGranted = false;
      if (!unavailable) {
        try {
          mediaGranted = await permission(true, loaded.preferences.types);
          setGranted(mediaGranted);
        } catch (error) {
          setMessage(errorText(error));
        }
      }
      if (supportsMediaManagement()) {
        try {
          const managementGranted = mediaGranted
            ? await promptMediaManagementAccess()
            : await hasMediaManagementAccess();
          setMediaManagementGranted(managementGranted);
          if (managementGranted === false && mediaGranted)
            setMessage("Permita o acesso de gerenciamento de mídia para não confirmar cada exclusão.");
        } catch {
          setMediaManagementGranted(false);
          if (mediaGranted)
            setMessage("Abra os Ajustes para permitir exclusões sem confirmação.");
        }
      } else {
        setMediaManagementGranted(null);
      }
    } catch (error) {
      setMessage(errorText(error));
    }
  }, []);

  useEffect(() => {
    initialize();
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced);
    const motion = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduced);
    const resume = AppState.addEventListener("change", async (value) => {
      if (value !== "active" || demoRef.current) return;
      const current = state.current;
      if (!current) return;
      if (Platform.OS !== "web") {
        try {
          const reminder = await syncReminders(current.preferences);
          setNotificationGranted(reminder.permissionGranted);
          if (current.preferences.reminder && !reminder.permissionGranted)
            setMessage("As notificações estão desativadas no Android. Confira os Ajustes.");
        } catch {
          setMessage("O lembrete não pôde ser atualizado. Confira os Ajustes.");
        }
      }
      if (supportsMediaManagement()) {
        try {
          const managementGranted = await hasMediaManagementAccess();
          setMediaManagementGranted(managementGranted);
          if (managementGranted === true) {
            setMessage((current) =>
              current === "Permita o acesso de gerenciamento de mídia para não confirmar cada exclusão." ||
              current === "Abra os Ajustes para permitir exclusões sem confirmação."
                ? ""
                : current,
            );
          }
        } catch {
          setMediaManagementGranted(false);
        }
      }
      if (lock.current) return;
      let base = current;
      if (base.mission.date !== localDay()) {
        base = today(base);
        publish(base);
        setFiles([]);
        setSearched(false);
      }
      try {
        const types = base.preferences.types ?? freshJournal().preferences.types;
        setGranted(false);
        if (libraryUnavailable(types)) return;
        setGranted(await permission(false, types));
        if (!base.mission.queueIds.length && !searched) return;
        lock.current = true;
        setBusy(true);
        const refreshed = await refreshMission(base);
        await commit(refreshed.journal);
        setFiles(refreshed.files);
        setSearched(true);
        if (refreshed.missing)
          setMessage("A lista foi atualizada porque alguns arquivos já não estavam disponíveis.");
      } catch (error) {
        if (error instanceof Error && error.message !== "Busca cancelada.") setMessage(errorText(error));
      } finally {
        lock.current = false;
        setBusy(false);
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
      let next = today(state.current);
      if (!next.mission.queueIds.length && next.mission.reviewed.length >= next.mission.target)
        next = newReview(next);
      if (!demoRef.current) {
        const unavailable = libraryUnavailable(next.preferences.types);
        if (unavailable) {
          setMessage(unavailable);
          return;
        }
        let allowed = await permission(false, next.preferences.types);
        if (!allowed) allowed = await permission(true, next.preferences.types);
        setGranted(allowed);
        if (!allowed) {
          setMessage("Permita o acesso às mídias para começar a revisão.");
          return;
        }
      }
      const result = await refreshMission(next, controller.signal);
      if (controller.signal.aborted) return;
      await commit(result.journal);
      setFiles(result.files);
      setSearched(true);
      if (result.unknown)
        setMessage("Alguns arquivos sem pasta identificável ficaram fora para respeitar suas proteções.");
      else if (result.missing)
        setMessage("A lista foi atualizada porque alguns arquivos já não estavam disponíveis.");
    } catch (error) {
      if (!controller.signal.aborted) setMessage(errorText(error));
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function completeReview(selectedIds: string[], handledIds?: string[]) {
    if (lock.current || !state.current || pending.current) return;
    const handled = new Set(handledIds ?? files.map((file) => file.id));
    const selected = files.filter((file) => handled.has(file.id) && selectedIds.includes(file.id));
    const ignored = files.filter((file) => handled.has(file.id) && !selectedIds.includes(file.id));
    lock.current = true;
    setBusy(true);
    setDeleting(selected.length > 0);
    let next = state.current;
    const failed: MediaFile[] = [];
    let deletedCount = 0;
    let missingCount = 0;
    let firstError = "";
    try {
      for (const file of selected) {
        try {
          if (!demoRef.current && !(await exists(file))) {
            next = removeFromQueue(next, file.id);
            missingCount++;
            continue;
          }
          const removed = demoRef.current || (await remove(file));
          if (!removed) {
            // Some Android builds complete the system delete request but do
            // not propagate its boolean result reliably. Confirm the asset's
            // actual absence before deciding that deletion failed.
            if (await exists(file)) {
              failed.push(file);
              continue;
            }
          }
          next = record(next, file, true);
          deletedCount++;
        } catch (error) {
          failed.push(file);
          if (!firstError) firstError = errorText(error);
        }
      }
      for (const file of ignored) next = record(next, file, false);
      const failedIds = new Set(failed.map((file) => file.id));
      let remaining = files.filter((file) => !handled.has(file.id) || failedIds.has(file.id));
      if (missingCount) {
        const refreshed = await refreshMission(next);
        next = refreshed.journal;
        remaining = refreshed.files;
      }
      try {
        await commit(next);
      } catch (error) {
        pending.current = next;
        publish(next);
        setUnsaved(true);
        setFiles(remaining);
        throw error;
      }
      setFiles(remaining);
      setSearched(true);
      if (failed.length) {
        setMessage(firstError || `${failed.length} arquivo(s) não foram excluídos e continuam na lista.`);
      } else if (deletedCount) {
        setMessage(`${deletedCount} arquivo(s) excluído(s).`);
      } else if (missingCount) {
        setMessage("A lista foi atualizada porque o arquivo já não estava disponível.");
      } else if (!handledIds) {
        setMessage(`${ignored.length} arquivo(s) ignorado(s) nesta revisão.`);
      } else {
        setMessage("");
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

  async function pickFolder() {
    if (lock.current || pending.current) return null;
    lock.current = true;
    setBusy(true);
    try {
      setMessage("");
      return await pickNativeFolder();
    } catch (error) {
      setMessage(errorText(error));
      return null;
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }

  async function openDeleteSettings() {
    try {
      await openMediaManagementSettings();
    } catch {
      setMessage("Abra os Ajustes do Android para permitir o gerenciamento de mídia.");
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
          change.reminderTimes !== undefined) &&
        !demoRef.current && Platform.OS !== "web"
      ) {
        const reminder = await syncReminders(next.preferences, change.reminder === true);
        setNotificationGranted(reminder.permissionGranted);
        if (!reminder.ok && next.preferences.reminder) {
          setMessage("Ative as notificações nas configurações do celular para usar os lembretes.");
        }
      }
      if (change.protectedPaths || change.types || change.batchSize) {
        next = setQueue(next, []);
        setFiles([]);
        setSearched(false);
      }
      await commit(next);
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
    notificationGranted,
    mediaManagementGranted,
    unsaved,
    retrySave,
    initialize,
    access,
    startMission,
    completeReview,
    resetIgnored,
    pickFolder,
    openDeleteSettings,
    updatePreferences,
    loadFolders,
    switchDemo,
    cancelScan: () => abort.current?.abort(),
    cancelFolders: () => folderAbort.current?.abort(),
  };
}

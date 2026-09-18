const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");

// Compile just these pure/domain modules in memory, injecting the device and storage boundaries.
function load(name, mocks = {}) {
  const filename = path.resolve(__dirname, "../src/core", name + ".ts");
  const source = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText;
  const module = { exports: {} };
  new Function("require", "module", "exports", source)(
    (id) => (id in mocks ? mocks[id] : id === "./model" ? model : require(id)),
    module,
    module.exports,
  );
  return module.exports;
}
const model = load("model");
const asset = (id, uri = `file:///storage/emulated/0/DCIM/${id}.jpg`) => ({
  id,
  uri,
  filename: `${id}.jpg`,
  mediaType: "photo",
  creationTime: 1000,
  albumId: "camera",
});
function library(overrides = {}, runtime = "standalone", os = "android") {
  return load("library", {
    "react-native": { Platform: { OS: os } },
    "expo-constants": { executionEnvironment: runtime },
    "expo-media-library/legacy": {
      SortBy: { creationTime: "creationTime" },
      getPermissionsAsync: async () => ({ granted: true }),
      getAssetInfoAsync: async () => ({}),
      ...overrides,
    },
    "expo-file-system/legacy": {
      getInfoAsync: async () => ({ exists: true, size: 42 }),
    },
  });
}
test("exclusion protects current and future descendants but not sibling prefixes", () => {
  assert.equal(
    model.isProtected("/storage/Music/new/album", ["/storage/Music/"]),
    true,
  );
  assert.equal(
    model.isProtected("/storage/Music Videos", ["/storage/Music"]),
    false,
  );
  assert.equal(model.isProtected("/storage/music", ["/storage/Music"]), false);
  assert.equal(
    model.normalizePath("file:///storage/My%20Music///"),
    "/storage/My Music",
  );
  assert.deepEqual(model.protect(["/storage/Music/Rock"], "/storage/Music"), [
    "/storage/Music",
  ]);
  assert.deepEqual(model.protect(["/storage/Music"], "/storage/Music/Rock"), [
    "/storage/Music",
  ]);
});
test("unique decisions and local-day rollover preserve history without rewards", () => {
  const initial = model.freshJournal();
  const kept = model.record(initial, { id: "1", bytes: 100 }, false);
  assert.equal("xp" in kept, false);
  assert.equal("days" in kept, false);
  assert.equal(kept.bytes, 0);
  assert.deepEqual(model.record(kept, { id: "1", bytes: 100 }, true), kept);
  const deleted = model.record(kept, { id: "2", bytes: 100 }, true);
  assert.equal(deleted.reviewed.length, 2);
  assert.equal(deleted.deleted, 1);
  assert.equal(deleted.mission.bytes, 100);
  const tomorrow = model.today({
    ...deleted,
    mission: { ...deleted.mission, date: "2000-01-01" },
  });
  assert.equal(tomorrow.mission.reviewed.length, 0);
  assert.equal(tomorrow.reviewed.length, 2);
  assert.equal(tomorrow.deleted, 1);
  assert.equal(tomorrow.bytes, 100);
  assert.equal(model.localDay(new Date(2026, 8, 16, 23, 59)), "2026-09-16");
});
test("scan paginates beyond excluded/reviewed first page to fill the daily batch", async () => {
  const calls = [];
  const lib = library({
    getAssetsAsync: async (options) => {
      calls.push(options);
      return !options.after
        ? {
            assets: Array.from({ length: 300 }, (_, i) =>
              asset("old" + i, `file:///storage/Music/${i}.jpg`),
            ),
            hasNextPage: true,
            endCursor: "next",
          }
        : { assets: [asset("seen"), asset("new")], hasNextPage: false };
    },
  });
  const result = await lib.scan(
    { ...model.freshJournal().preferences, protectedPaths: ["/storage/Music"] },
    ["seen"],
    1,
  );
  assert.deepEqual(
    result.files.map((f) => f.id),
    ["new"],
  );
  assert.equal(calls.length, 2);
  assert.equal(calls[1].after, "next");
  assert.equal(result.files[0].bytes, 42);
});
test("real Android/media and Music paths are never rewritten to guessed folders", async () => {
  const lib = library({
    getAssetsAsync: async () => ({
      assets: [
        asset(
          "a",
          "file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/a.jpg",
        ),
        asset("b", "file:///storage/emulated/0/Music/Rock/b.jpg"),
      ],
      hasNextPage: false,
    }),
  });
  const result = await lib.scan(model.freshJournal().preferences, [], 10);
  assert.equal(
    result.files[0].path,
    "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media",
  );
  assert.equal(result.files[1].path, "/storage/emulated/0/Music/Rock");
});
test("unresolved paths are skipped when protection rules exist; no guessed album path", async () => {
  const lib = library({
    getAssetsAsync: async () => ({
      assets: [asset("a", "content://media/42")],
      hasNextPage: false,
    }),
  });
  const result = await lib.scan(
    { ...model.freshJournal().preferences, protectedPaths: ["/storage/Music"] },
    [],
    10,
  );
  assert.equal(result.files.length, 0);
  assert.equal(result.unknown, 1);
});
test("permission errors, empty libraries, and failures never return demo assets", async () => {
  await assert.rejects(
    library({ getPermissionsAsync: async () => ({ granted: false }) }).scan(
      model.freshJournal().preferences,
      [],
      10,
    ),
  );
  assert.deepEqual(
    (
      await library({
        getAssetsAsync: async () => ({ assets: [], hasNextPage: false }),
      }).scan(model.freshJournal().preferences, [], 10)
    ).files,
    [],
  );
  await assert.rejects(
    library({
      getAssetsAsync: async () => {
        throw Error("Device error");
      },
    }).scan(model.freshJournal().preferences, [], 10),
  );
});
test("discovery exhausts pages, aggregates ancestors and counts only real media", async () => {
  const lib = library({
    getAssetsAsync: async ({ after }) =>
      !after
        ? {
            assets: [asset("a", "file:///storage/emulated/0/Music/Rock/a.mp3")],
            hasNextPage: true,
            endCursor: "b",
          }
        : {
            assets: [asset("b", "file:///storage/emulated/0/Music/Jazz/b.mp3")],
            hasNextPage: false,
          },
  });
  const result = await lib.discover();
  assert.equal(
    result.find((f) => f.path === "/storage/emulated/0/Music").count,
    2,
  );
  assert.equal(result.length, 3);
});
test("failed or cancelled deletion is reported and demo can never reach the device API", async () => {
  let calls = 0;
  const lib = library({
    deleteAssetsAsync: async () => {
      calls++;
      return false;
    },
  });
  assert.equal(await lib.remove({ id: "real" }), false);
  await assert.rejects(lib.remove({ id: "demo", demo: true }));
  assert.equal(calls, 1);
});
test("migration preserves explicit preferences/history without fake stats; errors propagate", async () => {
  const data = new Map([
    [
      "@media_cleaner_settings",
      JSON.stringify({
        batchSize: 5,
        excludedFolderPaths: ["/storage/Music"],
        reminderTimes: ["00:00"],
        includePhotos: true,
      }),
    ],
    ["@media_cleaner_reviewed_ids", JSON.stringify(["real", "mock_1"])],
  ]);
  const j = load("journal", {
    "@react-native-async-storage/async-storage": {
      getItem: async (k) => data.get(k),
      setItem: async (k, v) => data.set(k, v),
    },
  });
  const result = await j.loadJournal();
  assert.equal(result.preferences.time, "00:00");
  assert.equal(result.mission.target, 5);
  assert.deepEqual(result.reviewed, ["real"]);
  assert.equal(result.bytes, 0);
  assert.equal("xp" in result, false);
  const failing = load("journal", {
    "@react-native-async-storage/async-storage": {
      setItem: async () => {
        throw Error("Full");
      },
    },
  });
  await assert.rejects(failing.saveJournal(result));
});
test("disabled reminders cancel existing schedules and midnight stays midnight", async () => {
  let cancelled = 0,
    scheduled;
  const r = load("reminders", {
    "react-native": { Platform: { OS: "android" } },
    "expo-notifications": {
      AndroidImportance: { DEFAULT: 3 },
      SchedulableTriggerInputTypes: { DAILY: "daily" },
      setNotificationChannelAsync: async () => {},
      cancelAllScheduledNotificationsAsync: async () => cancelled++,
      getPermissionsAsync: async () => ({ granted: true }),
      scheduleNotificationAsync: async (value) => {
        scheduled = value;
      },
    },
  });
  const p = model.freshJournal().preferences;
  await r.schedule(p);
  assert.equal(cancelled, 1);
  assert.equal(scheduled, undefined);
  await r.schedule({ ...p, reminder: true, time: "00:00" });
  assert.equal(scheduled.trigger.hour, 0);
  assert.equal(scheduled.trigger.minute, 0);
});

test("Expo Go Android rejects visual access before native calls without changing selection", async () => {
  let calls = 0;
  const lib = library({ getPermissionsAsync: async () => { calls++; return { granted: true }; } }, "storeClient");
  const preferences = model.freshJournal().preferences;
  assert.match(lib.libraryUnavailable(preferences.types), /Expo Go.*Android/);
  await assert.rejects(lib.permission(false, preferences.types), /versão Android/);
  await assert.rejects(lib.permission(true, ["video"]), /Expo Go/);
  await assert.rejects(lib.scan(preferences, [], 10), /Expo Go/);
  await assert.rejects(lib.discover(undefined, ["photo"]), /Expo Go/);
  assert.equal(calls, 0);
  assert.deepEqual(preferences.types, ["photo", "video", "audio"]);
});

test("selected types are passed consistently to permissions, scan and discovery", async () => {
  const calls = [];
  const lib = library({
    getPermissionsAsync: async (...args) => { calls.push(args); return { granted: true }; },
    requestPermissionsAsync: async (...args) => { calls.push(args); return { granted: true }; },
    getAssetsAsync: async (options) => {
      assert.deepEqual(options.mediaType, ["audio"]);
      return { assets: [], hasNextPage: false };
    },
  }, "storeClient");
  assert.equal(lib.libraryUnavailable(["audio"]), null);
  assert.equal(await lib.permission(true, ["audio"]), true);
  await lib.scan({ ...model.freshJournal().preferences, types: ["audio"] }, [], 10);
  await lib.discover(undefined, ["audio"]);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => [false, ["audio"]]));
  assert.equal(library({}, "storeClient", "ios").libraryUnavailable(["photo"]), null);
});

test("native permission failures preserve cause and give actionable instructions", async () => {
  const cause = Error("AUDIO permission is not declared in AndroidManifest");
  const lib = library({
    getPermissionsAsync: async () => { throw cause; },
    requestPermissionsAsync: async () => { throw cause; },
  }, "storeClient");
  for (const request of [false, true]) {
    await assert.rejects(lib.permission(request, ["audio"]), (error) => {
      assert.equal(error.cause, cause);
      assert.match(error.message, /permissões configuradas/);
      assert.equal(error.message.includes(cause.message), false);
      return true;
    });
  }
  await assert.rejects(library({ getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }) }).permission(), /configurações do celular/);
  assert.equal(await library({ getPermissionsAsync: async () => ({ granted: false, canAskAgain: true }) }).permission(), false);
});

test("empty selection and completed batches never request all permissions by accident", async () => {
  const lib = library({ getPermissionsAsync: async () => { throw Error("Unexpected native call"); } });
  assert.equal(await lib.permission(true, []), false);
  assert.deepEqual(await lib.discover(undefined, []), []);
  assert.deepEqual(await lib.scan({ ...model.freshJournal().preferences, types: [] }, [], 10), { files: [], unknown: 0 });
  assert.deepEqual(await lib.scan(model.freshJournal().preferences, [], 0), { files: [], unknown: 0 });
});

test("v1 migration preserves actual totals, today's review and every setting; drops rewards", async () => {
  const previous = {
    ...model.freshJournal(), version: 1, xp: 1230, days: ["2026-09-01"],
    reviewed: ["a", "b"], deleted: 4, bytes: 999,
    preferences: { ...model.freshJournal().preferences, types: ["audio"], protectedPaths: ["/storage/Music"], legacyPaths: ["/storage/Old"], reminder: true, time: "00:00", motion: false, batchSize: 15 },
    mission: { date: model.localDay(), target: 15, reviewed: ["a", "b"], deleted: 1, bytes: 42 },
  };
  const data = new Map([["@media_cleaner_robot_v1", JSON.stringify(previous)]]);
  const j = load("journal", { "@react-native-async-storage/async-storage": {
    getItem: async (key) => data.get(key) ?? null,
    setItem: async (key, value) => data.set(key, value),
  } });
  const result = await j.loadJournal();
  const { xp, days, ...expected } = previous;
  assert.deepEqual(result, { ...expected, version: 2 });
  assert.deepEqual(JSON.parse(data.get("@media_cleaner_journal_v2")), result);
  assert.equal(data.get("@media_cleaner_robot_v1"), JSON.stringify(previous));
  assert.deepEqual(await j.loadJournal(), result);
});

test("failed migration persistence propagates and leaves the original intact", async () => {
  const previous = JSON.stringify({ ...model.freshJournal(), version: 1, xp: 5, days: [] });
  const j = load("journal", { "@react-native-async-storage/async-storage": {
    getItem: async (key) => key === "@media_cleaner_robot_v1" ? previous : null,
    setItem: async () => { throw Error("Storage full"); },
  } });
  await assert.rejects(j.loadJournal(), /Storage full/);
});

function cleanerHarness({ loaded = model.freshJournal(), unavailable = null, permissionError, removeResult = true, saveError } = {}) {
  const values = [], changes = [], calls = { permissions: 0, schedules: 0 };
  let index = 0;
  const core = load("useCleaner", {
    react: {
      useState: (initial) => {
        const slot = index++;
        values[slot] = initial;
        return [initial, (next) => {
          values[slot] = typeof next === "function" ? next(values[slot]) : next;
          changes.push([slot, values[slot]]);
        }];
      },
      useRef: (current) => ({ current }),
      useCallback: (fn) => fn,
      useEffect: () => {},
    },
    "react-native": { Platform: { OS: "android" } },
    "./journal": {
      loadJournal: async () => loaded,
      saveJournal: async () => { if (saveError) throw saveError; },
    },
    "./reminders": { schedule: async () => { calls.schedules++; return true; } },
    "./library": {
      libraryUnavailable: () => unavailable,
      permission: async () => { calls.permissions++; if (permissionError) throw permissionError; return true; },
      remove: async () => removeResult,
    },
  });
  const hook = core.useCleaner();
  return { hook, values, changes, calls };
}

test("unsupported runtime initializes storage and schedules without a raw error or demo", async () => {
  const loaded = { ...model.freshJournal(), reviewed: ["kept"], deleted: 3 };
  const h = cleanerHarness({ loaded, unavailable: "Expo Go requer build próprio." });
  await h.hook.initialize();
  assert.equal(h.values[0], loaded);
  assert.equal(h.values[2], false); // demo
  assert.equal(h.values[3], false); // granted
  assert.equal(h.values[6], ""); // message
  assert.equal(h.calls.permissions, 0);
  assert.equal(h.calls.schedules, 1);
  assert.match(h.hook.libraryUnavailable, /build próprio/);
  assert.equal(h.hook.deleting, false);
  for (const retired of ["eating", "setEating", "deletedDone"]) assert.equal(retired in h.hook, false);
});

test("unexpected initialization rejection remains visible and does not block reminders/history", async () => {
  const h = cleanerHarness({ permissionError: Error("Confira as permissões do aplicativo.") });
  await h.hook.initialize();
  assert.equal(h.values[0].version, 2);
  assert.match(h.values[6], /Confira as permissões/);
  assert.equal(h.calls.schedules, 1);
  assert.equal(h.values[2], false);
});

test("deleting state resets on cancellation and failed persistence retains deletion history for retry", async () => {
  const cancelled = cleanerHarness({ removeResult: false });
  await cancelled.hook.initialize();
  await cancelled.hook.decide({ id: "cancelled" }, true);
  assert.equal(cancelled.values[9], false);
  assert.equal(cancelled.values[0].reviewed.length, 0);
  assert.match(cancelled.values[6], /cancelada/);
  const failed = cleanerHarness({ saveError: Error("Full") });
  await failed.hook.initialize();
  await failed.hook.decide({ id: "removed", bytes: 42 }, true);
  assert.equal(failed.values[9], false);
  assert.ok(failed.changes.some(([slot, value]) => slot === 9 && value === true));
  assert.equal(failed.values[0].deleted, 1);
  assert.equal(failed.values[0].bytes, 42);
  assert.deepEqual(failed.values[0].reviewed, ["removed"]);
  assert.equal(failed.values[13], true); // unsaved
  assert.match(failed.values[6], /Salvar novamente/);
});

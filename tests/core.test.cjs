const { test } = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const fs = require("node:fs");
const path = require("node:path");

function load(name, mocks = {}) {
  const filename = path.resolve(__dirname, "../src/core", `${name}.ts`);
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
const selection = load("selection", { "./model": model });
const asset = (id, uri = `file:///storage/emulated/0/DCIM/${id}.jpg`, mediaType = "photo") => ({
  id,
  uri,
  filename: `${id}.jpg`,
  mediaType,
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
      deleteAssetsAsync: async () => true,
      ...overrides,
    },
      "expo-file-system/legacy": {
      getInfoAsync: async () => ({ exists: true, size: 42 }),
    },
    "./selection": selection,
  });
}

test("protected folders include descendants but not similarly named siblings", () => {
  assert.equal(model.isProtected("/storage/Music/new/album", ["/storage/Music/"]), true);
  assert.equal(model.isProtected("/storage/Music Videos", ["/storage/Music"]), false);
  assert.equal(model.isProtected("/storage/music", ["/storage/Music"]), false);
  assert.equal(model.normalizePath("file:///storage/My%20Music///"), "/storage/My Music");
  assert.deepEqual(model.protect(["/storage/Music/Rock"], "/storage/Music"), ["/storage/Music"]);
  assert.deepEqual(model.protect(["/storage/Music"], "/storage/Music/Rock"), ["/storage/Music"]);
});

test("kept files become ignored, deleted files update totals, and the next day resets only daily progress", () => {
  const initial = model.freshJournal();
  const kept = model.record(initial, { id: "1", bytes: 100 }, false);
  assert.deepEqual(kept.ignoredIds, ["1"]);
  assert.equal(kept.deleted, 0);
  assert.equal(kept.bytes, 0);
  assert.deepEqual(model.record(kept, { id: "1", bytes: 100 }, true), kept);
  const deleted = model.record(kept, { id: "2", bytes: 100 }, true);
  assert.deepEqual(deleted.mission.reviewed, ["1", "2"]);
  assert.equal(deleted.deleted, 1);
  assert.equal(deleted.bytes, 100);
  const tomorrow = model.today({ ...deleted, mission: { ...deleted.mission, date: "2000-01-01" } });
  assert.deepEqual(tomorrow.ignoredIds, ["1"]);
  assert.deepEqual(tomorrow.mission.reviewed, []);
  assert.equal(tomorrow.deleted, deleted.deleted);
  assert.equal(model.localDay(new Date(2026, 8, 16, 23, 59)), "2026-09-16");
});

test("reminder slots stay unique and move a collision forward by ten minutes", () => {
  assert.deepEqual(model.normalizeReminderTimes([1200, 1200, 1200], 3), [1200, 1210, 1220]);
  assert.deepEqual(model.setReminderTime([540, 900], 1, 540), [540, 550]);
  assert.equal(model.minutesToTime(1440), "00:00");
  assert.equal(model.timeToMinutes("23:59"), 1439);
  assert.equal(model.timeToMinutes("25:99"), null);
});

test("weighted selection keeps the oldest item first and gives sparse types more chances", () => {
  const files = [
    ...Array.from({ length: 16 }, (_, index) => ({ id: `photo-${index}`, kind: "photo", created: index })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `video-${index}`, kind: "video", created: 30 + index })),
    ...Array.from({ length: 2 }, (_, index) => ({ id: `audio-${index}`, kind: "audio", created: 40 + index })),
  ];
  const results = Array.from({ length: 100 }, (_, index) => selection.selectWeighted(files, 5, `day-${index}`));
  const videoSelections = results.reduce((total, result) => total + result.filter((file) => file.kind === "video").length, 0);
  const audioSelections = results.reduce((total, result) => total + result.filter((file) => file.kind === "audio").length, 0);
  assert.equal(results.every((result) => result[0].id === "photo-0"), true);
  assert.ok(videoSelections > 0, "videos should receive opportunities in a skewed library");
  assert.ok(audioSelections > 0, "audios should receive opportunities in a skewed library");
});

test("queue helpers remove resolved items without changing deletion totals", () => {
  const initial = model.setQueue(model.freshJournal(), ["a", "b"]);
  const next = model.removeFromQueue(initial, "a");
  assert.deepEqual(next.mission.queueIds, ["b"]);
  assert.deepEqual(next.mission.reviewed, []);
  assert.equal(next.deleted, 0);
  assert.deepEqual(model.record(next, { id: "b", bytes: 20 }, true).mission.queueIds, []);
});

test("scan paginates beyond protected and reviewed pages to fill the daily batch", async () => {
  const calls = [];
  const lib = library({
    getAssetsAsync: async (options) => {
      calls.push(options);
      return !options.after
        ? {
            assets: Array.from({ length: 300 }, (_, i) => asset(`old${i}`, `file:///storage/Music/${i}.jpg`)),
            hasNextPage: true,
            endCursor: "next",
          }
        : { assets: [asset("seen"), asset("new")], hasNextPage: false };
    },
  });
  const result = await lib.scan({ ...model.freshJournal().preferences, protectedPaths: ["/storage/Music"] }, ["seen"], 1);
  assert.deepEqual(result.files.map((file) => file.id), ["new"]);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].after, "next");
  assert.equal(result.files[0].bytes, 42);
});

test("queued assets are revalidated by ID instead of rescanning the whole library", async () => {
  let pages = 0;
  const lib = library({
    getAssetsAsync: async () => { pages++; return { assets: [], hasNextPage: false }; },
    getAssetInfoAsync: async (id) => id === "gone" ? null : asset(id, `file:///storage/emulated/0/DCIM/${id}.jpg`),
  });
  const result = await lib.loadQueued(model.freshJournal().preferences, ["kept", "gone"]);
  assert.deepEqual(result.files.map((file) => file.id), ["kept"]);
  assert.deepEqual(result.missing, ["gone"]);
  assert.equal(pages, 0);
});

test("pre-delete existence checks distinguish missing assets from a live asset", async () => {
  const lib = library({ getAssetInfoAsync: async (id) => id === "gone" ? null : {} });
  assert.equal(await lib.exists({ id: "live" }), true);
  assert.equal(await lib.exists({ id: "gone" }), false);
});

test("the scanner keeps real Android and Music paths instead of guessing albums", async () => {
  const lib = library({
    getAssetsAsync: async () => ({
      assets: [
        asset("a", "file:///storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media/a.jpg"),
        asset("b", "file:///storage/emulated/0/Music/Rock/b.jpg"),
      ],
      hasNextPage: false,
    }),
  });
  const result = await lib.scan(model.freshJournal().preferences, [], 10);
  assert.equal(result.files[0].path, "/storage/emulated/0/Android/media/com.whatsapp/WhatsApp/Media");
  assert.equal(result.files[1].path, "/storage/emulated/0/Music/Rock");
});

test("unknown paths are skipped when a protection rule exists", async () => {
  const lib = library({
    getAssetsAsync: async () => ({ assets: [asset("a", "content://media/42")], hasNextPage: false }),
  });
  const result = await lib.scan({ ...model.freshJournal().preferences, protectedPaths: ["/storage/Music"] }, [], 10);
  assert.deepEqual(result.files, []);
  assert.equal(result.unknown, 1);
});

test("device permission errors, empty libraries and deletion failures never return demo assets", async () => {
  await assert.rejects(library({ getPermissionsAsync: async () => ({ granted: false }) }).scan(model.freshJournal().preferences, [], 10));
  assert.deepEqual((await library({ getAssetsAsync: async () => ({ assets: [], hasNextPage: false }) }).scan(model.freshJournal().preferences, [], 10)).files, []);
  let calls = 0;
  const lib = library({ deleteAssetsAsync: async () => { calls++; return false; } });
  assert.equal(await lib.remove({ id: "real" }), false);
  await assert.rejects(lib.remove({ id: "demo", demo: true }));
  assert.equal(calls, 1);
});

test("folder discovery exhausts pages and aggregates parent counts", async () => {
  const lib = library({
    getAssetsAsync: async ({ after }) => !after
      ? { assets: [asset("a", "file:///storage/emulated/0/Music/Rock/a.mp3")], hasNextPage: true, endCursor: "b" }
      : { assets: [asset("b", "file:///storage/emulated/0/Music/Jazz/b.mp3")], hasNextPage: false },
  });
  const result = await lib.discover();
  assert.equal(result.find((folder) => folder.path === "/storage/emulated/0/Music").count, 2);
  assert.equal(result.length, 3);
});

test("Expo Go Android rejects visual media before native calls", async () => {
  let calls = 0;
  const lib = library({ getPermissionsAsync: async () => { calls++; return { granted: true }; } }, "storeClient");
  const preferences = model.freshJournal().preferences;
  assert.match(lib.libraryUnavailable(preferences.types), /Expo Go.*Android/);
  await assert.rejects(lib.permission(false, preferences.types), /versão Android/);
  await assert.rejects(lib.scan(preferences, [], 10), /versão Android/);
  assert.equal(calls, 0);
});

test("selected media types are passed consistently to permissions, scan and discovery", async () => {
  const calls = [];
  const lib = library({
    getPermissionsAsync: async (...args) => { calls.push(args); return { granted: true }; },
    requestPermissionsAsync: async (...args) => { calls.push(args); return { granted: true }; },
    getAssetsAsync: async (options) => { assert.deepEqual(options.mediaType, ["audio"]); return { assets: [], hasNextPage: false }; },
  }, "storeClient");
  assert.equal(await lib.permission(true, ["audio"]), true);
  await lib.scan({ ...model.freshJournal().preferences, types: ["audio"] }, [], 10);
  await lib.discover(undefined, ["audio"]);
  assert.deepEqual(calls, Array.from({ length: 3 }, () => [false, ["audio"]]));
});

test("empty type selection never requests all permissions by accident", async () => {
  const lib = library({ getPermissionsAsync: async () => { throw Error("Unexpected native call"); } });
  assert.equal(await lib.permission(true, []), false);
  assert.deepEqual(await lib.discover(undefined, []), []);
  assert.deepEqual(await lib.scan({ ...model.freshJournal().preferences, types: [] }, [], 10), { files: [], unknown: 0 });
  assert.deepEqual(await lib.scan(model.freshJournal().preferences, [], 0), { files: [], unknown: 0 });
});

test("journal migrates v2 and legacy settings to version 4 without rewards or legacy time fields", async () => {
  const previous = {
    ...model.freshJournal(),
    version: 2,
    xp: 1230,
    preferences: { ...model.freshJournal().preferences, time: "00:00", reminderTimes: undefined, batchSize: 15 },
    ignoredIds: ["kept"],
  };
  const data = new Map([["@media_cleaner_journal_v2", JSON.stringify(previous)]]);
  const journal = load("journal", {
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => data.get(key) ?? null,
      setItem: async (key, value) => data.set(key, value),
    },
  });
  const result = await journal.loadJournal();
  assert.equal(result.version, 4);
  assert.deepEqual(result.ignoredIds, ["kept"]);
  assert.deepEqual(result.preferences.reminderTimes, [0]);
  assert.equal("time" in result.preferences, false);
  assert.equal("xp" in result, false);
  assert.deepEqual(JSON.parse(data.get("@media_cleaner_journal_v4")), result);
});

test("legacy settings migrate folder exclusions, batch size, types, and multiple times", async () => {
  const data = new Map([
    ["@media_cleaner_settings", JSON.stringify({ batchSize: 5, excludedFolderPaths: ["/storage/Music"], reminderTimes: ["08:00", "08:00"], includePhotos: true, includeVideos: false })],
    ["@media_cleaner_reviewed_ids", JSON.stringify(["real", "mock_1"])],
  ]);
  const journal = load("journal", {
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => data.get(key) ?? null,
      setItem: async (key, value) => data.set(key, value),
    },
  });
  const result = await journal.loadJournal();
  assert.equal(result.preferences.batchSize, 5);
  assert.deepEqual(result.preferences.protectedPaths, ["/storage/Music"]);
  assert.deepEqual(result.preferences.types, ["photo", "audio"]);
  assert.deepEqual(result.preferences.reminderTimes, [480, 490]);
  assert.deepEqual(result.ignoredIds, ["real"]);
});

test("migration persistence errors are surfaced and do not silently discard data", async () => {
  const previous = JSON.stringify({ ...model.freshJournal(), version: 2 });
  const journal = load("journal", {
    "@react-native-async-storage/async-storage": {
      getItem: async (key) => key === "@media_cleaner_journal_v2" ? previous : null,
      setItem: async () => { throw Error("Storage full"); },
    },
  });
  await assert.rejects(journal.loadJournal(), /Storage full/);
});

test("reminders schedule one, two, or three owned daily notifications and preserve other schedules", async () => {
  let scheduled = [];
  const cancelled = [];
  const n = {
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DAILY: "daily" },
    setNotificationChannelAsync: async () => {},
    getAllScheduledNotificationsAsync: async () => [
      { identifier: "mine", content: { data: { owner: "media-cleaner-daily-review" } } },
      { identifier: "other", content: { data: { owner: "other-app" } } },
    ],
    cancelScheduledNotificationAsync: async (id) => cancelled.push(id),
    getPermissionsAsync: async () => ({ granted: true }),
    scheduleNotificationAsync: async (value) => { scheduled.push(value); return "id"; },
  };
  const reminders = load("reminders", { "react-native": { Platform: { OS: "android" } }, "expo-notifications": n });
  const preferences = model.freshJournal().preferences;
  await reminders.schedule({ ...preferences, reminder: true, reminderTimes: [0, 610, 1200] });
  assert.deepEqual(cancelled, ["mine"]);
  assert.equal(scheduled.length, 3);
  assert.deepEqual(scheduled.map((item) => [item.trigger.hour, item.trigger.minute]), [[0, 0], [10, 10], [20, 0]]);
  scheduled = [];
  assert.equal(await reminders.schedule({ ...preferences, reminder: false }), true);
  assert.deepEqual(scheduled, []);
});

test("reminder sync reports revoked notification permission and uses short direct copy", async () => {
  let scheduled = 0;
  let lastRequest;
  const n = {
    AndroidImportance: { DEFAULT: 3 },
    SchedulableTriggerInputTypes: { DAILY: "daily" },
    setNotificationChannelAsync: async () => {},
    getAllScheduledNotificationsAsync: async () => [],
    getPermissionsAsync: async () => ({ granted: false, canAskAgain: false }),
    scheduleNotificationAsync: async (value) => { scheduled++; lastRequest = value; return value; },
  };
  const reminders = load("reminders", { "react-native": { Platform: { OS: "android" } }, "expo-notifications": n });
  const denied = await reminders.syncReminders({ ...model.freshJournal().preferences, reminder: true });
  assert.deepEqual(denied, { ok: false, permissionGranted: false, scheduled: 0 });
  assert.equal(scheduled, 0);

  n.getPermissionsAsync = async () => ({ granted: true });
  await reminders.syncReminders({ ...model.freshJournal().preferences, reminder: true });
  assert.equal(scheduled, 1);
  assert.equal(lastRequest.content.title, "Hora de limpar o celular");
  assert.equal(lastRequest.content.body, "Abra o Dustio para revisar sua lista.");
});

test("web reminders stay disabled without trying to load native notifications", async () => {
  const reminders = load("reminders", { "react-native": { Platform: { OS: "web" } } });
  assert.equal(await reminders.schedule({ ...model.freshJournal().preferences, reminder: true }), false);
});

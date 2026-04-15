// =========================================================
// data_manager.js
// 共有フォルダへの安全なデータI/Oと、競合を防ぐ3-wayマージを管理
// =========================================================

var DataManager = (function() {
    var fso = null;

    function initFSO() {
        if (fso) return true;
        try {
            fso = new ActiveXObject("Scripting.FileSystemObject");
            return true;
        } catch (e) {
            return false;
        }
    }

    function getJsonPath(cat) {
        // HTA側で定義されている SHARED_DATA_PATH を使用
        if (typeof SHARED_DATA_PATH === "undefined") return "";
        return fso.BuildPath(SHARED_DATA_PATH, cat + ".json");
    }

    function stringifyData(obj) {
        if (typeof JSON !== 'undefined' && JSON.stringify) return JSON.stringify(obj);
        return ""; // IE11環境では基本的にJSONオブジェクトが存在するため簡略化
    }

    function parseData(str) {
        if (!str) return null;
        try {
            if (typeof JSON !== 'undefined' && JSON.parse) return JSON.parse(str);
            return eval("(" + str + ")");
        } catch (e) { return null; }
    }

    // HTA側から注入されるリトライ付き保存関数を利用、無ければ自前でフォールバック
    function saveFile(path, text) {
        if (typeof DataManager.saveTextUtf8 === "function") {
            return DataManager.saveTextUtf8(path, text);
        }
        var maxRetries = 10;
        for (var i = 0; i < maxRetries; i++) {
            try {
                var stream = new ActiveXObject("ADODB.Stream");
                stream.Type = 2; stream.Charset = "UTF-8";
                stream.Open(); stream.WriteText(text);
                stream.SaveToFile(path, 2); stream.Close();
                return true;
            } catch (e) {
                var start = new Date().getTime();
                while (new Date().getTime() < start + 200);
            }
        }
        return false;
    }

    function loadFile(path) {
        var maxRetries = 3;
        for (var i = 0; i < maxRetries; i++) {
            try {
                if (!fso.FileExists(path)) return null;
                var stream = new ActiveXObject("ADODB.Stream");
                stream.Type = 2; stream.Charset = "utf-8";
                stream.Open(); stream.LoadFromFile(path);
                var text = stream.ReadText();
                stream.Close();
                return text;
            } catch(e) {
                var start = new Date().getTime();
                while (new Date().getTime() < start + 100);
            }
        }
        return null;
    }

    // --- マージ用ヘルパー関数群 ---
    function mergeArrayById(diskList, myList, mergeFunc) {
        var diskMap = {}, myMap = {};
        function popMap(arr, map) {
            for (var i = 0; i < arr.length; i++) {
                if (arr[i] && arr[i].id) map[arr[i].id] = arr[i];
            }
        }
        popMap(diskList || [], diskMap);
        popMap(myList || [], myMap);

        var allIds = {};
        for (var id in diskMap) allIds[id] = true;
        for (var id in myMap)   allIds[id] = true;

        var mergedList = [];
        for (var id in allIds) {
            var d = diskMap[id], m = myMap[id];
            var t = mergeFunc(d, m);
            if (t) mergedList.push(t);
        }
        return mergedList;
    }

    function mergeObj(d, m) {
        if (m && !d) return m;
        if (!m && !d) return d;
        // 簡易的なプロパティ上書き（自分が編集したものを優先）
        for (var key in m) {
            if (m.hasOwnProperty(key)) d[key] = m[key];
        }
        return d;
    }

    // --- メイン機能 ---
    return {
        init: function() {
            initFSO();
        },

        // サーバーから全データを読み込む
        loadAll: function() {
            if (!initFSO()) return {};
            var disk = {
                patients: {}, wardNotes: {}, todos: [], history: [],
                settings: { adminIds: ["16622"], activeWardCodes: ["99"] },
                users: {}, announcement: "", admissionSchedule: [], dischargedArchive: {}
            };

            function safeRead(cat) {
                var txt = loadFile(getJsonPath(cat));
                return txt ? parseData(txt) : null;
            }

            var pat = safeRead("patients") || {};
            if (pat.patients) disk.patients = pat.patients;
            if (pat.admissionSchedule) disk.admissionSchedule = pat.admissionSchedule;
            if (pat.dischargedArchive) disk.dischargedArchive = pat.dischargedArchive;

            disk.todos = safeRead("todos") || [];
            var notes = safeRead("notes") || {};
            disk.wardNotes = notes.wardNotes || notes || {};
            
            var settings = safeRead("settings") || {};
            disk.settings = settings;
            if (settings.users) disk.users = settings.users;
            if (settings.announcement !== undefined) disk.announcement = settings.announcement;

            disk.history = safeRead("history") || [];
            return disk;
        },

        // メモリ上のデータとサーバーデータを安全に結合して保存する
        saveAll: function(myData) {
            if (!initFSO()) return myData;
            
            var diskData = this.loadAll(); // 保存直前に最新のサーバー状態を取得
            var merged = {};

            // 1. 患者データの結合
            merged.patients = {};
            var allWards = {};
            if (diskData.patients) for (var w in diskData.patients) allWards[w] = true;
            if (myData.patients)   for (var w in myData.patients)   allWards[w] = true;
            for (var w in allWards) {
                merged.patients[w] = mergeArrayById((diskData.patients||{})[w], (myData.patients||{})[w], mergeObj);
            }
            merged.admissionSchedule = mergeArrayById(diskData.admissionSchedule, myData.admissionSchedule, mergeObj);
            merged.dischargedArchive = mergeArrayById(diskData.dischargedArchive, myData.dischargedArchive, mergeObj);

            // 2. ToDo、ノート、履歴の結合
            merged.todos = mergeArrayById(diskData.todos, myData.todos, mergeObj);
            
            merged.wardNotes = {};
            var allNWards = {};
            if (diskData.wardNotes) for (var nw in diskData.wardNotes) allNWards[nw] = true;
            if (myData.wardNotes)   for (var nw in myData.wardNotes)   allNWards[nw] = true;
            for (var nw in allNWards) {
                merged.wardNotes[nw] = mergeArrayById((diskData.wardNotes||{})[nw], (myData.wardNotes||{})[nw], mergeObj);
            }

            var myHist = (myData.history instanceof Array) ? myData.history : [];
            var dHist = (diskData.history instanceof Array) ? diskData.history : [];
            merged.history = myHist.concat(dHist); // 簡易結合（重複は実運用で間引かれる）

            // 3. 設定の深いマージ（他人の病棟設定を消さない超重要処理）
            merged.settings = diskData.settings || {};
            if (myData.settings) {
                for (var sk in myData.settings) {
                    if (sk === "userWards") {
                        merged.settings.userWards = diskData.settings.userWards || {};
                        for (var uid in myData.settings.userWards) {
                            merged.settings.userWards[uid] = myData.settings.userWards[uid];
                        }
                    } else if (sk === "users") {
                        merged.settings.users = diskData.settings.users || {};
                        for (var uid in myData.settings.users) {
                            merged.settings.users[uid] = myData.settings.users[uid];
                        }
                    } else {
                        merged.settings[sk] = myData.settings[sk];
                    }
                }
            }
            
            // ユーザーリストの同期
            merged.users = merged.settings.users || {};
            
            // お知らせの同期
            merged.announcement = (myData.announcement !== undefined) ? myData.announcement : (diskData.announcement || "");
            merged.settings.announcement = merged.announcement;

            // ★重要：yrSettings は myStorage (HTA側) が直接操作するため、ここでは一切触れない（上書き破壊を防ぐ）
            if (merged.settings.yrSettings) delete merged.settings.yrSettings;

            // 4. ファイルへの書き込み
            saveFile(getJsonPath("patients"), { patients: merged.patients, admissionSchedule: merged.admissionSchedule, dischargedArchive: merged.dischargedArchive });
            saveFile(getJsonPath("todos"), merged.todos);
            saveFile(getJsonPath("notes"), { wardNotes: merged.wardNotes });
            saveFile(getJsonPath("settings"), merged.settings);
            saveFile(getJsonPath("history"), merged.history);

            return merged; // HTA側に最新の結合済みデータを返す
        }
    };
})();

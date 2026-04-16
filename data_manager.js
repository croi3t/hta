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

    // パフォーマンス管理用タイムスタンプ
    var lastReplayTs = 0;
    var lastArchiveTs = 0;

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
                settings: { adminIds: ["16622", "17049", "17494", "17701", "17702", "3107", "17397", "17050", "16623", "17496", "3429", "17626"], activeWardCodes: ["99"] },
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
            for (var key in settings) {
                disk.settings[key] = settings[key];
            }
            if (disk.settings.users) disk.users = disk.settings.users;
            if (settings.announcement !== undefined) disk.announcement = settings.announcement;

            disk.history = safeRead("history") || [];
            
            // 冪等性確保用の適用済みIDリスト
            disk.appliedTxIds = pat.appliedTxIds || []; 
            
            return disk;
        },

        // メモリ上のデータとサーバーデータを安全に結合して保存する（チェックポイント）
        saveAll: function(myData) {
            if (!initFSO()) return myData;
            
            var diskData = this.loadAll(); // 保存直前に最新のサーバー状態を取得
            var merged = this._mergeAndSave(myData, diskData);

            // 1時間以上経過した伝票を整理
            this._lazyArchive();

            return merged;
        },

        // -------------------------------------------------------
        // トランザクション処理 (伝票方式による差分同期)
        // -------------------------------------------------------

        // トランザクションディレクトリの取得・作成
        getTxDir: function() {
            if (!initFSO()) return "";
            var txDir = fso.BuildPath(SHARED_DATA_PATH, "tx");
            var archiveDir = fso.BuildPath(txDir, "archive");
            try {
                if (!fso.FolderExists(txDir)) fso.CreateFolder(txDir);
                if (!fso.FolderExists(archiveDir)) fso.CreateFolder(archiveDir);
            } catch(e) { return ""; }
            return txDir;
        },

        // 変更を伝票として発行
        appendTransaction: function(op, payload) {
            var txDir = this.getTxDir();
            if (!txDir) return false;

            var ts = new Date().getTime();
            var rand = Math.floor(Math.random() * 0x10000).toString(16);
            // ID形式: [ts]_[uid]_[rand]
            var txId = ts + "_" + (window.currentSystemId || "unknown") + "_" + rand;
            
            var txData = {
                txId: txId,
                ts: ts,
                uId: window.currentSystemId,
                uName: window.currentUserName,
                op: op,
                data: payload
            };

            var filePath = fso.BuildPath(txDir, "tx_" + txId + ".json");
            return saveFile(filePath, stringifyData(txData));
        },

        // 他端末の伝票を読み込んでリプレイする (超高速化版)
        replayTransactions: function(appData) {
            var txDir = this.getTxDir();
            if (!txDir || !appData) return false;

            var folder = fso.GetFolder(txDir);
            var fc = new Enumerator(folder.Files);
            var targets = [];

            for (; !fc.atEnd(); fc.moveNext()) {
                var file = fc.item();
                if (file.Name.indexOf("tx_") === 0 && file.Name.indexOf(".json") !== -1) {
                    var parts = file.Name.split("_");
                    var ts = parseInt(parts[1], 10);
                    
                    // 【高速化1】前回処理した時間(lastReplayTs)より古いファイルは、開く前に無視する
                    if (ts <= lastReplayTs) continue;

                    var txId = file.Name.replace("tx_", "").replace(".json", "");
                    
                    // 適用済みチェック
                    var alreadyApplied = false;
                    var appliedIds = appData.appliedTxIds || [];
                    for(var j=0; j<appliedIds.length; j++) {
                        if(appliedIds[j] === txId) { alreadyApplied = true; break; }
                    }

                    if (!alreadyApplied) {
                        targets.push({ id: txId, ts: ts, path: file.Path });
                    }
                }
            }

            if (targets.length === 0) return false;

            // タイムスタンプ順に適用
            targets.sort(function(a, b) { return a.ts - b.ts; });

            var updatedCount = 0;
            if (!appData.appliedTxIds) appData.appliedTxIds = [];
            var maxTs = lastReplayTs;

            for (var i = 0; i < targets.length; i++) {
                // 【高速化2】必要なファイルだけを開いてパースする
                var raw = loadFile(targets[i].path);
                var tx = parseData(raw);
                if (tx) {
                    if (tx.uId !== window.currentSystemId) {
                        this._applyDelta(appData, tx.op, tx.data, tx.uName);
                        updatedCount++;
                    }
                }
                appData.appliedTxIds.push(targets[i].id);
                if (targets[i].ts > maxTs) maxTs = targets[i].ts;
            }
            
            // 処理済みタイムスタンプを更新
            lastReplayTs = maxTs;
            
            if (appData.appliedTxIds.length > 1000) {
                appData.appliedTxIds = appData.appliedTxIds.slice(-1000);
            }

            return updatedCount > 0;
        },

        // -------------------------------------------------------
        // トランザクション処理 (伝票方式による差分同期)
        // -------------------------------------------------------
        
        // （getTxDir, appendTransaction, replayTransactions は既存のままでOK）

        // 各オペレーションの具体的反映
        _applyDelta: function(appData, op, data, uName) {
            try {
                var p = null;
                if (data && data.patientId && data.wardCode) {
                    p = this._findPatientInAppData(appData, data.patientId, data.wardCode);
                }

                switch (op) {
                    case "UPDATE_PATIENT_MEMO":
                        if (p) { p.memo = data.value; this._updateMemoAuthors(p, uName); }
                        break;
                    case "TOGGLE_STATUS":
                        if (p) p.status = data.value;
                        break;
                    case "TOGGLE_PRESCRIPTION":
                        if (p) p.chkPrescription = data.value;
                        break;
                    case "TOGGLE_ALERT":
                        if (p) p.alertLevel = data.value;
                        break;
                    case "UPDATE_PERSONAL_MEMO":
                        if (p) {
                            if (!p.personalMemos) p.personalMemos = {};
                            p.personalMemos[data.userId] = data.value;
                        }
                        break;
                    case "ADD_TODO":
                        if (!appData.todos) appData.todos = [];
                        var exists = false;
                        for (var k = 0; k < appData.todos.length; k++) {
                            if (String(appData.todos[k].id) === String(data.id)) {
                                exists = true;
                                // 既に存在する場合は重複追加を防ぎ、上書き更新する
                                for (var key in data) {
                                    if (data.hasOwnProperty(key)) appData.todos[k][key] = data[key];
                                }
                                break;
                            }
                        }
                        if (!exists) appData.todos.push(data);
                        break;
                    case "TOGGLE_TODO":
                        if (appData.todos) {
                            for(var k=0; k<appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    appData.todos[k].done = data.done; break;
                                }
                            }
                        }
                        break;
                    case "DELETE_TODO":
                        if (appData.todos) {
                            for(var k=0; k<appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    appData.todos[k].deleted = data.deleted; break;
                                }
                            }
                        }
                        break;
                    case "HARD_DELETE_TODO":
                        if (appData.todos) {
                            for(var k=0; k<appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    appData.todos[k].hardDeleted = true; break;
                                }
                            }
                        }
                        break;
                    case "UPDATE_NOTE":
                        if (!appData.wardNotes) appData.wardNotes = {};
                        var wCode = data.wardCode || "99";
                        if (!appData.wardNotes[wCode]) appData.wardNotes[wCode] = [];
                        
                        var wardNotes = appData.wardNotes[wCode];
                        var foundNote = false;
                        for (var n = 0; n < wardNotes.length; n++) {
                            if (String(wardNotes[n].id) === String(data.id)) {
                                wardNotes[n].title = data.title;
                                wardNotes[n].content = data.content;
                                wardNotes[n].author = data.author || uName;
                                wardNotes[n].date = data.date;
                                foundNote = true;
                                break;
                            }
                        }
                        // 存在しなければ新規追加
                        if (!foundNote) {
                            wardNotes.unshift({
                                id: data.id, title: data.title, content: data.content,
                                author: data.author || uName, date: data.date
                            });
                        }
                        break;
                }
            } catch(e) {}
        },

        _updateMemoAuthors: function(p, uName) {
            var now = new Date();
            var tsDisplay = (now.getMonth() + 1) + "/" + now.getDate() + " " + now.getHours() + ":" + (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
            var authorStr = uName + " (" + tsDisplay + ")";
            
            if (!p.memoAuthors) p.memoAuthors = [];
            if (p.memoAuthors[0] && p.memoAuthors[0].indexOf(uName) === 0) {
                p.memoAuthors[0] = authorStr;
            } else {
                p.memoAuthors.unshift(authorStr);
            }
            if (p.memoAuthors.length > 3) p.memoAuthors = p.memoAuthors.slice(0, 3);
            p.memoAuthor = p.memoAuthors[0];
        },

        _findPatientInAppData: function(appData, pid, wardCode) {
            // 【バグ修正】古いpatientsWardキーではなく、マップ形式のpatientsキーを参照する
            var list = appData.patients ? appData.patients[wardCode] : null;
            if (!list) return null;
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(pid)) return list[i];
            }
            return null;
        },

        _lazyArchive: function() {
            var now = new Date().getTime();
            // 【高速化3】お掃除処理は、前回の実行から「10分」以上経過している時だけ実行する
            if (now - lastArchiveTs < 600000) return; 
            
            var txDir = this.getTxDir();
            if (!txDir) return;
            var archiveDir = fso.BuildPath(txDir, "archive");
            var threshold = 3600000; // 1時間

            try {
                var folder = fso.GetFolder(txDir);
                var fc = new Enumerator(folder.Files);
                for (; !fc.atEnd(); fc.moveNext()) {
                    var file = fc.item();
                    if (file.Name.indexOf("tx_") === 0) {
                        try {
                            if (now - new Date(file.DateLastModified).getTime() > threshold) {
                                fso.MoveFile(file.Path, fso.BuildPath(archiveDir, file.Name));
                            }
                        } catch(e) {}
                    }
                }
                // 実行時間を記録
                lastArchiveTs = now;
            } catch(e) {}
        },

        // メモリ上のデータとサーバーデータを安全に結合して保存する（チェックポイント）
        saveAll: function(myData) {
            if (!initFSO()) return myData;
            
            var diskData = this.loadAll(); // 保存直前に最新のサーバー状態を取得

            // 【最重要修正】マスターファイル上書き前に必ず最新伝票を取り込む
            this.replayTransactions(myData);

            var merged = this._mergeAndSave(myData, diskData);

            this._lazyArchive(); // 1時間以上経過した伝票を整理

            return merged;
        },

        _mergeAndSave: function(myData, diskData) {
            var merged = {};

            // ▼ トランザクション管理対象データ（最新のmyDataをそのまま正として採用） ▼
            merged.patients = myData.patients || {};
            merged.admissionSchedule = myData.admissionSchedule || [];
            merged.dischargedArchive = myData.dischargedArchive || {};
            merged.todos = myData.todos || [];
            merged.wardNotes = myData.wardNotes || {};

            // 【最重要修正】適用済みトランザクションIDの確実な結合（履歴の忘却防止）
            var txIdMap = {};
            var mergedTxIds = [];
            var myTxIds = myData.appliedTxIds || [];
            var diskTxIds = diskData.appliedTxIds || [];

            for (var i = 0; i < myTxIds.length; i++) { 
                txIdMap[myTxIds[i]] = true; 
                mergedTxIds.push(myTxIds[i]); 
            }
            for (var j = 0; j < diskTxIds.length; j++) {
                if (!txIdMap[diskTxIds[j]]) { 
                    txIdMap[diskTxIds[j]] = true; 
                    mergedTxIds.push(diskTxIds[j]); 
                }
            }
            // 肥大化を防ぐため最新1000件に保つ
            if (mergedTxIds.length > 1000) mergedTxIds = mergedTxIds.slice(-1000);
            merged.appliedTxIds = mergedTxIds;

            // ▼ トランザクション管理外データ（設定・履歴等）の結合 ▼
            var myHist = (myData.history instanceof Array) ? myData.history : [];
            var dHist = (diskData.history instanceof Array) ? diskData.history : [];
            var histSeen = {};
            var histResult = [];
            var histCombo = myHist.concat(dHist);
            for (var hi = 0; hi < histCombo.length; hi++) {
                var hItem = histCombo[hi];
                if (!hItem) continue;
                var hKey = hItem.id ? String(hItem.id) : (hItem.createdAt ? String(hItem.createdAt) : null);
                if (hKey) {
                    if (!histSeen[hKey]) { histSeen[hKey] = true; histResult.push(hItem); }
                } else {
                    histResult.push(hItem); 
                }
            }
            merged.history = histResult;

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
            merged.users = merged.settings.users || {};
            
            var bAnn = diskData.announcement || "";
            var mAnn = (myData.announcement !== undefined) ? myData.announcement : "";
            merged.announcement = (mAnn !== bAnn && mAnn !== "") ? mAnn : bAnn;
            merged.settings.announcement = merged.announcement;

            if (merged.settings.yrSettings) delete merged.settings.yrSettings;

            // ▼ ファイルへの書き込み ▼
            var patObj = { 
                patients: merged.patients, 
                admissionSchedule: merged.admissionSchedule, 
                dischargedArchive: merged.dischargedArchive,
                appliedTxIds: merged.appliedTxIds 
            };
            var patStr = stringifyData(patObj);
            if (patStr && patStr.length > 2) saveFile(getJsonPath("patients"), patStr);

            var todoStr = stringifyData(merged.todos);
            if (todoStr && todoStr.length > 1) saveFile(getJsonPath("todos"), todoStr);

            var notesStr = stringifyData({ wardNotes: merged.wardNotes });
            if (notesStr && notesStr.length > 2) saveFile(getJsonPath("notes"), notesStr);

            var settingsStr = stringifyData(merged.settings);
            if (settingsStr && settingsStr.length > 2) saveFile(getJsonPath("settings"), settingsStr);

            var histStr = stringifyData(merged.history);
            if (histStr && histStr.length > 1) saveFile(getJsonPath("history"), histStr);

            return merged; 
        }
    };
})();

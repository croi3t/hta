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

        // 他端末の伝票を読み込んでリプレイする
        replayTransactions: function(appData) {
            var txDir = this.getTxDir();
            if (!txDir || !appData) return false;

            var folder = fso.GetFolder(txDir);
            var fc = new Enumerator(folder.Files);
            var targets = [];

            // 未適用のファイルをフィルタリング
            for (; !fc.atEnd(); fc.moveNext()) {
                var file = fc.item();
                if (file.Name.indexOf("tx_") === 0 && file.Name.indexOf(".json") !== -1) {
                    var txId = file.Name.replace("tx_", "").replace(".json", "");
                    
                    // 適用済みチェック (冪等性の確保)
                    var alreadyApplied = false;
                    var appliedIds = appData.appliedTxIds || [];
                    for(var j=0; j<appliedIds.length; j++) {
                        if(appliedIds[j] === txId) { alreadyApplied = true; break; }
                    }

                    if (!alreadyApplied) {
                        var parts = txId.split("_");
                        targets.push({ id: txId, ts: parseInt(parts[0],10), path: file.Path });
                    }
                }
            }

            if (targets.length === 0) return false;

            // タイムスタンプ順に適用
            targets.sort(function(a, b) { return a.ts - b.ts; });

            var updatedCount = 0;
            if (!appData.appliedTxIds) appData.appliedTxIds = [];

            for (var i = 0; i < targets.length; i++) {
                var raw = loadFile(targets[i].path);
                var tx = parseData(raw);
                if (tx) {
                    // 自分以外が発行した伝票のみ適用するが、IDは自分のものでも記録する
                    if (tx.uId !== window.currentSystemId) {
                        this._applyDelta(appData, tx.op, tx.data, tx.uName);
                        updatedCount++;
                    }
                }
                appData.appliedTxIds.push(targets[i].id);
            }
            
            // 適用済みリストを直近1000件程度に維持
            if (appData.appliedTxIds.length > 1000) {
                appData.appliedTxIds = appData.appliedTxIds.slice(-1000);
            }

            return updatedCount > 0;
        },

        // 各オペレーションの具体的反映
        _applyDelta: function(appData, op, data, uName) {
            try {
                var p = null;
                if (data && data.patientId && data.wardCode) {
                    p = this._findPatientInAppData(appData, data.patientId, data.wardCode);
                }

                switch (op) {
                    case "UPDATE_PATIENT_MEMO":
                        if (p) {
                            p.memo = data.value;
                            this._updateMemoAuthors(p, uName);
                        }
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
                        appData.todos.push(data);
                        break;
                    case "TOGGLE_TODO":
                        if (appData.todos) {
                            for(var k=0; k<appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    appData.todos[k].done = data.done;
                                    break;
                                }
                            }
                        }
                        break;
                    case "DELETE_TODO":
                        if (appData.todos) {
                            for(var k=0; k<appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    appData.todos[k].deleted = data.deleted;
                                    break;
                                }
                            }
                        }
                        break;
                }
            } catch(e) {}
        },

        // メモ履歴の統合
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
            var wk = "patientsWard" + wardCode;
            var list = appData[wk];
            if (!list) return null;
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(pid)) return list[i];
            }
            return null;
        },

        // 蓄積した伝票のアーカイブ (Lazy Archive)
        _lazyArchive: function() {
            var txDir = this.getTxDir();
            if (!txDir) return;
            var archiveDir = fso.BuildPath(txDir, "archive");
            var now = new Date().getTime();
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
                        } catch(e) { /* 使用中のファイル等はスキップ */ }
                    }
                }
            } catch(e) {}
        },

        // 内部メループ＆保存共通処理（二重ロードを防ぐため分離）
        _mergeAndSave: function(myData, diskData) {
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
            // IDベースで重複排除（myData優先 - 自分の変更を優先するため先に追加）
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
                    histResult.push(hItem); // IDなし履歴はそのまま追加
                }
            }
            merged.history = histResult;

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

            // 4. ファイルへの書き込み―データが空の場合は書き込みをスキップしてファイル破椁を防ぐ
            var patObj = { 
                patients: merged.patients, 
                admissionSchedule: merged.admissionSchedule, 
                dischargedArchive: merged.dischargedArchive,
                appliedTxIds: merged.appliedTxIds // 適用済みIDも永続化
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

            return merged; // HTA側に最新の結合済みデータを返す
        }
    };
})();

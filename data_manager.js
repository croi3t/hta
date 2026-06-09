var DataManager = (function() {
    var fso = null;
    var lastReplayTs = 0;
    var lastArchiveTs = 0;

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
        if (typeof SHARED_DATA_PATH === "undefined") return "";
        return fso.BuildPath(SHARED_DATA_PATH, cat + ".json");
    }

    function stringifyData(obj) {
        if (typeof JSON !== 'undefined' && JSON.stringify) return JSON.stringify(obj);
        return ""; 
    }

    function parseData(str) {
        if (!str) return null;
        try {
            if (typeof JSON !== 'undefined' && JSON.parse) return JSON.parse(str);
            return eval("(" + str + ")");
        } catch (e) { return null; }
    }

    function saveFile(path, text) {
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

    var _lastTx = { op: "", id: "", val: "" };
    var _lastSavedDataHash = "";
    var _txCounter = 0;
    
    function getHash(obj) {
        var str = stringifyData(obj);
        var hash = 0;
        if (!str) return hash;
        for (var i = 0; i < str.length; i++) {
            hash = ((hash << 5) - hash) + str.charCodeAt(i);
            hash |= 0;
        }
        return hash;
    }

    return {
        appData: {},

        init: function() {
            initFSO();
        },

        loadAll: function() {
            if (!initFSO()) return {};
            
            var adminList = ["16622", "17049", "17494", "17701", "17702"];
            adminList.push("3107", "17397", "17050", "16623", "17496", "3429", "17626");
            adminList.push("17624", "2772", "16365", "17276", "17495", "3716");

            var disk = {
                patients: {}, wardNotes: {}, todos: [], history: [],
                settings: { adminIds: adminList, activeWardCodes: ["99"] },
                users: {}, announcement: "", admissionSchedule: [], dischargedArchive: {}
            };

            function safeRead(cat) {
                var txt = loadFile(getJsonPath(cat));
                return txt ? parseData(txt) : null;
            }

            var pat = safeRead("patients") || {};
            if (pat.patients) disk.patients = pat.patients;
            if (pat.admissionSchedule) disk.admissionSchedule = pat.admissionSchedule;
            
            // ★修正: 過去のバグで配列として保存されている場合、辞書型(オブジェクト)に自動変換する
            if (pat.dischargedArchive) {
                if (pat.dischargedArchive instanceof Array) {
                    var arcObj = {};
                    for (var i = 0; i < pat.dischargedArchive.length; i++) {
                        if (pat.dischargedArchive[i] && pat.dischargedArchive[i].id) {
                            arcObj[pat.dischargedArchive[i].id] = pat.dischargedArchive[i];
                        }
                    }
                    disk.dischargedArchive = arcObj;
                } else {
                    disk.dischargedArchive = pat.dischargedArchive;
                }
            } else {
                disk.dischargedArchive = {};
            }

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
            disk.appliedTxIds = pat.appliedTxIds || []; 
            
            // --- メタデータの抽出・移行処理 ---
            disk.patientMeta = pat.patientMeta || {};

            function extractMeta(p) {
                if (!p || !p.id) return;
                var nId = String(p.id).replace(/^0+/, '') || '0';
                var hasMeta = false;
                var meta = disk.patientMeta[nId] || {};
                
                if (p.memo !== undefined) { meta.memo = p.memo; hasMeta = true; }
                if (p.status !== undefined) { meta.status = p.status; hasMeta = true; }
                if (p.statusAuthor !== undefined) { meta.statusAuthor = p.statusAuthor; hasMeta = true; }
                if (p.alertLevel !== undefined) { meta.alertLevel = p.alertLevel; hasMeta = true; }
                if (p.memoAuthors !== undefined) { meta.memoAuthors = p.memoAuthors; hasMeta = true; }
                if (p.bloodDate !== undefined && p.bloodDate !== "-") { meta.bloodDate = p.bloodDate; hasMeta = true; }
                if (p.bloodDetail !== undefined) { meta.bloodDetail = p.bloodDetail; hasMeta = true; }
                if (p.chkPrescription !== undefined) { meta.chkPrescription = p.chkPrescription; hasMeta = true; }
                if (p.personalMemos !== undefined) { meta.personalMemos = p.personalMemos; hasMeta = true; }
                
                if (hasMeta) {
                    disk.patientMeta[nId] = meta;
                }
            }

            // patientsから抽出
            for (var ward in disk.patients) {
                if (disk.patients.hasOwnProperty(ward) && disk.patients[ward] instanceof Array) {
                    for (var i = 0; i < disk.patients[ward].length; i++) extractMeta(disk.patients[ward][i]);
                }
            }
            // admissionScheduleから抽出
            if (disk.admissionSchedule instanceof Array) {
                for (var i = 0; i < disk.admissionSchedule.length; i++) extractMeta(disk.admissionSchedule[i]);
            }
            // dischargedArchiveから抽出
            for (var aId in disk.dischargedArchive) {
                if (disk.dischargedArchive.hasOwnProperty(aId)) extractMeta(disk.dischargedArchive[aId]);
            }
            // ---------------------------------
            
            return disk;
        },

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

        appendTransaction: function(op, payload) {
            var txDir = this.getTxDir();
            if (!txDir) return false;

            // 1. 重複ガード
            var currentTxDataStr = stringifyData({ op: op, data: payload });
            if (this._lastTxDataStr === currentTxDataStr) return true;
            this._lastTxDataStr = currentTxDataStr;

            // 2. トランザクションファイル作成
            var ts = new Date().getTime();
            var txId = ts + "_" + (_txCounter++) + "_" + (window.currentSystemId || "unknown") + "_" + Math.floor(Math.random() * 0x10000).toString(16);

            // (UI側で漏れている場合への保険としてローカルにも適用)
            if (typeof appData !== 'undefined') {
                this._applyDelta(appData, op, payload, window.currentUserName, ts);
                // ★修正: ローカル適用時に自分のトランザクションIDも記録しておく
                if (!appData.appliedTxIds) appData.appliedTxIds = [];
                appData.appliedTxIds.push(txId); 
            }

            var txData = { txId: txId, ts: ts, uId: window.currentSystemId, uName: window.currentUserName, op: op, data: payload };
            saveFile(fso.BuildPath(txDir, "tx_" + txId + ".json"), stringifyData(txData));

            // ★追加: 「自分の未保存の変更がある」というフラグを立てる
            this.hasLocalChanges = true;

            // 3. saveAll is removed for performance
            // if (typeof window.appData !== "undefined") {
            //     this.saveAll(window.appData); 
            // }
            
            return true;
        },

        replayTransactions: function(appData) {
            var txDir = this.getTxDir();
            if (!txDir || !appData) return false;

            var appliedMap = {};
            var appliedIds = appData.appliedTxIds || [];
            var maxAppliedTs = 0;
            for (var j = 0; j < appliedIds.length; j++) {
                appliedMap[appliedIds[j]] = true;
                var tsParts = appliedIds[j].split("_");
                var tsVal = parseInt(tsParts[0], 10);
                if (!isNaN(tsVal) && tsVal > maxAppliedTs) maxAppliedTs = tsVal;
            }

            if (lastReplayTs === 0 && maxAppliedTs > 60000) {
                lastReplayTs = maxAppliedTs - 60000;
            }

            var folder = fso.GetFolder(txDir);
            var fc = new Enumerator(folder.Files);
            var targets = [];

            for (; !fc.atEnd(); fc.moveNext()) {
                var file = fc.item();
                var fname = file.Name;
                
                if (fname.indexOf("tx_") === 0 && fname.indexOf(".json") !== -1) {
                    var parts = fname.split("_");
                    var ts = parseInt(parts[1], 10);
                    
                    if (ts <= lastReplayTs) continue;

                    var txId = fname.replace("tx_", "").replace(".json", "");

                    if (!appliedMap[txId]) {
                        targets.push({ id: txId, ts: ts, path: file.Path });
                    }
                }
            }

            if (targets.length === 0) return false;

            targets.sort(function(a, b) { return a.ts - b.ts; });

            var updatedCount = 0;
            if (!appData.appliedTxIds) appData.appliedTxIds = [];
            var maxTs = lastReplayTs;

            for (var i = 0; i < targets.length; i++) {
                var raw = loadFile(targets[i].path);
                var tx = parseData(raw);
                if (tx) {
                    // ★修正: tx.uId !== window.currentSystemId という「自分を無視する制限」を削除！
                    // 誰のトランザクションであれ、未適用なら必ず適用する
                    this._applyDelta(appData, tx.op, tx.data, tx.uName, tx.ts);
                    updatedCount++;
                }
                appData.appliedTxIds.push(targets[i].id);
                if (targets[i].ts > maxTs) maxTs = targets[i].ts;
            }
            
            lastReplayTs = maxTs;
            
            if (appData.appliedTxIds.length > 500) {
                appData.appliedTxIds = appData.appliedTxIds.slice(-500);
            }

            return updatedCount > 0;
        },

                _applyDelta: function(appData, op, data, uName, txTs) {
            try {
                var p = null;
                if (data && data.patientId && data.wardCode) {
                    p = this._findPatientInAppData(appData, data.patientId, data.wardCode);
                }

                // メタデータ一元更新ヘルパー
                var updateMeta = function(pid, field, value) {
                    if (!pid) return;
                    var nId = String(pid).replace(/^0+/, '') || '0';
                    if (!appData.patientMeta) appData.patientMeta = {};
                    if (!appData.patientMeta[nId]) appData.patientMeta[nId] = {};
                    appData.patientMeta[nId][field] = value;
                };

                                var updateMetaAuthors = function(pid, author, tsVal) {
                    if (!pid || !author) return;
                    var timeStr = "";
                    if (tsVal) {
                        var d = new Date(tsVal);
                        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
                        var dd = ("0" + d.getDate()).slice(-2);
                        var hh = ("0" + d.getHours()).slice(-2);
                        var min = ("0" + d.getMinutes()).slice(-2);
                        timeStr = " (" + mm + "/" + dd + " " + hh + ":" + min + ")";
                    }
                    var authorText = author + timeStr;

                    var nId = String(pid).replace(/^0+/, '') || '0';
                    if (!appData.patientMeta) appData.patientMeta = {};
                    if (!appData.patientMeta[nId]) appData.patientMeta[nId] = {};
                    var meta = appData.patientMeta[nId];
                    if (!meta.memoAuthors) meta.memoAuthors = [];
                    
                    if (meta.memoAuthors.length > 0 && meta.memoAuthors[0].indexOf(author) === 0) {
                        meta.memoAuthors[0] = authorText;
                    } else {
                        meta.memoAuthors.unshift(authorText);
                    }
                    if (meta.memoAuthors.length > 3) meta.memoAuthors = meta.memoAuthors.slice(0, 3);
                    meta.memoAuthor = authorText;
                };

                var updateMetaDict = function(pid, dictField, key, value) {
                    if (!pid) return;
                    var nId = String(pid).replace(/^0+/, '') || '0';
                    if (!appData.patientMeta) appData.patientMeta = {};
                    if (!appData.patientMeta[nId]) appData.patientMeta[nId] = {};
                    if (!appData.patientMeta[nId][dictField]) appData.patientMeta[nId][dictField] = {};
                    appData.patientMeta[nId][dictField][key] = value;
                };

                var needsInject = false;

                switch (op) {
                    case "UPDATE_ANNOUNCEMENT":
                        appData.announcement = data.value;
                        if (!appData.settings) appData.settings = {};
                        appData.settings.announcement = data.value;
                        break;
                    case "UPDATE_ADMISSION_MEMO":
                    case "UPDATE_PATIENT_MEMO":
                        updateMeta(data.patientId, "memo", data.value);
                        updateMetaAuthors(data.patientId, uName, txTs);
                        needsInject = true;
                        break;
                    case "UPDATE_ADMISSION_STATUS":
                        updateMeta(data.patientId, "status", data.value);
                        updateMeta(data.patientId, "statusAuthor", data.author);
                        needsInject = true;
                        break;
                    case "TOGGLE_STATUS":
                        updateMeta(data.patientId, "status", data.value);
                        updateMeta(data.patientId, "statusAuthor", typeof data.author !== "undefined" ? data.author : uName);
                        needsInject = true;
                        break;
                    case "UPDATE_ADMISSION_ALERT":
                    case "TOGGLE_ALERT":
                        updateMeta(data.patientId, "alertLevel", data.value);
                        needsInject = true;
                        break;
                    case "UPDATE_SURGERY_INFO":
                        if (p) {
                            p.surgeryDate = data.surgeryDate;
                            p.surgeryDisease = data.surgeryDisease;
                            p.surgeryProcedure = data.surgeryProcedure;
                            p.surgeryAnesthesia = data.surgeryAnesthesia;
                            p.surgeryHasEpi = data.surgeryHasEpi;
                            p.surgeryLixiana = data.surgeryLixiana;
                        }
                        break;
                    case "UPDATE_BLOOD_DATE":
                        updateMeta(data.patientId, "bloodDate", data.bloodDate);
                        updateMeta(data.patientId, "bloodDetail", data.bloodDetail);
                        needsInject = true;
                        break;
                    case "TOGGLE_PRESCRIPTION":
                        updateMeta(data.patientId, "chkPrescription", data.value);
                        needsInject = true;
                        break;
                    case "UPDATE_PERSONAL_MEMO":
                        updateMetaDict(data.patientId, "personalMemos", data.userId, data.value);
                        needsInject = true;
                        break;
                    case "ADD_TODO":
                        if (!appData.todos) appData.todos = [];
                        var exists = false;
                        for (var k = 0; k < appData.todos.length; k++) {
                            if (String(appData.todos[k].id) === String(data.id)) {
                                exists = true;
                                for (var key in data) {
                                    if (data.hasOwnProperty(key)) appData.todos[k][key] = data[key];
                                }
                                break;
                            }
                        }
                        if (!exists) {
                            appData.todos.push(data);
                        }
                        break;
                    case "MARK_TODO_READ":
                        if (appData.todos) {
                            for (var k = 0; k < appData.todos.length; k++) {
                                if (String(appData.todos[k].id) === String(data.id)) {
                                    if (!appData.todos[k].readBy) appData.todos[k].readBy = [];
                                    if (appData.todos[k].readBy.indexOf(data.userId) === -1) {
                                        appData.todos[k].readBy.push(data.userId);
                                    }
                                    break;
                                }
                            }
                        }
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
                        if (!foundNote) {
                            wardNotes.unshift({
                                id: data.id, title: data.title, content: data.content,
                                author: data.author || uName, date: data.date
                            });
                        }
                        break;
                    case "DELETE_NOTE":
                        if (appData.wardNotes) {
                            var wCode = data.wardCode || "99";
                            if (appData.wardNotes[wCode]) {
                                var wardNotes = appData.wardNotes[wCode];
                                for (var n = 0; n < wardNotes.length; n++) {
                                    if (String(wardNotes[n].id) === String(data.id)) {
                                        wardNotes.splice(n, 1);
                                        break;
                                    }
                                }
                            }
                        }
                        break;
                    case "UPDATE_CUSTOM_TABS":
                        if (!appData.settings) appData.settings = {};
                        if (!appData.settings.userCustomTabs) appData.settings.userCustomTabs = {};
                        appData.settings.userCustomTabs[data.userId] = data.tabs;
                        break;
                }
                if (needsInject && typeof window.PatientLogic !== "undefined" && window.PatientLogic.injectMeta) {
                    window.PatientLogic.injectMeta(appData);
                }
            } catch(e) { console.log(e); }
        },

                _updateMemoAuthors: function(p, uName) {
            var now = new Date();
            var minStr = (now.getMinutes() < 10 ? "0" : "") + now.getMinutes();
            var tsDisplay = (now.getMonth() + 1) + "/" + now.getDate() + " " + now.getHours() + ":" + minStr;
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
            var list = appData.patients ? appData.patients[wardCode] : null;
            if (list) {
                for (var i = 0; i < list.length; i++) {
                    if (String(list[i].id) === String(pid)) return list[i];
                }
            }
            if (appData.dischargedArchive && appData.dischargedArchive[pid]) {
                return appData.dischargedArchive[pid];
            }
            return null;
        },

        _lazyArchive: function() {
            var now = new Date().getTime();
            if (now - lastArchiveTs < 600000) return; 
            
            var txDir = this.getTxDir();
            if (!txDir) return;
            var archiveDir = fso.BuildPath(txDir, "archive");
            var threshold = 3600000; 

            try {
                var folder = fso.GetFolder(txDir);
                var fc = new Enumerator(folder.Files);
                for (; !fc.atEnd(); fc.moveNext()) {
                    var file = fc.item();
                    var fname = file.Name;
                    if (fname.indexOf("tx_") === 0) {
                        try {
                            var parts = fname.split("_");
                            var fileTs = parseInt(parts[1], 10);
                            
                            if (!isNaN(fileTs)) {
                                if (now - fileTs > threshold) {
                                    fso.MoveFile(file.Path, fso.BuildPath(archiveDir, fname));
                                }
                            }
                        } catch(e) {}
                    }
                }
                lastArchiveTs = now;
            } catch(e) {}
        },

        _checkAndCreateBackup: function(data) {
            try {
                var now = new Date();
                var today = now.getFullYear() + ("0" + (now.getMonth() + 1)).slice(-2) + ("0" + now.getDate()).slice(-2);
                
                if (!data.settings) data.settings = {};
                if (data.settings.lastBackupDate === today) return; // 今日実行済みならスキップ

                var backupDirRoot = fso.BuildPath(SHARED_DATA_PATH, "backup");
                if (!fso.FolderExists(backupDirRoot)) fso.CreateFolder(backupDirRoot);
                
                var targetDir = fso.BuildPath(backupDirRoot, today);
                if (!fso.FolderExists(targetDir)) fso.CreateFolder(targetDir);

                var files = ["patients.json", "settings.json", "todos.json", "notes.json", "history.json"];
                for (var i = 0; i < files.length; i++) {
                    var src = getJsonPath(files[i].replace(".json", ""));
                    if (fso.FileExists(src)) {
                        fso.CopyFile(src, fso.BuildPath(targetDir, files[i]), true);
                    }
                }
                data.settings.lastBackupDate = today;
            } catch(e) {}
        },

        saveAll: function(myData, forceSave) {
            if (!initFSO()) return myData;
            
            // 1. 最新のディスク状態を読み込む
            var diskData = this.loadAll(); 
            
            // 2. ★超重要: 読み込んだ後に、未適用のトランザクションを必ず自データ(myData)に適用する
            this.replayTransactions(myData); 
            
            // 3. その上でマージする（最新のトランザクションが反映されたmyDataで上書き）
            var merged = this._mergeAndSave(myData, diskData, forceSave);
            
            // ★追加: 保存のタイミングでバックアップを確認・実行
            this._checkAndCreateBackup(merged);
            
            this._lazyArchive(); 

            return merged; 
        },

                _mergeAndSave: function(myData, diskData, forceSave) {
            var merged = {};

            merged.patients = myData.patients || {};
            merged.admissionSchedule = myData.admissionSchedule || [];
            merged.dischargedArchive = myData.dischargedArchive || {};
            merged.todos = myData.todos || [];

            // ★追加: patientMetaのマージ
            merged.patientMeta = {};
            var dMeta = diskData.patientMeta || {};
            var mMeta = myData.patientMeta || {};
            
            for (var id in dMeta) {
                if (dMeta.hasOwnProperty(id)) {
                    merged.patientMeta[id] = {};
                    for (var k in dMeta[id]) merged.patientMeta[id][k] = dMeta[id][k];
                }
            }
            for (var id in mMeta) {
                if (mMeta.hasOwnProperty(id)) {
                    var mObj = mMeta[id];
                    var dObj = merged.patientMeta[id] || {};
                    for (var key in mObj) {
                        if (mObj.hasOwnProperty(key)) {
                            if (key === "personalMemos" && typeof mObj[key] === "object") {
                                if (!dObj.personalMemos) dObj.personalMemos = {};
                                for (var pk in mObj[key]) dObj.personalMemos[pk] = mObj[key][pk];
                            } else {
                                dObj[key] = mObj[key];
                            }
                        }
                    }
                    merged.patientMeta[id] = dObj;
                }
            }

                        // ★修正: 病棟メモ(wardNotes)をサーバーデータと安全にマージする
            merged.wardNotes = diskData.wardNotes || {}; 
            if (myData.wardNotes) {
                for (var wk in myData.wardNotes) {
                    if (myData.wardNotes.hasOwnProperty(wk)) {
                        var mNotes = myData.wardNotes[wk] || [];
                        var dNotes = merged.wardNotes[wk] || [];
                        
                        // 手元が空配列(0件)の場合、初期化バグでディスクのデータが消えるのを防ぐ
                        if (mNotes.length === 0 && dNotes.length > 0) {
                            merged.wardNotes[wk] = dNotes;
                            continue;
                        }

                        // IDベースで安全にマージ
                        var noteMap = {};
                        var finalNotes = [];
                        
                        // 1. ディスクのノートをマップに登録
                        for (var i = 0; i < dNotes.length; i++) {
                            if (dNotes[i] && dNotes[i].id) {
                                noteMap[dNotes[i].id] = dNotes[i];
                            }
                        }
                        
                        // 2. 自分の手元のノートを優先して結果配列に追加（並び順は自分のものを優先）
                        var myIds = {};
                        for (var j = 0; j < mNotes.length; j++) {
                            if (mNotes[j] && mNotes[j].id) {
                                var nid = mNotes[j].id;
                                myIds[nid] = true;
                                if (noteMap[nid]) {
                                    // 既存ノートなら最新の内容に更新
                                    var mergedNote = {};
                                    for (var prop in noteMap[nid]) mergedNote[prop] = noteMap[nid][prop];
                                    for (var prop in mNotes[j]) mergedNote[prop] = mNotes[j][prop];
                                    finalNotes.push(mergedNote);
                                } else {
                                    // 新規ノート
                                    finalNotes.push(mNotes[j]);
                                }
                            }
                        }
                        
                        // 3. 自分側に存在しないディスク側のノートは、「他人が追加した」か「自分が削除した」もの。
                        // データロスを防ぐため、「自分が削除した」ケース以外は復活させるのが安全だが、
                        // 今回はトランザクションで削除が同期される前提なので、
                        // 基本的に他人が追加した未同期ノートを拾うため、ディスク残存分を後ろに追加する。
                        for (var i = 0; i < dNotes.length; i++) {
                            if (dNotes[i] && dNotes[i].id && !myIds[dNotes[i].id]) {
                                finalNotes.push(dNotes[i]);
                            }
                        }
                        
                        merged.wardNotes[wk] = finalNotes;
                    }
                }
            }

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
            if (mergedTxIds.length > 500) mergedTxIds = mergedTxIds.slice(-500);
            merged.appliedTxIds = mergedTxIds;

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

            // ★最適化：ハッシュ値をチェックし、内容が同じならファイル書き込みをスキップ
            var currentHash = getHash(merged);
            if (!forceSave && currentHash === _lastSavedDataHash) {
                return merged; // 変更なし！何もしない（これが一番速い）
            }
            _lastSavedDataHash = currentHash;

            var patObj = { 
                patients: merged.patients, 
                admissionSchedule: merged.admissionSchedule, 
                dischargedArchive: merged.dischargedArchive,
                patientMeta: merged.patientMeta,
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









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

    return {
        appData: {},

        init: function() {
            initFSO();
        },

        loadAll: function() {
            if (!initFSO()) return {};
            
            var adminList = ["16622", "17049", "17494", "17701", "17702"];
            adminList.push("3107", "17397", "17050", "16623", "17496", "3429", "17626");

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
            disk.appliedTxIds = pat.appliedTxIds || []; 
            
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

            var ts = new Date().getTime();
            var rand = Math.floor(Math.random() * 0x10000).toString(16);
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
                    if (tx.uId !== window.currentSystemId) {
                        this._applyDelta(appData, tx.op, tx.data, tx.uName);
                        updatedCount++;
                    }
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
            if (!list) return null;
            for (var i = 0; i < list.length; i++) {
                if (String(list[i].id) === String(pid)) return list[i];
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

        saveAll: function(myData) {
            if (!initFSO()) return myData;
            
            var diskData = this.loadAll(); 
            this.replayTransactions(myData);
            var merged = this._mergeAndSave(myData, diskData);
            this._lazyArchive(); 

            return merged;
        },

        _mergeAndSave: function(myData, diskData) {
            var merged = {};

            merged.patients = myData.patients || {};
            merged.admissionSchedule = myData.admissionSchedule || [];
            merged.dischargedArchive = myData.dischargedArchive || {};
            merged.todos = myData.todos || [];
            merged.wardNotes = myData.wardNotes || {};

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
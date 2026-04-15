/**
 * Board2 - 3-Way Merge Logic
 * 複数ユーザーによる同時編集を、ベースデータ、他者データ(ディスク)、自分データの3点から統合します。
 */

/**
 * 患者リストのマージ用ヘルパー関数
 */
function mergePatientList(baseList, diskList, myList) {
    var base = baseList || [];
    var disk = diskList || [];
    var my   = myList   || [];
    
    if (!(base instanceof Array)) base = [];
    if (!(disk instanceof Array)) disk = [];
    if (!(my   instanceof Array)) my   = [];

    var baseMap = {}; for(var i=0; i<base.length; i++) if(base[i]) baseMap[base[i].id] = base[i];
    var myMap = {}; for(var i=0; i<my.length; i++) if(my[i]) myMap[my[i].id] = my[i];
    var diskMap = {}; for(var i=0; i<disk.length; i++) if(disk[i]) diskMap[disk[i].id] = disk[i];
    
    var resultList = [].concat(disk); // ディスク側をベースにする

    // 自分の更新分を適用
    for (var pId in myMap) {
        var m = myMap[pId];
        var b = baseMap[pId];
        var d = diskMap[pId];
        
        if (!b) {
            // 新規追加
            if (!d) resultList.push(m);
            else {
                // ディスク側にも既に存在する場合、フィールドをマージ
                for (var key in m) { if (m.hasOwnProperty(key)) d[key] = m[key]; }
            }
        } else if (d) {
            // 既存エントリのフィールドごとマージ
            if(m.memo !== b.memo) d.memo = m.memo;
            if(m.status !== b.status) d.status = m.status;
            if (m.chkPrescription !== b.chkPrescription) d.chkPrescription = m.chkPrescription;
            if (m.alertLevel !== b.alertLevel) d.alertLevel = m.alertLevel;
            if (m.memoAuthor !== b.memoAuthor) d.memoAuthor = m.memoAuthor;
            if (m.memoAuthors && m.memoAuthors.length !== (b.memoAuthors || []).length) d.memoAuthors = m.memoAuthors;

            // ★修正2：採血日データを「サーバーと同期する対象」に含める（これで1分ごとの更新で消えなくなります）
            if (m.bloodDate !== b.bloodDate) d.bloodDate = m.bloodDate;
            if (m.bloodDetail !== b.bloodDetail) d.bloodDetail = m.bloodDetail;
            
            if (!d.personalMemos) d.personalMemos = {};
            var bMemos = b.personalMemos || {};
            var mMemos = m.personalMemos || {};
            for (var pmk in mMemos) {
                if (mMemos.hasOwnProperty(pmk) && mMemos[pmk] !== bMemos[pmk]) {
                    d.personalMemos[pmk] = mMemos[pmk];
                }
            }
        }
    }
    // 自分の削除分を適用
    for (var pId in baseMap) {
        if (!myMap[pId]) {
            for (var i = resultList.length - 1; i >= 0; i--) {
                if (resultList[i] && resultList[i].id === pId) resultList.splice(i, 1);
            }
        }
    }
    return resultList;
}

function perform3WayMerge(baseData, diskData, myData) {
    if(!myData) return diskData || {};
    if(!diskData) return myData;
    if(!baseData) baseData = {};

    // 強制的な型変換 (配列 [] として扱われるとキー付きデータが保存時に消えるため)
    if (myData.dischargedArchive instanceof Array) myData.dischargedArchive = {};
    if (diskData.dischargedArchive instanceof Array) diskData.dischargedArchive = {};
    if (baseData.dischargedArchive instanceof Array) baseData.dischargedArchive = {};
    
    var result = {};
    try {
        // 1. 患者リスト (レガシー個別キー)
        var patientKeys = ["patientsWard1", "patientsWard2", "patientsWard3", "admissionSchedule"];
        for(var w=0; w<patientKeys.length; w++) {
            var wk = patientKeys[w];
            if (myData[wk] !== undefined || diskData[wk] !== undefined) {
                result[wk] = mergePatientList(baseData[wk], diskData[wk], myData[wk]);
            }
        }

        // 1c. patients マップ (新形式・動的病棟)
        if (myData.patients || diskData.patients) {
            var myPats = myData.patients || {};
            var diskPats = diskData.patients || {};
            var basePats = baseData.patients || {};
            var mergedPats = {};
            var allCodes = {};
            for(var c in myPats) allCodes[c] = true;
            for(var c in diskPats) allCodes[c] = true;
            for(var c in basePats) allCodes[c] = true;
            for(var code in allCodes) {
                mergedPats[code] = mergePatientList(basePats[code], diskPats[code], myPats[code]);
            }
            result.patients = mergedPats;
        }

        // 1b. dischargedArchive (オブジェクト形式: PID -> Data)
        var diskArc = diskData.dischargedArchive || {};
        var myArc   = myData.dischargedArchive   || {};
        var baseArc = baseData.dischargedArchive  || {};
        
        var mergedArc = {};
        for (var pid in diskArc) {
            if (diskArc.hasOwnProperty(pid)) mergedArc[pid] = diskArc[pid];
        }
        for (var pid in myArc) {
            if (!myArc.hasOwnProperty(pid)) continue;
            var mEntry = myArc[pid];
            var bEntry = baseArc[pid] || {};
            var dEntry = mergedArc[pid];
            if (!dEntry) {
                mergedArc[pid] = mEntry;
            } else {
                for (var fk in mEntry) {
                    if (!mEntry.hasOwnProperty(fk)) continue;
                    if (JSON.stringify(mEntry[fk]) !== JSON.stringify(bEntry[fk])) {
                        dEntry[fk] = mEntry[fk];
                    }
                }
            }
        }
        result.dischargedArchive = mergedArc;

        // 2. ToDo リストのマージ
        if (myData.todos !== undefined || diskData.todos !== undefined) {
            var diskTodos = diskData.todos || [];
            var myTodos = myData.todos || [];
            var baseTodos = baseData.todos || [];
            var baseTMap = {}; for(var i=0; i<baseTodos.length; i++) if(baseTodos[i]) baseTMap[baseTodos[i].id] = baseTodos[i];
            var myTMap = {}; for(var i=0; i<myTodos.length; i++) if(myTodos[i]) myTMap[myTodos[i].id] = myTodos[i];
            
            var mergedTodos = [];
            var mergedTodoIds = {};
            for(var i=0; i<diskTodos.length; i++) {
                var t = diskTodos[i]; if (!t) continue;
                var b = baseTMap[t.id];
                var m = myTMap[t.id];
                if(b && m) {
                    if(m.done !== b.done) t.done = m.done;
                    if(m.deleted !== b.deleted) t.deleted = m.deleted;
                    if(m.text !== b.text) t.text = m.text;
                }
                mergedTodos.push(t);
                mergedTodoIds[t.id] = true;
            }
            for(var i=0; i<myTodos.length; i++) {
                if(myTodos[i] && !mergedTodoIds[myTodos[i].id]) mergedTodos.push(myTodos[i]);
            }
            result.todos = mergedTodos;
        }

        // 3. 設定・ユーザー情報等のマージ (最新優先)
        var updateIfChanged = ["settings", "announcement", "users", "userWards"];
        for (var i = 0; i < updateIfChanged.length; i++) {
            var k = updateIfChanged[i];
            if (myData[k] !== undefined) {
                if (JSON.stringify(myData[k]) !== JSON.stringify(baseData[k] || null)) {
                    result[k] = myData[k];
                } else {
                    result[k] = diskData[k] !== undefined ? diskData[k] : myData[k];
                }
            } else if (diskData[k] !== undefined) {
                result[k] = diskData[k];
            }
        }

        // 3b. wardNotes マップ (動的病棟ノート) のマージ
        if (myData.wardNotes || diskData.wardNotes) {
            var myNotes = myData.wardNotes || {};
            var diskNotes = diskData.wardNotes || {};
            var baseNotes = baseData.wardNotes || {};
            var mergedNotes = {};
            var allWards = {};
            for(var w in myNotes) allWards[w] = true;
            for(var w in diskNotes) allWards[w] = true;
            for(var w in baseNotes) allWards[w] = true;
            for(var ward in allWards) {
                if (myNotes[ward] !== undefined) {
                    if (JSON.stringify(myNotes[ward]) !== JSON.stringify(baseNotes[ward] || null)) {
                        mergedNotes[ward] = myNotes[ward];
                    } else {
                        mergedNotes[ward] = diskNotes[ward] !== undefined ? diskNotes[ward] : myNotes[ward];
                    }
                } else if (diskNotes[ward] !== undefined) {
                    mergedNotes[ward] = diskNotes[ward];
                }
            }
            result.wardNotes = mergedNotes;
        }

        // 4. 履歴
        var myHist = (myData.history instanceof Array) ? myData.history : [];
        var diskHist = (diskData.history instanceof Array) ? diskData.history : [];
        var combo = myHist.concat(diskHist);
        var seen = {}; 
        var resHist = [];
        for (var i = 0; i < combo.length; i++) {
            var h = combo[i];
            if (h && h.id) {
                var eventKey = h.id + "_" + (h.createdAt || "0");
                if (!seen[eventKey]) {
                    seen[eventKey] = true;
                    resHist.push(h); 
                }
            }
        }
        resHist.sort(function(a, b) { return (b.createdAt || 0) - (a.createdAt || 0); });
        if (resHist.length > 300) resHist = resHist.slice(0, 300);
        result.history = resHist;

    } catch(err) {
        // エラー時も型だけは維持して返す
        if (myData.dischargedArchive instanceof Array) myData.dischargedArchive = {};
        return myData || diskData || {};
    }
    return result;
}

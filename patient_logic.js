// ==========================================
// Patient Logic
// ==========================================

var PatientLogic = {
            injectMeta: function(appData) {
        if (!appData || !appData.patients || !appData.patientMeta) return;
        for (var ward in appData.patients) {
            if (appData.patients.hasOwnProperty(ward)) {
                PatientLogic.injectMetaToList(appData.patients[ward], appData.patientMeta);
            }
        }
    },injectMetaToList: function(list, meta) {
        if (!list || !meta) return;
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (!p || !p.id) continue;
            var nId = String(p.id).replace(/^0+/, '') || '0';
            var m = meta[nId];
            if (m) {
                p.memo = m.memo || '';
                p.status = m.status || 0;
                p.statusAuthor = m.statusAuthor || '';
                p.alertLevel = m.alertLevel || 0;
                p.memoAuthors = m.memoAuthors || [];
                if (m.bloodDate) p.bloodDate = m.bloodDate;
                if (m.bloodDetail) p.bloodDetail = m.bloodDetail;
                if (m.chkPrescription !== undefined) p.chkPrescription = m.chkPrescription;
                  if (m.personalMemos) p.personalMemos = m.personalMemos;
                  
                  if (m.surgeryDate !== undefined) p.surgeryDate = m.surgeryDate;
                  if (m.surgeryDisease !== undefined) p.surgeryDisease = m.surgeryDisease;
                  if (m.surgeryProcedure !== undefined) p.surgeryProcedure = m.surgeryProcedure;
                  if (m.surgeryAnesthesia !== undefined) p.surgeryAnesthesia = m.surgeryAnesthesia;
                  if (m.surgeryHasEpi !== undefined) p.surgeryHasEpi = m.surgeryHasEpi;
                  if (m.surgeryLixiana !== undefined) p.surgeryLixiana = m.surgeryLixiana;
                if (m.personalMemos) p.personalMemos = m.personalMemos;
            }
        }
    },

    processFetchedPatients: function(newPatients, wardName) {
        if (!newPatients || !newPatients.length) return;
        
        // 空の要素を除去
        newPatients = newPatients.filter(function(item) { return item != null; });
        
        try {
            var list = getCurrentPatientsList();
            
            // ★変更: 既存の引き継ぎロジック(oldMap等)を削除し、純粋にリストを更新するのみとする。
            // メタデータ(メモやステータス)は appData.patientMeta で一元管理されるため、
            // オブジェクトへの引き継ぎ処理は不要になります。

            // 履歴の更新(新規患者の検出)
            if (!appData.history) appData.history = [];
            var nowStr = getTodayString() + " " + getTimeString();
            var historyAdded = 0;
            
            // アーカイブのクリーンアップ (半年経過で削除)
            if (!appData.dischargedArchive) appData.dischargedArchive = {};
            var currentMs = new Date().getTime();
            var limitMs = 180 * 24 * 60 * 60 * 1000;
            for (var arcId in appData.dischargedArchive) {
                if (appData.dischargedArchive.hasOwnProperty(arcId)) {
                    var arcDat = appData.dischargedArchive[arcId].archivedAt;
                    if (arcDat && (currentMs - arcDat > limitMs)) {
                        delete appData.dischargedArchive[arcId];
                    }
                }
            }

            var mergedList = [];
            for(var k = 0; k < newPatients.length; k++) {
                var np = newPatients[k];
                var nId = String(np.id).replace(/^0+/, '') || '0';
                
                // 既存のリストにいない場合のみ履歴追加
                var isNew = true;
                for (var j = 0; j < list.length; j++) {
                    if (String(list[j].id).replace(/^0+/, '') === nId) {
                        isNew = false;
                        break;
                    }
                }

                if(isNew && list.length > 0) {
                    appData.history.unshift({
                        date: nowStr, type: "入室/追加", patient: np.name, id: np.id, ward: wardName,
                        dept: np.dept || "", doctor: np.doctor || "", disease: np.disease || "",
                        createdAt: new Date().getTime(), user: currentUserName
                    });
                    historyAdded++;
                }
                
                mergedList.push(np);
            }
            
            // 退室チェック: 既存リストにいて、新しいリストにいない患者
            for(var j = 0; j < list.length; j++) {
                var op = list[j];
                var oId = String(op.id).replace(/^0+/, '') || '0';
                var found = false;
                for(var k = 0; k < newPatients.length; k++) {
                    if (String(newPatients[k].id).replace(/^0+/, '') === oId) {
                        found = true;
                        break;
                    }
                }
                if(!found) {
                    appData.history.unshift({
                        date: nowStr, type: "退室/削除", patient: op.name, id: op.id, ward: wardName,
                        dept: op.dept || "", doctor: op.doctor || "", disease: op.disease || "",
                        createdAt: new Date().getTime(), user: currentUserName
                    });
                    historyAdded++;
                    
                    // アーカイブへ移動
                    if (!appData.dischargedArchive[oId]) {
                        appData.dischargedArchive[oId] = { id: oId, archivedAt: new Date().getTime() };
                    }
                }
            }
            
            if (historyAdded > 0) {
                while(appData.history.length > 300) {
                    appData.history.pop();
                }
            }
            
            // リストを更新
            if (!appData.patients) appData.patients = {};
            var targetWardKey = (typeof window.currentWard !== 'undefined') ? window.currentWard : wardName;
            appData.patients[targetWardKey] = mergedList;
            
            // Webから取得した生データにローカルのメモ/タグ等のメタデータを結合する
            if (typeof PatientLogic !== 'undefined' && PatientLogic.injectMeta) {
                PatientLogic.injectMeta(appData);
            }
            
            DataManager.hasLocalChanges = true;
            renderPatients();
            
        } catch(e) {
            alert("Error in processFetchedPatients: " + e.message);
        }
    },
    
    parseAdmissionHtml: function(doc) {
        try {
            var newAdmissions = [];
            var tables = doc.getElementsByTagName("table");
            if (tables.length > 0) {
                var targetTable = tables[0];
                var tbody = targetTable.getElementsByTagName("tbody")[0] || targetTable;
                var rows = tbody.getElementsByTagName("tr");
                
                for (var i = 0; i < rows.length; i++) {
                    var cells = rows[i].getElementsByTagName("td");
                    if (cells.length >= 6) {
                        var idMatch = cells[2].innerText.match(/\d+/);
                        var pId = idMatch ? idMatch[0] : "";
                        var pName = cells[3].innerText.trim();
                        if (pName.indexOf("　") > 0) {
                            pName = pName.replace(/　/g, " ");
                        }
                        var pAgeMatch = cells.length > 7 ? cells[7].innerText.match(/\d+/) : null;
                        var pAge = pAgeMatch ? pAgeMatch[0] : "";
                        var pSex = cells.length > 8 ? cells[8].innerText.trim() : "";
                        
                        var pDept = cells.length > 11 ? cells[11].innerText.trim() : "";
                        var pDoctor = cells.length > 12 ? cells[12].innerText.trim() : "";
                        var pDisease = cells.length > 15 ? cells[15].innerText.trim() : "";
                        
                        if (pId && pName) {
                            newAdmissions.push({
                                id: pId,
                                name: pName,
                                sex: pSex,
                                age: pAge,
                                dept: pDept,
                                doctor: pDoctor,
                                disease: pDisease
                            });
                        }
                    }
                }
            }
            
            // メタデータの引き継ぎ処理は不要 (patientMeta で管理するため)
            // 新規リストで上書き
            if (tables.length > 0 || doc.body.innerText.indexOf("データがありません") !== -1 || doc.body.innerText.indexOf("該当する患者") !== -1 || doc.body.innerText.indexOf("該当データが") !== -1) {
                appData.admissionSchedule = newAdmissions;
                DataManager.hasLocalChanges = true;
                renderAdmissionSchedule();
            } else {
                // テーブルも無く、データなしの文言も無い場合は、セッション切れやエラーページとみなし、既存のデータを保持する
                renderAdmissionSchedule(); // 既存データで再描画のみ行う
            }
            
        } catch(e) {
            alert("Error in parseAdmissionHtml: " + e.message);
        }
    }
};













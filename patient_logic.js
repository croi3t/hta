// ==========================================
// Patient Logic
// ==========================================

var PatientLogic = {
        injectMetaToList: function(list, meta) {
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
            
            DataManager.saveAll(appData, true);
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
                        var idMatch = cells[1].innerText.match(/\d+/);
                        var pId = idMatch ? idMatch[0] : "";
                        var pName = cells[2].innerText.trim();
                        if (pName.indexOf("　") > 0) {
                            pName = pName.replace(/　/g, " ");
                        }
                        var pSex = cells[3].innerText.trim();
                        var pAgeMatch = cells[4].innerText.match(/\d+/);
                        var pAge = pAgeMatch ? pAgeMatch[0] : "";
                        var pDept = cells[5].innerText.trim();
                        
                        if (pId && pName) {
                            newAdmissions.push({
                                id: pId,
                                name: pName,
                                sex: pSex,
                                age: pAge,
                                dept: pDept
                            });
                        }
                    }
                }
            }
            
            // メタデータの引き継ぎ処理は不要 (patientMeta で管理するため)
            // 新規リストで上書き
            appData.admissionSchedule = newAdmissions;
            
            DataManager.saveAll(appData, true);
            renderAdmissionSchedule();
            
        } catch(e) {
            alert("Error in parseAdmissionHtml: " + e.message);
        }
    }
};





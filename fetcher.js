function importFromExcel() {
    if (!isEditMode) {
        alert('編集モードでのみ利用できます。');
        return;
    }
    
    var btn = document.getElementById('btn-excel-import');
    var orgText = btn.innerText;
    btn.innerText = '⏳ 読み込み中...';
    btn.disabled = true;
    
    setTimeout(function() {
        try {
            doExcelImport();
        } catch(e) {
            alert('Excel取込エラー: ' + e.message);
        }
        btn.innerText = orgText;
        btn.disabled = false;
    }, 100);
}

function doExcelImport() {
    // 1. 今週の範囲を計算 (日曜日開始)
    var today = new Date();
    var dayOfWeek = today.getDay(); // 0=日, 1=月, ..., 6=土
    var weekStart = new Date(today);
    weekStart.setDate(today.getDate() - dayOfWeek);
    weekStart.setHours(0,0,0,0);
    var weekEnd = new Date(weekStart);
    weekEnd.setDate(weekStart.getDate() + 6);
    weekEnd.setHours(23,59,59,999);
    
    // 2. デスクトップ上のファイルを検索
    var wsh = new ActiveXObject('WScript.Shell');
    var desktopPath = wsh.SpecialFolders('Desktop');
    var fso = new ActiveXObject('Scripting.FileSystemObject');
    
    if (!fso.FolderExists(desktopPath)) {
        alert('デスクトップフォルダが見つかりません。');
        return;
    }
    
    var folder = fso.GetFolder(desktopPath);
    var files = new Enumerator(folder.Files);
    var matchedFiles = [];
    
    for (; !files.atEnd(); files.moveNext()) {
        var f = files.item();
        var fname = f.Name;
        // 服薬指導履歴YYYYMMDD で始まるファイル (.xls, .xlsx, .xlsm)
        var m = fname.match(/^服薬指導履歴(\d{8})/);
        if (!m) continue;
        var ext = fname.split('.').pop().toLowerCase();
        if (ext !== 'xls' && ext !== 'xlsx' && ext !== 'xlsm') continue;
        
        var dateStr = m[1]; // YYYYMMDD
        var y = parseInt(dateStr.substring(0,4), 10);
        var mo = parseInt(dateStr.substring(4,6), 10) - 1;
        var d = parseInt(dateStr.substring(6,8), 10);
        var fileDate = new Date(y, mo, d);
        
        // 今週の範囲内かチェック
        if (fileDate >= weekStart && fileDate <= weekEnd) {
            matchedFiles.push({
                path: f.Path,
                date: fileDate,
                dateNum: parseInt(dateStr, 10),
                name: fname
            });
        }
    }
    
    if (matchedFiles.length === 0) {
        alert('今週(' + formatDateShort(weekStart) + '～' + formatDateShort(weekEnd) + ')の服薬指導履歴Excelファイルがデスクトップ上に見つかりませんでした。\n\nファイル名例: 服薬指導履歴20260303.xlsx, 服薬指導履歴202603036B.xlsx');
        return;
    }
    
    // 最新日付のファイルを選択（同一日付で複数ファイルがあれば全て読む）
    matchedFiles.sort(function(a, b) { return b.dateNum - a.dateNum; });
    var latestDateNum = matchedFiles[0].dateNum;
    var filesToRead = [];
    for (var i = 0; i < matchedFiles.length; i++) {
        if (matchedFiles[i].dateNum === latestDateNum) {
            filesToRead.push(matchedFiles[i]);
        }
    }
    
    // 3. Excel COMで読み取り
    var excel = null;
    var patientsWithMark = {}; // patientId -> true
    
    try {
        // ▼▼▼ ここから書き換え ▼▼▼
        // ★修正4: 取込時も JUST Calc と Excel の両方に対応させる
        try {
            excel = new ActiveXObject("JustCalc.Application");
        } catch(e1) {
            excel = new ActiveXObject("Excel.Application");
        }
        
        excel.Visible = false;
        excel.DisplayAlerts = false;
        // ▲▲▲ ここまで ▲▲▲
        
        for (var fi = 0; fi < filesToRead.length; fi++) {
            var wb = null;
            try {
                wb = excel.Workbooks.Open(filesToRead[fi].path, 0, true); // ReadOnly=true
                var ws = wb.Sheets(1);
                var usedRange = ws.UsedRange;
                var lastRow = usedRange.Row + usedRange.Rows.Count - 1;
                var lastCol = usedRange.Column + usedRange.Columns.Count - 1;
                
                // ヘッダー行(1行目)から今週の日付列を特定
                var weekDateCols = [];
                for (var c = 4; c <= lastCol; c++) {
                    var cellVal = ws.Cells(1, c).Value;
                    if (!cellVal) continue;
                    var colDate = parseExcelDate(cellVal);
                    if (colDate && colDate >= weekStart && colDate <= weekEnd) {
                        weekDateCols.push(c);
                    }
                }
                
                // 各患者行をチェック
                for (var r = 2; r <= lastRow; r++) {
                    var pid = ws.Cells(r, 1).Value;
                    if (!pid) continue;
                    
                    // ★追加: JUST Calc対策として末尾の「.0」を削除し、確実に文字列として扱う
                    pid = String(pid).replace(/\.0$/, '').replace(/[\s\r\n]/g, '');
                    
                    // 数値の場合は整数化
                    if (!isNaN(pid)) pid = String(parseInt(pid, 10));
                    // 記号行(○●□■◇◆△▲☆等)をスキップ
                    if (/^[○●□■◇◆△▲☆★]$/.test(pid)) break;
                    // 今週の列に◆があるかチェック
                    for (var ci = 0; ci < weekDateCols.length; ci++) {
                        var cellValue = ws.Cells(r, weekDateCols[ci]).Value;
                        // ★追加: 値を確実に文字列にしてから判定する
                        if (cellValue && String(cellValue).indexOf('◆') !== -1) {
                            patientsWithMark[pid] = true;
                            break;
                        }
                    }
                }
            } catch(e2) {
                alert('ファイル読み取りエラー (' + filesToRead[fi].name + '): ' + e2.message);
            } finally {
                if (wb) { try { wb.Close(false); } catch(e3){} }
            }
        }
    } finally {
        if (excel) { try { excel.Quit(); } catch(e4){} excel = null; }
    }
    // 4. 病棟共有ボードの患者リスト(大元のappData)と照合
    var updatedCount = 0;
    var alreadyRecorded = 0;
    var markIds = Object.keys ? Object.keys(patientsWithMark) : (function(obj) { var k=[]; for(var p in obj){ if(obj.hasOwnProperty(p)) k.push(p); } return k; })(patientsWithMark);
    
    // 現在選択中の病棟配列を直接操作して永続化させる
    var targetArray = null;
    var targetArray = appData.patients[currentWard];
    
    if (targetArray) {
        for (var pi = 0; pi < targetArray.length; pi++) {
            var p = targetArray[pi];
            var pId = String(p.id).replace(/[\s]/g, '');
            // 先頭ゼロを除去して照合（0251607 と 251607 を同一として扱う）
            var pIdNorm = pId.replace(/^0+/, '') || '0';
            if (patientsWithMark[pId] || patientsWithMark[pIdNorm]) {
                var currentMeta = appData.patientMeta && appData.patientMeta[pIdNorm] ? appData.patientMeta[pIdNorm] : {};
                var currentStatus = currentMeta.status !== undefined ? currentMeta.status : (p.status || 0);

                if (currentStatus === 3) {
                    alreadyRecorded++;
                } else {
                    if (typeof DataManager !== "undefined") {
                        DataManager.appendTransaction("UPDATE_ADMISSION_STATUS", {
                            patientId: pId, wardCode: currentWard, value: 3, author: ""
                        });
                    }
                    updatedCount++;
                }
            }
        }
    }
    
    // 5. 保存とUI更新
    if (updatedCount > 0) {
        if (typeof DataManager !== "undefined") {
            DataManager.replayTransactions(appData);
        }
        renderPatients();
    }
    
    var fileNames = [];
    for (var fn = 0; fn < filesToRead.length; fn++) fileNames.push(filesToRead[fn].name);
    
    var msg = 'Excel取込完了\n\n';
    msg += '読み取りファイル: ' + fileNames.join(', ') + '\n';
    msg += '◆マーク検出患者数: ' + markIds.length + '名\n';
    msg += '介入状況を「記録済」に更新: ' + updatedCount + '名\n';
    if (alreadyRecorded > 0) msg += '(既に記録済: ' + alreadyRecorded + '名)\n';
    if (markIds.length > 0 && updatedCount === 0 && alreadyRecorded === 0) {
        msg += '\n※ ◆がある患者が現在の病棟に存在しません。\n  病棟タブを確認してください。';
    }
    alert(msg);
}

function parseExcelDate(val) {
    // Excelの日付値はシリアル値か文字列
    if (val instanceof Date) return val;
    if (typeof val === 'number') {
        // Excelシリアル値から変換
        var d = new Date((val - 25569) * 86400 * 1000);
        d.setHours(0,0,0,0);
        return d;
    }
    var s = String(val).replace(/\s/g, '');
    // YYYY/MM/DD or M/D
    var m1 = s.match(/(\d{4})\/(\d{1,2})\/(\d{1,2})/);
    if (m1) return new Date(parseInt(m1[1],10), parseInt(m1[2],10)-1, parseInt(m1[3],10));
    var m2 = s.match(/^(\d{1,2})\/(\d{1,2})$/);
    if (m2) {
        var yr = new Date().getFullYear();
        return new Date(yr, parseInt(m2[1],10)-1, parseInt(m2[2],10));
    }
    
    // ★追加: JUST Calc対策「○月○日」形式の処理
    var m3 = s.match(/(\d{1,2})月(\d{1,2})日/);
    if (m3) {
        var yr = new Date().getFullYear();
        return new Date(yr, parseInt(m3[1],10)-1, parseInt(m3[2],10));
    }
    
    return null;
}

function formatDateShort(d) {
    return (d.getMonth()+1) + '/' + d.getDate();
}

// ---------- データ表示と操作: 患者 ----------
function getCurrentPatientsList() {
    if (!appData.patients) appData.patients = {};
    if (!appData.patients[currentWard]) appData.patients[currentWard] = [];
    return appData.patients[currentWard];
}

// ★追加: 現在のフィルタリング状態（カスタムタブ等）を考慮して実際に表示される患者リストを取得
function getDisplayedPatientsList() {
    var list = [];
    if (typeof currentFilterTag !== 'undefined' && currentFilterTag !== "") {
        var seenIds = {};
        for (var w in appData.patients) {
            if (appData.patients.hasOwnProperty(w) && appData.patients[w]) {
                var wList = appData.patients[w];
                for (var i = 0; i < wList.length; i++) {
                    var p = wList[i];
                    if (!p || typeof p !== 'object' || !p.id) continue;
                    
                    var targetMemo = "";
                    
                    var sharedM = (p.memo || "");
                    var persM = ((p.personalMemos && typeof currentSystemId !== 'undefined' && p.personalMemos[currentSystemId]) ? p.personalMemos[currentSystemId] : "");
                    if (typeof currentFilterScope !== 'undefined' && currentFilterScope === "personal") {
                        targetMemo = persM;
                    } else if (typeof currentFilterScope !== 'undefined' && currentFilterScope === "all") {
                        targetMemo = sharedM + " " + persM;
                    } else {
                        targetMemo = sharedM;
                    }

                    
                    if (targetMemo.indexOf(currentFilterTag) !== -1) {
                        if (!seenIds[p.id]) {
                            seenIds[p.id] = true;
                            p._tempWardCode = w;
                            list.push(p);
                        }
                    }
                }
            }
        }
    } else {
        var baseList = getCurrentPatientsList();
        for (var i = 0; i < baseList.length; i++) {
            var p = baseList[i];
            if (p && typeof p === 'object' && p.id) {
                p._tempWardCode = currentWard;
                list.push(p);
            }
        }
    }
    
    // ソート処理も適用（UI上と同じ順番にするため）
    if (typeof sortKey !== 'undefined' && sortKey) {
        list.sort(function(a, b) {
            var valA = a[sortKey] || "";
            var valB = b[sortKey] || "";
            if (!isNaN(valA) && !isNaN(valB) && valA !== "" && valB !== "") {
                return (Number(valA) - Number(valB)) * (typeof sortOrder !== 'undefined' ? sortOrder : 1);
            }
            return valA.toString().localeCompare(valB.toString()) * (typeof sortOrder !== 'undefined' ? sortOrder : 1);
        });
    }
    
    return list;
}

function renderPatients() {
    
    var scrollX = window.pageXOffset || (document.documentElement ? document.documentElement.scrollLeft : 0);
    var scrollY = window.pageYOffset || (document.documentElement ? document.documentElement.scrollTop : 0);
    var tbody = document.getElementById("tbody-patients");
    
    // ★修正: getDisplayedPatientsList()を利用して実際に表示すべきリストを取得
    var displayList = getDisplayedPatientsList();
    
    if(!displayList || displayList.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" align="center">該当病棟の患者データがありません。</td></tr>';
        return;
    }
    
    if (window.PatientLogic && window.PatientLogic.injectMetaToList) window.PatientLogic.injectMetaToList(displayList, appData.patientMeta);
    
    var html = "";
    var highlightWords = ["退院", "転院", "ENT", "ent"];
    for(var i=0; i<displayList.length; i++) {
        var p = displayList[i];
        if (!p || typeof p !== 'object') continue;
        if (!p.id) continue;
        
        var isHighlight = false;
        if (p.memo) {
            var lowerMemo = p.memo.toLowerCase();
            for(var w=0; w<highlightWords.length; w++) {
                if (lowerMemo.indexOf(highlightWords[w].toLowerCase()) !== -1) {
                    isHighlight = true; break;
                }
            }
        }
        var hlClass = isHighlight ? ' highlight-row' : '';

        var aLevel = p.alertLevel || 0;
        var aText = aLevel === 1 ? "？" : (aLevel === 2 ? "！" : "");
        var aClass = aLevel === 1 ? "alert-question" : (aLevel === 2 ? "alert-exclamation" : "alert-none");
        var alertEvent = isEditMode ? 'onclick="toggleAlertLevel(\'' + escapeHtml(p.id) + '\')"' : 'onclick="alert(\'編集不可\')"';

        var statIdx = p.status || 0;
        var statClass = STATUS_CLASSES[statIdx];
        var statText = STATUS_TEXTS[statIdx];
        if(statText === "(未設定)") statText = "未";
        else if(statText === "介入予定") statText = "予定";
        else if(statText === "指導済") statText = "指導";
        else if(statText === "記録済") statText = "記録";

        var authorHtml = p.statusAuthor ? '<br><span class="status-author">' + p.statusAuthor + '</span>' : '';
        var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';
        var clickEvent = isEditMode ? 'onclick="toggleStatus(\'' + escapeHtml(p.id) + '\')"' : 'onclick="alert(\'編集不可\')"';
        
        var chkVal = p.chkPrescription || 0;
        if(typeof chkVal === "boolean") chkVal = chkVal ? 2 : 0;
        var chkClass = chkVal === 1 ? "status-chk-half" : (chkVal === 2 ? "status-chk-on" : "");
        var chkText = chkVal === 1 ? "&#9744;" : (chkVal === 2 ? "&#10004;" : "");
        var chkBg = chkVal === 1 ? "background-color:#ffe8a1;" : "";
        var chkEvent = isEditMode ? 'onclick="togglePrescriptionCheck(\'' + escapeHtml(p.id) + '\')"' : 'onclick="alert(\'編集不可\')"';

        var memoDisabled = isEditMode ? '' : 'disabled="disabled"';
        var mcs1 = 'onchange="finalizeMemo(\'' + escapeHtml(p.id) + '\', this)" ';
        var mcs2 = 'onkeyup="updateMemoDebounced(\'' + escapeHtml(p.id) + '\', this.value, this); showTagSuggest(this, event);"';
        var memoChangeShared = isEditMode ? mcs1 + mcs2 : '';
        
        var mcp1 = 'onchange="finalizePersonalMemo(\'' + escapeHtml(p.id) + '\', this)" ';
        var mcp2 = 'onkeyup="updatePersonalMemoDebounced(\'' + escapeHtml(p.id) + '\', this.value, this); showTagSuggest(this, event);"';
        var memoChangePersonal = isEditMode ? mcp1 + mcp2 : '';
        
        var memoAuthorHtml = '';
        if (p.memoAuthors && p.memoAuthors.length > 0) {
            memoAuthorHtml = escapeHtml(p.memoAuthors.join(" / "));
        } else if (p.memoAuthor) {
            memoAuthorHtml = escapeHtml(p.memoAuthor);
        }
        
        var bdManualClick = isEditMode ? 'onclick="changeBloodDate(\'' + escapeHtml(p.id) + '\')"' : 'onclick="alert(\'編集不可\')";';
        var bdTitle = p.bloodDetail ? 'title="採血詳細: ' + escapeHtml(p.bloodDetail) + '"' : 'title="採血日修正"';
        
        var fetchBtnHtml = '<div style="padding:4px 0;">&nbsp;</div>';
        if (isEditMode) {
            var f1 = '<div class="hide-on-print blood-fetch-btn" ';
            var f2 = 'onclick="event.stopPropagation(); fetchBloodDateForPatient(\'' + escapeHtml(p.id) + '\')" ';
            var f3 = 'style="background:#e3f2fd; color:#0d6efd; font-size:10px; font-weight:bold; ';
            var f4 = 'text-align:center; padding:4px 0; border-bottom:1px dotted #ccc; cursor:pointer;" ';
            var f5 = 'title="取得">取得</div>';
            fetchBtnHtml = f1 + f2 + f3 + f4 + f5;
        }
        
        var d1 = '<div class="blood-date-text" ' + bdManualClick + ' ';
        var d2 = 'style="text-align:center; padding:4px 0; font-size:11px; cursor:pointer;" ';
        var d3 = bdTitle + '>' + escapeHtml(p.bloodDate || "-") + '</div>';
        var dateTextHtml = d1 + d2 + d3;

        var pMemos = (p && typeof p === 'object' && p.personalMemos) ? p.personalMemos : {};
        var myMemo = (pMemos && currentSystemId) ? (pMemos[currentSystemId] || "") : "";

        var rowHtmlArr = [];
        var otherUpdatedAttr = "";
        if (p.memoAuthors && p.memoAuthors.length > 0 && p.memoAuthors[0].indexOf(currentUserName) !== 0) {
            otherUpdatedAttr = ' data-updated-by-other="true"';
        }
        
        var updateTimeAttr = p.lastUpdateTime ? ' data-last-update-time="' + p.lastUpdateTime + '"' : '';
        rowHtmlArr.push('<tr id="tr-patient-' + escapeHtml(p.id) + '"' + otherUpdatedAttr + updateTimeAttr + '>');

        // ★修正: 不要なチェックボックス列を削除
        rowHtmlArr.push('<td>' + escapeHtml(p.id) + '</td>');
        rowHtmlArr.push('<td>' + escapeHtml(p.name) + '</td>');
        rowHtmlArr.push('<td class="hide-on-print" style="font-size:11px; padding:2px 4px;">');
        rowHtmlArr.push('<div style="color:#0d6efd; font-weight:bold; border-bottom:1px dotted #eee;">' + escapeHtml(p.dept || '') + '</div>');
        rowHtmlArr.push('<div style="color:#555;">' + escapeHtml(p.doctor || '') + '</div>');
        rowHtmlArr.push('</td>');
        var diseaseSurgeryHtml = "";
        var memoSurgeryHtml = "";
        var diseaseSurgeryHtml = "";
        var memoSurgeryHtml = "";
        var hospDaysPostOpHtml = "";
        if (p.surgeryDate && p.surgeryDate !== "なし" && p.surgeryDate !== "-") {
            var isUnknownDate = (p.surgeryDate === "不明");
            var sDate = new Date(p.surgeryDate);
            var isValidDate = !isUnknownDate && !isNaN(sDate.getTime());
            if (isValidDate) {
                var today = new Date();
                today.setHours(0,0,0,0);
                sDate.setHours(0,0,0,0);
                var diffDays = Math.floor((today.getTime() - sDate.getTime()) / (1000 * 3600 * 24));
                var postOpText = (diffDays === 0) ? "本日" : (diffDays > 0 ? "術後" + diffDays + "日" : "術前" + Math.abs(diffDays) + "日");
                hospDaysPostOpHtml = '<br><span style="color:#c62828; font-weight:bold; font-size:10px;">' + postOpText + '</span>';
            }
            var epiBadge = p.surgeryHasEpi ? ' <span style="background:#dc3545; color:#fff; padding:0 3px; border-radius:2px;">エピ有</span>' : "";
            var lixBadge = p.surgeryLixiana ? ' <span style="background:#ff9800; color:#fff; padding:0 3px; border-radius:2px; font-weight:bold;" title="リクシアナ(エドキサバン)休薬">💊EDO</span>' : "";
            var dateDisplay = isValidDate ? escapeHtml(p.surgeryDate) : "（手術日未取得）";
            diseaseSurgeryHtml = '<div style="font-size:11px; color:#c2185b; font-weight:bold; margin-top:4px;">手術日: ' + dateDisplay + '<br>' + epiBadge + lixBadge + '</div>';
            memoSurgeryHtml = '<div style="font-size:10.5px; color:#c2185b; background:#fce4ec; padding:4px; margin-bottom:0; font-weight:bold;" title="病名: ' + escapeHtml(p.surgeryDisease) + '\n術式: ' + escapeHtml(p.surgeryProcedure) + '\n麻酔: ' + escapeHtml(p.surgeryAnesthesia) + '">✂️ ' + escapeHtml(p.surgeryProcedure) + '</div>';
        }
        rowHtmlArr.push('<td style="padding:2px 4px; vertical-align:top;">');
        rowHtmlArr.push('<div style="color:#2c3e50; font-weight:bold;' + (diseaseSurgeryHtml ? 'border-bottom:1px dotted #eee; padding-bottom:2px; margin-bottom:2px;' : '') + '">' + escapeHtml(p.disease || '') + ' <span id="btn-single-surg-' + escapeHtml(p.id) + '" style="cursor:pointer; font-size:10px; color:#fff; background-color:#e91e63; padding:2px 6px; border-radius:10px; margin-left:4px; font-weight:bold; display:inline-block;" title="この患者の手術情報を取得" onclick="fetchSingleSurgery(\'' + escapeHtml(p.id) + '\', this)">手術取得</span></div>');
        if (currentWard === "51") {
            if (p.surgeryDate === "なし") {
                rowHtmlArr.push('<div class="surgery-proc-text" style="color:#999; font-size:11px; font-style:italic;">術：なし</div>');
            }
        }
        if (diseaseSurgeryHtml) {
            rowHtmlArr.push(diseaseSurgeryHtml); // ★主病名の下に手術日とバッジを挿入
        }
        rowHtmlArr.push('</td>');
        
        var roomHtml = escapeHtml(p.room || '');
        if (typeof currentFilterTag !== 'undefined' && currentFilterTag !== "" && p._tempWardCode) {
            var wName = getWardName(p._tempWardCode) || "他病棟";
            roomHtml = '<div style="font-size:10px; color:#555; border-bottom:1px dotted #ccc;">' + escapeHtml(wName) + '</div><div style="padding-top:2px;">' + roomHtml + '</div>';
        }
        rowHtmlArr.push('<td style="text-align:center; font-size:12px; font-weight:bold;">' + roomHtml + '</td>');
        
        var hospDaysHtml = escapeHtml(p.daysInHosp || "-");
        hospDaysHtml += hospDaysPostOpHtml;
        rowHtmlArr.push('<td style="text-align:center; font-size:12px; line-height:1.2;">' + hospDaysHtml + '</td>');

        rowHtmlArr.push('<td class="blood-date-cell" style="padding:0; width:85px;">' + fetchBtnHtml + dateTextHtml + '</td>');
        var st1 = '<td class="status-cell ' + statClass + '" style="' + statUnderline + '" ';
        var st2 = 'onmousedown="startDragStatus(event, \'' + escapeHtml(p.id) + '\')" ' + clickEvent + '>';
        rowHtmlArr.push(st1 + st2 + statText + authorHtml + '</td>');
        
        rowHtmlArr.push('<td style="text-align:center; font-size:20px; color:#fd7e14; ' + chkBg + '" class="chk-toggle ' + chkClass + '" ' + chkEvent + '>' + chkText + '</td>');
        rowHtmlArr.push('<td style="text-align:center; font-size:20px; font-weight:bold; color:#e74c3c;" class="alert-toggle ' + aClass + '" ' + alertEvent + '>' + escapeHtml(aText) + '</td>');
        
        rowHtmlArr.push('<td class="' + hlClass + '" style="padding:0; vertical-align:top;">');
        
        // 術式バッジ（情報共有・メモ欄）
        if (memoSurgeryHtml) {
            rowHtmlArr.push(memoSurgeryHtml);
        }
        
        // メモ用変数の定義
        var sharedMemoContent = escapeHtml(p.memo || "");
        var displaySharedMemo = sharedMemoContent.replace(/(#[^\s　#]+)/g, '<span class="memo-tag">$1</span>');
        var myMemoContent = escapeHtml((p.personalMemos && p.personalMemos[currentSystemId]) ? p.personalMemos[currentSystemId] : "");
        var myDisplayMemo = myMemoContent.replace(/(#[^\s　#]+)/g, '<span class="memo-tag">$1</span>');
        
        // 共有メモ
        rowHtmlArr.push('<div class="memo-wrap" style="position:relative; margin-bottom:0;">');
        rowHtmlArr.push('<div class="memo-display" style="font-size:12px; padding:2px 4px; background:#f9f9f9; line-height:1.4; min-height:18px; white-space:pre-wrap; cursor:text; word-break:break-all;" onclick="if(isEditMode){this.style.display=\'none\'; this.nextSibling.style.display=\'block\'; this.nextSibling.focus(); this.nextSibling.style.height=\'auto\'; this.nextSibling.style.height=this.nextSibling.scrollHeight+\'px\';}">' + (displaySharedMemo || '<span style="color:#aaa;">（共有）メモ...</span>') + '</div>');
        var ta1 = '<textarea rows="1" ' + memoDisabled + ' ' + memoChangeShared;
        var ta2 = ' placeholder="（共有）メモ..." style="display:none; min-height:18px; padding:2px 4px; font-size:12px; line-height:1.4; border:1px solid #3498db; background:#fff; width:100%; box-sizing:border-box;" onblur="this.style.display=\'none\'; this.previousSibling.style.display=\'block\'; this.previousSibling.innerHTML = escapeHtml(this.value || \'\').replace(/(#[^\\s　#]+)/g, \'<span class=\\\'memo-tag\\\'>$1</span>\') || \'<span style=\\\'color:#aaa;\\\'>（共有）メモ...</span>\';">';
        rowHtmlArr.push(ta1 + ta2 + sharedMemoContent + '</textarea>');
        rowHtmlArr.push('</div>');
        
        // 個人メモ
        rowHtmlArr.push('<div class="memo-wrap hide-on-print" style="position:relative; margin-bottom:0;">');
        rowHtmlArr.push('<div class="memo-display" style="font-size:12px; padding:2px 4px; background:#e1f5fe; line-height:1.4; min-height:18px; white-space:pre-wrap; cursor:text; word-break:break-all;" onclick="if(isEditMode){this.style.display=\'none\'; this.nextSibling.style.display=\'block\'; this.nextSibling.focus(); this.nextSibling.style.height=\'auto\'; this.nextSibling.style.height=this.nextSibling.scrollHeight+\'px\';}">' + (myDisplayMemo || '<span style="color:#aaa;">（個人）メモ...</span>') + '</div>');
        var ta3 = '<textarea rows="1" ' + memoDisabled + ' ' + memoChangePersonal;
        var ta4 = ' placeholder="（個人）メモ..." ';
        var ta5 = 'style="display:none; min-height:18px; padding:2px 4px; font-size:12px; line-height:1.4; border:1px solid #03a9f4; background:#e1f5fe; width:100%; box-sizing:border-box;" onblur="this.style.display=\'none\'; this.previousSibling.style.display=\'block\'; this.previousSibling.innerHTML = escapeHtml(this.value || \'\').replace(/(#[^\\s　#]+)/g, \'<span class=\\\'memo-tag\\\'>$1</span>\') || \'<span style=\\\'color:#aaa;\\\'>（個人）メモ...</span>\';">';
        rowHtmlArr.push(ta3 + ta4 + ta5 + myMemoContent + '</textarea>');
        rowHtmlArr.push('</div>');
        rowHtmlArr.push('</td>');
        rowHtmlArr.push('<td class="hide-on-print ' + hlClass + '" style="font-size:10px; color:#666;">' + memoAuthorHtml + '</td>');
        rowHtmlArr.push('</tr>');
        html += rowHtmlArr.join('');
    }

    tbody.style.visibility = "hidden";
    tbody.innerHTML = html;
    var textareas = tbody.getElementsByTagName('textarea');
    for(var t=0; t<textareas.length; t++) {
        var ta = textareas[t];
        ta.style.height = 'auto'; 
        var sh = ta.scrollHeight;
        if (sh > 0) ta.style.height = sh + 'px';
    }
    tbody.style.visibility = "visible";
    var container = document.getElementById("main-content-scroll");
    if (container) container.scrollTop = scrollTop;
    window.scrollTo(scrollX, scrollY);
}

function toggleAlertLevel(id) {
    if(!isEditMode) return;
    var p = findPatientById(id);
    if(!p) return;
    p.alertLevel = ((p.alertLevel || 0) + 1) % 3;
    var aLevel = p.alertLevel;
    var aText = aLevel === 1 ? "？" : (aLevel === 2 ? "！" : "");
    var aClass = aLevel === 1 ? "alert-question" : (aLevel === 2 ? "alert-exclamation" : "alert-none");

    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("TOGGLE_ALERT", {
            patientId: id, wardCode: currentWard, value: p.alertLevel
        });
    }

    var trId = "tr-patient-" + p.id;
    var tr = document.getElementById(trId);
    if (tr) {
        var td = tr.querySelector(".alert-toggle");
        if (td) { td.className = "alert-toggle " + aClass; td.innerText = aText; }
    }
}

function toggleStatus(id) {
    if(!isEditMode) return;
    var p = findPatientById(id);
    if(!p) return;
    
    var newStatus = ((p.status || 0) + 1) % 4;
    var newAuthor = newStatus === 0 ? "" : currentUserName;
    
    var strId = String(id);
    var nId = strId.replace(/^0+/, '') || '0';
    if (appData && appData.patients) {
        for (var wardCode in appData.patients) {
            if (appData.patients.hasOwnProperty(wardCode)) {
                var list = appData.patients[wardCode];
                for (var i = 0; i < list.length; i++) {
                    var pIdStr = String(list[i].id);
                    if (pIdStr === strId || (pIdStr.replace(/^0+/, '') || '0') === nId) {
                        list[i].status = newStatus;
                        list[i].statusAuthor = newAuthor;
                    }
                }
            }
        }
    }
    
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("TOGGLE_STATUS", {
            patientId: id, wardCode: currentWard, value: newStatus, author: newAuthor
        });
    }

    var statIdx = newStatus || 0;
    var statClass = STATUS_CLASSES[statIdx];
    var rawStatText = STATUS_TEXTS[statIdx];
    var statText = rawStatText === "(未設定)" ? "未" : (rawStatText === "介入予定" ? "予定" : (rawStatText === "指導済" ? "指導" : "記録"));
    if(statIdx === 0) statText = "-";
    
    var authorHtml = newAuthor ? '<br><span class="status-author">' + escapeHtml(newAuthor) + '</span>' : '';
    var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';
    
    var trId = "tr-patient-" + p.id;
    var allRows = document.getElementsByTagName("tr");
    for(var j=0; j<allRows.length; j++) {
        if(allRows[j].id === trId) {
            var td = allRows[j].querySelector(".status-cell");
            if(td) {
                td.className = "status-cell " + statClass;
                td.style.cssText = statUnderline;
                td.innerHTML = statText + authorHtml;
            }
        }
    }
}

var dragStatusInfo = { active: false, index: -1, startX: 0, currentX: 0, element: null };

function startDragStatus(e, id) {
    if(!isEditMode) return;
    if(e.button !== 1 && e.button !== 0) return; 

    dragStatusInfo.active = true;
    dragStatusInfo.index = id;
    dragStatusInfo.startX = e.clientX;
    dragStatusInfo.currentX = e.clientX;
    dragStatusInfo.element = e.srcElement || e.target;
    
    while(dragStatusInfo.element && dragStatusInfo.element.tagName !== 'TD') {
        dragStatusInfo.element = dragStatusInfo.element.parentNode;
    }
    
    if(dragStatusInfo.element && dragStatusInfo.element.setCapture) dragStatusInfo.element.setCapture();
    
    if (document.addEventListener) {
        document.addEventListener("mousemove", handleDragMove, false);
        document.addEventListener("mouseup", endDragStatus, false);
    } else if (document.attachEvent) {
        document.attachEvent("onmousemove", handleDragMove);
        document.attachEvent("onmouseup", endDragStatus);
    }
    
    if (e.stopPropagation) e.stopPropagation();
    e.cancelBubble = true;
    return false;
}

function handleDragMove() {
    if(!dragStatusInfo.active) return;
    var e = window.event || arguments[0];
    if(e) dragStatusInfo.currentX = e.clientX;
    
    var diff = Math.abs(dragStatusInfo.currentX - dragStatusInfo.startX);
    if(diff > 10) {
        if(dragStatusInfo.element && dragStatusInfo.element.className.indexOf("dragging-item") === -1) {
            dragStatusInfo.element.className += " dragging-item";
        }
    }
}

function endDragStatus(e) {
    if(!dragStatusInfo.active) return;
    var ev = window.event || e;
    
    if (document.removeEventListener) {
        document.removeEventListener("mousemove", handleDragMove, false);
        document.removeEventListener("mouseup", endDragStatus, false);
    } else if (document.detachEvent) {
        document.detachEvent("onmousemove", handleDragMove);
        document.detachEvent("onmouseup", endDragStatus);
    }
    
    if(dragStatusInfo.element && dragStatusInfo.element.releaseCapture) dragStatusInfo.element.releaseCapture();
    
    if(dragStatusInfo.element) {
        dragStatusInfo.element.className = dragStatusInfo.element.className.replace(/dragging-item/g, "").trim();
    }

    var diff = Math.abs(dragStatusInfo.currentX - dragStatusInfo.startX);
    if(diff > 30) {
        var clientX = ev ? ev.clientX : dragStatusInfo.currentX;
        var clientY = ev ? ev.clientY : 0;
        showUserSelectMenu(dragStatusInfo.index, clientX, clientY);
    }
    
    dragStatusInfo.active = false;
}

function showUserSelectMenu(id, x, y) {
    var menu = document.getElementById("user-select-menu");
    if(!menu) {
        menu = document.createElement("div");
        menu.id = "user-select-menu";
        document.body.appendChild(menu);
    }
    
    var users = getUniqueUsers();
    var html = "";
    var encId = escapeHtml(id);
    html += '<div class="user-select-item" onclick="selectUserStatus(\'' + encId + '\', \'' + escapeHtml(currentUserName) + '\')">' + escapeHtml(currentUserName) + ' (自分)</div>';
    
    for(var i=0; i<users.length; i++) {
        if(users[i] === currentUserName) continue;
        html += '<div class="user-select-item" onclick="selectUserStatus(\'' + encId + '\', \'' + escapeHtml(users[i]) + '\')">' + escapeHtml(users[i]) + '</div>';
    }
    html += '<div class="user-select-item" style="border-top:1px solid #eee; color:#999;" onclick="selectUserStatus(\'' + encId + '\', \'\')">(クリア)</div>';
    
    menu.innerHTML = html;
    menu.style.display = "block";
    
    var scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft;
    var scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop;
    var left = x + scrollX + 5;
    var top = y + scrollY + 5;
    
    if(x + 155 > document.body.clientWidth) left = x + scrollX - 155;
    
    menu.style.left = left + "px";
    menu.style.top = top + "px";
    
    var closeMenu = function() {
        var ev = window.event || arguments[0];
        var target = ev.srcElement || ev.target;
        if(!target || !target.className || (typeof target.className === 'string' && target.className.indexOf("user-select-item") === -1)) {
            menu.style.display = "none";
            if (document.removeEventListener) {
                document.removeEventListener("mousedown", closeMenu, false);
            } else if (document.attachEvent) {
                document.detachEvent("onmousedown", closeMenu);
            }
        }
    };
    if (document.addEventListener) {
        setTimeout(function(){ document.addEventListener("mousedown", closeMenu, false); }, 50);
    } else if (document.attachEvent) {
        setTimeout(function(){ document.attachEvent("onmousedown", closeMenu); }, 50);
    }
}

function selectUserStatus(id, userName) {
    var p = findPatientById(id);
    if (!p) return;
    
    var newStatus = p.status;
    if((!newStatus || newStatus === 0) && userName !== "") newStatus = 1;
    if(userName === "") newStatus = 0;
    
    var strId = String(id);
    var nId = strId.replace(/^0+/, '') || '0';
    if (appData && appData.patients) {
        for (var wardCode in appData.patients) {
            if (appData.patients.hasOwnProperty(wardCode)) {
                var list = appData.patients[wardCode];
                for (var i = 0; i < list.length; i++) {
                    var pIdStr = String(list[i].id);
                    if (pIdStr === strId || (pIdStr.replace(/^0+/, '') || '0') === nId) {
                        list[i].status = newStatus;
                        list[i].statusAuthor = userName;
                    }
                }
            }
        }
    }
    
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("TOGGLE_STATUS", {
            patientId: id, wardCode: currentWard, value: newStatus, author: userName
        });
    }

    var statIdx = newStatus || 0;
    var statClass = STATUS_CLASSES[statIdx];
    var rawStatText = STATUS_TEXTS[statIdx];
    var statText = rawStatText === "(未設定)" ? "未" : (rawStatText === "介入予定" ? "予定" : (rawStatText === "指導済" ? "指導" : "記録"));
    if(statIdx === 0) statText = "-";
    
    var authorHtml = userName ? '<br><span class="status-author">' + escapeHtml(userName) + '</span>' : '';
    var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';
    
    var trId = "tr-patient-" + p.id;
    var allRows = document.getElementsByTagName("tr");
    for(var j=0; j<allRows.length; j++) {
        if(allRows[j].id === trId) {
            var td = allRows[j].querySelector(".status-cell");
            if(td) {
                td.className = "status-cell " + statClass;
                td.style.cssText = statUnderline;
                td.innerHTML = statText + authorHtml;
            }
        }
    }

    var menu = document.getElementById("user-select-menu");
    if(menu) menu.style.display = "none";
}

function getUniqueUsers() {
    if (cachedUniqueUsers !== null) return cachedUniqueUsers;
    
    var userMap = {};
    // 1. settings.users から取得
    if (appData && appData.users) {
        for (var id in appData.users) {
            var name = appData.users[id];
            if (name && name !== "undefined") userMap[name] = true;
        }
    }
    
    // 2. 自分自身を必ず含める (ToDo 作業者や介入者選択用)
    if (currentUserName && currentUserName !== "") {
        userMap[currentUserName] = true;
    }

    var result = [];
    for (var n in userMap) {
        if (userMap.hasOwnProperty(n)) result.push(n);
    }
    result.sort();
    cachedUniqueUsers = result;
    return result;
}

function togglePrescriptionCheck(id) {
    if(!isEditMode) return;
    var p = findPatientById(id);
    if(!p) return;

    var currentVal = p.chkPrescription || 0;
    if(typeof currentVal === "boolean") currentVal = currentVal ? 2 : 0;
    p.chkPrescription = (currentVal + 1) % 3;

    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("TOGGLE_PRESCRIPTION", {
            patientId: id, wardCode: currentWard, value: p.chkPrescription
        });
    }

    var trId = "tr-patient-" + p.id;
    var tr = document.getElementById(trId);
    if (tr) {
        var td = tr.querySelector(".chk-toggle");
        if (td) {
            var val = p.chkPrescription;
            if(val === 1) {
                td.className = "chk-toggle status-chk-half"; td.innerHTML = "&#9744;"; td.style.backgroundColor = "#ffe8a1";
            } else if(val === 2) {
                td.className = "chk-toggle status-chk-on"; td.innerHTML = "&#10004;"; td.style.backgroundColor = "";
            } else {
                td.className = "chk-toggle"; td.innerHTML = ""; td.style.backgroundColor = "";
            }
        }
    }
}

function updateMemo(id, val, element) {
    if(!isEditMode) return;
    var p = findPatientById(id);
    if(!p) return; 
    if(p.memo !== val) {
        p.memo = val;
        if (element) {
            element.style.height = "auto";
            element.style.height = element.scrollHeight + "px";
            
            var isHighlight = false;
            var highlightWords = ["退院", "転院", "ENT", "ent"];
            var lowerVal = val.toLowerCase();
            for(var w=0; w<highlightWords.length; w++) {
                if (lowerVal.indexOf(highlightWords[w].toLowerCase()) !== -1) {
                    isHighlight = true;
                    break;
                }
            }
            var tdMemo = element.parentNode;
            if (tdMemo && tdMemo.tagName && tdMemo.tagName.toLowerCase() === 'td') {
                if (isHighlight) {
                    addClass(tdMemo, 'highlight-row');
                } else {
                    removeClass(tdMemo, 'highlight-row');
                }
            }
        }
    }
    
    // ★ここにあった if (typeof DataManager !== "undefined") { ... } の伝票発行ブロックをまるごと削除します
    // （入力完了時の finalizeMemo 関数側に任せるため）
}

function updatePersonalMemoHeight(element) {
    if (element) {
        element.style.height = "auto";
        element.style.height = (element.scrollHeight) + "px";
    }
}

function finalizePersonalMemo(id, element) {
    if(!isEditMode) return;
    var val = element.value;
    var p = findPatientById(id);
    if(!p) return;
    if(!p.personalMemos) p.personalMemos = {};
    p.personalMemos[currentSystemId] = val;
    // ★追加: トランザクションの発行
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_PERSONAL_MEMO", {
            patientId: id, wardCode: currentWard, userId: currentSystemId, value: val
        });
    }

}

function finalizeMemo(id, element) {
    if(!isEditMode) return;
    var p = findPatientById(id);
    var val = element.value;
    if(!p) return;
    
    // 1. メモリを即時更新
    p.memo = val;
    var d = new Date();
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    var dd = ("0" + d.getDate()).slice(-2);
    var hh = ("0" + d.getHours()).slice(-2);
    var min = ("0" + d.getMinutes()).slice(-2);
    var authorStr = currentUserName + " (" + mm + "/" + dd + " " + hh + ":" + min + ")";
    
    if (!p.memoAuthors) p.memoAuthors = [];
    if (p.memoAuthors.length > 0 && p.memoAuthors[0].indexOf(currentUserName) === 0) {
        p.memoAuthors[0] = authorStr;
    } else {
        p.memoAuthors.unshift(authorStr);
    }
    if (p.memoAuthors.length > 3) p.memoAuthors = p.memoAuthors.slice(0, 3);

    // 2. トランザクションファイルを作成する（これは非常に軽いので即時実行）
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_PATIENT_MEMO", {
            patientId: id, wardCode: currentWard, value: val
        });
    }

    // 3. 画面再描画（UIの完全同期）
    renderPatients();
}

function resetAllStatus() {
    if(!isEditMode) return;
    var list = getCurrentPatientsList();
    if(list.length === 0) return;
    
    if(confirm("【警告】\n表示中の病棟の「介入状況」をすべてリセット（初期化）します。\n※マーク(！/？)および共有メモは保持されます。\n\n本当によろしいですか？")) {
        if(confirm("最終確認です。本当に一括リセットを実行してよろしいですか？")) {
            for(var i=0; i<list.length; i++) {
                if (list[i].status !== 0) {
                    list[i].status = 0;
                    list[i].statusAuthor = "";
                    if (typeof DataManager !== "undefined") {
                        DataManager.appendTransaction("TOGGLE_STATUS", {
                            patientId: list[i].id, 
                            wardCode: currentWard, 
                            value: 0,
                            author: ""
                        });
                    }
                }
            }
            renderPatients();

            alert("介入状況のリセットが完了しました。");
        }
    }
}

function resetAllPrescriptionChecks() {
    if(!isEditMode) return;
    var list = getCurrentPatientsList();
    if(list.length === 0) return;
    
    if(confirm("表示中の病棟の「処方」確認状態（✔・☐）をすべて解除してよろしいですか？")) {
        for(var i=0; i<list.length; i++) {
            if (list[i].chkPrescription) {
                list[i].chkPrescription = false;
                if (typeof DataManager !== "undefined") {
                    DataManager.appendTransaction("TOGGLE_PRESCRIPTION", {
                        patientId: list[i].id, 
                        wardCode: currentWard, 
                        value: false
                    });
                }
            }
        }
        renderPatients();

        alert("処方確認のチェックをクリアしました。");
    }
}

function jumpToPatient(pid, pname) {
    if(!pid && !pname) return;
    
    try {
        switchTab('tab-patients');
        
        // タブ切り替えによるDOMの再表示（display: block;）が完了してからスクロールさせるよう遅延
        setTimeout(function() {
            try {
                var tr = null;
                // まずIDで検索
                if (pid) {
                    var trId = "tr-patient-" + String(pid).trim();
                    tr = document.getElementById(trId);
                }
                // IDで見つからなかった場合、表示されている行から氏名で検索
                if (!tr && pname) {
                    var tbody = document.getElementById("tbody-patients");
                    var rows = tbody.getElementsByTagName("tr");
                    for (var i = 0; i < rows.length; i++) {
                        // 患者一覧の2列目(インデックス1)が氏名
                        var nameCell = rows[i].getElementsByTagName("td")[1];
                        if (nameCell && nameCell.innerText.indexOf(pname) !== -1) {
                            tr = rows[i];
                            break;
                        }
                    }
                }

                if(tr) {
                    // IE11非対応の {behavior: "smooth"} オブジェクトではなく、互換性のある true を渡す
                    tr.scrollIntoView(true);
                    
                    // 一瞬黄色くハイライトして場所を知らせる
                    var oldBg = tr.style.backgroundColor;
                    tr.style.backgroundColor = "#ffeb3b";
                    setTimeout(function(){
                        tr.style.backgroundColor = oldBg;
                    }, 1500);
                } else {
                    var msg = pid ? ("ID: " + pid) : "";
                    if (pname) msg += (msg ? " / " : "") + "氏名: " + pname;
                    alert("現在表示中の病棟の患者一覧に、該当の患者(" + msg + ") が見つかりませんでした。\n(別の病棟の患者の可能性があります)");
                }
            } catch(e) {
                alert("ジャンプ先のスクロール処理に失敗しました: " + e.message);
            }
        }, 150);
    } catch(err) {
        alert("ジャンプ処理の起動に失敗しました: " + err.message);
    }
}

// ---------- 外部データ取得とHTMLパース (IFRAME方式) ----------
function fetchPatientData() {
    if(!isEditMode) return;
    
    // 現在の病棟設定を取得
    var wardCode = currentWard;
    if(!wardCode) {
        alert("有効な病棟が選択されていません。");
        return;
    }
    var wardSettings = { name: getWardName(wardCode), code: wardCode };
    if(!currentSystemId) {
        alert("担当者ID(システム用)が設定されていません。一度リロードして再ログインしてください。");
        return;
    }
    
    var btn = document.getElementById("btn-fetch");
    var orgText = btn.innerText;
    btn.innerText = "↻ 取得中...";
    btn.disabled = true;

    var nowStr = new Date().toLocaleTimeString();
    var lastUpdateLabel = document.getElementById("last-update-time");
    if (lastUpdateLabel) {
        lastUpdateLabel.innerText = "(最終Webデータ取得: " + nowStr + ")";
    }

    // JSONPレスポンス用の一時コールバック（並行処理のため複数）
    var callbacks = [];
    var wCode = wardSettings.code ? String(wardSettings.code) : "";
    var wName = wardSettings.name ? String(wardSettings.name) : "";
    var isDummy = (wCode === "99") || 
                  (wName.indexOf("ﾀﾞﾐｰ") !== -1) ||
                  (wCode.toLowerCase() === "test") ||
                  (wName.toLowerCase() === "test");

    if (isDummy) {
        setTimeout(function() {
            var dummyPatients = [];
            var depts = ["内科", "外科", "整形外科", "産婦人科", "小児科", "眼科", "耳鼻科", "皮膚科", "泌尿器科", "脳神経外科"];
            var diseases = ["原発性免疫不全症候群", "急性虫垂炎", "大腿骨転子部骨折", "新型コロナ肺炎", "2型糖尿病", "白内障", "突発性難聴", "アトピー性皮膚炎", "前立腺肥大症", "くも膜下出血"];
            
            for(var i=1; i<=40; i++) {
                var dIdx = i % 10;
                // 4人ごとに部屋番号を変えるダミー
                var roomNum = (300 + Math.ceil(i/4)).toString();
                
                dummyPatients.push({
                    room: roomNum, // ★追加: 病室ダミー [cite: 11]
                    id: (100000 + i).toString(),
                    name: "テスト患者　" + i + "号",
                    dept: depts[dIdx],
                    doctor: "医師" + String.fromCharCode(65 + dIdx % 5),
                    disease: diseases[dIdx],
                    daysInHosp: (Math.floor(Math.random() * 50) + 1).toString() // ★追加: 在院日数ダミー [cite: 11]
                });
            }
            
            processFetchedPatients(dummyPatients, wardSettings.name || "TEST");
            btn.innerText = "↻ 現在の病棟のシステム更新";
            btn.disabled = false;
        }, 300);
        return;
    }

    // カスタムタブが選択中の場合は全病棟を一括取得（裏で静かに実行）
    if (typeof currentFilterTag !== 'undefined' && currentFilterTag !== "") {
        fetchAllActiveWardsData(function() {
            btn.innerText = orgText;
            btn.disabled = false;
            // 取得完了後に再描画
            renderPatients();
        }, true);
        return;
    }

    var iframeId = "loader-iframe";
    var iframe = document.getElementById(iframeId);
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = iframeId;
        iframe.style.display = "none";
        document.body.appendChild(iframe);
    }
    
    iframe.onload = function() {
        try {
            var doc = iframe.contentWindow.document;
            parseHtmlAndMerge(doc, wardSettings.name);
        } catch(e) {
            alert("患者データの読み取りに失敗しました。\n\n【考えられる原因】\n1. セキュリティ制限: ブラウザ（インターネットオプション）の『信頼済みサイト』にカルテサーバーのURL(10.5.171.42)を登録してください。\n2. ネットワーク: サーバーに接続できない環境です。\n3. ファイル不在: まだ作成されていない時間帯のリストを読み込もうとしています。\n\nエラー詳細: " + e.message);
        }
        btn.innerText = "↻ 現在の病棟のシステム更新";
        btn.disabled = false;
        
        setTimeout(function(){ iframe.onload = null; }, 100);
    };
    
    // URLの自動生成
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = ("0" + (today.getMonth() + 1)).slice(-2);
    var dd = ("0" + today.getDate()).slice(-2);
    var dateStr = yyyy + "%2F" + mm + "%2F" + dd; // YYYY/MM/DDのエンコード
    
    var baseUrl = "http://10.5.171.42:8082/karte/kanja_ichiran/kanja_ichiran.php";
    var fetchUrl = baseUrl + "?byoto_code=" + wardSettings.code + 
                   "&search_date=" + dateStr + 
                   "&ichiran_code=58&user_id=" + currentSystemId + 
                   "&section_code=&page_num=0&login_flg=" + 
                   "&t=" + new Date().getTime(); // キャッシュ回避
    
    // もし手動でテスト用URLが設定されていた場合のデバッグ用回避（設定コードがhttp始まりならそのまま使う）
    if (String(wardSettings.code).indexOf('http') === 0 || String(wardSettings.code).indexOf('file') === 0) {
        fetchUrl = wardSettings.code;
    }

    try {
        iframe.src = fetchUrl;
    } catch(e) {
        alert("URLを開けませんでした: " + e.message);
        btn.innerText = "↻ 現在の病棟のシステム更新";
        btn.disabled = false;
    }
}

function processFetchedPatients(newPatients, wardName) {
    if (window.PatientLogic) window.PatientLogic.processFetchedPatients(newPatients, wardName);
}

// ---------- 全病棟一括データ取得 ----------
function fetchAllActiveWardsData(callback, silent) {
    if (!isEditMode) {
        if (callback) callback();
        return;
    }
    
    var activeCodes = [];
    if (typeof ALL_WARDS !== "undefined") {
        for (var wIdx = 0; wIdx < ALL_WARDS.length; wIdx++) {
            activeCodes.push(ALL_WARDS[wIdx].code);
        }
    }
    if (activeCodes.length === 0) {
        if (callback) callback();
        return;
    }

    var iframeId = "loader-iframe-all";
    var iframe = document.getElementById(iframeId);
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = iframeId;
        iframe.style.display = "none";
        document.body.appendChild(iframe);
    }
    
    var wardIndex = 0;
    var originalWard = window.currentWard; // 元の病棟を記憶
    
    // UIブロック
    var overlay = document.getElementById("loader-overlay-all");
    if (!overlay) {
        overlay = document.createElement("div");
        overlay.id = "loader-overlay-all";
        overlay.style.position = "fixed";
        overlay.style.top = "0";
        overlay.style.left = "0";
        overlay.style.width = "100%";
        overlay.style.height = "100%";
        overlay.style.backgroundColor = "rgba(0,0,0,0.6)";
        overlay.style.zIndex = "10000";
        overlay.style.color = "white";
        overlay.style.fontSize = "20px";
        overlay.style.fontWeight = "bold";
        overlay.style.display = "flex";
        overlay.style.alignItems = "center";
        overlay.style.justifyContent = "center";
        document.body.appendChild(overlay);
    }
    if (silent) {
        overlay.style.display = "none";
    } else {
        overlay.style.display = "flex";
    }

    var baseUrl = "http://10.5.171.42:8082/karte/kanja_ichiran/kanja_ichiran.php";
    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = ("0" + (today.getMonth() + 1)).slice(-2);
    var dd = ("0" + today.getDate()).slice(-2);
    var dateStr = yyyy + "%2F" + mm + "%2F" + dd;

    function fetchNext() {
        if (wardIndex >= activeCodes.length) {
            window.currentWard = originalWard; // 元の病棟に戻す
            if (!silent) overlay.style.display = "none";
            if (callback) callback();
            return;
        }

        var code = activeCodes[wardIndex];
        var wName = getWardName(code);
        window.currentWard = code; // 一時的にcurrentWardを差し替え
        
        overlay.innerHTML = "全病棟データを取得中...<br>(" + (wardIndex + 1) + " / " + activeCodes.length + ") " + escapeHtml(wName);

        var fetchUrl = baseUrl + "?byoto_code=" + code + 
                       "&search_date=" + dateStr + 
                       "&ichiran_code=58&user_id=" + currentSystemId + 
                       "&section_code=&page_num=0&login_flg=" + 
                       "&t=" + new Date().getTime();
        
        if (String(code).indexOf('http') === 0 || String(code).indexOf('file') === 0) {
            fetchUrl = code;
        }

        var wCode = String(code);
        var isDummy = (wCode === "99") || 
                      (wName.indexOf("ﾀﾞﾐｰ") !== -1) ||
                      (wCode.toLowerCase() === "test") ||
                      (wName.toLowerCase() === "test");

        // ★ダミーデータ処理
        if ((typeof USE_DUMMY_DATA !== 'undefined' && USE_DUMMY_DATA) || isDummy) {
            setTimeout(function() {
                var dummyPatients = [];
                var depts = ["内科", "外科", "整形外科", "産婦人科", "小児科", "眼科", "耳鼻科", "皮膚科", "泌尿器科", "脳神経外科"];
                var diseases = ["原発性免疫不全症候群", "急性虫垂炎", "大腿骨転子部骨折", "新型コロナ肺炎", "2型糖尿病", "白内障", "突発性難聴", "アトピー性皮膚炎", "前立腺肥大症", "くも膜下出血"];
                
                for(var i=1; i<=40; i++) {
                    var dIdx = i % 10;
                    var roomNum = (300 + Math.ceil(i/4)).toString();
                    
                    dummyPatients.push({
                        room: roomNum,
                        id: (100000 + i).toString(),
                        name: "テスト患者　" + i + "号",
                        dept: depts[dIdx],
                        doctor: "医師" + String.fromCharCode(65 + dIdx % 5),
                        disease: diseases[dIdx],
                        daysInHosp: (Math.floor(Math.random() * 50) + 1).toString()
                    });
                }
                
                processFetchedPatients(dummyPatients, wName || "TEST");
                
                wardIndex++;
                fetchNext();
            }, 300);
            return;
        }

        iframe.onload = function() {
            try {
                var doc = iframe.contentWindow.document;
                parseHtmlAndMerge(doc, wName);
            } catch(e) {}
            setTimeout(function() {
                wardIndex++;
                fetchNext();
            }, 300);
        };
        
        try {
            iframe.src = fetchUrl;
        } catch(e) {
            wardIndex++;
            fetchNext();
        }
    }
    
    fetchNext();
}

// ---------- 採血日個別取得機能（karte.php連携） ----------
// Deleted redundant vars & function

/**
 * 患者テーブルを検索フィルターで絞り込む
 * Line 524 から呼び出される
 */
function filterPatientTable() {
    var input = document.getElementById("ipt-patient-search");
    var filter = input ? input.value.toLowerCase() : "";
    var sel = document.getElementById("sel-update-filter");
    var updateFilter = sel ? sel.value : "";
    var tbody = document.getElementById("tbody-patients");
    if (!tbody) return;
    var tr = tbody.getElementsByTagName("tr");
    
    var now = new Date().getTime();

    for (var i = 0; i < tr.length; i++) {
        var row = tr[i];
        if (row.cells.length < 5) continue; 
        
        var text = (row.textContent || row.innerText || "").toLowerCase();
        var matchSearch = (text.indexOf(filter) > -1);
        
        var matchUpdate = true;
        
        var isOther = (row.getAttribute("data-updated-by-other") === "true");
        var tsStr = row.getAttribute("data-last-update-time");
        var diffH = -1;
        if (tsStr) {
            var ts = parseInt(tsStr, 10);
            if (!isNaN(ts)) {
                diffH = (now - ts) / (1000 * 60 * 60);
            }
        }
        
        if (updateFilter === "other") {
            matchUpdate = isOther;
        } else if (updateFilter === "3h") {
            matchUpdate = (diffH >= 0 && diffH <= 3);
        } else if (updateFilter === "24h") {
            matchUpdate = (diffH >= 0 && diffH <= 24);
        } else if (updateFilter === "other_3h") {
            matchUpdate = isOther && (diffH >= 0 && diffH <= 3);
        } else if (updateFilter === "other_24h") {
            matchUpdate = isOther && (diffH >= 0 && diffH <= 24);
        }
        
        if (matchSearch && matchUpdate) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    }
}

// Dead code processNextBloodFetch removed

function fetchBloodDateForPatient(patientId) {
    var p = findPatientById(patientId);
    if (!p) return;
    
    // UIフィードバック
    var tr = document.getElementById("tr-patient-" + patientId);
    if (tr) {
        var textEl = tr.querySelector(".blood-date-text");
        if (textEl) textEl.innerText = "取得中...";
    }
    
    fetchSingleBloodDate(p, function() {
        renderPatients();

    });
}

function fetchSingleSurgery(patientId, btn) {
    if (!isEditMode) { alert("編集モード時のみ実行可能です。"); return; }
    var patient = findPatientById(patientId);
    if (!patient) { alert("対象の患者が見つかりません。"); return; }
    
    var originalText = "";
    if (btn) {
        originalText = btn.innerText;
        btn.innerText = "取得中...";
        btn.style.backgroundColor = "#ffc107";
        btn.style.color = "#000";
        btn.style.pointerEvents = "none";
    }

    if (typeof SurgeryFetcher !== "undefined" && SurgeryFetcher.fetchSingle) {
        SurgeryFetcher.fetchSingle(patient, function() {
            renderPatients();
            setTimeout(function() { saveData(false); }, 100);
        });
    } else {
        alert("SurgeryFetcherが読み込まれていません。");
        if (btn) {
            btn.innerText = originalText;
            btn.style.backgroundColor = "#17a2b8";
            btn.style.color = "#fff";
            btn.style.pointerEvents = "auto";
        }
    }
}

function updateAllBloodDates() {
    if (!isEditMode) { alert("編集モード時のみ実行可能です。"); return; }
    var list = (typeof getDisplayedPatientsList === "function") ? getDisplayedPatientsList() : getCurrentPatientsList();
    if (list.length === 0) { alert("更新対象の患者がいません。"); return; }
    
    if (!confirm("表示中の全患者(" + list.length + "名)の採血日を順次取得しますか？\n(裏で1件ずつ取得するため画面は固まりません)")) return;

    var btn = document.querySelector("div[onclick='updateAllBloodDates()']");
    var originalText = btn ? btn.innerText : "[採血] 全体取得";
    if (btn) { btn.style.pointerEvents = "none"; btn.innerText = "準備中..."; }

    window.isBloodFetching = true;

    var idsToFetch = [];
    for (var i = 0; i < list.length; i++) {
        idsToFetch.push(list[i].id);
        var tr = document.getElementById("tr-patient-" + list[i].id);
        if (tr) {
            var textEl = tr.querySelector(".blood-date-text");
            if (textEl) textEl.innerText = "待機中...";
        }
    }

    var totalCount = idsToFetch.length;
    var index = 0;

    function processNext() {
        if (index >= totalCount) {
            window.isBloodFetching = false;
            if (btn) { btn.style.pointerEvents = "auto"; btn.innerText = originalText; }
            renderPatients();
            
            // ★超重要：遅延保存(autoSave)ではなく、アラートが出る前に【即時保存】を強制実行！
            saveData(false);
            
            alert("全件の取得が完了しました。");
            return;
        }
        
        var targetId = idsToFetch[index];
        index++;
        var patient = findPatientById(targetId);
        
        if (btn) btn.innerText = "残: " + (totalCount - index + 1);
        
        if (!patient) {
            setTimeout(processNext, 50);
            return;
        }

        var tr = document.getElementById("tr-patient-" + patient.id);
        if (tr) {
            var textEl = tr.querySelector(".blood-date-text");
            if (textEl) textEl.innerText = "取得中...";
        }
        
        fetchSingleBloodDate(patient, function() {
            var updateTr = document.getElementById("tr-patient-" + patient.id);
            if (updateTr) {
                var dtEl = updateTr.querySelector(".blood-date-text");
                if (dtEl) dtEl.innerText = patient.bloodDate || "-";
            }
            setTimeout(processNext, 200);
        });
    }
    processNext();
}

// --- Shift-JIS デコード用ヘルパー ---
function decodeShiftJIS(bin) {
    try {
        var stream = new ActiveXObject("ADODB.Stream");
        stream.Type = 1; // adTypeBinary
        stream.Open();
        stream.Write(bin);
        stream.Position = 0;
        stream.Type = 2; // adTypeText
        stream.Charset = "Shift_JIS";
        var text = stream.ReadText();
        stream.Close();
        return text;
    } catch (e) {
        return "";
    }
}

function fetchSingleBloodDate(p, callback) {
    if (!p || !p.id) { callback(); return; }
    
    var userId = "16622";
    if (typeof currentSystemId !== "undefined" && currentSystemId) {
        userId = currentSystemId;
    } else if (typeof appData !== "undefined" && appData.settings && appData.settings.adminIds && appData.settings.adminIds[0]) {
        userId = appData.settings.adminIds[0];
    }

    var url = "http://10.5.171.42:8082/karte/karte.php?kanja_id=" + p.id + 
              "&user_id=" + userId + 
              "&order_search_flg=1&order_search_code=3&order_search_name=#top" +
              "&_nocache=" + new Date().getTime();

    var iframeId = "blood-fetch-iframe-" + p.id;
    var existing = document.getElementById(iframeId);
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

    var iframe = document.createElement("iframe");
    iframe.id = iframeId;
    iframe.style.display = "none";
    iframe.application = "yes"; 
    document.body.appendChild(iframe);

    var isDone = false;
    var cleanupAndCallback = function() {
        if (isDone) return;
        isDone = true;
        setTimeout(function() {
            var ifr = document.getElementById(iframeId);
            if (ifr && ifr.parentNode) ifr.parentNode.removeChild(ifr);
        }, 500);
        callback(); 
    };

    var fallbackTimer = setTimeout(function() {
        if (!isDone) {
            p.bloodDate = "-";
            p.bloodDetail = "読み込みタイムアウト(3分超過)";
            cleanupAndCallback();
        }
    }, 180000); 

    iframe.onload = function() {
        setTimeout(function() {
            if (isDone) return;
            try {
                var doc = iframe.contentWindow.document;
                var allText = "";
                
                function collectText(currentDoc) {
                    if (!currentDoc) return;
                    try {
                        if (currentDoc.body && currentDoc.body.innerText) {
                            allText += " " + currentDoc.body.innerText;
                        }
                    } catch(e) {}
                    var frames = currentDoc.getElementsByTagName("frame");
                    var iframes = currentDoc.getElementsByTagName("iframe");
                    for(var j=0; j<frames.length; j++) {
                        try { collectText(frames[j].contentWindow.document); } catch(e){}
                    }
                    for(var k=0; k<iframes.length; k++) {
                        try { collectText(iframes[k].contentWindow.document); } catch(e){}
                    }
                }
                
                collectText(doc);

                var regex = /【([^】]*?(?:生化学|血液|外注|一般)[^】]*?)】[^【]{0,150}?(\d{4})\/(\d{2})\/(\d{2})/g;
                var match;
                var today = new Date();
                today.setHours(0,0,0,0);
                var futureEntries = [];
                
                while ((match = regex.exec(allText)) !== null) {
                    var typeRaw = match[1].replace(/^[0-9:\s]+/, '').replace(/\[.*?\]\s*/g, '').trim();
                    var typeClean = typeRaw.substring(0, 15);
                    var y = parseInt(match[2], 10);
                    var m = parseInt(match[3], 10);
                    var d = parseInt(match[4], 10);
                    var dt = new Date(y, m - 1, d);
                    
                    var diffDays = (dt.getTime() - today.getTime()) / (1000 * 3600 * 24);
                    if (diffDays >= 1 && diffDays <= 30) {
                        futureEntries.push({
                            dateObj: dt,
                            displayDate: ('0'+m).slice(-2) + '/' + ('0'+d).slice(-2),
                            category: typeClean,
                            fullText: match[0].substring(0, 45)
                        });
                    }
                }
                
                if (futureEntries.length > 0) {
                    futureEntries.sort(function(a, b) { return a.dateObj.getTime() - b.dateObj.getTime(); });
                    var target = futureEntries[0];
                    p.bloodDate = target.displayDate + '(' + target.category + ')';
                    p.bloodDetail = target.fullText;
                } else {
                    p.bloodDate = "なし";
                    p.bloodDetail = "明日以降30日以内の検査予定が見つかりませんでした";
                }
            } catch(e) {
                p.bloodDate = "-";
                p.bloodDetail = "フレーム解析エラー: " + (e.message || e);
            }
            
            // ★追加: データ取得成功時に、ここで確実に伝票(Transaction)を発行する
            if (typeof DataManager !== "undefined") {
                DataManager.appendTransaction("UPDATE_BLOOD_DATE", {
                    patientId: p.id,
                    wardCode: currentWard,
                    bloodDate: p.bloodDate,
                    bloodDetail: p.bloodDetail
                });
            }

            clearTimeout(fallbackTimer);
            
            var tr = document.getElementById('tr-patient-' + p.id);
            if (tr) {
                var dateSpan = tr.querySelector('.blood-date-text');
                if (dateSpan) dateSpan.innerHTML = escapeHtml(p.bloodDate);
                var fetchBtn = tr.querySelector('.blood-fetch-btn');
                if (fetchBtn) { fetchBtn.innerText = '完了'; fetchBtn.disabled = false; }
                var cell = tr.querySelector('.blood-date-cell');
                if (cell && p.bloodDetail) cell.title = '採血詳細: ' + escapeHtml(p.bloodDetail) + ' (クリックで手動修正)';
            }

            cleanupAndCallback();
        }, 1500); 
    };
    
    try {
        iframe.src = url;
    } catch(e) {
        p.bloodDate = "-";
        p.bloodDetail = "URLアクセスエラー";
        clearTimeout(fallbackTimer);
        cleanupAndCallback();
    }
}

function parseHtmlAndMerge(doc, wardName) {
    try {
        var tables = doc.getElementsByTagName("table");
        if(tables.length === 0) {
            alert("ページにテーブルデータが含まれていません。");
            return;
        }

        var targetTable = tables[0];
        var rows = targetTable.getElementsByTagName("tr");
        
        var newPatients = [];
        var roomIndex = 8;     // ★追加: 病室 (列番号8) [cite: 11]
        var idIndex = 2;       // 患者ID
        var nameIndex = 3;     // 氏名
        var deptIndex = 9;     // 診療科
        var docIndex = 10;     // 主治医
        var diseaseIndex = 32; // 主病名
        var daysInHospIndex = 29; // 在院日数
        
        for(var i = 0; i < rows.length; i++) {
            var cells = rows[i].getElementsByTagName("td");
            if(cells.length > diseaseIndex) {
                var pidStr = (cells[idIndex].innerText || cells[idIndex].textContent || "").replace(/\s+/g, "");
                
                if (pidStr.indexOf("患者ID") !== -1 || pidStr === "＼" || pidStr === "") continue;

                // 病室の取得 [cite: 11]
                var proom = cells[roomIndex] ? (cells[roomIndex].innerText || cells[roomIndex].textContent || "").trim() : "";
                var pname = cells[nameIndex].innerText || cells[nameIndex].textContent || "";
                var pdept = cells[deptIndex].innerText || cells[deptIndex].textContent || "";
                var pdoc = cells[docIndex].innerText || cells[docIndex].textContent || "";
                var pdisease = cells[diseaseIndex].innerText || cells[diseaseIndex].textContent || "";
                var pdays = cells[daysInHospIndex] ? (cells[daysInHospIndex].innerText || cells[daysInHospIndex].textContent || "") : "-";

                if(pidStr) {
                    newPatients.push({
                        room: proom,   // ★追加 [cite: 11]
                        id: pidStr,
                        name: pname.trim(),
                        dept: pdept.trim(),
                        doctor: pdoc.trim(),
                        disease: pdisease.trim(),
                        daysInHosp: pdays.trim()
                    });
                }
            }
        }
        
        if(newPatients.length === 0) {
            // alert("テーブルから患者情報を抽出できませんでした。データが0件またはフォーマットが変わった可能性があります。");
            return;
        }
        
        processFetchedPatients(newPatients, wardName);
    } catch(e) {
        alert("HTML解析エラー: " + e.message);
    }
}

function processFetchedPatients(newPatients, wardName) {
    if (window.PatientLogic) window.PatientLogic.processFetchedPatients(newPatients, wardName);
}


// ---------- 入院予定患者一覧 ----------
var admissionPatients = [];

function toggleAdmissionPanel() {
    var body = document.getElementById('admission-body');
    var icon = document.getElementById('admission-toggle-icon');
    if (body.style.display === 'none') {
        body.style.display = '';
        icon.innerText = '▼';
    } else {
        body.style.display = 'none';
        icon.innerText = '▲';
    }
}

function fetchAdmissionSchedule() {
    if (!isEditMode) return;
    var wardCode = currentWard;
    var wardName = getWardName(wardCode);
    if (!wardCode || String(wardCode) === '99' || String(wardCode).indexOf('http') === 0) return;

    var iframeId = "admission-iframe";
    var iframe = document.getElementById(iframeId);
    if (!iframe) {
        iframe = document.createElement("iframe");
        iframe.id = iframeId;
        iframe.style.display = "none";
        document.body.appendChild(iframe);
    }

    var today = new Date();
    var yyyy = today.getFullYear();
    var mm = ('0' + (today.getMonth() + 1)).slice(-2);
    var dd = ('0' + today.getDate()).slice(-2);
    var dateStr = yyyy + "%2F" + mm + "%2F" + dd;

    var fetchUrl = "http://10.5.171.42:8082/karte/kanja_ichiran/kanja_ichiran.php" +
        "?nyuin_yoyaku_start_date=" + dateStr +
        "&nyuin_yoyaku_end_date=" + dateStr +
        "&byoto_gentei_flg=%2C" +
        "&nyuin_byoto_code=" + wardCode +
        "&ichiran_code=6&user_id=" + currentSystemId +
        "&section_code=&page_num=0&login_flg=" +
        "&t=" + new Date().getTime();

    iframe.onload = function() {
        try {
            var doc = iframe.contentWindow.document;
            parseAdmissionHtml(doc);
        } catch(e) {}
    };
    try { iframe.src = fetchUrl; } catch(e) {}
}

function renderCustomCalendarHTML() {
    var div = document.getElementById("custom-datepicker");
    if(!div) return;
    var y = calCurrentYear;
    var m = calCurrentMonth;
    var firstDay = new Date(y, m-1, 1).getDay();
    var lastDate = new Date(y, m, 0).getDate();
    
    var html = [];
    html.push("<div style='display:flex; justify-content:space-between; align-items:center; margin-bottom:5px; background:#f0f0f0; padding:3px; border-radius:3px;'>");
    html.push("<button onclick='changeCalMonth(-1)' style='cursor:pointer; border:none; background:transparent;' title='前月'>◀</button>");
    html.push("<b style='font-size:13px;'>" + m + "月 (" + y + "年)</b>");
    html.push("<button onclick='changeCalMonth(1)' style='cursor:pointer; border:none; background:transparent;' title='次月'>▶</button>");
    html.push("</div>");
    
    html.push("<table style='width:100%; text-align:center; font-size:12px; border-collapse:collapse;'>");
    html.push("<tr style='color:#666; border-bottom:1px solid #ccc;'>");
    html.push("<th style='color:#e74c3c;'>日</th><th>月</th><th>火</th><th>水</th><th>木</th><th>金</th><th style='color:#3498db;'>土</th></tr><tr>");
    
    for(var i=0; i<firstDay; i++) { html.push("<td></td>"); }
    for(var i=1; i<=(lastDate); i++) {
        var dayOfWeek = (i + firstDay - 1) % 7;
        var cls = (dayOfWeek === 0) ? "color:#e74c3c;" : (dayOfWeek === 6) ? "color:#3498db;" : "";
        var isToday = (m === new Date().getMonth()+1 && i === new Date().getDate() && y === new Date().getFullYear());
        var isSelected = (m === calSelectedMonth && i === calSelectedDate);
        var bg = isSelected ? "background:#2ecc71; color:#fff; border-radius:3px; font-weight:bold;" : (isToday ? "background:#ffecb3; border-radius:3px;" : "background:#fff;");
        var styleCls = "cursor:pointer; width:24px; height:24px; padding:0; margin:1px; border:1px solid #ddd; " + cls + " " + bg;
        html.push("<td><button onclick='clickCalDate("+m+", "+i+")' style='" + styleCls + "'>" + i + "</button></td>");
        if(dayOfWeek === 6 && i !== lastDate) html.push("</tr><tr>");
    }
    html.push("</tr></table>");
    
    var existingTime = "";
    if(pendingDeadline) {
        var tm = pendingDeadline.match(/\s([0-9]{1,2}:[0-9]{1,2})/);
        if(tm) existingTime = tm[1];
    }
    
    html.push("<div style='margin-top:10px; display:flex; align-items:center; justify-content:space-between; border-top:1px solid #ccc; padding-top:8px;'>");
    html.push("<span style='font-size:12px; margin-right:5px; font-weight:bold;'>時刻:</span>");
    html.push("<select id='cal-time' style='padding:4px; font-size:12px; flex-grow:1; border:1px solid #aaa; border-radius:3px;'>");
    html.push("<option value=''>指定なし</option>");
    for(var h=0; h<24; h++) {
        var hStr = (h<10?"0":"")+h+":00";
        var hSel = (existingTime === hStr) ? "selected" : "";
        html.push("<option value='"+hStr+"' "+hSel+">"+hStr+"</option>");
    }
    html.push("</select></div>");
    
    html.push("<div style='margin-top:12px; display:flex; justify-content:space-between; gap:5px;'>");
    html.push("<button onclick='commitCalDate()' style='flex-grow:1; background:#3498db; color:white; border:none; padding:6px 0; border-radius:4px; cursor:pointer; font-weight:bold;'>決定</button>");
    html.push("<button onclick='clearCalDate()' style='background:#e74c3c; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;'>クリア</button>");
    html.push("<button onclick='document.getElementById(\"custom-datepicker\").style.display=\"none\";' style='background:#95a5a6; color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer;'>閉じる</button>");
    html.push("</div>");
    
    div.innerHTML = html.join('');
}

function parseBloodDateFromDoc(doc, patientId) {
    var today = new Date();
    today.setHours(0,0,0,0);
    var futureEntries = [];
    var allEntries = [];

    try {
        var allText = "";
        
        function collectText(currentDoc) {
            if(!currentDoc) return;
            try {
                if (currentDoc.body && currentDoc.body.innerText) {
                    allText += " " + currentDoc.body.innerText;
                }
            } catch(e) {}
            
            var frames = currentDoc.getElementsByTagName('frame');
            var iframes = currentDoc.getElementsByTagName('iframe');
            for(var j=0; j<frames.length; j++) {
                try { collectText(frames[j].contentWindow.document); } catch(e){}
            }
            for(var k=0; k<iframes.length; k++) {
                try { collectText(iframes[k].contentWindow.document); } catch(e){}
            }
        }
        collectText(doc);

        var regex = /[【\[]([^】\]]+)[】\]][^【\[]{0,100}?(\d{4})\/(\d{2})\/(\d{2})/g;
        var match;
        
        while ((match = regex.exec(allText)) !== null) {
            // カテゴリのクリーニング
            var catRaw = match[1].replace(/^[0-9:]+\s*/, '').replace(/\[.*?\]\s*/g, '').trim();
            var catClean = catRaw.substring(0, 15);
            
            var y = parseInt(match[2], 10);
            var m = parseInt(match[3], 10);
            var d = parseInt(match[4], 10);
            var dt = new Date(y, m - 1, d);
            
            var entry = { 
                dateObj: dt, 
                displayDate: ('0'+m).slice(-2) + '/' + ('0'+d).slice(-2),
                category: catClean,
                fullText: match[0].substring(0, 40)
            };
            
            // 今日と抽出した日付の差（日数）を計算
            var diffDays = (dt.getTime() - today.getTime()) / (1000 * 3600 * 24);
            // ★修正：今日(0)以前、または30日より先のデータは無視する
            if (diffDays < 1 || diffDays > 30) continue;
            
            futureEntries.push(entry);
        }
    } catch(e) {}
    
    var targetEntry = null;
    // 見つけた日付リストを並び替えて「一番今日に近い未来」を選ぶ
    if (futureEntries.length > 0) {
        futureEntries.sort(function(a, b) { return a.dateObj.getTime() - b.dateObj.getTime(); });
        targetEntry = futureEntries[0];
    }
    
    var p = findPatientById(patientId);
    if (!p) return;

    if (targetEntry) {
        var catText = targetEntry.category ? '(' + targetEntry.category + ')' : '';
        p.bloodDate = targetEntry.displayDate + catText;
        p.bloodDetail = targetEntry.fullText;
    } else {
        // ★修正：見つからなかった場合は「なし」と表示
        p.bloodDate = 'なし';
        p.bloodDetail = '明日以降30日以内の検査予定が見つかりませんでした';
    }
    
    var tr = document.getElementById('tr-patient-' + patientId);
    if (tr) {
        var dateSpan = tr.querySelector('.blood-date-text');
        if (dateSpan) dateSpan.innerHTML = escapeHtml(p.bloodDate);
        var fetchBtn = tr.querySelector('.blood-fetch-btn');
        if (fetchBtn) { fetchBtn.innerText = '完了'; fetchBtn.disabled = false; }
        var cell = tr.querySelector('.blood-date-cell');
        if (cell && p.bloodDetail) cell.title = '採血詳細: ' + escapeHtml(p.bloodDetail) + ' (クリックで手動修正)';
    }

}



// function saveDataQuietly removed to avoid conflict with DataManager

function parseAdmissionHtml(doc) {
    if (window.PatientLogic) window.PatientLogic.parseAdmissionHtml(doc);
}


function renderAdmissionSchedule() {
    if (typeof appData !== "undefined" && appData.admissionSchedule) {
        admissionPatients = appData.admissionSchedule;
    }
    
    var tbody = document.getElementById('tbody-admission');
    var countEl = document.getElementById('admission-count');
    if (!tbody) return;
    if (countEl) countEl.innerText = admissionPatients.length;
    if (admissionPatients.length === 0) {
        tbody.innerHTML = '<tr><td colspan="10" align="center">本日の入院予定はありません</td></tr>';
        return;
    }
    var html = '';
    for (var i = 0; i < admissionPatients.length; i++) {
        var p = admissionPatients[i];
        var statIdx = p.status || 0;
        var statClass = STATUS_CLASSES[statIdx];
        var statText = STATUS_TEXTS[statIdx];
        if(statText === "(未設定)") statText = "未";
        else if(statText === "介入予定") statText = "予定";
        else if(statText === "指導済") statText = "指導";
        else if(statText === "記録済") statText = "記録";

        var authorHtml = p.statusAuthor ? '<br><span class="status-author">' + p.statusAuthor + '</span>' : '';
        var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';
        var clickEvent = isEditMode ? 'onclick="toggleAdmissionStatus('+i+')"' : '';
        var memoDisabled = isEditMode ? '' : 'disabled="disabled"';
        var memoChange = isEditMode ? 'onchange="finalizeAdmissionMemo('+i+', this)" onkeyup="updateAdmissionMemoDebounced('+i+', this.value, this)"' : '';
        var alertEvent = isEditMode ? 'onclick="toggleAdmissionAlert('+i+')"' : '';
        var aLevel = p.alertLevel || 0;
        var aText = aLevel === 0 ? '' : aLevel === 1 ? '?' : '!';
        var aClass = aLevel === 0 ? '' : aLevel === 1 ? 'alert-caution' : 'alert-urgent';
        var bdAdClick = isEditMode ? 'onclick="changeAdmissionBloodDate('+i+')"' : '';
        var bdAdTitle = p.bloodDetail ? 'title="採血詳細: ' + escapeHtml(p.bloodDetail) + '"' : 'title="採血日修正"';

        var alreadyAdmitted = false;
        var currentList = getCurrentPatientsList();
        for (var cl = 0; cl < currentList.length; cl++) {
            var pIdNorm1 = String(p.id).replace(/^0+/, '') || '0';
            var pIdNorm2 = String(currentList[cl].id).replace(/^0+/, '') || '0';
            if (pIdNorm1 === pIdNorm2) { alreadyAdmitted = true; break; }
        }
        var admittedBadge = alreadyAdmitted ? '<span style="background:#28a745;color:#fff;font-size:9px;padding:1px 4px;border-radius:3px;">入院済</span>' : '';

        var rowHtmlArr = [];
        rowHtmlArr.push('<tr' + (alreadyAdmitted ? ' style="background:#e8f5e9;"' : '') + '>');
        rowHtmlArr.push('<td>' + escapeHtml(p.id) + '</td>');
        rowHtmlArr.push('<td>' + escapeHtml(p.name) + admittedBadge + '</td>');
        rowHtmlArr.push('<td class="hide-on-print" style="font-size:11px; padding:2px 4px;">');
        rowHtmlArr.push('<div style="color:#0d6efd; font-weight:bold;">' + escapeHtml(p.dept || '') + '</div>');
        rowHtmlArr.push('<div style="color:#555;">' + escapeHtml(p.doctor || '') + '</div>');
        rowHtmlArr.push('</td>');
        rowHtmlArr.push('<td>' + escapeHtml(p.disease || '') + '</td>');
        rowHtmlArr.push('<td style="text-align:center; font-size:12px;">' + escapeHtml(p.room || '-') + '</td>');
        rowHtmlArr.push('<td style="text-align:center;">-</td>');
        rowHtmlArr.push('<td ' + bdAdClick + ' style="text-align:center; font-size:11px; cursor:pointer;" ' + bdAdTitle + '>' + escapeHtml(p.bloodDate || "-") + '</td>');
        rowHtmlArr.push('<td class="status-cell ' + statClass + '" style="' + statUnderline + '" ' + clickEvent + '>' + statText + authorHtml + '</td>');
        rowHtmlArr.push('<td style="text-align:center;">-</td>');
        rowHtmlArr.push('<td style="text-align:center; font-size:14px; font-weight:bold;" class="alert-toggle ' + aClass + '" ' + alertEvent + '>' + escapeHtml(aText) + '</td>');
        rowHtmlArr.push('<td><textarea ' + memoDisabled + ' ' + memoChange + ' placeholder="メモ...">' + escapeHtml(p.memo || '') + '</textarea></td>');
        rowHtmlArr.push('</tr>');
        html += rowHtmlArr.join('');
    }
    tbody.innerHTML = html;
}

function toggleAdmissionStatus(idx) {
    if (!isEditMode || idx >= admissionPatients.length) return;
    var p = admissionPatients[idx];
    p.status = ((p.status || 0) + 1) % 4;
    p.statusAuthor = currentUserName;
    appData.admissionSchedule = admissionPatients;
    
    // ★追加
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_ADMISSION_STATUS", {
            patientId: p.id, value: p.status, author: p.statusAuthor
        });
    }
    renderAdmissionSchedule();

}

function toggleAdmissionAlert(idx) {
    if (!isEditMode || idx >= admissionPatients.length) return;
    var p = admissionPatients[idx];
    p.alertLevel = ((p.alertLevel || 0) + 1) % 3;
    appData.admissionSchedule = admissionPatients;
    
    // ★追加
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_ADMISSION_ALERT", {
            patientId: p.id, value: p.alertLevel
        });
    }
    renderAdmissionSchedule();

}

// changeBloodDate: IDベースに変更 (手動入力。DOM直接更新)

function changeBloodDate(patientId) {
    if (!isEditMode) return;
    var list = getCurrentPatientsList();
    var p = null;
    for (var i = 0; i < list.length; i++) {
        if (String(list[i].id) === String(patientId)) { p = list[i]; break; }
    }
    if (!p) return;
    var currentText = (p.bloodDate || '').replace(/<[^>]+>/g, ' ').trim();
    var newVal = prompt('採血日を入力してください (例: 03/25)', currentText);
    if (newVal !== null) {
        p.bloodDate = newVal;
        p.bloodDetail = '';
        
        // ★追加: 手動入力時も確実に伝票(Transaction)を発行する
        if (typeof DataManager !== "undefined") {
            DataManager.appendTransaction("UPDATE_BLOOD_DATE", {
                patientId: p.id,
                wardCode: currentWard,
                bloodDate: p.bloodDate,
                bloodDetail: p.bloodDetail
            });
        }

        // DOM直接更新
        var tr = document.getElementById('tr-patient-' + p.id);
        if (tr) {
            var dateSpan = tr.querySelector('.blood-date-text');
            if (dateSpan) dateSpan.innerHTML = escapeHtml(newVal || '-');
            var cell = tr.querySelector('.blood-date-cell');
            if (cell) cell.title = 'クリックで採血日を手動修正';
        }

    }
}

function changeAdmissionBloodDate(index) {
    if (!isEditMode || index >= admissionPatients.length) return;
    var p = admissionPatients[index];
    var newVal = prompt("採血日を入力してください (例: 03/25)", p.bloodDate || "");
    if (newVal !== null) {
        p.bloodDate = newVal;
        renderAdmissionSchedule();

    }
}

function updateAdmissionMemo(idx, val, el) {
    if (idx >= admissionPatients.length) return;
    admissionPatients[idx].memo = val;
    appData.admissionSchedule = admissionPatients;
}

function finalizeAdmissionMemo(idx, el) {
    if (idx >= admissionPatients.length) return;
    var p = admissionPatients[idx];
    p.memo = el.value;
    if (el.value && currentUserName) {
        if (!p.memoAuthors) p.memoAuthors = [];
        var d = new Date();
        var mm = ("0" + (d.getMonth() + 1)).slice(-2);
        var dd = ("0" + d.getDate()).slice(-2);
        var hh = ("0" + d.getHours()).slice(-2);
        var min = ("0" + d.getMinutes()).slice(-2);
        var authorStr = currentUserName + " (" + mm + "/" + dd + " " + hh + ":" + min + ")";
        if (p.memoAuthors.length > 0 && p.memoAuthors[0].indexOf(currentUserName) === 0) {
            p.memoAuthors[0] = authorStr;
        } else {
            p.memoAuthors.unshift(authorStr);
        }
    }
    appData.admissionSchedule = admissionPatients;
    
    // ★追加: トランザクションの発行
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_ADMISSION_MEMO", {
            patientId: p.id, value: p.memo
        });
    }

}

function editTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.editTodo(index);
    }
}

function deleteTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.deleteTodo(index);
    }
}

function hardDeleteTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.hardDeleteTodo(index);
    }
}

function restoreTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.restoreTodo(index);
    }
}

function toggleTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.toggleTodo(index);
    }
}

function escapeHtml(str) {
    if(!str || typeof str !== 'string') return '';
    return str.replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;')
              .replace(/'/g, '&#39;');
}

function getTodayString() {
    var d = new Date();
    return d.getFullYear() + "/" + (("0"+(d.getMonth()+1)).slice(-2)) + "/" + (("0"+d.getDate()).slice(-2));
}
function getTimeString() { var d = new Date(); return (("0"+d.getHours()).slice(-2)) + ":" + (("0"+d.getMinutes()).slice(-2)); }

// ---------- ソート機能 ----------
var sortKey = "";
var sortOrder = 1; // 1:昇順, -1:降順
function sortPatients(key) {
    if (sortKey === key) {
        sortOrder = sortOrder * -1;
    } else {
        sortKey = key;
        sortOrder = 1; // 新規キーは昇順から
    }
    renderPatients();
}

// ---------- ToDoリスト管理 ----------
var currentTodoTab = ""; // dynamic: ward-4A, personal, deleted

function switchTodoSubTab(tabVal, el) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.switchSubTab(tabVal);
    }
}
function renderTodos() {
    var selAssignee = document.getElementById('sel-todo-assignee');
    if (selAssignee) {
        var users = getUniqueUsers();
        var newHtml = '<option value="">(指定なし)</option>';
        for (var u = 0; u < users.length; u++) {
            newHtml += '<option value="' + escapeHtml(users[u]) + '">' + escapeHtml(users[u]) + '</option>';
        }
        if (newHtml !== lastAssigneeHtml) {
            selAssignee.innerHTML = newHtml;
            lastAssigneeHtml = newHtml;
        }
    }

    if (typeof TodoUI !== "undefined") {
        TodoUI.render();
    } else {
        // ★追加: todo_ui.js が読み込めていない場合にエラーメッセージを表示する
        var tbody = document.getElementById("tbody-todo");
        if (tbody) {
            var msg1 = '<tr><td colspan="4" align="center" style="color:#d35400; font-weight:bold; padding:20px;">';
            var msg2 = '⚠️ ToDoモジュール (todo_ui.js) が読み込めていません。<br>';
            var msg3 = 'HTAファイルと同じ場所にある「js」フォルダの中に「todo_ui.js」が入っているか確認してください。</td></tr>';
            tbody.innerHTML = msg1 + msg2 + msg3;
        }
    }
}

// ---------- ToDo通知機能 (Vol.15.6) ----------
function checkMyTodos() {
    if(!appData.todos) return;
    var myTodos = [];
    var currentIncompleteCount = 0;
    for(var i=0; i<appData.todos.length; i++) {
        var t = appData.todos[i];
        if(!t.done && !t.deleted && !t.archived && t.assignee === currentUserName) {
            myTodos.push("・" + (t.text || ""));
            currentIncompleteCount++;
        }
    }
    
    // 前回の通知時よりタスクが増えている場合のみ通知する（重複防止）
    if(currentIncompleteCount > 0 && currentIncompleteCount > lastAlertedTodoCount) {
        var msg = "【" + currentUserName + "さんへのタスクがあります】\n\n" + myTodos.join("\n") + "\n\nToDoリストを確認してください。";
        setTimeout(function(){ alert(msg); }, 1500);
    }
    lastAlertedTodoCount = currentIncompleteCount;
}

function startDeadlineTimer() {
    setInterval(function(){
        if(!appData.todos) return;
        var now = new Date();
        for(var i=0; i<appData.todos.length; i++) {
            var t = appData.todos[i];
            if(t.done || t.deleted || t.archived || !t.deadline || !t.reminderOffset || t.alerted) continue;
            // 作業者が指定されている場合は自分宛のみ通知（未指定の場合は全員に通知）
            if(t.assignee && t.assignee !== currentUserName) continue;

            // スヌーズ中かチェック（IDベースで管理）
            if(snoozeList[t.id] && now.getTime() < snoozeList[t.id]) continue;

            // deadline "M/D H:M" または "M/D"
            var parts = t.deadline.match(/([0-9]{1,2})\/([0-9]{1,2})(\s[0-9]{1,2}:[0-9]{1,2})?/);
            if(!parts) continue;
            
            var due = new Date();
            due.setMonth(parseInt(parts[1], 10) - 1);
            due.setDate(parseInt(parts[2], 10));
            if(parts[3]) {
                var tm = parts[3].trim().split(":");
                due.setHours(parseInt(tm[0], 10), parseInt(tm[1], 10), 0, 0);
            } else {
                due.setHours(23, 59, 59, 999);
            }
            
            var diffMin = (due.getTime() - now.getTime()) / (1000 * 60);
            // 期限内かつリマインド分以内、または期限超過で24時間以内の場合
            if((diffMin > 0 && diffMin <= t.reminderOffset) || (diffMin < 0 && diffMin >= -1440)) {
                var overduePrefix = diffMin < 0 ? "【超過】" : "【期限間近】";
                if(confirm(overduePrefix + "のタスク\n" + t.text + "\n期限: " + t.deadline + "\n\n「OK」で了解（通知停止）\n「キャンセル」で10分後に再通知")) {
                    t.alerted = true; // 了解
                    delete snoozeList[t.id];
                    
                    // ★修正：の遅延を許さず、アラート直後に強制即時保存！
                    saveData(false); 
                    
                } else {
                    // スヌーズ設定（10分後）
                    snoozeList[t.id] = now.getTime() + (10 * 60 * 1000);
                }
            }
        }
        
        // --- 完了通知ロジック ---
        for(var i=0; i<appData.todos.length; i++) {
            var t = appData.todos[i];
            // 「自分が作成者 or 担当者」かつ「完了済み」かつ「通知希望」かつ「未通知」かつ「削除/アーカイブでない」
            var isMyTodo = (t.author === currentUserName) || (t.assignee === currentUserName);
            if(isMyTodo && t.done && !t.deleted && !t.archived && t.notifyOnDone && !t.doneAlerted) {
                alert("【タスク完了のお知らせ】\n\n「" + t.text + "」\nが完了されました。");
                t.doneAlerted = true;
                
                // ★修正：の遅延を許さず、アラート直後に強制即時保存！
                saveData(false);
            }
        }
    }, 60000);
}

// 自由入力の期限テキストから「当日か」「期限切れか」を判定するヘルパー
function parseTodoDate(deadlineStr) {
    if (!deadlineStr || deadlineStr.trim() === "") return { isToday: false, isOverdue: false };
    
    var now = new Date();
    // 形式は "1/5", "1/5 15:00" など
    var m = deadlineStr.match(/^([0-9]{1,2})\/([0-9]{1,2})/);
    if (!m) {
        if (deadlineStr.match(/^([0-9]{1,2}):([0-9]{1,2})$/)) return { isToday: true, isOverdue: false };
        return { isToday: false, isOverdue: false };
    }
    
    var targetMonth = parseInt(m[1], 10);
    var targetDate = parseInt(m[2], 10);
    var curMonth = now.getMonth() + 1;
    var curDate = now.getDate();
    
    if (targetMonth === curMonth && targetDate === curDate) return { isToday: true, isOverdue: false };
    
    if (targetMonth < curMonth || (targetMonth === curMonth && targetDate < curDate)) {
        if (curMonth - targetMonth === -11) return { isToday: false, isOverdue: false }; // 来年1月
        return { isToday: false, isOverdue: true };
    }
    
    if (targetMonth - curMonth === 11) return { isToday: false, isOverdue: true }; // 去年12月
    return { isToday: false, isOverdue: false };
}

// --- ToDoのカスタムカレンダーUI ---
var pendingDeadline = "";

// カレンダー表示月管理用
var calCurrentYear = new Date().getFullYear();
var calCurrentMonth = new Date().getMonth() + 1; // 1-12
var calSelectedDate = null; // 選択中の日 (1-31)
var calSelectedMonth = null;
var calSelectedYear = null;

// 期限設定用カレンダーの起動
function openCustomDatePicker(btn) {
    // 編集モードでなければ何もしない
    if(!isEditMode) return;
    
    // TodoUIが存在する場合、現在の期限をカレンダーの状態に反映させる（同期）
    if(typeof TodoUI !== "undefined" && TodoUI.getPendingDeadline) {
        pendingDeadline = TodoUI.getPendingDeadline();
    }
    
    var div = document.getElementById("custom-datepicker");
    if(!div) {
        div = document.createElement("div");
        div.id = "custom-datepicker";
        // 画面中央に固定配置（モーダル風）、幅を見切れないように 300px に拡張
        div.style.cssText = "position:fixed; top:50%; left:50%; transform:translate(-50%, -50%); background:#fff; border:1px solid #999; padding:15px; z-index:9999; box-shadow:0 10px 25px rgba(0,0,0,0.5); font-size:13px; font-family:sans-serif; width:300px; border-radius:8px;";
        document.body.appendChild(div);
    }
    
    // 現在の入力から月・日を取得する（あれば）
    calSelectedYear = new Date().getFullYear();
    if(pendingDeadline) {
        var m = pendingDeadline.match(/([0-9]{1,2})\/([0-9]{1,2})/);
        if(m) {
            calCurrentMonth = parseInt(m[1], 10);
            calSelectedMonth = calCurrentMonth;
            calSelectedDate = parseInt(m[2], 10);
        }
    } else {
        calCurrentYear = new Date().getFullYear();
        calCurrentMonth = new Date().getMonth() + 1;
        calSelectedMonth = null;
        calSelectedDate = null;
    }
    
    renderCustomCalendarHTML();
    div.style.display = "block";
}

function changeCalMonth(diff) {
    calCurrentMonth += diff;
    if(calCurrentMonth > 12) { calCurrentMonth = 1; calCurrentYear++; }
    else if(calCurrentMonth < 1) { calCurrentMonth = 12; calCurrentYear--; }
    renderCustomCalendarHTML();
}



function clickCalDate(m, d) {
    calSelectedMonth = m;
    calSelectedDate = d;
    renderCustomCalendarHTML();
}

function clearCalDate() {
    pendingDeadline = "";
    calSelectedMonth = null;
    calSelectedDate = null;
    var tSel = document.getElementById("cal-time");
    if(tSel) tSel.value = "";
    commitCalDate();
}

function commitCalDate() {
    if (calSelectedMonth !== null && calSelectedDate !== null) {
        var tSel = document.getElementById("cal-time");
        var tStr = (tSel && tSel.value !== "") ? " " + tSel.value : "";
        pendingDeadline = calSelectedMonth + "/" + calSelectedDate + tStr;
    } else if (pendingDeadline === "") {
        pendingDeadline = "";
    }
    
    // TodoUIへ期限を同期
    if(typeof TodoUI !== "undefined" && TodoUI.setPendingDeadline) {
        TodoUI.setPendingDeadline(pendingDeadline);
    }
    
    var lbl = document.getElementById("lbl-todo-deadline");
    if(pendingDeadline !== "") {
        lbl.innerText = "[" + pendingDeadline + "]";
        lbl.style.display = "inline";
    } else {
        lbl.style.display = "none";
        lbl.innerText = "";
    }
    
    var div = document.getElementById("custom-datepicker");
    if(div) div.style.display = "none";
}

var editingTodoIndex = null;
function addNewTodoUI() {
    if (typeof TodoUI !== "undefined") {
        TodoUI.addNewTodoUI();
    }
}

function addTodo() {
    if (typeof TodoUI !== "undefined") {
        TodoUI.addTodo();
    }
}

function toggleTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.toggleDone(index);
    }
}

function deleteTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.deleteTodo(index);
    }
}

function editTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.editTodo(index);
    }
}

function cancelEditTodo() {
    if (typeof TodoUI !== "undefined") {
        TodoUI.cancelEditTodo();
    }
}

function restoreTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.restoreTodo(index);
    }
}

function hardDeleteTodo(index) {
    if (typeof TodoUI !== "undefined") {
        TodoUI.deleteTodo(index); // TodoUI側では delete が soft/hard を吸収するように実装
    }
}

// ---------- 入退室履歴表示 ----------
function renderHistory() {
    var tbody = document.getElementById("tbody-history");
    if(!appData.history || appData.history.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" align="center">まだ履歴はありません。</td></tr>';
        return;
    }

    // ★追加: 履歴にある病棟を抽出してプルダウンメニューを動的に生成する
    var selWard = document.getElementById("sel-history-ward");
    if (selWard) {
        var curVal = selWard.value;
        var wards = {};
        for(var w = 0; w < appData.history.length; w++) {
            if(appData.history[w].ward) wards[appData.history[w].ward] = true;
        }
        var selHtml = '<option value="">全病棟</option>';
        var sortedWards = [];
        for(var wKey in wards) { if(wards.hasOwnProperty(wKey)) sortedWards.push(wKey); }
        sortedWards.sort();
        for(var sw = 0; sw < sortedWards.length; sw++) {
            var selected = (sortedWards[sw] === curVal) ? " selected" : "";
            selHtml += '<option value="' + escapeHtml(sortedWards[sw]) + '"' + selected + '>' + escapeHtml(sortedWards[sw]) + '</option>';
        }
        selWard.innerHTML = selHtml;
    }

    var html = "";
    for(var i=0; i<appData.history.length; i++) {
        var h = appData.history[i];
        var pId = h.id || "";
        var pName = h.patient || "";
        if (!pId && pName) {
            var match = pName.match(/^(.*?)\s*\(\s*([0-9a-zA-Z\-]+)\s*\)$/);
            if (match) { pName = match[1]; pId = match[2]; }
        }

        var isArrival = h.type.indexOf("退室") === -1 && h.type.indexOf("退避") === -1;
        var typeStyle = isArrival ? "color: #155724; background-color: #d4edda; font-weight:bold;" : "color: #721c24; background-color: #f8d7da;";

        var clickAction = '';
        var titleText = '';
        var linkStyle = 'color: #0d6efd; text-decoration: underline; cursor: pointer;';

        if (isArrival) {
            clickAction = 'onclick="jumpToPatient(\'' + escapeHtml(pId) + '\', \'' + escapeHtml(pName) + '\')"';
            titleText = 'クリックして患者一覧の現在の行へジャンプ';
        } else {
            clickAction = 'onclick="toggleHistoryDetail(\'' + escapeHtml(pId) + '\', ' + i + ')"';
            titleText = 'クリックして退院時のメモやステータスを表示';
            linkStyle = 'color: #c62828; text-decoration: underline; cursor: pointer; font-weight:bold;';
        }

        html += '<tr id="tr-history-' + i + '">';
        html += '<td style="font-size:11px; color:#555;">' + escapeHtml(h.date) + '</td>';
        html += '<td style="font-size:11px;">' + (h.ward ? escapeHtml(h.ward) : '') + '</td>';
        html += '<td align="center" style="font-size:11px; padding:2px;' + typeStyle + '">' + escapeHtml(h.type) + '</td>';
        html += '<td><span ' + clickAction + ' style="' + linkStyle + '" title="' + titleText + '">' + escapeHtml(pId) + '</span></td>';
        html += '<td><span ' + clickAction + ' style="' + linkStyle + '" title="' + titleText + '">' + escapeHtml(pName) + '</span></td>';
        html += '<td style="font-size:11px;">' + escapeHtml(h.dept || "-") + '</td>';
        html += '<td style="font-size:11px;">' + escapeHtml(h.doctor || "-") + '</td>';
        html += '<td style="font-size:11px;">' + escapeHtml(h.disease || "-") + '</td>';
        html += '</tr>';
        html += '<tr id="tr-history-detail-' + i + '" style="display:none; background:#fffaf0;"><td colspan="8" id="td-history-detail-' + i + '" style="padding:10px; border:1px solid #ffd54f;"></td></tr>';
    }
    tbody.innerHTML = html;
    filterHistoryTable();
}

function filterHistoryTable() {
    var wardFilter = document.getElementById("sel-history-ward") ? document.getElementById("sel-history-ward").value : "";
    var searchInput = document.getElementById("ipt-history-search");
    var filter = searchInput ? searchInput.value.toLowerCase() : "";
    var tbody = document.getElementById("tbody-history");
    if (!tbody) return;
    var tr = tbody.getElementsByTagName("tr");

    for (var i = 0; i < tr.length; i++) {
        var row = tr[i];
        if (row.id && row.id.indexOf("tr-history-detail-") === 0) continue; // 詳細行は飛ばす
        
        var wardText = row.cells[1] ? (row.cells[1].textContent || row.cells[1].innerText || "") : "";
        var contentText = (row.textContent || row.innerText || "").toLowerCase();

        var matchWard = (wardFilter === "" || wardText === wardFilter);
        var matchSearch = (filter === "" || contentText.indexOf(filter) > -1);

        if (matchWard && matchSearch) {
            row.style.display = "";
        } else {
            row.style.display = "none";
            // 対応する詳細行も隠す
            var detailRow = document.getElementById("tr-history-detail-" + row.id.replace("tr-history-", ""));
            if (detailRow) detailRow.style.display = "none";
        }
    }
}

function filterKarteLinkTable() {
    var input = document.getElementById("ipt-kartelink-search");
    if (!input) return;
    var filter = input.value.toLowerCase();
    var tbody = document.getElementById("tbody-kartelink");
    if (!tbody) return;
    var tr = tbody.getElementsByTagName("tr");

    for (var i = 0; i < tr.length; i++) {
        var row = tr[i];
        if (row.cells.length < 5) continue; // メッセージ行などを除外
        
        var text = (row.textContent || row.innerText || "").toLowerCase();
        if (text.indexOf(filter) > -1) {
            row.style.display = "";
        } else {
            row.style.display = "none";
        }
    }
}


function toggleHistoryDetail(pId, rowIndex) {
    var detailRow = document.getElementById("tr-history-detail-" + rowIndex);
    var detailCell = document.getElementById("td-history-detail-" + rowIndex);
    if (!detailRow || !detailCell) return;
    if (detailRow.style.display !== "none") {
        detailRow.style.display = "none";
        return;
    }

    var hItem = appData.history[rowIndex];
    var p = findPatientById(pId);
    var arc = p;
    if (!arc) {
        var pName = hItem ? (hItem.patient || "") : "";
        var match = pName.match(/^(.*?)\s*\(\s*([0-9a-zA-Z\-]+)\s*\)$/);
        if (match) pName = match[1];
        arc = { id: pId, name: pName || "過去の退院患者" };
    }

      if (arc.id && typeof PatientLogic !== "undefined" && PatientLogic.injectMetaToList) {
          PatientLogic.injectMetaToList([arc], appData.patientMeta);
      }
    
    var status = arc.status || 0;
    var statClass = STATUS_CLASSES[status];
    var statText = STATUS_TEXTS[status];
    if(statText === "(未設定)") statText = "未";
    else if(statText === "介入予定") statText = "予定";
    else if(statText === "指導済") statText = "指導";
    else if(statText === "記録済") statText = "記録";

    var chkVal = arc.chkPrescription || 0;
    if (typeof chkVal === "boolean") chkVal = chkVal ? 2 : 0;
    var chkText = (chkVal === 1) ? "△" : (chkVal === 2 ? "✓" : "-");
    var chkStyle = (chkVal === 1) ? "color:#e67e22;" : (chkVal === 2 ? "color:#27ae60; font-weight:bold;" : "color:#999;");

    var aLevel = arc.alertLevel || 0;
    var aText = aLevel === 0 ? "" : aLevel === 1 ? "?" : "!";
    var aClass = aLevel === 0 ? "" : aLevel === 1 ? "alert-caution" : "alert-urgent";

    var h = [];
    h.push('<div style="padding:5px; background:#fff;">');
    h.push('<table id="tbl-history-detail-sub" style="width:100%; border-collapse:collapse; font-size:12px; border:1px solid #ddd;">');
    h.push('  <thead><tr style="background:#e3f2fd;">');
    h.push('    <th width="60">患者ID</th><th width="110">氏名</th><th width="70">診療科</th><th width="70">主治医</th><th width="120">主病名</th>');
    h.push('    <th width="35">在院</th><th width="65">採血日</th><th width="35">介入</th><th width="35">処方</th><th width="35">強調</th><th width="auto">情報共有・メモ</th>');
    h.push('  </tr></thead>');
    h.push('  <tbody><tr>');
    h.push('    <td align="center">' + escapeHtml(pId) + '</td>');
    h.push('    <td>' + escapeHtml(hItem.patient || "") + '</td>');
    h.push('    <td>' + escapeHtml(hItem.dept || "-") + '</td>');
    h.push('    <td>' + escapeHtml(hItem.doctor || "-") + '</td>');
    h.push('    <td>' + escapeHtml(hItem.disease || "-") + '</td>');
    h.push('    <td align="center">-</td>');
    h.push('    <td align="center" style="font-size:11px;">' + escapeHtml(arc.bloodDate || "-") + '</td>');
    h.push('    <td class="status-cell ' + statClass + '" align="center" style="font-weight:bold; height:30px;">' + statText + '</td>');
    h.push('    <td align="center" style="font-size:16px; ' + chkStyle + '">' + chkText + '</td>');
    h.push('    <td align="center" style="color:#e74c3c; font-size:14px; font-weight:bold;" class="alert-toggle ' + aClass + '">' + escapeHtml(aText) + '</td>');
    
    var memoDisabled = isEditMode ? "" : "disabled";
    var memoChange = isEditMode ? 'onchange="updateHistoryMemo(\'' + escapeHtml(pId) + '\', this.value)" onkeyup="showTagSuggest(this, event);"' : "";
    h.push('    <td><textarea ' + memoDisabled + ' ' + memoChange + ' style="width:100%; height:40px; font-size:11px; padding:2px; border:1px solid #ddd; background:#f9f9f9;" placeholder="メモを入力...">' + escapeHtml(arc.memo || "") + '</textarea></td>');
    h.push('  </tr></tbody>');
    h.push('</table>');

    var pMemos = arc ? (arc.personalMemos || {}) : {};
    var myMemo = pMemos[currentSystemId] || "";
    
    h.push('<div style="margin-top:8px; display:flex; align-items:flex-start; gap:10px;">');
    h.push('  <span style="font-size:11px; font-weight:bold; color:#0d6efd; background:#e1f5fe; padding:2px 6px; border-radius:3px;">個人メモ</span>');
    var pMemoDisabled = isEditMode ? "" : "disabled";
    // ★修正: onchange="finalizePersonalMemo(...)" を追加して、入力完了時に確実に保存と伝票発行を行わせる
    var pMemoChange = isEditMode ? 'onchange="finalizePersonalMemo(\'' + escapeHtml(pId) + '\', this)" onkeyup="updatePersonalMemoDebounced(\'' + escapeHtml(pId) + '\', this.value, this); showTagSuggest(this, event);"' : "";
    h.push('  <div style="flex:1;">');
    h.push('    <textarea ' + pMemoDisabled + ' ' + pMemoChange + ' style="width:100%; height:40px; font-size:11px; padding:2px; border:1px dashed #b3d7ff; background:#f0fbff;" placeholder="自分専用のメモを入力...">' + escapeHtml(myMemo) + '</textarea>');
    h.push('  </div>');
    h.push('</div>');
    if (!p) {
        h.push('<div style="margin-top:8px; font-size:10px; color:#c62828; text-align:right;">⚠ 対応する患者レコードが見つからないため、新規アーカイブとして保存されます。</div>');
    }
    h.push('</div>');
    
    detailCell.innerHTML = h.join('');
    detailRow.style.display = "table-row";
}

function updateHistoryMemo(pId, newVal) {
    var arc = findPatientById(pId);
    if (!arc) {
        if (!appData.patients) appData.patients = {};
        if (!appData.patients["退院"]) appData.patients["退院"] = [];
        arc = { id: pId, memoAuthors: [], name: "退院患者(手動追加)" };
        appData.patients["退院"].push(arc);
    }
    arc.memo = newVal;
    // 編集者リストの更新 (重複防止)
    if (!arc.memoAuthors) arc.memoAuthors = [];
    var d = new Date();
    var mm = ("0" + (d.getMonth() + 1)).slice(-2);
    var dd = ("0" + d.getDate()).slice(-2);
    var hh = ("0" + d.getHours()).slice(-2);
    var min = ("0" + d.getMinutes()).slice(-2);
    var authorStr = currentUserName + " (" + mm + "/" + dd + " " + hh + ":" + min + ")";
    if (arc.memoAuthors.length > 0 && arc.memoAuthors[0].indexOf(currentUserName) === 0) {
        arc.memoAuthors[0] = authorStr;
    } else {
        arc.memoAuthors.unshift(authorStr);
    }
    
    // ★追加: 退室患者のメモでも確実に伝票（トランザクション）を発行する
    if (typeof DataManager !== "undefined") {
        DataManager.appendTransaction("UPDATE_PATIENT_MEMO", {
            patientId: pId, wardCode: currentWard, value: newVal
        });
    }

}

// ---------- トランザクション履歴からの緊急復元ロジック (Vol.15) ----------
function recoverFromTransactions() {
    if (typeof DataManager === "undefined") {
        alert("DataManagerが読み込まれていません。");
        return;
    }
    if (!confirm("トランザクションから緊急復元を試みますか？\n(注意: 未適用の保存ファイルからデータを作り直します)")) {
        return;
    }

    try {
        var baseData = DataManager.loadDiskData ? DataManager.loadDiskData() : DataManager.loadAll();
        DataManager.replayTransactions(baseData);
        appData = baseData;
        DataManager.appData = appData;
        DataManager.hasLocalChanges = true;
        
        applyWardTabs();
        renderPatients();
        if (typeof TodoUI !== "undefined" && document.getElementById("tab-todo") && document.getElementById("tab-todo").className.indexOf("active") !== -1) {
            TodoUI.render();
        }
        if (typeof renderHistory !== "undefined") {
            renderHistory();
        }
        
        alert("緊急復元が完了しました。\n表示を確認後、1分お待ち頂くと自動保存されます。");
    } catch(e) {
        alert("復元中にエラーが発生しました: " + e.message);
    }
}

// ---------- Excel出力機能 ----------
// ---------- Excel出力機能 (Vol.15.x拡張版) ----------
function exportToExcel() {
    try {
        var table = document.getElementById("tbl-patients");
        if(!table) return;
        
        var cloneTable = table.cloneNode(true);
        var tds = cloneTable.getElementsByTagName("td");
        
        var highlightColor = "#ffe8a1";
        
        for(var i=0; i<tds.length; i++) {
            var cell = tds[i];
            
            // Excelで文字が小さくなるのを防ぐため、インラインのfont-sizeを除去
            cell.style.fontSize = "";
            
            // インライン背景色の復元（ExcelはCSSクラスの背景色を読み込まないため直接ベタ書きする）
            if (hasClass(cell, "highlight-row") || (cell.parentNode && hasClass(cell.parentNode, "highlight-row"))) {
                cell.style.backgroundColor = highlightColor;
            } else if (hasClass(cell, "status-done")) {
                cell.style.backgroundColor = "#d4edda";
            } else if (hasClass(cell, "status-plan")) {
                cell.style.backgroundColor = "#fff3cd";
            } else if (hasClass(cell, "status-recorded")) { // 「記録済」の青色を追加
                cell.style.backgroundColor = "#cce5ff";
            }
            
            // 処方確認列 (chk-toggle) にインラインで設定された背景色 (chkBg) をExcel出力時はクリアする
            if (hasClass(cell, "chk-toggle")) {
                cell.style.backgroundColor = "";
                removeClass(cell, "hide-on-print");
            }
            
// ★修正: Textarea(編集用)は削除し、表示用の memo-display をそのまま活かす
            var tas = cell.getElementsByTagName("textarea");
            while(tas.length > 0) {
                tas[0].parentNode.removeChild(tas[0]);
            }
            
            // ハイライト行の背景色を表示用メモにも適用する
            var displays = cell.querySelectorAll('.memo-display');
            for(var d=0; d<displays.length; d++){
                if (displays[d].style.backgroundColor === "" && cell.style.backgroundColor !== "") {
                    displays[d].style.backgroundColor = cell.style.backgroundColor;
                }
                
                // 修正: Excel出力時に改行が消えてスペースになるのを防ぐため、明示的に <br> に変換する
                if (displays[d].innerHTML) {
                    displays[d].innerHTML = displays[d].innerHTML.replace(/\r?\n/g, '<br style="mso-data-placement:same-cell;" />');
                }

            }
        }
        
        // ボタン等の不要要素除去
        // ★修正: 個人メモのラッパー(.memo-wrap)が印刷除外クラスで消されないように除外指定を追加
        var hideElems = cloneTable.querySelectorAll('.hide-on-print:not(.chk-toggle):not(.memo-wrap), .sort-icon, .karte-btn, .tab-close-btn');
        for(var i = 0; i < hideElems.length; i++) {
            if (hideElems[i].parentNode) hideElems[i].parentNode.removeChild(hideElems[i]);
        }

        // テスト患者の行をExcel出力から除外する処理
        var rows = cloneTable.getElementsByTagName("tr");
        // 特定のテスト患者IDリスト（カンマ区切りで追加可能）
        var testIds = ["9999999", "8888888", "1234567"]; 
        // 下からループして安全に削除
        for (var r = rows.length - 1; r >= 1; r--) {
            var tr = rows[r];
            var cells = tr.getElementsByTagName("td");
            if (cells.length > 1) {
                var pid = (cells[0].innerText || cells[0].textContent || "").trim();
                var pname = (cells[1].innerText || cells[1].textContent || "").trim();
                var pidNum = parseInt(pid, 10);
                
                // 名前が「テスト」「てすと」「test」を含むか、IDがリスト内または9000000以上の場合は行ごと削除
                if (pname.indexOf("テスト") !== -1 || pname.indexOf("てすと") !== -1 || pname.toLowerCase().indexOf("test") !== -1 || testIds.indexOf(pid) !== -1 || (!isNaN(pidNum) && pidNum >= 9000000)) {
                    if (tr.parentNode) tr.parentNode.removeChild(tr);
                }
            }
        }
        
        var outputHTML = "<table border='1'>" + cloneTable.innerHTML + "</table>";
        
        // ★修正: JUST Calcでも表として認識させるためにHTML要素としてコピーする
        var div = document.createElement("div");
        div.style.position = "absolute";
        div.style.left = "-9999px";
        div.innerHTML = outputHTML;
        document.body.appendChild(div);
        
        // ★修正: 新旧環境でエラーが出ない安全なコピー処理
        if (document.body.createTextRange) {
            var range = document.body.createTextRange();
            range.moveToElementText(div);
            range.select();
            document.execCommand("Copy");
            try { document.selection.empty(); } catch(e) {} // エラーが出ても無視する
        } else if (window.getSelection) {
            var sel = window.getSelection();
            var range = document.createRange();
            range.selectNodeContents(div);
            sel.removeAllRanges();
            sel.addRange(range);
            document.execCommand("Copy");
            sel.removeAllRanges();
        }
        
        document.body.removeChild(div);
        
        // ★修正2: JUST Calc を優先して探し、なければExcelを探す
        var excelApp = null;
        try {
            excelApp = new ActiveXObject("JustCalc.Application");
        } catch(e1) {
            try {
                excelApp = new ActiveXObject("Excel.Application");
            } catch(e2) {
                alert("JUST Calc または Excel の起動に失敗しました。");
                return;
            }
        }
        
        var workbook = excelApp.Workbooks.Add();
        var sheet = workbook.ActiveSheet;
        
        // ★修正3: A1セルを明示的に選択してから貼り付ける
        sheet.Range("A1").Select();
        sheet.Paste();
        // ▲▲▲ ここまで ▲▲▲
        
        sheet.Cells.WrapText = true;
        sheet.Cells.VerticalAlignment = -4160; // xlTop
        
        var lastCol = sheet.UsedRange.Columns.Count;
        for (var c = 1; c <= lastCol; c++) {
            var head = sheet.Cells(1, c).Value;
            if (head === "患者ID" || head === "ID") sheet.Columns(c).ColumnWidth = 9.4;
            else if (head === "氏名") {
                sheet.Columns(c).ColumnWidth = 17.5;
                // データ行の氏名のみフォントを大きくする
                var lastRow = sheet.UsedRange.Rows.Count;
                sheet.Range(sheet.Cells(2, c), sheet.Cells(lastRow, c)).Font.Size = 14; 
            }
            else if (head && head.indexOf("診療科") !== -1) sheet.Columns(c).ColumnWidth = 13.0; // 2段結合列用
            else if (head === "主病名") sheet.Columns(c).ColumnWidth = 17.5;
            else if (head === "病室") sheet.Columns(c).ColumnWidth = 6.0;
            else if (head === "在院") sheet.Columns(c).ColumnWidth = 5;
            else if (head === "介入") sheet.Columns(c).ColumnWidth = 8.0;
            else if (head === "処方") sheet.Columns(c).ColumnWidth = 5.0;
            else if (head === "強調") sheet.Columns(c).ColumnWidth = 5.0;
            else if (head === "情報共有・メモ") sheet.Columns(c).ColumnWidth = 60;
        }
        
        var lastRow = sheet.UsedRange.Rows.Count;
        for (var r = 2; r <= lastRow; r++) {
            // 条件なしで強制的に行幅を50に固定する
            sheet.Rows(r).RowHeight = 50;
        }
        
        try {
            sheet.PageSetup.Zoom = false; 
            sheet.PageSetup.FitToPagesWide = 1; 
            sheet.PageSetup.Orientation = 1; // xlPortrait
        } catch(e) {}
        
        sheet.Range("A1").Select();
        excelApp.Visible = true;
    } catch(err) { alert("Excel出力エラー: " + err.message); }
}



<!-- 薬歴ツール JavaScript 統合ブロック         -->


// ==========================================
// 薬歴作成ツール (統合版) - JavaScript
// ==========================================================
// --- IE 互換用 DOM 操作ヘルパー ---
function hasClass(el, className) {
    if (!el || !el.className) return false;
    return (" " + el.className + " ").indexOf(" " + className + " ") !== -1;
}
function addClass(el, className) {
    if (!el) return;
    if (!hasClass(el, className)) {
        el.className += (el.className ? " " : "") + className;
    }
}
function removeClass(el, className) {
    if (!el || !el.className) return;
    var current = el.className;
    var updated = (" " + current + " ").replace(" " + className + " ", " ");
    el.className = updated.replace(/^\s+|\s+$/g, "");
}
// --------------------------------

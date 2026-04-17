/**
 * Board2 - Patient UI Module
 * 患者一覧の表示、ソート、介入状況の切り替え、メモの更新などを担当します。
 * [IDベース]: イベントハンドラはすべて患者IDを引数に取ります。
 */

var PatientUI = {
    sortKey: "",
    sortOrder: 1,
    STATUS_CLASSES: ["status-empty", "status-plan", "status-done", "status-recorded"],
    STATUS_TEXTS: ["(未設定)", "介入予定", "指導済", "記録済"],
    HIGHLIGHT_WORDS: ["退院", "転院", "ENT", "ent"],

    // -------------------------------------------------------
    // データ取得ヘルパー
    // -------------------------------------------------------

    /** 現在の病棟患者リストを返す */
    getCurrentList: function() {
        var wk = "patientsWard" + currentWard;
        return DataManager.appData[wk] || [];
    },

    /**
     * IDで患者データを検索して返す（IDベースの核心）
     * @param {string} patientId 患者ID
     * @returns {object|null} 患者オブジェクト、または null
     */
    findPatientById: function(patientId) {
        var list = this.getCurrentList();
        for (var i = 0; i < list.length; i++) {
            if (String(list[i].id) === String(patientId)) return list[i];
        }
        return null;
    },

    // -------------------------------------------------------
    // レンダリング
    // -------------------------------------------------------

    render: function() {
        var tbody = document.getElementById("tbody-patients");
        if (!tbody) return;

        // スクロール位置の保持 (Req.2)
        var scrollX = window.pageXOffset || (document.documentElement ? document.documentElement.scrollLeft : 0);
        var scrollY = window.pageYOffset || (document.documentElement ? document.documentElement.scrollTop : 0);

        var list = this.getCurrentList();
        if (!list || list.length === 0) {
            tbody.innerHTML = '<tr><td colspan="12" align="center">該当病棟の患者データがありません。</td></tr>';
            return;
        }

        // ソート適用
        if (this.sortKey) {
            var key = this.sortKey;
            var order = this.sortOrder;
            list.sort(function(a, b) {
                var valA = a[key] || "";
                var valB = b[key] || "";
                if (!isNaN(valA) && !isNaN(valB) && valA !== "" && valB !== "") {
                    return (Number(valA) - Number(valB)) * order;
                }
                return valA.toString().localeCompare(valB.toString(), 'ja') * order;
            });
        }

        // ガタつき抑止: 描画中は非表示
        tbody.style.visibility = "hidden";

        var html = "";
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (!p || typeof p !== 'object') continue;
            if (!p.id) continue;
            html += this.generateRowHtml(p);
        }

        tbody.innerHTML = html;
        this.adjustTextareaHeights(tbody);

        tbody.style.visibility = "visible";

        // スクロール位置の復元
        setTimeout(function() {
            window.scrollTo(scrollX, scrollY);
        }, 10);
    },

    /**
     * 1行分のHTML生成 (病室追加・科/医師の2段表示対応)
     */
    generateRowHtml: function(p) {
        var pid = escapeHtml(p.id);

        // ハイライト判定
        var isHighlight = false;
        if (p.memo) {
            var lowerMemo = p.memo.toLowerCase();
            for (var w = 0; w < this.HIGHLIGHT_WORDS.length; w++) {
                if (lowerMemo.indexOf(this.HIGHLIGHT_WORDS[w].toLowerCase()) !== -1) {
                    isHighlight = true;
                    break;
                }
            }
        }
        var hlClass = isHighlight ? ' highlight-row' : '';

        // マーク判定 (0=無, 1=?, 2=!)
        var aLevel = p.alertLevel || 0;
        var aClass = aLevel === 1 ? "alert-question" : (aLevel === 2 ? "alert-exclamation" : "alert-none");
        var aText  = aLevel === 1 ? "？" : (aLevel === 2 ? "！" : "");

        // 介入状況
        var statIdx   = p.status || 0;
        var statClass = this.STATUS_CLASSES[statIdx];
        var rawStatText = this.STATUS_TEXTS[statIdx];
        var statText = rawStatText;
        if (rawStatText === "(未設定)")  statText = "未";
        else if (rawStatText === "介入予定") statText = "予定";
        else if (rawStatText === "指導済")  statText = "指導";
        else if (rawStatText === "記録済")  statText = "記録";

        var authorHtml   = p.statusAuthor ? '<br><span class="status-author">' + escapeHtml(p.statusAuthor) + '</span>' : '';
        var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';

        // 処方確認
        var chkVal = p.chkPrescription || 0;
        if (typeof chkVal === "boolean") chkVal = chkVal ? 2 : 0;
        var chkClass = chkVal === 1 ? "status-chk-half" : (chkVal === 2 ? "status-chk-on" : "");
        var chkText  = chkVal === 1 ? "&#9744;" : (chkVal === 2 ? "&#10004;" : "");
        var chkBg    = chkVal === 1 ? "background-color:#ffe8a1;" : "";

        // メモ著者
        var memoAuthorHtml = '';
        if (p.memoAuthors && p.memoAuthors.length > 0) {
            memoAuthorHtml = escapeHtml(p.memoAuthors.join(" / "));
        } else if (p.memoAuthor) {
            memoAuthorHtml = escapeHtml(p.memoAuthor);
        }

        // 個人メモ
        var pMemos = (p && typeof p === 'object' && p.personalMemos) ? p.personalMemos : {};
        var myMemo = (pMemos && currentSystemId) ? (pMemos[currentSystemId] || "") : "";

        // 採血日
        var bDate  = p.bloodDate || "-";
        var bdTitle = p.bloodDetail
            ? 'title="採血詳細: ' + escapeHtml(p.bloodDetail) + ' (クリックで手動修正)"'
            : 'title="クリックで採血日を修正"';

        // 編集モード制御
        var editOnlyStatus = isEditMode
            ? 'onclick="PatientUI.toggleStatus(\'' + pid + '\')"'
            : 'onclick="alert(\'編集するには上部の「閲覧モード」をクリックしてIDを入力してください。\')"';
        var editOnlyChk = isEditMode
            ? 'onclick="PatientUI.togglePrescriptionCheck(\'' + pid + '\')"'
            : 'onclick="alert(\'編集するには上部の「閲覧モード」をクリックしてIDを入力してください。\')"';
        var editOnlyAlert = isEditMode
            ? 'onclick="PatientUI.toggleAlertLevel(\'' + pid + '\')"'
            : 'onclick="alert(\'編集するには上部の「閲覧モード」をクリックしてIDを入力してください。\')"';
        var editOnlyBlood = isEditMode
            ? 'onclick="PatientUI.changeBloodDate(\'' + pid + '\')"'
            : 'onclick="alert(\'編集するには上部の「閲覧モード」をクリックしてIDを入力してください。\')"';
        var memoDisabled    = isEditMode ? '' : 'disabled="disabled"';
        var memoChangeShared   = isEditMode
            ? 'onchange="PatientUI.finalizeMemo(\'' + pid + '\', this)" onkeyup="PatientUI.updateMemoHeight(this)"'
            : '';
        var memoChangePersonal = isEditMode
            ? 'onchange="PatientUI.finalizePersonalMemo(\'' + pid + '\', this)" onkeyup="PatientUI.updateMemoHeight(this)"'
            : '';

        // --- HTML 組み立て開始 ---
        var h = '<tr id="tr-patient-' + pid + '">';
        
        // 1. 患者ID
        h += '<td>' + pid + '</td>';
        
        // 2. 氏名
        h += '<td>' + escapeHtml(p.name) + '</td>';
        
        // 3. 診療科 / 主治医 (1列内に2段表示)
        h += '<td class="hide-on-print" style="font-size:11px; line-height:1.3; padding:2px 4px;">';
        h += '<div style="color:#0d6efd; font-weight:bold; border-bottom:1px dotted #eee; padding-bottom:1px; margin-bottom:1px;">' + escapeHtml(p.dept || '') + '</div>';
        h += '<div style="color:#555;">' + escapeHtml(p.doctor || '') + '</div>';
        h += '</td>';
        
        // 4. 主病名
        h += '<td>' + escapeHtml(p.disease || '') + '</td>';

        // 5. 病室 (在院列の左に移動)
        h += '<td style="text-align:center; font-size:12px; font-weight:bold; color:#444;">' + escapeHtml(p.room || '') + '</td>';
        
        // 6. 在院
        h += '<td style="text-align:center; font-size:12px;">' + escapeHtml(p.daysInHosp || '-') + '</td>';
        
        // 7. 採血日
        h += '<td ' + editOnlyBlood + ' style="text-align:center; font-size:11px; cursor:pointer;" ' + bdTitle + '>' + escapeHtml(bDate) + '</td>';
        
        // 8. 介入
        h += '<td class="status-cell ' + statClass + '" style="' + statUnderline + '" ' + editOnlyStatus + ' title="クリックで状態変更">' + statText + authorHtml + '</td>';
        
        // 9. 処方
        h += '<td style="text-align:center; font-size:20px; font-weight:bold; cursor:pointer; user-select:none; color:#fd7e14; ' + chkBg + '" class="chk-toggle ' + chkClass + '" ' + editOnlyChk + ' title="処方確認（クリックで☐・✔切替）">' + chkText + '</td>';
        
        // 10. 強調
        h += '<td style="color:#e74c3c; font-size:14px; font-weight:bold; cursor:pointer; text-align:center; user-select:none;" class="alert-toggle ' + aClass + '" ' + editOnlyAlert + '>' + escapeHtml(aText) + '</td>';
        
        // 11. 情報共有・メモ
        h += '<td class="' + hlClass + '" style="padding:4px;">';
        h += '<textarea rows="1" ' + memoDisabled + ' ' + memoChangeShared + ' placeholder="【共有】申し送りやメモ..." style="min-height:24px; line-height:1.2; padding:2px; font-size:12px; margin-bottom:2px; overflow:hidden;">' + escapeHtml(p.memo || '') + '</textarea>';
        h += '<textarea rows="1" ' + memoDisabled + ' ' + memoChangePersonal + ' class="hide-on-print" placeholder="【個人(' + escapeHtml(currentUserName) + ')】自分用メモ..." style="min-height:24px; line-height:1.2; padding:2px; font-size:12px; background-color:#e8f4f8; border:1px dashed #b3d7ff; overflow:hidden;">' + escapeHtml(myMemo) + '</textarea>';
        h += '</td>';
        
        // 12. 更新履歴
        h += '<td class="hide-on-print ' + hlClass + '" style="font-size:10px; color:#666;">' + memoAuthorHtml + '</td>';
        
        h += '</tr>';
        return h;
    },

    // -------------------------------------------------------
    // イベントハンドラ（すべてIDベース）
    // -------------------------------------------------------

    /**
     * 介入状況を切り替える（DOM直接更新 → 全体再描画なし）
     * @param {string} patientId 患者ID
     */
    toggleStatus: function(patientId) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        p.status = ((p.status || 0) + 1) % 4;
        p.statusAuthor = p.status === 0 ? "" : currentUserName;

        // DOM直接更新
        var tr = document.getElementById("tr-patient-" + p.id);
        if (tr) {
            var td = tr.querySelector(".status-cell");
            if (td) {
                var statIdx = p.status;
                var statClass = this.STATUS_CLASSES[statIdx];
                var rawStatText = this.STATUS_TEXTS[statIdx];
                var statText = rawStatText;
                if (rawStatText === "(未設定)")  statText = "未";
                else if (rawStatText === "介入予定") statText = "予定";
                else if (rawStatText === "指導済")  statText = "指導";
                else if (rawStatText === "記録済")  statText = "記録";

                var authorHtml = p.statusAuthor
                    ? '<br><span class="status-author">' + escapeHtml(p.statusAuthor) + '</span>'
                    : '';
                var statUnderline = (statIdx === 1 || statIdx === 2) ? 'text-decoration:underline;' : '';

                td.className = "status-cell " + statClass;
                td.style.cssText = statUnderline;
                td.innerHTML = statText + authorHtml;
            }
        }
        
        // 伝票発行 (REQ.3)
        DataManager.appendTransaction("TOGGLE_STATUS", {
            patientId: patientId,
            wardCode: currentWard,
            value: p.status
        });

        if (typeof autoSave === "function") autoSave();
    },

    /**
     * 処方確認チェックを切り替える（DOM直接更新）
     * @param {string} patientId 患者ID
     */
    togglePrescriptionCheck: function(patientId) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        var currentVal = p.chkPrescription || 0;
        if (typeof currentVal === "boolean") currentVal = currentVal ? 2 : 0;
        p.chkPrescription = (currentVal + 1) % 3;

        // DOM直接更新
        var tr = document.getElementById("tr-patient-" + p.id);
        if (tr) {
            var td = tr.querySelector(".chk-toggle");
            if (td) {
                var val = p.chkPrescription;
                if (val === 1) {
                    td.className = "chk-toggle status-chk-half";
                    td.innerHTML = "&#9744;";
                    td.style.backgroundColor = "#ffe8a1";
                } else if (val === 2) {
                    td.className = "chk-toggle status-chk-on";
                    td.innerHTML = "&#10004;";
                    td.style.backgroundColor = "";
                } else {
                    td.className = "chk-toggle";
                    td.innerHTML = "";
                    td.style.backgroundColor = "";
                }
            }
        }

        // 伝票発行 (REQ.3)
        DataManager.appendTransaction("TOGGLE_PRESCRIPTION", {
            patientId: patientId,
            wardCode: currentWard,
            value: p.chkPrescription
        });

        if (typeof autoSave === "function") autoSave();
    },

    /**
     * 強調マーク(？/！)を切り替える（DOM直接更新）
     * @param {string} patientId 患者ID
     */
    toggleAlertLevel: function(patientId) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        p.alertLevel = ((p.alertLevel || 0) + 1) % 3;
        var aLevel = p.alertLevel;
        var aText  = aLevel === 1 ? "？" : (aLevel === 2 ? "！" : "");
        var aClass = aLevel === 1 ? "alert-question" : (aLevel === 2 ? "alert-exclamation" : "alert-none");

        // DOM直接更新
        var tr = document.getElementById("tr-patient-" + p.id);
        if (tr) {
            var td = tr.querySelector(".alert-toggle");
            if (td) {
                td.className = "alert-toggle " + aClass;
                td.innerText = aText;
            }
        }

        // 伝票発行 (REQ.3)
        DataManager.appendTransaction("TOGGLE_ALERT", {
            patientId: patientId,
            wardCode: currentWard,
            value: p.alertLevel
        });

        if (typeof autoSave === "function") autoSave();
    },

    /**
     * 共有メモを確定して保存する
     * memoAuthors 複数履歴対応・遅延再描画でクリックイベント消失を防ぐ
     * @param {string} patientId 患者ID
     * @param {HTMLElement} element textarea要素
     */
    finalizeMemo: function(patientId, element) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        var val = element.value;
        p.memo = val;

        if (val.trim() !== "") {
            var now = new Date();
            var mm = ("0" + (now.getMonth() + 1)).slice(-2);
            var dd = ("0" + now.getDate()).slice(-2);
            var hh = ("0" + now.getHours()).slice(-2);
            var min = ("0" + now.getMinutes()).slice(-2);
            var newAuthor = currentUserName + " (" + mm + "/" + dd + " " + hh + ":" + min + ")";

            if (!p.memoAuthors) p.memoAuthors = [];
            // 同一ユーザーの直近記録は日時のみ更新
            if (p.memoAuthors.length > 0 && p.memoAuthors[0].indexOf(currentUserName) === 0) {
                p.memoAuthors[0] = newAuthor;
            } else {
                p.memoAuthors.unshift(newAuthor);
            }
            // 最大3件保持
            if (p.memoAuthors.length > 3) p.memoAuthors = p.memoAuthors.slice(0, 3);
            // 旧プロパティとの互換
            p.memoAuthor = newAuthor;
        } else {
            p.memoAuthors = [];
            p.memoAuthor = "";
        }

        // 遅延再描画: onchange直後のDOMが消える前にクリックイベントを先に消化させる
        var self = this;
        setTimeout(function() {
            // 伝票発行 (REQ.3)
            DataManager.appendTransaction("UPDATE_PATIENT_MEMO", {
                patientId: patientId,
                wardCode: currentWard,
                value: val
            });

            self.render();
            if (typeof autoSave === "function") autoSave();
        }, 150);
    },

    /**
     * 個人メモを確定して保存する
     * @param {string} patientId 患者ID
     * @param {HTMLElement} element textarea要素
     */
    finalizePersonalMemo: function(patientId, element) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        if (!p.personalMemos) p.personalMemos = {};
        p.personalMemos[currentSystemId] = element.value;

        // 伝票発行 (自分自身の他端末同期用)
        DataManager.appendTransaction("UPDATE_PERSONAL_MEMO", {
            patientId: patientId,
            wardCode: currentWard,
            userId: currentSystemId,
            value: element.value
        });

        if (typeof autoSave === "function") autoSave();
    },

    /**
     * 採血日を手動変更する
     * @param {string} patientId 患者ID
     */
    changeBloodDate: function(patientId) {
        if (!isEditMode) return;
        var p = this.findPatientById(patientId);
        if (!p) return;

        var newVal = prompt("採血日を入力してください (例: 03/25)", p.bloodDate || "");
        if (newVal !== null) {
            p.bloodDate = newVal;
            this.render();
            DataManager.saveCategory("patients", DataManager.appData);
        }
    },

    // -------------------------------------------------------
    // テキストエリア高さ自動調整
    // -------------------------------------------------------

    updateMemoHeight: function(element) {
        element.style.height = 'auto';
        element.style.height = element.scrollHeight + 'px';
    },

    adjustTextareaHeights: function(container) {
        var tas = container.getElementsByTagName('textarea');
        for (var i = 0; i < tas.length; i++) {
            tas[i].style.height = 'auto';
            var sh = tas[i].scrollHeight;
            if (sh > 0) tas[i].style.height = sh + 'px';
        }
    }
};

// -------------------------------------------------------
// 一括操作（core.js や board_v2.hta から呼び出し可）
// -------------------------------------------------------

function resetAllStatus() {
    if (!isEditMode) return;
    var list = PatientUI.getCurrentList();
    if (list.length === 0) return;

    if (confirm("【警告】\n表示中の病棟の「介入状況」をすべてリセット（初期化）します。\n※マーク(！/？)および共有メモは保持されます。\n\n本当によろしいですか？")) {
        if (confirm("最終確認です。本当に一括リセットを実行してよろしいですか？")) {
            for (var i = 0; i < list.length; i++) {
                list[i].status = 0;
                list[i].statusAuthor = "";
            }
            PatientUI.render();
            DataManager.saveCategory("patients", DataManager.appData);
            alert("介入状況のリセットが完了しました。");
        }
    }
}

function resetAllPrescriptionChecks() {
    if (!isEditMode) return;
    var list = PatientUI.getCurrentList();
    if (list.length === 0) return;

    if (confirm("表示中の病棟の「処方」確認状態（✔・☐）をすべて解除してよろしいですか？")) {
        for (var i = 0; i < list.length; i++) {
            list[i].chkPrescription = 0;
        }
        PatientUI.render();
        DataManager.saveCategory("patients", DataManager.appData);
        alert("処方確認のチェックをクリアしました。");
    }
}

function sortPatients(key) {
    if (PatientUI.sortKey === key) {
        PatientUI.sortOrder = PatientUI.sortOrder * -1;
    } else {
        PatientUI.sortKey = key;
        PatientUI.sortOrder = 1;
    }
    PatientUI.render();
}

function filterPatientTable() {
    var input = document.getElementById("ipt-patient-search");
    var filter = input ? input.value.toLowerCase() : "";
    var tbody = document.getElementById("tbody-patients");
    if (!tbody) return;
    var rows = tbody.getElementsByTagName("tr");
    for (var i = 0; i < rows.length; i++) {
        var text = rows[i].innerText || rows[i].textContent || "";
        rows[i].style.display = (filter === "" || text.toLowerCase().indexOf(filter) !== -1) ? "" : "none";
    }
}

/**
 * Excel出力機能
 */
function exportToExcel() {
    try {
        var table = document.getElementById("tbl-patients");
        if (!table) return;

        var cloneTable = table.cloneNode(true);
        var tds = cloneTable.getElementsByTagName("td");

        for (var i = 0; i < tds.length; i++) {
            var cell = tds[i];
            var tas = cell.getElementsByTagName("textarea");
            if (tas.length > 0) {
                for (var j = 0; j < tas.length; j++) {
                    var val = tas[j].value || "";
                    if (val === tas[j].getAttribute("placeholder")) val = "";
                    var replacementDiv = document.createElement("div");
                    if (val !== "") {
                        var text = val.replace(/\n/g, "<br>");
                        if (j >= 1) replacementDiv.style.backgroundColor = "#e8f4f8";
                        replacementDiv.innerHTML = text;
                    }
                    tas[j].parentNode.replaceChild(replacementDiv, tas[j]);
                    j--;
                }
            }
        }

        var hideElems = cloneTable.querySelectorAll('.hide-on-print, .sort-icon, .karte-btn');
        for (var k = 0; k < hideElems.length; k++) {
            if (hideElems[k].parentNode) hideElems[k].parentNode.removeChild(hideElems[k]);
        }

        var outputHTML = "<table border='1'>" + cloneTable.innerHTML + "</table>";
        window.clipboardData.setData("Text", outputHTML);

        var excelApp = new ActiveXObject("Excel.Application");
        if (!excelApp) { alert("Excelの起動に失敗しました。"); return; }

        var workbook = excelApp.Workbooks.Add();
        var sheet = workbook.ActiveSheet;
        sheet.Paste();

        sheet.Cells.WrapText = true;
        sheet.Cells.VerticalAlignment = -4160; // xlTop

        var lastCol = sheet.UsedRange.Columns.Count;
        for (var c = 1; c <= lastCol; c++) {
            var head = sheet.Cells(1, c).Value;
            if (head === "患者ID" || head === "ID") sheet.Columns(c).ColumnWidth = 9;
            if (head === "氏名") sheet.Columns(c).ColumnWidth = 14;
            if (head === "情報共有・メモ") sheet.Columns(c).ColumnWidth = 60;
        }

        excelApp.Visible = true;
    } catch (e) {
        alert("Excel出力中にエラーが発生しました: " + e.description);
    }
}

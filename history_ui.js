/**
 * Board2 - History UI Module
 * 入退室履歴の表示、退室詳細の展開、患者一覧へのジャンプ機能を担当します。
 */

var HistoryUI = {
    render: function() {
        var tbody = document.getElementById("tbody-history");
        if (!tbody) return;

        var history = DataManager.appData.history || [];
        if (history.length === 0) {
            tbody.innerHTML = '<tr><td colspan="8" align="center">まだ履歴はありません。</td></tr>';
            return;
        }

        var html = "";
        for (var i = 0; i < history.length; i++) {
            var h = history[i];
            var pId = h.id || "";
            var pName = h.patient || "";
            
            // IDが空で名前にIDが含まれている場合の補正
            if (!pId && pName) {
                var match = pName.match(/^(.*?)\s*\(\s*([0-9a-zA-Z\-]+)\s*\)$/);
                if (match) { pName = match[1]; pId = match[2]; }
            }

            var isArrival = h.type.indexOf("退室") === -1 && h.type.indexOf("退避") === -1;
            var typeStyle = isArrival ? "color: #155724; background-color: #d4edda; font-weight:bold;" : "color: #721c24; background-color: #f8d7da;";
            
            var clickAction = '';
            var titleText = '';
            var linkStyle = 'color: #3498db; text-decoration: underline; cursor: pointer;';
            
            if (isArrival) {
                clickAction = 'onclick="jumpToPatient(\'' + escapeHtml(pId) + '\', \'' + escapeHtml(pName) + '\')"';
                titleText = 'クリックして患者一覧の現在の行へジャンプ';
            } else {
                clickAction = 'onclick="HistoryUI.toggleDetail(\'' + escapeHtml(pId) + '\', ' + i + ')"';
                titleText = 'クリックして退院時のメモやステータスを表示';
                linkStyle = 'color: #e74c3c; text-decoration: underline; cursor: pointer; font-weight:bold;';
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
            // 詳細展開用のダミー行
            html += '<tr id="tr-history-detail-' + i + '" style="display:none; background:#fffaf0;"><td colspan="8" id="td-history-detail-' + i + '" style="padding:10px; border:1px solid #ffd54f;"></td></tr>';
        }
        tbody.innerHTML = html;
    },

    toggleDetail: function(pId, rowIndex) {
        var detailRow = document.getElementById("tr-history-detail-" + rowIndex);
        var detailCell = document.getElementById("td-history-detail-" + rowIndex);
        if (!detailRow || !detailCell) return;

        if (detailRow.style.display !== "none") {
            detailRow.style.display = "none";
            return;
        }

        var archive = DataManager.appData.dischargedArchive || {};
        var arc = archive[pId] || null;
        var html = '<div style="font-size:12px;">';
        
        if (arc) {
            var statText = PatientUI.STATUS_TEXTS[arc.status || 0];
            var statClass = PatientUI.STATUS_CLASSES[arc.status || 0];
            var archivedDate = arc.archivedAt ? new Date(arc.archivedAt).toLocaleString() : "不明";
            
            html += '<div style="margin-bottom:8px; display:flex; gap:15px; align-items:center;">';
            html += '<strong>【退院時の状態】</strong> <span class="status-cell ' + statClass + '" style="padding:2px 8px; border-radius:3px;">' + statText + '</span>';
            html += '<span style="color:#666;">（記録者: ' + escapeHtml(arc.statusAuthor || "不明") + ' / 退院記録日時: ' + archivedDate + '）</span>';
            html += '</div>';
            html += '<strong>【最終共有メモ】</strong><br>';
            html += '<div style="background:#fff; border:1px solid #ddd; padding:8px; margin-top:4px; white-space:pre-wrap; min-height:30px;">' + escapeHtml(arc.memo || "(メモなし)") + '</div>';
            
            if (arc.memoAuthors && arc.memoAuthors.length > 0) {
                html += '<div style="font-size:10px; color:#888; margin-top:3px;">メモ更新者: ' + escapeHtml(arc.memoAuthors.join(" / ")) + '</div>';
            }
        } else {
            html += '<div style="color:#c62828;">⚠ この患者の退院時詳細データが見つかりませんでした。 (一定期間経過後に自動削除されたか、古いバージョンのデータです)</div>';
        }
        html += '</div>';
        
        detailCell.innerHTML = html;
        detailRow.style.display = "table-row";
    }
};

/**
 * 患者一覧へのジャンプ機能 (グローバル)
 */
function jumpToPatient(pid, pname) {
    if(!pid && !pname) return;
    
    try {
        switchTab('tab-patients');
        
        // タブ切り替えによるDOMの再表示が完了してからスクロールさせる
        setTimeout(function() {
            try {
                var tr = null;
                // 1. IDで検索
                if (pid) {
                    var trId = "tr-patient-" + String(pid).trim();
                    tr = document.getElementById(trId);
                }
                // 2. 表示されている行から氏名で検索
                if (!tr && pname) {
                    var tbody = document.getElementById("tbody-patients");
                    var rows = tbody.getElementsByTagName("tr");
                    for (var i = 0; i < rows.length; i++) {
                        var nameCell = rows[i].getElementsByTagName("td")[1];
                        if (nameCell && nameCell.innerText.indexOf(pname) !== -1) {
                            tr = rows[i];
                            break;
                        }
                    }
                }

                if(tr) {
                    tr.scrollIntoView(true);
                    // 一瞬ハイライト
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

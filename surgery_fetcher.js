// =========================================================
// 5A病棟専用：手術情報スクレイピングモジュール (完全版)
// js/surgery_fetcher.js
// =========================================================

var SurgeryFetcher = {
    
    // 全件取得のメインループ
    updateAllSurgeries: function() {
        if (!isEditMode) { alert("編集モード時のみ実行可能です。"); return; }
        if (currentWard !== "51") { alert("この機能は5A病棟専用です。"); return; }
        
        var list = getCurrentPatientsList();
        if (list.length === 0) { alert("更新対象の患者がいません。"); return; }
        
        if (!confirm("表示中の全患者(" + list.length + "名)の手術記録を検索・取得しますか？\n(直列処理のため画面は固まりません)")) return;

        var btn = document.getElementById("btn-fetch-surgery");
        var originalText = btn ? btn.innerText : "✂️ 手術情報取得";
        if (btn) { btn.style.pointerEvents = "none"; btn.innerText = "準備中..."; }

        window.isSurgeryFetching = true;

        var idsToFetch = [];
        for (var i = 0; i < list.length; i++) {
            idsToFetch.push(list[i].id);
            var tr = document.getElementById("tr-patient-" + list[i].id);
            if (tr) {
                // 主病名の下にある術式テキストを一時的に「待機中」にする
                var opEl = tr.querySelector(".surgery-proc-text");
                if (opEl) { opEl.innerText = "待機中..."; opEl.style.color = "#999"; }
            }
        }

        var totalCount = idsToFetch.length;
        var index = 0;

        function processNext() {
            if (index >= totalCount) {
                window.isSurgeryFetching = false;
                if (btn) { btn.style.pointerEvents = "auto"; btn.innerText = originalText; }
                renderPatients();
                saveData(false); // 即時保存
                alert("全件の手術情報の取得が完了しました。");
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
                var opEl = tr.querySelector(".surgery-proc-text");
                if (opEl) { opEl.innerText = "取得中..."; opEl.style.color = "#0d6efd"; }
            }

            SurgeryFetcher.fetchSingle(patient, function() {
                var trUpdate = document.getElementById("tr-patient-" + patient.id);
                if (trUpdate) { renderPatients(); }
                setTimeout(processNext, 150);
            });
        }
        processNext();
    },

    // 1件分のスクレイピング処理
    fetchSingle: function(p, callback) {
        if (!p || !p.id) { callback(); return; }
        
        var userId = currentSystemId || "16622";
        var today = new Date();
        var yyyy = today.getFullYear();
        var mm = ("0" + (today.getMonth() + 1)).slice(-2);
        var dd = ("0" + today.getDate()).slice(-2);
        var kijunDate = yyyy + "/" + mm + "/" + dd;

        var days = parseInt(p.daysInHosp, 10);
        var rangeDays = 20; 
        if (!isNaN(days) && days > 0) {
            rangeDays = days + 3; 
        }

        var url = "http://10.5.71.21:8082/karte/karte.php?kanja_id=" + p.id + 
                  "&user_id=" + userId + 
                  "&order_kind_code_str=0091,1091&kijun_date=" + kijunDate + 
                  "&range_date=" + rangeDays + "/7/1/1&disp_selectsection=0000021&disp_selectukind=1,2,3&document_code=700360003,730360001&multi_kind=1#top" +
                  "&_nocache=" + new Date().getTime();

        var iframeId = "surgery-fetch-iframe-" + p.id;
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
                p.surgeryDate = "-";
                p.surgeryProcedure = "タイムアウト";
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
                                allText += "\n" + currentDoc.body.innerText;
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

                    var extract = function(regex) {
                        var m = allText.match(regex);
                        return m ? m[1].replace(/[\r\n]+/g, ' ').trim() : "";
                    };

                    var disease = extract(/病名：([\s\S]*?)術式：/);
                    var procedure = extract(/術式：([\s\S]*?)体位：/);
                    var anesthesia = extract(/麻酔法：([\s\S]*?)(?=\n[^\s　]+：|\n【|$)/);

                    // ★修正: 「手術開始時刻：」または「実施日：」から直接日付を狙い撃ち
                    var surgDateStr = "";
                    var dateMatch = allText.match(/(?:手術開始時刻|実施日)[：\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                    
                    if (dateMatch) {
                        surgDateStr = dateMatch[1] + '/' + ('0'+dateMatch[2]).slice(-2) + '/' + ('0'+dateMatch[3]).slice(-2);
                    }

                    // ★修正: 手術情報が抽出できなかった場合は「術：なし」として扱う
                    if (!surgDateStr && !procedure) {
                        p.surgeryDate = "なし";
                        p.surgeryDisease = "";
                        p.surgeryProcedure = "";
                        p.surgeryAnesthesia = "";
                        p.surgeryHasEpi = false;
                    } else {
                        p.surgeryDate = surgDateStr || "不明";
                        p.surgeryDisease = disease;
                        p.surgeryProcedure = procedure || "情報なし";
                        p.surgeryAnesthesia = anesthesia;
                        
                        var hasEpi = (anesthesia.indexOf("硬膜外") !== -1 || anesthesia.indexOf("エピ") !== -1 || anesthesia.toUpperCase().indexOf("EPI") !== -1);
                        p.surgeryHasEpi = hasEpi;
                    }

                    // 伝票(Transaction)の発行
                    if (typeof DataManager !== "undefined") {
                        DataManager.appendTransaction("UPDATE_SURGERY_INFO", {
                            patientId: p.id,
                            wardCode: currentWard,
                            surgeryDate: p.surgeryDate,
                            surgeryDisease: p.surgeryDisease,
                            surgeryProcedure: p.surgeryProcedure,
                            surgeryAnesthesia: p.surgeryAnesthesia,
                            surgeryHasEpi: p.surgeryHasEpi
                        });
                    }

                } catch(e) {
                    p.surgeryDate = "-";
                    p.surgeryProcedure = "解析エラー";
                }
                
                clearTimeout(fallbackTimer);
                autoSave(); 
                cleanupAndCallback();
            }, 1500); 
        };
        
        try {
            iframe.src = url;
        } catch(e) {
            clearTimeout(fallbackTimer);
            cleanupAndCallback();
        }
    }
};

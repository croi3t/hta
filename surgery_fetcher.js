// =========================================================
// 5A病棟専用：手術情報スクレイピングモジュール (改訂版)
// js/surgery_fetcher.js
// =========================================================

var SurgeryFetcher = {
    updateAllSurgeries: function() {
        if (!isEditMode) { alert("編集モード時のみ実行可能です。"); return; }
        if (currentWard !== "51") { alert("この機能は5A病棟専用です。"); return; }
        
        var list = getCurrentPatientsList();
        if (list.length === 0) { alert("更新対象の患者がいません。"); return; }
        if (!confirm("表示中の全患者(" + list.length + "名)の手術記録を検索・取得しますか？\n(直列処理のため画面は固まりません)")) return;

        var btn = document.getElementById("btn-fetch-surgery");
        var originalText = btn ? btn.innerText : "✂️ 手術取得";
        if (btn) { btn.style.pointerEvents = "none"; btn.innerText = "準備中..."; }

        window.isSurgeryFetching = true;

        var idsToFetch = [];
        for (var i = 0; i < list.length; i++) {
            idsToFetch.push(list[i].id);
            var tr = document.getElementById("tr-patient-" + list[i].id);
            if (tr) {
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
                saveData(false); 
                alert("全件の手術情報の取得が完了しました。");
                return;
            }
            
            var targetId = idsToFetch[index];
            index++;
            var patient = findPatientById(targetId);
            
            if (btn) btn.innerText = "残: " + (totalCount - index + 1);
            if (!patient) { setTimeout(processNext, 50); return; }

            var tr = document.getElementById("tr-patient-" + patient.id);
            if (tr) {
                var opEl = tr.querySelector(".surgery-proc-text");
                if (opEl) { opEl.innerText = "取得中..."; opEl.style.color = "#0d6efd"; }
            }

            SurgeryFetcher.fetchSingle(patient, function() {
                var trUpdate = document.getElementById("tr-patient-" + patient.id);
                if (trUpdate) renderPatients();
                setTimeout(processNext, 150);
            });
        }
        processNext();
    },

    fetchSingle: function(p, callback) {
        if (!p || !p.id) { callback(); return; }
        
        var userId = currentSystemId || "16622";
        var today = new Date();
        var kijunDate = today.getFullYear() + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + ("0" + today.getDate()).slice(-2);

        var days = parseInt(p.daysInHosp, 10);
        var rangeDays = (!isNaN(days) && days > 0) ? (days + 3) : 20;

        var url = "http://10.5.171.42:8082/karte/karte.php?kanja_id=" + p.id + 
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

                    // 1. 各項目の抽出（「見出し」をキーにして、次の見出しまたは改行で止める）
                    var disease = extract(/病名：([\s\S]*?)術式：/);
                    
                    // ★修正: 術式は「術式：」の後ろから、「体位：」「麻酔法：」または「出血量：」が出現するまでとする
                    var procedure = extract(/術式：([\s\S]*?)(?=\n[^\s　]+：|\n【|体位：|麻酔法：|出血量：|$)/);
                    
                    // 2. 術式から不要な「加算」や「器材」を徹底排除
                    if (procedure) {
                        // 複数行になったものを一時的にスペースで繋ぐ
                        procedure = procedure.replace(/[\r\n]+/g, ' ');

                        // ★ピンポイント削除: 「加算」「器材」「器材キット」等の不要ワードを除去
                        var removeKeywords = [
                            /画像等手術支援加算.*?\(.*?\)/g,
                            /画像等手術支援加算/g,
                            /器材：.*$/g,
                            /器材キット：.*$/g
                        ];
                        for (var i = 0; i < removeKeywords.length; i++) {
                            procedure = procedure.replace(removeKeywords[i], '');
                        }
                        procedure = procedure.trim();
                    }

                    // 3. 麻酔法の抽出（「麻酔法：」から次の見出しまで）
                    var anesthesia = extract(/麻酔法：([\s\S]*?)(?=\n[^\s　]+：|\n【|体位：|出血量：|$)/);
                    
                    // 4. 体位などの余計な文字列が術式に残っていないか最終クリーンアップ
                    procedure = procedure.replace(/(体位：|麻酔法：|出血量：).*$/g, '').trim();

                    // 日付の取得（より厳格に）
                    var surgDateStr = "";
                    var dateMatch = allText.match(/(?:手術開始時刻|手術日|実施日)[：\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                    if (dateMatch) {
                        surgDateStr = dateMatch[1] + '/' + ('0'+dateMatch[2]).slice(-2) + '/' + ('0'+dateMatch[3]).slice(-2);
                    }

                    // ★追加: 在院日数から「今回の入院期間」を計算し、逸脱する過去の手術日を弾く
                    var isValidDate = true;
                    if (surgDateStr) {
                        var sDate = new Date(surgDateStr);
                        sDate.setHours(0,0,0,0);
                        var aDate = new Date(today.getTime());
                        if (!isNaN(days) && days > 0) {
                            aDate.setDate(today.getDate() - (days + 3)); // 余裕を3日持たせる
                        } else {
                            aDate.setDate(today.getDate() - 30);
                        }
                        aDate.setHours(0,0,0,0);
                        var tDate = new Date(today.getTime());
                        tDate.setDate(tDate.getDate() + 30); // 未来の予定も許可

                        if (sDate < aDate || sDate > tDate) {
                            isValidDate = false; 
                        }
                    }
                    if (!isValidDate) surgDateStr = ""; // 期間外なら空にする

                    // ★修正: 共有いただいた術式リストに基づく厳密なリクシアナ適応判定
                    var lixianaRegex = /(人工関節置換術|人工関節再置換術|人工骨頭挿入術|骨折観血的手術|観血的整復固定術|人工関節全置換|TKA|THA|BHA)/i;
                    var hipKneeRegex = /(股|膝|大腿)/i; // 股関節・膝関節・大腿骨に関連するか
                    
                    var isLixiana = false;
                    // 術式または病名に含まれ、かつ股・膝・大腿のキーワードがある場合
                    if ((procedure && lixianaRegex.test(procedure) && hipKneeRegex.test(procedure)) || 
                        (disease && lixianaRegex.test(disease) && hipKneeRegex.test(disease))) {
                        isLixiana = true;
                    }

                    // 手術情報が空、または期間外の場合は「なし」とする
                    if (!surgDateStr && !procedure) {
                        p.surgeryDate = "なし";
                        p.surgeryDisease = "";
                        p.surgeryProcedure = "";
                        p.surgeryAnesthesia = "";
                        p.surgeryHasEpi = false;
                        p.surgeryLixiana = false;
                    } else {
                        p.surgeryDate = surgDateStr || "不明";
                        p.surgeryDisease = disease;
                        p.surgeryProcedure = procedure || "情報なし";
                        p.surgeryAnesthesia = anesthesia;
                        p.surgeryHasEpi = (anesthesia.indexOf("硬膜外") !== -1 || anesthesia.indexOf("エピ") !== -1 || anesthesia.toUpperCase().indexOf("EPI") !== -1);
                        p.surgeryLixiana = isLixiana;
                    }

                    if (typeof DataManager !== "undefined") {
                        DataManager.appendTransaction("UPDATE_SURGERY_INFO", {
                            patientId: p.id, wardCode: currentWard, surgeryDate: p.surgeryDate,
                            surgeryDisease: p.surgeryDisease, surgeryProcedure: p.surgeryProcedure,
                            surgeryAnesthesia: p.surgeryAnesthesia, surgeryHasEpi: p.surgeryHasEpi,
                            surgeryLixiana: p.surgeryLixiana
                        });
                    }
                } catch(e) {
                    p.surgeryDate = "-";
                    p.surgeryProcedure = "解析エラー";
                }
                
                clearTimeout(fallbackTimer);
                if (typeof DataManager !== "undefined") { DataManager.saveAll(appData, true); } 
                cleanupAndCallback();
            }, 1500); 
        };
        try { iframe.src = url; } catch(e) { clearTimeout(fallbackTimer); cleanupAndCallback(); }
    }
};

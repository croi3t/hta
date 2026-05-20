// =========================================================
// 5A病棟専用：手術情報スクレイピングモジュール
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

            SurgeryFetcher.fetchSingle(patient, function() {
                renderPatients(); // 1件終わるごとに画面を更新して術後日数を表示
                setTimeout(processNext, 200);
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
        var kijunDate = yyyy + "/" + mm + "/" + dd; // 当日を基準日とする

        // ご指定いただいた抽出用URL
        var url = "http://10.5.71.21:8082/karte/karte.php?kanja_id=" + p.id + 
                  "&user_id=" + userId + 
                  "&order_kind_code_str=0091,1091&kijun_date=" + kijunDate + 
                  "&range_date=20/7/1/1&disp_selectsection=0000021&disp_selectukind=1,2,3&document_code=700360003,730360001&multi_kind=1#top" +
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
            if (!isDone) { cleanupAndCallback(); }
        }, 180000); // 3分タイムアウト

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
                                allText += "\n" + currentDoc.body.innerText; // 改行を保持して結合
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

                    // --- 正規表現による抽出ロジック ---
                    var extract = function(regex) {
                        var m = allText.match(regex);
                        // マッチしたら、改行をスペースに変換して余分な空白を消す
                        return m ? m[1].replace(/[\r\n]+/g, ' ').trim() : "";
                    };

                    // 病名： ～ 術式： の間
                    var disease = extract(/病名：([\s\S]*?)術式：/);
                    // 術式： ～ 体位： の間（複数行対応）
                    var procedure = extract(/術式：([\s\S]*?)体位：/);
                    // 麻酔法： ～ （次の行が「何かの見出し（○○：）」や【 】で始まるまで）
                    var anesthesia = extract(/麻酔法：([\s\S]*?)(?=\n[^\s　]+：|\n【|$)/);

                    // 手術日の抽出（YYYY/MM/DD または YYYY年M月D日）
                    var surgDateStr = "";
                    var dateMatch = allText.match(/(?:手術日|実施日)[：\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                    if (!dateMatch) {
                        // 見出しがなければ、文書内の最初に出てくるそれっぽい日付を拾う
                        dateMatch = allText.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                    }
                    if (dateMatch) {
                        surgDateStr = dateMatch[1] + '/' + ('0'+dateMatch[2]).slice(-2) + '/' + ('0'+dateMatch[3]).slice(-2);
                    }

                    // データが1つでも取れれば保存
                    if (surgDateStr || procedure) {
                        p.surgeryDate = surgDateStr;
                        p.surgeryDisease = disease;
                        p.surgeryProcedure = procedure;
                        p.surgeryAnesthesia = anesthesia;
                        
                        // 硬膜外麻酔（エピ）の有無を判定
                        var hasEpi = (anesthesia.indexOf("硬膜外") !== -1 || anesthesia.indexOf("エピ") !== -1 || anesthesia.toUpperCase().indexOf("EPI") !== -1);
                        p.surgeryHasEpi = hasEpi;

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
                    }

                } catch(e) {}
                
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

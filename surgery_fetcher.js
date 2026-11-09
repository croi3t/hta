// =========================================================
// 5A病棟専用：手術情報スクレイピングモジュール (改訂版)
// js/surgery_fetcher.js
// =========================================================

var SurgeryFetcher = {
    updateAllSurgeries: function() {
        if (!isEditMode) { alert("編集モード時のみ実行可能です。"); return; }
        
        var list = (typeof window.getDisplayedPatientsList === "function") ? window.getDisplayedPatientsList() : ((typeof getDisplayedPatientsList === "function") ? getDisplayedPatientsList() : (typeof window.getCurrentPatientsList === "function" ? window.getCurrentPatientsList() : getCurrentPatientsList()));
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
        
        var userId = (typeof currentSystemId !== "undefined" && currentSystemId) ? currentSystemId : "16622";
        var today = new Date();
        var kijunDate = today.getFullYear() + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + ("0" + today.getDate()).slice(-2);

        var days = parseInt(p.daysInHosp, 10);
        var rangeDays = (!isNaN(days) && days > 0) ? (days + 3) : 20;

        // ★カルテLinkと完全に一致させた正規の手術予約・記録URL（確実に術式・病名を取得）
        // isHeavy: trueなら従来の重い文書閲覧URL、falseなら処方(0011)と同等の超軽量オーダ照会URL
        function buildUrl(isHeavy) {
            if (isHeavy) {
                // 重い文書コード付きフォールバックURL（確実に術式・病名を取得）
                return "http://10.5.171.42:8082/karte/karte.php?kanja_id=" + encodeURIComponent(p.id) + 
                       "&user_id=" + encodeURIComponent(userId) + 
                       "&order_kind_code_str=0091,1091" + 
                       "&kijun_date=" + kijunDate + 
                       "&range_date=" + rangeDays + "/7/1/1" + 
                       "&disp_selectsection=0000021&disp_selectukind=1,2,3" + 
                       "&document_code=700360003" + 
                       "&multi_kind=1" + 
                       "&_nocache=" + new Date().getTime() + "#top";
            }
            
            // ★処方(0011)・注射(0031)・再診(0081)と完全に同一の超軽量オーダ照会形式（重い外部JSがなく1秒足らずで返る）
            var sDate = new Date(today.getTime());
            sDate.setDate(sDate.getDate() - rangeDays);
            var startDateStr = sDate.getFullYear() + "/" + ("0" + (sDate.getMonth() + 1)).slice(-2) + "/" + ("0" + sDate.getDate()).slice(-2);
            var eDate = new Date(today.getTime());
            eDate.setDate(eDate.getDate() + 30);
            var endDateStr = eDate.getFullYear() + "/" + ("0" + (eDate.getMonth() + 1)).slice(-2) + "/" + ("0" + eDate.getDate()).slice(-2);

            return "http://10.5.171.42:8082/karte/karte.php" +
                   "?disp_flgs=0/0/2/0/0/0/1/0/0/1/0/0/0/0/0" +
                   "&kanja_id=" + encodeURIComponent(p.id) +
                   "&user_id=" + encodeURIComponent(userId) +
                   "&start_date=" + startDateStr +
                   "&end_date=" + endDateStr +
                   "&hakkou_date=" + startDateStr +
                   "&kijun_date=" + kijunDate +
                   "&range_date=" + rangeDays + "/7/1/1" +
                   "&disp_selectsection=" +
                   "&disp_selectukind=1,2,3,91" +
                   "&disp_usection_code=0" +
                   "&disp_ukind_code=2122" +
                   "&order_kind_set_code=0091" +
                   "&order_kind_code_str=0091,1091" +
                   "&no_log_flg=1&nyugai_kind=&min_date=&max_date=&disp_zoom=100" +
                   "&_t=" + new Date().getTime();
        }

        var iframeId = "surgery-fetch-iframe-" + p.id;
        var existing = document.getElementById(iframeId);
        if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

        var iframe = document.createElement("iframe");
        iframe.id = iframeId;
        iframe.style.display = "none";
        iframe.application = "yes"; 
        document.body.appendChild(iframe);

        var isDone = false;
        var pollTimer = null;
        var fallbackTimer = null;

        var cleanupAndCallback = function() {
            if (isDone) return;
            isDone = true;
            if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
            if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
            setTimeout(function() {
                var ifr = document.getElementById(iframeId);
                if (ifr && ifr.parentNode) {
                    try { ifr.onload = null; ifr.src = "about:blank"; } catch(e0) {}
                    ifr.parentNode.removeChild(ifr);
                }
            }, 300);
            callback(); 
        };

        fallbackTimer = setTimeout(function() {
            if (!isDone) { 
                p.surgeryDate = "-";
                p.surgeryProcedure = "タイムアウト";
                cleanupAndCallback(); 
            }
        }, 15000);
        
        // 解析処理の共通関数
        function processContent(allText) {
            if (isDone) return;
            try {
                var extract = function(regex) {
                    var m = allText.match(regex);
                    return m ? m[1].replace(/[\r\n]+/g, ' ').trim() : "";
                };

                // 1. 各項目の抽出（「見出し」をキーにして、次の見出しまたは改行で止める）
                var disease = extract(/(?:病名[：:]|診断名[：:])([\s\S]*?)(?=術式[：:]|\n[^\s　]+：|\n【|$)/);
                
                // ★術式は「術式：」の後ろから、「体位：」「麻酔法：」または「出血量：」が出現するまでとする
                var procedure = extract(/術式[：:]([\s\S]*?)(?=\n[^\s　]+：|\n【|体位[：:]|麻酔法[：:]|出血量[：:]|$)/);
                
                // 2. 術式から不要な「加算」や「器材」を徹底排除
                if (procedure) {
                    procedure = procedure.replace(/[\r\n]+/g, ' ');
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
                var anesthesia = extract(/麻酔法[：:]([\s\S]*?)(?=\n[^\s　]+：|\n【|体位[：:]|出血量[：:]|$)/);
                
                // 4. 体位などの余計な文字列が術式に残っていないか最終クリーンアップ
                procedure = procedure.replace(/(体位[：:]|麻酔法[：:]|出血量[：:]).*$/g, '').trim();

                // 日付の取得（より厳格に）
                var surgDateStr = "";
                var dateMatch = allText.match(/(?:手術開始時刻|手術日|実施日)[：:\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
                if (dateMatch) {
                    surgDateStr = dateMatch[1] + '/' + ('0'+dateMatch[2]).slice(-2) + '/' + ('0'+dateMatch[3]).slice(-2);
                }

                // 在院日数から「今回の入院期間」を計算し、逸脱する過去の手術日を弾く
                var isValidDate = true;
                if (surgDateStr) {
                    var sDate = new Date(surgDateStr);
                    sDate.setHours(0,0,0,0);
                    var aDate = new Date(today.getTime());
                    if (!isNaN(days) && days > 0) {
                        aDate.setDate(today.getDate() - (days + 3));
                    } else {
                        aDate.setDate(today.getDate() - 30);
                    }
                    aDate.setHours(0,0,0,0);
                    var tDate = new Date(today.getTime());
                    tDate.setDate(tDate.getDate() + 30);

                    if (sDate < aDate || sDate > tDate) {
                        isValidDate = false; 
                    }
                }
                if (!isValidDate) surgDateStr = "";

                // リクシアナ適応判定
                var lixianaRegex = /(人工関節置換術|人工関節再置換術|人工骨頭挿入術|骨折観血的手術|観血的整復固定術|人工関節全置換|TKA|THA|BHA)/i;
                var hipKneeRegex = /(股|膝|大腿)/i;
                
                var isLixiana = false;
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
                    var targetWard = p._tempWardCode || currentWard;
                    DataManager.appendTransaction("UPDATE_SURGERY_INFO", {
                        patientId: p.id, wardCode: targetWard, surgeryDate: p.surgeryDate,
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
        }

        // ダミーデータ処理
        if (typeof USE_DUMMY_DATA !== 'undefined' && USE_DUMMY_DATA) {
            setTimeout(function() {
                if (isDone) return;
                var dummyText = "手術日：" + kijunDate + "\n病名：ダミー疾患\n術式：ダミー手術(人工関節置換術)\n麻酔法：全身麻酔・硬膜外麻酔\n出血量：100ml\n";
                processContent(dummyText);
            }, 100);
            return;
        }

        // iframe内の全テキストを再帰的に収集
        function collectText(winOrDoc) {
            var text = "";
            if (!winOrDoc) return "";
            try {
                var doc = winOrDoc.document || winOrDoc;
                if (doc && doc.body && doc.body.innerText) {
                    text += "\n" + doc.body.innerText;
                }
                var frames = doc.getElementsByTagName("frame");
                for (var j = 0; j < frames.length; j++) {
                    try { text += "\n" + collectText(frames[j].contentWindow); } catch(ef) {}
                }
                var iframes = doc.getElementsByTagName("iframe");
                for (var k = 0; k < iframes.length; k++) {
                    try { text += "\n" + collectText(iframes[k].contentWindow); } catch(eif) {}
                }
            } catch(e) {}
            return text;
        }

        // ★即時完了ポーリング: iframe.onload は待たず、HTMLテキストが届いた瞬間に0.2〜0.5秒で抽出！
        var checkCount = 0;
        var maxChecks = 25; // 80ms * 25 = 約2.0秒
        var hasRetriedWithHeavy = false;

        function checkReady() {
            if (isDone) return;
            checkCount++;

            var allText = "";
            var docReadyState = "";
            try {
                if (iframe.contentWindow) {
                    allText = collectText(iframe.contentWindow);
                    if (iframe.contentWindow.document) {
                        docReadyState = iframe.contentWindow.document.readyState || "";
                    }
                }
            } catch(e) {}

            var hasSurgeryKeywords = (allText.indexOf("術式：") !== -1 || allText.indexOf("術式:") !== -1 ||
                                      allText.indexOf("病名：") !== -1 || allText.indexOf("病名:") !== -1 ||
                                      allText.indexOf("手術開始時刻") !== -1 ||
                                      allText.indexOf("手術日") !== -1 ||
                                      allText.indexOf("実施日") !== -1);

            // 1. キーワード検知時：即座に抽出完了（最速 0.1〜0.4秒）
            if (hasSurgeryKeywords) {
                p._surgeryFetchMode = hasRetriedWithHeavy ? "heavy" : "light";
                processContent(allText);
                return;
            }

            // 2. ドキュメントロード完了後、キーワードがない場合の判定
            var isDocComplete = (docReadyState === "complete" || docReadyState === "interactive");
            if ((isDocComplete && checkCount >= 6 && allText.length > 50) || checkCount >= maxChecks) {
                // 安全策：
                // 軽量形式で「手術予約」の文字はあるのに「術式：」等の本文見出しが未展開で、
                // まだ重いURLを試していない場合のみ、1回だけdocument_code=700360003で自動再取得！
                var hasOrderHeaderWithoutBody = (allText.indexOf("手術予約") !== -1 && !hasSurgeryKeywords);
                if (hasOrderHeaderWithoutBody && !hasRetriedWithHeavy) {
                    hasRetriedWithHeavy = true;
                    checkCount = 0;
                    try {
                        iframe.src = buildUrl(true);
                        return;
                    } catch(e2) {}
                }

                // 「手術予約」オーダ自体がない（手術なし患者）、または再試行後も完了
                p._surgeryFetchMode = hasRetriedWithHeavy ? "heavy" : "light";
                processContent(allText);
                return;
            }
        }

        // 80ms即時ポーリング開始
        pollTimer = setInterval(checkReady, 80);

        iframe.onload = function() {
            checkReady();
        };

        try {
            // ★最初は処方・注射・再診と全く同一の超軽量オーダ照会形式で最速取得（1秒足らず）
            iframe.src = buildUrl(false);
        } catch(e) {
            clearTimeout(fallbackTimer);
            cleanupAndCallback();
        }
    }};

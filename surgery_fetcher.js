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

        // ★カルテLinkと完全に一致させた正規の手術予約・記録URL
        function buildUrl() {
            return "http://10.5.171.42:8082/karte/karte.php?kanja_id=" + p.id + 
                   "&user_id=" + userId + 
                   "&order_kind_code_str=0091,1091" + 
                   "&kijun_date=" + kijunDate + 
                   "&range_date=" + rangeDays + "/7/1/1" + 
                   "&disp_selectsection=0000021&disp_selectukind=1,2,3" + 
                   "&document_code=700360003" + 
                   "&multi_kind=1" + 
                   "&_nocache=" + new Date().getTime() + "#top";
        }

        var isDone = false;
        var fallbackTimer = null;
        var currentIeApp = null;
        var currentIframeId = null;

        var cleanupAndCallback = function() {
            if (isDone) return;
            isDone = true;
            if (fallbackTimer) { clearTimeout(fallbackTimer); fallbackTimer = null; }
            if (currentIeApp) {
                try { currentIeApp.Quit(); } catch(eq) {}
                currentIeApp = null;
            }
            if (currentIframeId) {
                var ifr = document.getElementById(currentIframeId);
                if (ifr && ifr.parentNode) {
                    try { ifr.onload = null; ifr.src = "about:blank"; } catch(e0) {}
                    ifr.parentNode.removeChild(ifr);
                }
                currentIframeId = null;
            }
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
                var disease = extract(/病名：([\s\S]*?)術式：/);
                
                // ★術式は「術式：」の後ろから、「体位：」「麻酔法：」または「出血量：」が出現するまでとする
                var procedure = extract(/術式：([\s\S]*?)(?=\n[^\s　]+：|\n【|体位：|麻酔法：|出血量：|$)/);
                
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
                var anesthesia = extract(/麻酔法：([\s\S]*?)(?=\n[^\s　]+：|\n【|体位：|出血量：|$)/);
                
                // 4. 体位などの余計な文字列が術式に残っていないか最終クリーンアップ
                procedure = procedure.replace(/(体位：|麻酔法：|出血量：).*$/g, '').trim();

                // 日付の取得（より厳格に）
                var surgDateStr = "";
                var dateMatch = allText.match(/(?:手術開始時刻|手術日|実施日)[：\s]*(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
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

        // Shift-JIS デコード用ヘルパー
        function decodeShiftJIS(bin) {
            if (!bin) return "";
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

        // HTMLタグ除去・innerText相当変換ヘルパー
        function htmlToPlainText(html) {
            if (!html) return "";
            var s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, " ");
            s = s.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, " ");
            s = s.replace(/<(?:br|\/p|\/div|\/tr|\/td|\/th|\/li|\/h[1-6])\b[^>]*>/gi, "\n");
            s = s.replace(/<[^>]+>/g, " ");
            s = s.replace(/&nbsp;/gi, " ");
            s = s.replace(/&lt;/gi, "<");
            s = s.replace(/&gt;/gi, ">");
            s = s.replace(/&quot;/gi, '"');
            s = s.replace(/&apos;/gi, "'");
            s = s.replace(/&amp;/gi, "&");
            return s.replace(/[ \t]+/g, " ").replace(/\n\s*\n/g, "\n");
        }

        // -----------------------------------------------------------------
        // ★第1優先：案B「MSXML2.XMLHTTP」直接通信（最速：0.1〜0.3秒）
        // ブラウザエンジンや外部JSのダウンロードを完全排除し、HTMLを直接受信
        // -----------------------------------------------------------------
        function tryXmlHttp() {
            try {
                var xhr = null;
                try {
                    xhr = new ActiveXObject("MSXML2.XMLHTTP");
                } catch(ex1) {
                    try { xhr = new ActiveXObject("Microsoft.XMLHTTP"); } catch(ex2) { xhr = new XMLHttpRequest(); }
                }

                if (!xhr) {
                    fallbackToIEApp();
                    return;
                }

                var xhrTimer = setTimeout(function() {
                    try { xhr.abort(); } catch(ea) {}
                    fallbackToIEApp();
                }, 2500); // 2.5秒でタイムアウトしてIEAppへフォールバック

                xhr.open("GET", buildUrl(), true);
                xhr.onreadystatechange = function() {
                    if (xhr.readyState === 4) {
                        clearTimeout(xhrTimer);
                        if (xhr.status === 200 || xhr.status === 0) {
                            var rawHtml = "";
                            try { rawHtml = decodeShiftJIS(xhr.responseBody); } catch(ed) {}
                            if (!rawHtml) {
                                try { rawHtml = xhr.responseText; } catch(et) {}
                            }

                            if (rawHtml && rawHtml.length > 50) {
                                var plainText = htmlToPlainText(rawHtml);
                                var hasKeywords = (plainText.indexOf("術式：") !== -1 ||
                                                   plainText.indexOf("病名：") !== -1 ||
                                                   plainText.indexOf("手術開始時刻") !== -1 ||
                                                   plainText.indexOf("手術日") !== -1 ||
                                                   plainText.indexOf("実施日") !== -1);

                                // キーワード検知、またはカルテ画面が正常返却された場合
                                if (hasKeywords || rawHtml.indexOf("karte") !== -1 || rawHtml.indexOf("手術") !== -1) {
                                    // 内部フレームの存在チェック (frame/iframe)
                                    var subFrameMatch = rawHtml.match(/<frame\b[^>]*src=["']([^"']+)["']/i);
                                    if (!hasKeywords && subFrameMatch && subFrameMatch[1]) {
                                        var subUrl = subFrameMatch[1];
                                        if (subUrl.indexOf("http") !== 0) {
                                            subUrl = "http://10.5.171.42:8082" + (subUrl.charAt(0) === '/' ? '' : '/karte/') + subUrl;
                                        }
                                        trySubFrameXmlHttp(subUrl, plainText);
                                        return;
                                    }

                                    // XMLHTTP直接取得で大成功！
                                    processContent(plainText);
                                    return;
                                }
                            }
                        }
                        // ステータス異常やデータ不足時はIEAppへフォールバック
                        fallbackToIEApp();
                    }
                };
                xhr.send(null);
            } catch(eXHR) {
                fallbackToIEApp();
            }
        }

        // サブフレーム用XMLHTTP
        function trySubFrameXmlHttp(subUrl, parentText) {
            try {
                var xhr2 = new ActiveXObject("MSXML2.XMLHTTP");
                xhr2.open("GET", subUrl, true);
                var subTimer = setTimeout(function() {
                    try { xhr2.abort(); } catch(e) {}
                    fallbackToIEApp();
                }, 2000);
                xhr2.onreadystatechange = function() {
                    if (xhr2.readyState === 4) {
                        clearTimeout(subTimer);
                        if (xhr2.status === 200 || xhr2.status === 0) {
                            var subHtml = "";
                            try { subHtml = decodeShiftJIS(xhr2.responseBody); } catch(ed) {}
                            if (!subHtml) { try { subHtml = xhr2.responseText; } catch(et) {} }
                            var totalText = parentText + "\n" + htmlToPlainText(subHtml);
                            processContent(totalText);
                            return;
                        }
                        fallbackToIEApp();
                    }
                };
                xhr2.send(null);
            } catch(e) {
                fallbackToIEApp();
            }
        }

        // -----------------------------------------------------------------
        // ★第2優先（フォールバック）：案A「InternetExplorer.Application」
        // HTAと別プロセスで動作するためUIスレッドをブロックしない
        // -----------------------------------------------------------------
        function fallbackToIEApp() {
            if (isDone) return;
            try {
                currentIeApp = new ActiveXObject("InternetExplorer.Application");
                currentIeApp.Visible = false;
                try { currentIeApp.Silent = true; } catch(es) {}

                currentIeApp.Navigate(buildUrl());

                var waitCount = 0;
                var maxWait = 25; // 100ms * 25 = 2.5秒
                var ieTimer = setInterval(function() {
                    if (isDone) { clearInterval(ieTimer); return; }
                    waitCount++;

                    var ready = false;
                    try {
                        if (!currentIeApp.Busy && currentIeApp.readyState === 4) ready = true;
                    } catch(eb) {}

                    var text = "";
                    try {
                        if (currentIeApp.Document && currentIeApp.Document.body) {
                            text = currentIeApp.Document.body.innerText || "";
                        }
                    } catch(et) {}

                    var hasKw = (text.indexOf("術式：") !== -1 || text.indexOf("病名：") !== -1 || text.indexOf("手術日") !== -1);

                    if (hasKw || (ready && waitCount >= 3) || waitCount >= maxWait) {
                        clearInterval(ieTimer);
                        try { currentIeApp.Quit(); } catch(eq) {}
                        currentIeApp = null;
                        processContent(text);
                    }
                }, 100);
            } catch(eIE) {
                // IE.Applicationが起動できない環境はiframeへ安全フォールバック
                fallbackToIframe();
            }
        }

        // -----------------------------------------------------------------
        // ★第3優先（最終安全フォールバック）：従来のiframe
        // -----------------------------------------------------------------
        function fallbackToIframe() {
            if (isDone) return;
            currentIframeId = "surgery-fetch-iframe-" + p.id;
            var existing = document.getElementById(currentIframeId);
            if (existing && existing.parentNode) existing.parentNode.removeChild(existing);

            var iframe = document.createElement("iframe");
            iframe.id = currentIframeId;
            iframe.style.display = "none";
            iframe.application = "yes";
            document.body.appendChild(iframe);

            var checkCount = 0;
            var maxChecks = 25;
            var pollTimer = setInterval(function() {
                if (isDone) { clearInterval(pollTimer); return; }
                checkCount++;
                var allText = "";
                try {
                    if (iframe.contentWindow && iframe.contentWindow.document && iframe.contentWindow.document.body) {
                        allText = iframe.contentWindow.document.body.innerText || "";
                    }
                } catch(e) {}

                var hasKw = (allText.indexOf("術式：") !== -1 || allText.indexOf("病名：") !== -1 || allText.indexOf("手術日") !== -1);
                if (hasKw || checkCount >= maxChecks) {
                    clearInterval(pollTimer);
                    processContent(allText);
                }
            }, 100);

            try { iframe.src = buildUrl(); } catch(e) { processContent(""); }
        }

        // 実行開始：まずは最速の XMLHTTP を試みる！
        tryXmlHttp();
    }

};
﻿// ---------- 薬管1 対象薬剤判定 ----------
        // 全角英数記号→半角に変換する正規化関数
        function normalizeDrug(s) {
            if (!s) return '';
            // 全角英数→半角
            var r = s.replace(/[\uFF01-\uFF5E]/g, function(c) {
                return String.fromCharCode(c.charCodeAt(0) - 0xFEE0);
            });
            // 全角スペース→半角
            r = r.replace(/\u3000/g, ' ');
            // 小文字化
            r = r.toLowerCase();
            // スペース除去
            r = r.replace(/\s/g, '');
            return r;
        }
        
        // 薬品名からカタカナ/漢字の先頭部分(一般名)を抽出
        function extractDrugRoot(name) {
            var n = normalizeDrug(name);
            // 数字や「(」「「」の前までを取得（規格やメーカー名を除去）
            var m = n.match(/^([^\d\(\)「」]+)/);
            return m ? m[1] : n;
        }
        
        // TOKUYAKU_LISTの正規化キャッシュ
        var tokuyakuCache = null;
        function getTokuyakuCache() {
            if (tokuyakuCache) return tokuyakuCache;
            if (typeof TOKUYAKU_LIST === 'undefined' || !TOKUYAKU_LIST) return null;
            tokuyakuCache = [];
            var seen = {};
            for (var i = 0; i < TOKUYAKU_LIST.length; i++) {
                var norm = normalizeDrug(TOKUYAKU_LIST[i]);
                var root = extractDrugRoot(TOKUYAKU_LIST[i]);
                tokuyakuCache.push({ orig: TOKUYAKU_LIST[i], norm: norm, root: root });
                seen[root] = true;
            }
            // ユニークなrootリストも保持
            tokuyakuCache.uniqueRoots = [];
            var seen2 = {};
            for (var j = 0; j < tokuyakuCache.length; j++) {
                if (!seen2[tokuyakuCache[j].root]) {
                    seen2[tokuyakuCache[j].root] = true;
                    tokuyakuCache.uniqueRoots.push(tokuyakuCache[j].root);
                }
            }
            return tokuyakuCache;
        }
        
        function isTokuyaku(drugName) {
            if (!drugName) return false;
            var highlightEnabled = document.getElementById('set-tokuyaku-highlight');
            if (highlightEnabled && !highlightEnabled.checked) return false;
            var cache = getTokuyakuCache();
            if (!cache) return false;
            
            var inputNorm = normalizeDrug(drugName);
            var inputRoot = extractDrugRoot(drugName);
            
            // 入力の正規化名がリストのいずれかに含まれる/含むかチェック
            for (var i = 0; i < cache.length; i++) {
                if (cache[i].norm.indexOf(inputNorm) !== -1 || inputNorm.indexOf(cache[i].norm) !== -1) {
                    return true;
                }
                // root同士の前方一致
                if (inputRoot.length >= 3 && cache[i].root.indexOf(inputRoot) === 0) {
                    return true;
                }
                if (cache[i].root.length >= 3 && inputRoot.indexOf(cache[i].root) === 0) {
                    return true;
                }
            }
            return false;
        }
        
        function checkTokuyaku() {
            var input = document.getElementById('ipt-tokuyaku-check');
            var result = document.getElementById('tokuyaku-check-result');
            if (!input || !result) return;
            var query = input.value.replace(/[\s\u3000]/g, '');
            if (!query) { result.innerHTML = ''; return; }
            
            var cache = getTokuyakuCache();
            if (!cache) {
                result.innerHTML = '<span style="color:#e65100;">● tokuyaku_list.js が読み込まれていません。HTAと同じフォルダに配置してください。</span>';
                return;
            }
            
            var queryNorm = normalizeDrug(query);
            // ユニークなrootでマッチング（後発品・規格違いの重複を防ぐ）
            var matchedRoots = {};
            var matchedExamples = {};
            for (var i = 0; i < cache.length; i++) {
                if (cache[i].norm.indexOf(queryNorm) !== -1) {
                    var rt = cache[i].root;
                    if (!matchedRoots[rt]) {
                        matchedRoots[rt] = true;
                        matchedExamples[rt] = cache[i].orig;
                    }
                }
            }
            
            var rootKeys = [];
            for (var k in matchedRoots) { if (matchedRoots.hasOwnProperty(k)) rootKeys.push(k); }
            
            if (rootKeys.length > 0) {
                var html = '<span style="color:#c62828; font-weight:bold;">● 薬剤管理指導１対象あり (' + rootKeys.length + '種):</span><br>';
                var showCount = Math.min(rootKeys.length, 10);
                for (var j = 0; j < showCount; j++) {
                    html += '<span style="color:#c62828;">　・' + matchedExamples[rootKeys[j]] + '</span><br>';
                }
                if (rootKeys.length > 10) html += '<span style="color:#999;">　...他 ' + (rootKeys.length - 10) + ' 種</span>';
                result.innerHTML = html;
            } else {
                result.innerHTML = '<span style="color:#2e7d32;">✔ 「' + input.value + '」は薬管１対象外です</span>';
            }
        }
        
        // ---------- 処方略称生成 ----------
        // 全角カタカナ→半角カタカナ変換マップ
        var zenToHanKana = {
            'ア':'ｱ','イ':'ｲ','ウ':'ｳ','エ':'ｴ','オ':'ｵ','カ':'ｶ','キ':'ｷ','ク':'ｸ','ケ':'ｹ','コ':'ｺ',
            'サ':'ｻ','シ':'ｼ','ス':'ｽ','セ':'ｾ','ソ':'ｿ','タ':'ﾀ','チ':'ﾁ','ツ':'ﾂ','テ':'ﾃ','ト':'ﾄ',
            'ナ':'ﾅ','ニ':'ﾆ','ヌ':'ﾇ','ネ':'ﾈ','ノ':'ﾉ','ハ':'ﾊ','ヒ':'ﾋ','フ':'ﾌ','ヘ':'ﾍ','ホ':'ﾎ',
            'マ':'ﾏ','ミ':'ﾐ','ム':'ﾑ','メ':'ﾒ','モ':'ﾓ','ヤ':'ﾔ','ユ':'ﾕ','ヨ':'ﾖ',
            'ラ':'ﾗ','リ':'ﾘ','ル':'ﾙ','レ':'ﾚ','ロ':'ﾛ','ワ':'ﾜ','ヲ':'ｦ','ン':'ﾝ',
            'ァ':'ｧ','ィ':'ｨ','ゥ':'ｩ','ェ':'ｪ','ォ':'ｫ','ッ':'ｯ','ャ':'ｬ','ュ':'ｭ','ョ':'ｮ','ヴ':'ｳﾞ','ー':'ｰ',
            'ガ':'ｶﾞ','ギ':'ｷﾞ','グ':'ｸﾞ','ゲ':'ｹﾞ','ゴ':'ｺﾞ','ザ':'ｻﾞ','ジ':'ｼﾞ','ズ':'ｽﾞ','ゼ':'ｾﾞ','ゾ':'ｿﾞ',
            'ダ':'ﾀﾞ','ヂ':'ﾁﾞ','ヅ':'ﾂﾞ','デ':'ﾃﾞ','ド':'ﾄﾞ','バ':'ﾊﾞ','ビ':'ﾋﾞ','ブ':'ﾌﾞ','ベ':'ﾍﾞ','ボ':'ﾎﾞ',
            'パ':'ﾊﾟ','ピ':'ﾋﾟ','プ':'ﾌﾟ','ペ':'ﾍﾟ','ポ':'ﾎﾟ'
        };
        
        function toHankakuKana(str) {
            var result = '';
            for (var i = 0; i < str.length; i++) {
                var c = str.charAt(i);
                if (zenToHanKana[c]) {
                    result += zenToHanKana[c];
                } else {
                    // 全角英数→半角
                    var code = c.charCodeAt(0);
                    if (code >= 0xFF01 && code <= 0xFF5E) {
                        result += String.fromCharCode(code - 0xFEE0);
                    } else {
                        result += c;
                    }
                }
            }
            return result;
        }
        
        // 薬品名の先頭4「文字」を半角カタカナで取得（濁点・半濁点は1文字としてカウント）
        // 薬剤略称辞書（標準略称マッピング）
        var DRUG_ABBR_DICT = {
            // ペニシリン系
            "アンピシリン": "ABPC", "アモキシシリン": "AMPC", "ピペラシリン": "PIPC",
            "スルバシリン": "Ab/S", "スルバクタム": "Ab/S", "ユナシン": "Ab/S",
            "ユナスピン": "Ab/S", "オーグメンチン": "Am/C",
            "タゾバクタム": "T/P", "ゾシン": "T/P",
            // セフェム系
            "セファゾリン": "CEZ", "セフメタゾール": "CMZ", "セフトリアキソン": "CTRX",
            "セフォタキシム": "CTX", "セフタジジム": "CAZ", "セフェピム": "CFPM",
            "セファレキシン": "CEX", "セフジニル": "CFDN", "セフカペン": "CFPN",
            "セフジトレン": "CDTR", "フロモックス": "CFPN", "メイアクト": "CDTR",
            "セフォゾプラン": "CZOP",
            // カルバペネム系
            "メロペネム": "MEPM", "イミペネム": "IPM", "ドリペネム": "DRPM",
            "ビアペネム": "BIPM",
            // アミノグリコシド系
            "ゲンタマイシン": "GM", "アミカシン": "AMK", "トブラマイシン": "TOB",
            // グリコペプチド・リポペプチド
            "バンコマイシン": "VCM", "テイコプラニン": "TEIC", "ダプトマイシン": "DAP",
            // マクロライド系
            "アジスロマイシン": "AZM", "クラリスロマイシン": "CAM", "エリスロマイシン": "EM",
            // キノロン系
            "レボフロキサシン": "LVFX", "シプロフロキサシン": "CPFX", "モキシフロキサシン": "MFLX",
            // テトラサイクリン系
            "ミノサイクリン": "MINO", "ドキシサイクリン": "DOXY",
            // その他抗菌薬
            "メトロニダゾール": "MNZ", "リネゾリド": "LZD", "クリンダマイシン": "CLDM",
            "ホスホマイシン": "FOM", "コリスチン": "CL",
            "スルファメトキサゾール": "ST", "バクタ": "ST", "バクトラミン": "ST",
            // 抗真菌薬
            "フルコナゾール": "FLCZ", "ボリコナゾール": "VRCZ", "ミカファンギン": "MCFG",
            "カスポファンギン": "CPFG", "アムホテリシン": "AMPB",
            // 抗ウイルス薬
            "アシクロビル": "ACV", "バラシクロビル": "VACV", "ガンシクロビル": "GCV",
            "オセルタミビル": "OTV", "レムデシビル": "RDV",
            // 抗てんかん薬
            "レベチラセタム": "LEV", "バルプロ酸": "VPA", "デパケン": "VPA",
            "フェニトイン": "PHT", "アレビアチン": "PHT",
            "カルバマゼピン": "CBZ", "テグレトール": "CBZ",
            "ラモトリギン": "LTG", "ラコサミド": "LCM", "ビムパット": "LCM",
            "フェノバルビタール": "PB", "ゾニサミド": "ZNS", "トピラマート": "TPM",
            "クロバザム": "CLB", "クロナゼパム": "CZP", "ペランパネル": "PER",
            "ガバペンチン": "GBP",
            // 抗凝固・抗血小板
            "ヘパリン": "Hep", "ワルファリン": "Wf",
            "リバーロキサバン": "Xa-R", "イグザレルト": "Xa-R",
            "アピキサバン": "Xa-A", "エリキュース": "Xa-A",
            "エドキサバン": "Xa-E", "リクシアナ": "Xa-E",
            "ダビガトラン": "DABI", "プラザキサ": "DABI",
            "クロピドグレル": "CPG", "プラスグレル": "PSG",
            // ステロイド
            "プレドニゾロン": "PSL", "メチルプレドニゾロン": "mPSL",
            "デキサメタゾン": "DEX", "ヒドロコルチゾン": "HC", "ベタメタゾン": "BM",
            // 免疫抑制剤
            "タクロリムス": "TAC", "シクロスポリン": "CyA",
            "ミコフェノール": "MMF", "アザチオプリン": "AZP",
            // インスリン
            "ヒューマログ": "HmL", "ノボラピッド": "NvR", "アピドラ": "APD",
            "トレシーバ": "TRB", "ランタス": "Lan", "レベミル": "Lev",
            // 輸液・電解質等
            "生理食塩液": "NS", "生理食塩水": "NS", "生食": "NS", "プラミツト": "NS",
            "ブドウ糖液": "TZ", "ブドウ糖注射液": "TZ", "５％ＴＺ": "TZ", "５％ブドウ糖": "TZ",
            "注射用水": "WS", "蒸留水": "WS",
            // その他
            "アセトアミノフェン": "AAP", "カロナール": "AAP", "アセリオ": "AAP",
            "ロキソプロフェン": "Lox", "イブプロフェン": "IBP",
            "フロセミド": "Fur", "スピロノラクトン": "SPL",
            "オメプラゾール": "OPZ", "ランソプラゾール": "LPZ",
            "ラベプラゾール": "RPZ", "エソメプラゾール": "EPZ",
            "ボノプラザン": "VPZ", "タケキャブ": "VPZ"
        };

        function lookupDrugAbbr(drugName) {
            var chk = document.getElementById('chk-use-abbr-dict');
            if (chk && !chk.checked) return null; // OFFならスキップ
            
            // 半角カタカナを全角に変換してから辞書引き
            var fullName = drugName.replace(/[\uFF66-\uFF9F]/g, function(s) {
                var hk = "ヲァィゥェォャュョッーアイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワン゛゜";
                var idx = s.charCodeAt(0) - 0xFF66;
                return idx >= 0 && idx < hk.length ? hk.charAt(idx) : s;
            });
            // 濁点・半濁点結合（゛→濁点、゜→半濁点）
            fullName = fullName.replace(/([カキクケコサシスセソタチツテトハヒフヘホ])゛/g, function(m, c) {
                var base = "カキクケコサシスセソタチツテトハヒフヘホ";
                var daku = "ガギグゲゴザジズゼゾダヂヅデドバビブベボ";
                var i = base.indexOf(c);
                return i >= 0 ? daku.charAt(i) : m;
            }).replace(/([ハヒフヘホ])゜/g, function(m, c) {
                var base = "ハヒフヘホ";
                var han = "パピプペポ";
                var i = base.indexOf(c);
                return i >= 0 ? han.charAt(i) : m;
            });
            for (var key in DRUG_ABBR_DICT) {
                if (DRUG_ABBR_DICT.hasOwnProperty(key)) {
                    if (drugName.indexOf(key) !== -1 || fullName.indexOf(key) !== -1) {
                        return DRUG_ABBR_DICT[key];
                    }
                }
            }
            return null;
        }

        function getFirst4HanKana(drugName) {
            // 記号スキップ: ★（要届出）（要許可）等を除去
            var cleaned = drugName.replace(/^[\s　]*/, '')
                .replace(/^★+/, '')
                .replace(/^[（(][^）)]*[）)]/, '')
                .replace(/^[\s　]*/, '');
            if (!cleaned) return '';
            
            // 半角カタカナに変換
            var hk = toHankakuKana(cleaned);
            
            // 先頭4文字を取得（濁点ﾞ半濁点ﾟは前の文字とセットで1文字扱い）
            var chars = [];
            for (var i = 0; i < hk.length && chars.length < 4; i++) {
                var c = hk.charAt(i);
                // 次の文字が濁点・半濁点の場合はセットで追加
                if (i + 1 < hk.length && (hk.charAt(i+1) === '\uFF9E' || hk.charAt(i+1) === '\uFF9F')) {
                    chars.push(c + hk.charAt(i+1));
                    i++;
                } else {
                    chars.push(c);
                }
            }
            return chars.join('');
        }
        
        function generateAbbreviation() {
            var input = document.getElementById('abbr-input');
            var resultEl = document.getElementById('abbr-result');
            var detailEl = document.getElementById('abbr-detail');
            if (!input || !resultEl) return;
            
            var text = input.value;
            if (!text.replace(/\s/g, '')) {
                resultEl.value = '';
                if (detailEl) detailEl.innerHTML = '';
                return;
            }
            
            var lines = text.split('\n');
            var drugNames = [];
            var seen = {};
            
            for (var i = 0; i < lines.length; i++) {
                var rawLine = lines[i];
                
                // ★根本修正: 判定の邪魔になる（向）（麻）（先）（後）（般）等を一番最初に行から完全に消し去る
                rawLine = rawLine.replace(/^([\s　]*)[（\(](向|麻|劇|毒|劇・向|毒・向|向・劇|先|後|般)[）\)]\s*/, '$1');
                
                var line = rawLine.replace(/^[\s　]+/, '');
                if (!line) continue;
                
                var drugMatch = null;
                
                // パターA: （持参薬）薬品名 数量T【...】（薬歴作成タブの元データ形式）
                if (/^（持参薬）/.test(line)) {
                    drugMatch = line.replace(/^（持参薬）/, '').replace(/\s+\d+.*$/, '').replace(/\s+【.*$/, '').trim();
                }
                // パターンB: テキスト整理済みの形式 - "数字) 薬品名数量 数量T 分X..." or "薬品名数量 数量T 分X..."
                else if (/^\d+\)\s*/.test(line)) {
                    var cleaned = line.replace(/^\d+\)\s*/, '');
                    drugMatch = cleaned.replace(/\s+\d+[TＴ錠ｶCＣ包ml管本枚袋g]+.*$/i, '').trim();
                    if (!drugMatch) drugMatch = cleaned.replace(/\s+分\d.*$/, '').replace(/\s+\d+.*$/, '').trim();
                }
                // パターンC: Rp行なしで直接薬品名（テキスト整理済みでRp番号なし）
                // 薬品名 + 数量 + 用法のパターン
                else if (/^[^\s（【Rp分◆◇▼■☆※]/.test(line) && /\d+[TＴ錠ｶCＣ包ml管本枚袋g]+/i.test(line)) {
                    drugMatch = line.replace(/\s+\d+[TＴ錠ｶCＣ包ml管本枚袋g]+.*$/i, '').trim();
                    if (!drugMatch) drugMatch = line.replace(/\s+\d+.*$/, '').trim();
                }
                // パターンD: 薬歴作成タブのRp行の次行にある薬品名行
                // "　　薬品名錠XX 数量T ..."のパターン（先頭がスペースインデント）
                else if (/^[\s　]{2,}/.test(rawLine) && !/^[\s　]*(薬効|院内|院外|フリー|分\d|（持参薬用法）)/.test(line)) {
                    if (/[錠ｶカプセル散顆粒液mg]+/.test(line) && !/Rp\d/.test(line)) {
                        drugMatch = line.replace(/\s+\d+[TＴ錠ｶCＣ包ml管本枚袋g]+.*$/i, '').replace(/\s+【.*$/, '').trim();
                    }
                }
                // 不要な行（電子カルテの薬効情報や院内採用状態、点滴の側管指示など）をスキップ
                if (/^(薬効名称|院内\(|点滴 末梢側管)/.test(line) || /^[0-9０-９]+-[0-9０-９]+：/.test(line)) {
                    continue;
                }

                // パターンE: タブ区切りの電子カルテ処方データ、または単なる縦1列のコピペテキスト
                if (!drugMatch) {
                    var abbrCols = rawLine.split('\t');
                    var abbrCol0 = (abbrCols[0] || '').replace(/^[0-9０-９]+[\s　]+/, '').trim();
                    
                    if (!abbrCol0 || /^\[/.test(abbrCol0) || /^（/.test(abbrCol0) || /^\d+:\d+/.test(abbrCol0) || /mL\/時/.test(rawLine) || /^(薬効|院内|院外|フリー|点滴|静注|皮下注|その他注|開始時刻|キット生食|生食注|生理食塩|血糖|ソリューゲン|ソリタ)/.test(abbrCol0)) {
                        // skip
                    } else if (/^[0-9０-９]+$/.test(abbrCol0)) {
                        // cols[0]が番号のみの場合、cols[1]を薬品名とする
                        abbrCol0 = (abbrCols[1] || '').trim();
                        if (abbrCol0 && !/^(薬効|院内|院外)/.test(abbrCol0)) drugMatch = abbrCol0;
                    } else if (abbrCols.length > 1) {
                        // cols[1]が数値なら薬品行とみなす
                        var abbrCol1 = (abbrCols[1] || '').trim();
                        if (/^[0-9０-９]/.test(abbrCol1) || /^[TＴＶ錠ｶCＣ包管本枚袋キット]/.test(abbrCol1)) {
                            drugMatch = abbrCol0;
                        }
                    } else {
                        // タブ区切りでもなく、これまでのパターンにも合致しない「文字列のみ」の行は
                        // ユーザーが薬品名だけを縦に並べてコピペしたとみなしてそのまま採用を試みる
                        if (abbrCol0.length > 2 && !/^(Rp|分|■|◆|▼)/.test(abbrCol0)) {
                            drugMatch = abbrCol0.replace(/\s+\d+.*$/, '').trim(); // 念のため後ろの数量っぽいのを削る
                        }
                    }
                }
                
                if (!drugMatch) continue;
                // 記号除去: ★（要届出）（要許可）等 + 【簡易懸濁】等の括弧注釈
                drugMatch = drugMatch.replace(/^★+/, '').replace(/^[（(]要[^）)]*[）)]/, '').replace(/\s*[【\[][^】\]]*[】\]]/g, '').replace(/^[\s　]+/, '');
                
                // 接頭語の除去（麻、向、劇、毒、各種メーカー名など）
                // ※先頭で既に消しているのでここは保険としての処理になります
                drugMatch = drugMatch.replace(/^（(向|麻|劇|毒|劇・向|毒・向|向・劇)）/, '');
                drugMatch = drugMatch.replace(/^\((向|麻|劇|毒|劇・向|毒・向|向・劇)\)/, '');
                drugMatch = drugMatch.replace(/^(ツムラ|ﾂﾑﾗ|クラシエ|ｸﾗｼｴ|オースギ|ｵｰｽｷﾞ|コタロー|ｺﾀﾛｰ|JG|フソー|ﾌｿｰ|ファイザー|ﾌｧｲｻﾞｰ|マイラン|ﾏｲﾗﾝ|サワイ|ｻﾜｲ|トーワ|ﾄｰﾜ|テバ|ﾃﾊﾞ|アメル|ｱﾒﾙ|日医工|ＮＰ|NP|武田|タケダ|ﾀｹﾀﾞ|明治|Meiji|ﾒｲｼﾞ)/i, '');
                
                if (!drugMatch || drugMatch.length < 2) continue;
                
                // 辞書引き → マッチしなければ先頭4文字半角カタカナ
                var abbr = lookupDrugAbbr(drugMatch) || getFirst4HanKana(drugMatch);
                if (!abbr || seen[abbr]) continue;
                seen[abbr] = true;
                drugNames.push({ full: drugMatch, abbr: abbr, isTk: isTokuyaku(drugMatch) });
            }
            
            if (drugNames.length === 0) {
                resultEl.value = '';
                if (detailEl) detailEl.innerHTML = '<span style="color:#999;">薬剤名が抽出できませんでした</span>';
                return;
            }
            
            // 略称結果（スペース区切り1行）→ textarea.valueに設定
            var hlToggle = document.getElementById('set-tokuyaku-highlight');
            var highlightEnabled = hlToggle ? hlToggle.checked : true;
            
            var abbrLine = [];
            for (var j = 0; j < drugNames.length; j++) {
                abbrLine.push(drugNames[j].abbr);
            }
            resultEl.value = abbrLine.join(' ');
            
            // 詳細リスト
            if (detailEl) {
                var dhtml = '';
                for (var k = 0; k < drugNames.length; k++) {
                    var tkMark = drugNames[k].isTk ? '<span style="color:#c62828; font-weight:bold; font-size:10px; border:1px solid #c62828; padding:0 3px; border-radius:3px; margin-right:4px;">薬管1</span>' : '';
                    dhtml += '<div style="padding:2px 0; border-bottom:1px dotted #ddd;">';
                    dhtml += tkMark + '<span style="color:#2e7d32; font-weight:bold; font-family:monospace;">' + drugNames[k].abbr + '</span>';
                    dhtml += ' ← ' + drugNames[k].full;
                    dhtml += '</div>';
                }
                detailEl.innerHTML = dhtml;
            }
        }
        
        function copyAbbrResult() {
            var el = document.getElementById('abbr-result');
            if (!el || !el.value) return;
            try {
                window.clipboardData.setData("Text", el.value);
                yrShowAlert("略称をコピーしました！");
            } catch(e) {
                yrShowAlert("コピーに失敗しました。", "error");
            }
        }

        // ---------- 基準日カレンダー ----------
        function yrShiftDate(days) {
            var input = document.getElementById('baseDate');
            if (!input || !input.value) return;
            var parts = input.value.split('-');
            if(parts.length < 3) return;
            
            var d = new Date(parseInt(parts[0],10), parseInt(parts[1],10)-1, parseInt(parts[2],10));
            d.setDate(d.getDate() + days);
            
            input.value = d.getFullYear() + '-' + ('0'+(d.getMonth()+1)).slice(-2) + '-' + ('0'+d.getDate()).slice(-2);
        }

        var yrCalYear = 0, yrCalMonth = 0;
        
        function toggleYrCalendar() {
            var popup = document.getElementById('yr-calendar-popup');
            if (popup.style.display === 'none' || !popup.style.display) {
                var cur = document.getElementById('baseDate').value;
                if (cur) {
                    var parts = cur.split('-');
                    yrCalYear = parseInt(parts[0], 10);
                    yrCalMonth = parseInt(parts[1], 10) - 1;
                } else {
                    var now = new Date();
                    yrCalYear = now.getFullYear();
                    yrCalMonth = now.getMonth();
                }
                yrCalRender();
                popup.style.display = 'block';
            } else {
                popup.style.display = 'none';
            }
        }
        
        function yrCalRender() {
            var title = document.getElementById('yr-cal-title');
            var body = document.getElementById('yr-cal-body');
            title.innerText = yrCalYear + '年 ' + (yrCalMonth + 1) + '月';
            
            var firstDay = new Date(yrCalYear, yrCalMonth, 1).getDay();
            var daysInMonth = new Date(yrCalYear, yrCalMonth + 1, 0).getDate();
            var today = new Date();
            var todayStr = today.getFullYear() + '-' + ('0'+(today.getMonth()+1)).slice(-2) + '-' + ('0'+today.getDate()).slice(-2);
            var selectedStr = document.getElementById('baseDate').value || '';
            
            var html = '';
            var day = 1;
            for (var row = 0; row < 6; row++) {
                if (day > daysInMonth) break;
                html += '<tr>';
                for (var col = 0; col < 7; col++) {
                    if ((row === 0 && col < firstDay) || day > daysInMonth) {
                        html += '<td style="padding:4px;"></td>';
                    } else {
                        var dateStr = yrCalYear + '-' + ('0'+(yrCalMonth+1)).slice(-2) + '-' + ('0'+day).slice(-2);
                        var bg = '';
                        var fc = '#333';
                        if (dateStr === selectedStr) { bg = 'background:#ffc107; font-weight:bold;'; fc = '#000'; }
                        else if (dateStr === todayStr) { bg = 'background:#e3f2fd;'; fc = '#0d6efd'; }
                        if (col === 0) fc = '#c62828';
                        if (col === 6) fc = '#1565c0';
                        html += '<td style="padding:4px; cursor:pointer; border-radius:3px; ' + bg + ' color:' + fc + ';" onclick="yrCalSelectDate(\'' + dateStr + '\')" onmouseover="this.style.backgroundColor=\'#fff3cd\'" onmouseout="this.style.backgroundColor=\'' + (dateStr === selectedStr ? '#ffc107' : (dateStr === todayStr ? '#e3f2fd' : '')) + '\'">' + day + '</td>';
                        day++;
                    }
                }
                html += '</tr>';
            }
            body.innerHTML = html;
        }
        
        function yrCalNavMonth(dir) {
            yrCalMonth += dir;
            if (yrCalMonth < 0) { yrCalMonth = 11; yrCalYear--; }
            if (yrCalMonth > 11) { yrCalMonth = 0; yrCalYear++; }
            yrCalRender();
        }
        
        function yrCalSelectDate(dateStr) {
            document.getElementById('baseDate').value = dateStr;
            document.getElementById('yr-calendar-popup').style.display = 'none';
        }
        
        function yrCalSetToday() {
            var t = new Date();
            var ds = t.getFullYear() + '-' + ('0'+(t.getMonth()+1)).slice(-2) + '-' + ('0'+t.getDate()).slice(-2);
            yrCalSelectDate(ds);
        }
        

        function yrSwitchTab(tabId, el) {
            if (typeof summaryState !== "undefined" && summaryState.isFetching) {
                yrShowAlert("現在サマリ情報を収集中です。完了または中断してから操作してください。", "error");
                return;
            }
            // yr-nav-link経由の呼び出し（旧方式互換）
            var navs = document.querySelectorAll('.yr-nav-link');
            for(var i=0; i<navs.length; i++) removeClass(navs[i], 'yr-active');
            if (el) addClass(el, 'yr-active');
            yrSwitchPane(tabId);
        }
        
        function yrSwitchTabInline(tabId, el) {
            if (typeof summaryState !== "undefined" && summaryState.isFetching) {
                yrShowAlert("現在サマリ情報を収集中です。完了または中断してから操作してください。", "error");
                return;
            }
            // メインタブバー内のサブタブ切替
            var subs = document.querySelectorAll('#yr-subtabs-inline .yr-sub');
            for(var i=0; i<subs.length; i++) removeClass(subs[i], 'active');
            addClass(el, 'active');
            yrSwitchPane(tabId);
        }
        
        function yrSwitchPane(tabId) {
            var panes = document.querySelectorAll('.yr-tab-pane');
            for(var j=0; j<panes.length; j++) {
                removeClass(panes[j], 'yr-show');
                removeClass(panes[j], 'yr-active');
            }
            var targetPane = document.getElementById(tabId);
            addClass(targetPane, 'yr-show');
            addClass(targetPane, 'yr-active');

            if (tabId === 'yr-tab-macro' || tabId === 'yr-tab-settings' || tabId === 'yr-tab-abbr' || tabId === 'yr-tab-med-adj' || tabId === 'yr-tab-med-adj-2026' || tabId === 'yr-tab-summary') {
                document.getElementById('yr-main-controls').style.display = 'none';
            } else {
                document.getElementById('yr-main-controls').style.display = 'flex';
            }
        }

        function yrShowAlert(msg, type) {
            if (type === undefined) type = 'info';
            var alertArea = document.getElementById('yr-alertArea');
            alertArea.style.display = 'block';
            alertArea.style.backgroundColor = type === 'error' ? '#f8d7da' : '#cff4fc';
            alertArea.style.color = type === 'error' ? '#842029' : '#055160';
            alertArea.style.borderColor = type === 'error' ? '#f5c2c7' : '#b6effb';
            alertArea.innerHTML = msg;
            setTimeout(function() { alertArea.style.display = 'none'; }, 4000);
        }

        function yrSaveSettings() {
            if (!currentSystemId) return;
            try {
                // ファイルを開くのはこの1回だけ
                var data = myStorage._load();
                if (!data[currentSystemId]) data[currentSystemId] = {};
                var ud = data[currentSystemId];

                ud['set-halfwidth'] = document.getElementById('set-halfwidth').checked ? 'true' : 'false';
                
                var kanaFormatRadio = document.querySelector('input[name="set-kana-format"]:checked');
                if (kanaFormatRadio) ud['set-kana-format'] = kanaFormatRadio.value;
                
                ud['set-merge'] = document.getElementById('set-merge').checked ? 'true' : 'false';
                ud['set-softdelete'] = document.getElementById('set-softdelete').checked ? 'true' : 'false';
                ud['set-remove-form'] = document.getElementById('set-remove-form').checked ? 'true' : 'false';
                ud['set-remove-iv-words'] = document.getElementById('set-remove-iv-words').checked ? 'true' : 'false';
                ud['set-remove-salt'] = document.getElementById('set-remove-salt').checked ? 'true' : 'false';
                ud['set-remove-maker'] = document.getElementById('set-remove-maker').checked ? 'true' : 'false';
                // ud['set-add-number'] = document.getElementById('set-add-number').checked ? 'true' : 'false';
                
                var chkAbbr = document.getElementById('chk-use-abbr-dict');
                if (chkAbbr) ud['set-abbr-dict'] = chkAbbr.checked ? 'true' : 'false';
                
                var hlToggle = document.getElementById('set-tokuyaku-highlight');
                if (hlToggle) ud['set-tokuyaku-highlight'] = hlToggle.checked ? 'true' : 'false';
                
                var incTiming = document.getElementById('includeTiming');
                if (incTiming) ud['set-timing'] = incTiming.value;
                
                // ファイルへの書き込みも最後に1回だけ
                myStorage._save(data);
            } catch(e) {}
        }

        function saveAbbrSetting() {
            var chk = document.getElementById('chk-use-abbr-dict');
            if (chk) {
                myStorage.setItem('set-abbr-dict', chk.checked ? 'true' : 'false');
            }
        }

        function formatText(str) {
            if (!str) return "";
            var res = str;
            if (document.getElementById('set-halfwidth').checked) {
                res = res.replace(/[Ａ-Ｚａ-ｚ０-９．]/g, function(s) { return String.fromCharCode(s.charCodeAt(0) - 0xFEE0); });
                res = res.replace(/　/g, ' ');
            }

            var kanaFormatRadio = document.querySelector('input[name="set-kana-format"]:checked');
            var kanaFormat = kanaFormatRadio ? kanaFormatRadio.value : 'full';

            if (kanaFormat === 'full') {
                res = res.replace(kanaReg, function(match){return kanaMap[match];});
            } else if (kanaFormat === 'half') {
                res = res.replace(fullKanaReg, function(match){return fullToHalfMap[match];});
            }

            return res;
        }

        function cleanDrugName(nameStr) {
            var res = nameStr;
            if (document.getElementById('set-remove-form').checked) {
                res = res.replace(/配合錠|ＯＤ錠|OD錠|徐放ＯＤ錠|徐放OD錠|カプセル剤|カプセル|錠|エキス顆粒|ｴｷｽ顆粒/g, '');
            }
            if (document.getElementById('set-remove-salt').checked) {
                res = res.replace(/塩酸塩|フマル酸塩|クエン酸塩|マレイン酸塩|酒石酸塩|Na塩|メシル酸塩|ﾌﾏﾙ酸塩|ｸｴﾝ酸塩|ﾏﾚｲﾝ酸塩|ﾒｼﾙ酸塩|Ｎａ塩/g, '');
            }
            if (document.getElementById('set-remove-maker').checked) {
                res = res.replace(/「.*?」/g, '');
                // ▼ メーカー名削除に武田テバ等を追加し、先頭・末尾どちらにあっても消す
                res = res.replace(/^(ツムラ|ﾂﾑﾗ|クラシエ|ｸﾗｼｴ|オースギ|ｵｰｽｷﾞ|コタロー|ｺﾀﾛｰ|JG|フソー|ﾌｿｰ|ファイザー|ﾌｧｲｻﾞｰ|マイラン|ﾏｲﾗﾝ|サワイ|ｻﾜｲ|トーワ|ﾄｰﾜ|テバ|ﾃﾊﾞ|アメル|ｱﾒﾙ|日医工|ＮＰ|NP|武田|タケダ|ﾀｹﾀﾞ|武田テバ|明治|Meiji|ﾒｲｼﾞ)/i, '');
                res = res.replace(/(ツムラ|ﾂﾑﾗ|クラシエ|ｸﾗｼｴ|オースギ|ｵｰｽｷﾞ|コタロー|ｺﾀﾛｰ|JG|フソー|ﾌｿｰ|ファイザー|ﾌｧｲｻﾞｰ|マイラン|ﾏｲﾗﾝ|サワイ|ｻﾜｲ|トーワ|ﾄｰﾜ|テバ|ﾃﾊﾞ|アメル|ｱﾒﾙ|日医工|ＮＰ|NP|武田|タケダ|ﾀｹﾀﾞ|武田テバ|明治|Meiji|ﾒｲｼﾞ)$/i, '');
            }
            res = res.replace(/：|退院|★|【般】/g, '');
            res = res.replace(/\(持参薬\)|（持参薬）/g, '');
            res = res.replace(/[ 　]*入院用|[ 　]*入院/g, '');
            // ▼ 【契機外/他院】などを強制的に全削除
            res = res.replace(/【.*?】/g, '');
            return res.trim();
        }

// ==========================================
        // 共通テキスト整理処理 (マクロ・薬剤調整加算 両用)
        // ==========================================
        function processMacroText(rawInput, overrideAddNumber) {
            if (!rawInput) return "";
            var text = formatText(rawInput);
            
            text = text.replace(/([^\r\n])([ \t]*)(Rp\d+)/g, '$1\n$3');
            
            var useAddNumber = false;
            if (typeof overrideAddNumber === "boolean") {
                useAddNumber = overrideAddNumber;
            } else {
                var addNumEl = document.getElementById('set-add-number');
                useAddNumber = !!(addNumEl && addNumEl.checked);
            }
            if (useAddNumber) {
                text = text.replace(/^[ \t]*Rp(\d+).*?[\r\n]+[ \t]*/gm, '$1) ');
            } else {
                text = text.replace(/^[ \t]*.*Rp\d+.*?$[\r\n]*/gm, '');
            }

            text = text.replace(/^[ \t]*.*(?:院外|院内)[\s\(].*\d{4}\/\d{2}\/\d{2}.*?$[\r\n]*/gm, '\n◆外来\n');
            text = text.replace(/^[ \t]*.*\[?(?:定期|臨時|緊急|実施済|退院)\]?.*\d{4}\/\d{2}\/\d{2}.*?$[\r\n]*/gm, '\n◇入院\n');
            text = text.replace(/^[ \t]*.*【持参薬】.*検認.*?(?:\r?\n[^\r\n]*?)?\d{4}\/\d{2}\/\d{2}[^\r\n]*[\r\n]*/gm, '\n▼持参薬検認\n');
            text = text.replace(/^[ \t]*.*【持参薬】(?!.*検認).*?(?:\r?\n[^\r\n]*?)?\d{4}\/\d{2}\/\d{2}[^\r\n]*[\r\n]*/gm, '\n■持参薬\n');


            text = text.replace(/^[ \t]*.*院内[\(].*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*院内採用.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*薬効名称.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*実数入力.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*外来用手術前検認.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*[^ \t]+[ 　]+[^ \t]+\(.*?[科外]\).*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*No\.\d+.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*.*院外専用薬.*?$[\r\n]*/gm, '');
            text = text.replace(/^[ \t]*\d{4}\/\d{2}\/\d{2}[ \t]*(?:朝|昼|夕|眠前)?.*?$[\r\n]*/gm, '');

            text = text.replace(/(\n▼持参薬検認\s*)+/g, '\n▼持参薬検認\n');
            text = text.replace(/(\n■持参薬\s*)+/g, '\n■持参薬\n');
            text = text.replace(/(\n◆外来\s*)+/g, '\n◆外来\n');
            text = text.replace(/(\n◇入院\s*)+/g, '\n◇入院\n');


            text = text.replace(/「.*?」/g, '');
            text = text.replace(/【.*?】/g, '');
            text = text.replace(/[ \t　]+[\d]+日分/g, '');
            text = text.replace(/[ \t　]+[\d]+回分/g, '');
            text = text.replace(/／[\d]+日分/g, '');
            text = text.replace(/／[\d]+回分/g, '');

            var removeKeywords = [
                '2020/', '2021/', '2022/', '2023/', '2024/', '2025/', '2026/',
                '注射後', '開始日', '用法変更', '\\[院外\\]', '血糖[:：]',
                '薬剤師による服用状況確認は未実施です'
            ];
            var removeRegex = new RegExp('^[ \\t]*.*(' + removeKeywords.join('|') + ').*?$[\\r\\n]*', 'gm');
            text = text.replace(removeRegex, '');
            
            var textLines = text.split('\n');
            var detectingClinic = false;
            for (var k = 0; k < textLines.length; k++) {
                if (textLines[k].indexOf('▼持参薬検認') !== -1 || textLines[k].indexOf('■持参薬') !== -1) {

                        } else if (detectingClinic) {
                    if (textLines[k].match(/^[ \t]*Rp.?\d+/i) || textLines[k].match(/^[ \t]*[（\(]持参薬[）\)]/) || textLines[k].match(/^[ \t]*\d+\)/)) {
                        detectingClinic = false;
                    } else {
                        var tmpLine = textLines[k].trim();
                        if (tmpLine !== "" && !tmpLine.match(/^\d{4}\/\d{2}\/\d{2}/) && tmpLine.indexOf('▼') !== 0) {
                            textLines[k] = textLines[k].replace(/^([ \t]*)/, '$1▼');
                        }
                    }
                }
            }
            text = textLines.join('\n');
            
            var lines = text.split('\n');
            for (var i = 0; i < lines.length; i++) {
                if (lines[i].trim() !== "" && !lines[i].startsWith("◆") && !lines[i].startsWith("◇") && !lines[i].startsWith("▼") && !lines[i].startsWith("■")) {
                    lines[i] = cleanDrugName(lines[i]);
                }
            }
            text = lines.join('\n');
            
            text = text.replace(/\(朝・夕\)/g, '朝夕').replace(/\(朝夕\)/g, '朝夕');
            text = text.replace(/\(朝・昼\)/g, '朝昼').replace(/\(昼・夕\)/g, '昼夕');
            text = text.replace(/\(朝・昼･夕\)/g, '朝昼夕');
            text = text.replace(/1回量\[/g, '1回');
            text = text.replace(/\[.*?\]/g, '');
            text = text.replace(/\]/g, '');
            text = text.replace(/^ +/gm, '');

            text = text.replace(/\[\$T\]\r?\n?/g, 'T ');
            text = text.replace(/\[\$C\]\r?\n?/g, 'C ');
            text = text.replace(/\[\$ｷｯﾄ\]\r?\n?/g, 'ﾄ ');
            text = text.replace(/\[\$本\]\r?\n?/g, '本 ');
            text = text.replace(/\[\$枚\]\r?\n?/g, '枚 ');
            text = text.replace(/\[\$袋\]\r?\n?/g, '袋 ');
            text = text.replace(/\[\$包\]\r?\n?/g, '包 ');
            text = text.replace(/\[\$器\]\r?\n?/g, '器 ');
            text = text.replace(/\[\$位\]\r?\n?/g, '位 ');
            text = text.replace(/\[\$箱\]\r?\n?/g, '箱 ');
            text = text.replace(/\[\$缶\]\r?\n?/g, '缶 ');
            text = text.replace(/\[\$g\]\r?\n?/g, 'g ');
            text = text.replace(/\[\$l\]\r?\n?/g, 'l ');
            text = text.replace(/\[\$V\]\r?\n?/g, 'V ');
            text = text.replace(/ﾅﾄﾘｳﾑ/g, 'Na');

            var mergeEl = document.getElementById('set-merge');
            if (mergeEl && mergeEl.checked) {
                var usageStarts = '（持参薬用法）|\\(持参薬用法\\)|分\\d|1日|１日|就寝前|眠前|頓服|毎食|朝夕|朝昼|昼夕|痛い|発熱|週\\d';
                var removeUnits = "個|枚|本|袋|瓶|筒|ﾁｭｰﾌﾞ|チューブ|ｷｯﾄ|キット|V|Ｖ";
                var removeRegex = new RegExp('^(?![ \\t　]*(?:' + usageStarts + '))([ \\t　]*.*?)((?:\\d+(?:\\.\\d+)?)(?:' + removeUnits + '))\\s*[\\r\\n]+[ \\t　]*', 'gim');
                text = text.replace(removeRegex, "$1 ");

                var mergeUnits = "錠|ｶﾌﾟｾﾙ|カプセル|包|ml|mL|mg|g|滴|T|C|Ｔ|Ｃ|回|日分";
                var mergeRegex = new RegExp('^(?![ \\t　]*(?:' + usageStarts + '))([ \\t　]*.*?)((?:\\d+(?:\\.\\d+)?)(?:' + mergeUnits + '))\\s*[\\r\\n]+[ \\t　]*', 'gim');
                text = text.replace(mergeRegex, "$1$2 ");
            }
            return text.replace(/\n\s*\n/g, '\n').trim();
        }

        // ==========================================
        // タブ③: テキスト整理 処理本体
        // ==========================================
        var macroSaveTimer = null;
        var lastMacroType = 'normal'; // ★この行を追加
        function yrRunMacro() {
            lastMacroType = 'normal';
            var rawInput = document.getElementById('macroInput').value;
            if (!rawInput) {
                document.getElementById('macroOutput').value = "";
                return;
            }

            // 新設した共通処理を呼び出す
            var text = processMacroText(rawInput);
            document.getElementById('macroOutput').value = text;
            
            // ★修正: 重たいファイル保存を1秒遅らせて画面のフリーズを防ぐ
            clearTimeout(macroSaveTimer);
            macroSaveTimer = setTimeout(function() {
                saveMacroHistory(rawInput, text);
            }, 1000);
            
            // 薬管1判定パネル更新
            var panel = document.getElementById('macro-tokuyaku-panel');
            var cache = getTokuyakuCache();
            if (panel && cache) {
                var tkLines = text.split('\n');
                var found = [];
                for (var li = 0; li < tkLines.length; li++) {
                    var tkLine = tkLines[li].replace(/^\d+\)\s*/, '').replace(/^[\s　]+/, '');
                    if (!tkLine || /^[◆◇▼■]/.test(tkLine)) continue;
                    var drugPart = tkLine.replace(/\s+\d.*$/, '').replace(/[\(（].*$/, '').trim();
                    if (drugPart.length < 2) continue;
                    var dpNorm = normalizeDrug(drugPart);
                    var dpRoot = extractDrugRoot(drugPart);
                    var matched = false;
                    for (var ti = 0; ti < cache.length; ti++) {
                        if (cache[ti].norm.indexOf(dpNorm) !== -1 || dpNorm.indexOf(cache[ti].norm) !== -1) {
                            matched = true; break;
                        }
                        if (dpRoot.length >= 3 && cache[ti].root.indexOf(dpRoot) === 0) {
                            matched = true; break;
                        }
                        if (cache[ti].root.length >= 3 && dpRoot.indexOf(cache[ti].root) === 0) {
                            matched = true; break;
                        }
                    }
                    if (matched) {
                        var dup = false;
                        for (var fi = 0; fi < found.length; fi++) { if (found[fi] === drugPart) dup = true; }
                        if (!dup) found.push(drugPart);
                    }
                }
                if (found.length > 0) {
                    panel.style.display = 'block';
                    panel.style.background = '#ffebee';
                    panel.style.color = '#c62828';
                    panel.innerHTML = '● <b>薬剤管理指導１対象:</b> ' + found.join('、');
                } else if (tkLines.length > 1) {
                    panel.style.display = 'block';
                    panel.style.background = '#e8f5e9';
                    panel.style.color = '#2e7d32';
                    panel.innerHTML = '✔ 薬管１対象薬剤なし';
                } else {
                    panel.style.display = 'none';
                }
            }
        }

        
        // ==========================================
        // 採血データ整理機能
        // ==========================================
        function processBloodTestText(text) {
            if (!text) return "";
            var lines = text.split('\n');
            var records = [];
            var currentDateStr = "";
            var currentDateObj = null;
            
            for (var i = 0; i < lines.length; i++) {
                var line = lines[i].replace(/^\s+|\s+$/g, '');
                if (!line) continue;
                
                // 日付行かチェック (例: 2026/05/29 08:30)
                var dateMatch = line.match(/(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
                if (dateMatch) {
                    currentDateObj = new Date(parseInt(dateMatch[1], 10), parseInt(dateMatch[2], 10) - 1, parseInt(dateMatch[3], 10));
                    var showYearEl = document.getElementById('set-show-year');
                    if (showYearEl && showYearEl.checked) {
                        currentDateStr = parseInt(dateMatch[1], 10) + "/" + parseInt(dateMatch[2], 10) + "/" + parseInt(dateMatch[3], 10);
                    } else {
                        currentDateStr = parseInt(dateMatch[2], 10) + "/" + parseInt(dateMatch[3], 10);
                    }
                }
                
                // 項目と値のパース (例: TP：5.0 L, ALB：1.8 L)
                // 括弧や日本語を含む項目名にも対応し、値の末尾の H や L は除外する
                var itemRegex = /([^,、:：]+)[\s]*[:：][\s]*([^,、]+)/g;
                var match;
                var hasItems = false;
                var currentItems = {};
                
                while ((match = itemRegex.exec(line)) !== null) {
                    var name = match[1].replace(/^\s+|\s+$/g, '');
                    var val = match[2].replace(/^\s+|\s+$/g, '');
                    
                    // 日付や時刻の誤判定（例: 2026/05/29 08）はスキップ
                    if (/^[\d\/\-\s]+$/.test(name)) continue;
                    
                    // 末尾の異常値マーク( H や L )を除去（前のスペース必須）
                    val = val.replace(/\s+[HLhl]$/, '');
                    
                    currentItems[name] = val;
                    hasItems = true;
                }
                
                if (hasItems && currentDateStr) {
                    records.push({
                        dateObj: currentDateObj,
                        dateStr: currentDateStr,
                        items: currentItems
                    });
                }
            }
            
            // 時系列（古い順）にソート
            records.sort(function(a, b) {
                return a.dateObj.getTime() - b.dateObj.getTime();
            });
            
            // 存在する全項目を取得し、新しい順に登場した順番をベースにする
            var allItemsMap = {};
            var allItemsOrder = [];
            for (var i = records.length - 1; i >= 0; i--) {
                for (var key in records[i].items) {
                    if (!allItemsMap[key]) {
                        allItemsMap[key] = true;
                        allItemsOrder.push(key);
                    }
                }
            }
            
            var outputLines = [];
            for (var j = 0; j < allItemsOrder.length; j++) {
                var key = allItemsOrder[j];
                var parts = [];
                for (var r = 0; r < records.length; r++) {
                    if (records[r].items[key] !== undefined) {
                        parts.push(records[r].dateStr + " " + records[r].items[key]);
                    }
                }
                if (parts.length > 0) {
                    outputLines.push(key + "：" + parts.join(" → "));
                }
            }
            
            return outputLines.join("\n");
        }

        function yrRunBloodMacro() {
            lastMacroType = 'blood';
            var rawInput = document.getElementById('macroInput').value;
            if (!rawInput) {
                document.getElementById('macroOutput').value = "";
                return;
            }
            var text = processBloodTestText(rawInput);
            document.getElementById('macroOutput').value = text;
        }

        function yrReRunMacro() {
            if (lastMacroType === 'blood') yrRunBloodMacro();
            else yrRunMacro();
        }

        function yrCopyMacroResult() {
            var text = document.getElementById('macroOutput').value;
            if (!text) return;
            text = text.replace(/\r?\n/g, '\r\n'); // Windows向けの改行コード（\r\n）強制置換
            try {
                window.clipboardData.setData("Text", text);
                yrShowAlert("整理されたテキストをコピーしました！");
            } catch(err) {
                yrShowAlert("コピーに失敗しました。", "error");
            }
        }

        // ==========================================
        // 履歴モーダル（自動保存・一覧表示）処理
        // ==========================================
        function saveMacroHistory(rawText, outText) {
            if (!rawText) return;
            var historyArr = JSON.parse(myStorage.getItem('macroHistoryList') || '[]');

            if (historyArr.length > 0 && historyArr[0].raw === rawText) {
                return;
            }

            var now = new Date();
            var dateStr = now.toLocaleDateString('ja-JP');
            var timeStr = now.toLocaleTimeString('ja-JP');

            historyArr.unshift({
                datetime: dateStr + " " + timeStr,
                raw: rawText
            });

            if (historyArr.length > 50) {
                historyArr = historyArr.slice(0, 50);
            }

            myStorage.setItem('macroHistoryList', JSON.stringify(historyArr));
        }

        function yrOpenHistoryModal() {
            yrRenderHistoryList();
            document.getElementById('yr-historyModal').style.display = 'flex';
        }

        function yrCloseHistoryModal() {
            document.getElementById('yr-historyModal').style.display = 'none';
        }

        function yrRenderHistoryList() {
            var area = document.getElementById('yr-historyListArea');
            var historyArr = JSON.parse(myStorage.getItem('macroHistoryList') || '[]');

            if (historyArr.length === 0) {
                area.innerHTML = '<div class="text-center text-muted" style="padding:30px; font-size:1.1rem;">変換履歴はまだありません。</div>';
                return;
            }

            var html = '';
            for(var index=0; index<historyArr.length; index++) {
                var item = historyArr[index];
                var safeRaw = (item.raw || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                html += '<div class="yr-history-item"><div class="yr-history-header"><span class="yr-history-time">' + item.datetime + '</span><div><button class="btn btn-outline-secondary btn-sm" onclick="yrLoadHistoryItem(' + index + ')" style="background:white;">✔ 左の入力欄に復元</button></div></div><textarea class="yr-history-textarea" readonly>' + safeRaw + '</textarea></div>';
            }
            area.innerHTML = html;
        }

        function yrLoadHistoryItem(index) {
            var historyArr = JSON.parse(myStorage.getItem('macroHistoryList') || '[]');
            if (historyArr[index]) {
                document.getElementById('macroInput').value = historyArr[index].raw;
                yrRunMacro();
                yrCloseHistoryModal();
                yrShowAlert("履歴からデータを復元し、変換を実行しました。", "info");
            }
        }


        // ==========================================
        // タブ①②: 薬歴自動作成 処理
        // ==========================================

        // ▼ マスターチェックボックスによる全選択/解除と一括ボタンの表示制御
        function yrToggleAllCheckboxes(source) {
            var checkboxes = document.querySelectorAll('.row-checkbox');
            var hasChecked = source.checked;
            for (var i = 0; i < checkboxes.length; i++) {
                var cb = checkboxes[i];
                if (!cb.disabled) {
                    cb.checked = hasChecked;
                }
            }
            yrUpdateMergeButtonVisibility(hasChecked);
        }

        // ▼ 各行のチェックボックス変更時に一括ボタンの表示/非表示を切り替え
        function yrOnRowCheckboxChange() {
            var checkboxes = document.querySelectorAll('.row-checkbox');
            var hasChecked = false;
            for (var i = 0; i < checkboxes.length; i++) {
                if (checkboxes[i].checked) {
                    hasChecked = true;
                    break;
                }
            }
            yrUpdateMergeButtonVisibility(hasChecked);
        }

        // ▼ 結合ボタンの表示切替処理
        function yrUpdateMergeButtonVisibility(show) {
            var btn = document.getElementById('yr-btn-merge-checked');
            if (btn) {
                btn.style.display = show ? 'inline-block' : 'none';
            }
        }

        // 全カテゴリを対象にチェックされた行を一括統合（〇時間毎の自動計算付き）
        function yrMergeCheckedRowsAcrossAll() {
            var allCheckboxes = document.querySelectorAll('.row-checkbox:checked');
            if (allCheckboxes.length < 2) {
                yrShowAlert("統合するには2つ以上の行を選択してください。", "error");
                return;
            }

            // 選ばれた行がすべて「同じカテゴリか」チェックする
            var targetCat = allCheckboxes[0].getAttribute("data-cat");
            for(var c=1; c<allCheckboxes.length; c++) {
                if(allCheckboxes[c].getAttribute("data-cat") !== targetCat) {
                    yrShowAlert("異なるカテゴリにまたがって統合することはできません。\n1つの表の中で選択してください。", "error");
                    return;
                }
            }
            targetCat = parseInt(targetCat, 10);

            var selectedItems = [];
            for(var i=0; i<allCheckboxes.length; i++) {
                var id = allCheckboxes[i].value;
                for(var x=0; x<globalResults[targetCat].length; x++) {
                    if (globalResults[targetCat][x].id === id) {
                        selectedItems.push(globalResults[targetCat][x]);
                        break;
                    }
                }
            }

            if (selectedItems.length < 2) return;

            var firstItemName = selectedItems[0].name;
            var allSameName = true;
            for(var m=0; m<selectedItems.length; m++) {
                if(selectedItems[m].name !== firstItemName) allSameName = false;
            }

            // ① 同じ薬品名同士の場合は旧ロジック（〇時間毎）を適用
            if (allSameName) {
                var count = selectedItems.length;
                var newInst = Math.floor(24 / count) + "時間毎";

                var baseItem = selectedItems[0];
                baseItem.inst = newInst;
                baseItem.fullText = (baseItem.dateStr ? baseItem.dateStr + " " : "")
                    + baseItem.name
                    + (baseItem.dose ? " " + baseItem.dose + baseItem.unit : "")
                    + " " + newInst;

                for (var i = 1; i < selectedItems.length; i++) {
                    selectedItems[i].deleted = true;
                }
                
                var masterCheckbox = document.querySelector('th input[type="checkbox"]');
                if (masterCheckbox) masterCheckbox.checked = false;

                renderTable();
                yrShowAlert(count + "つの行を「" + newInst + "」に統合しました！", "info");
            
            // ② 違う薬品名同士の場合は改行して結合（D&D方式と同じ単純連結）
            } else {
                if (!confirm("異なる名称の薬品が含まれています。\nこのままテキストを改行して結合しますか？")) {
                    return;
                }
                var sep = (targetCat === 1) ? "\n" : "\n";
                var combinedStr = "";
                for(var k=0; k<selectedItems.length; k++){
                    if(k>0) combinedStr += sep;
                    combinedStr += selectedItems[k].fullText;
                }
                
                var baseItemDiff = selectedItems[0];
                baseItemDiff.fullText = combinedStr;
                baseItemDiff.dose = "-";
                baseItemDiff.unit = "-";
                baseItemDiff.inst = "-";
                
                for(var n=1; n<selectedItems.length; n++){
                    selectedItems[n].deleted = true;
                }
                
                var masterCheckbox2 = document.querySelector('th input[type="checkbox"]');
                if (masterCheckbox2) masterCheckbox2.checked = false;

                renderTable();
                yrShowAlert("行を統合しました。", "info");
            }
            
            yrUpdateMergeButtonVisibility(false); // 処理完了後はボタン非表示にする
        }

        // --- ドラッグ＆ドロップによる行統合 ---
        var yrDragSourceId = null;
        var yrDragSourceCat = null;

        // --- IE互換用closest代替 ---
        function yrGetClosestTr(el) {
            while (el) {
                if (el.tagName && el.tagName.toLowerCase() === 'tr') return el;
                el = el.parentNode;
            }
            return null;
        }

        function yrRowDragStart(e, cat, id) {
            yrDragSourceId = id;
            yrDragSourceCat = cat;
            e.dataTransfer.effectAllowed = 'move';
            
            // IEは 'text/plain' ではなく 'text' を指定する必要がある
            try { e.dataTransfer.setData('text', id); } catch(ex){}
            
            e.target.style.opacity = '0.5';
        }

        function yrRowDragOver(e) {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            
            var tr = yrGetClosestTr(e.target);
            if (tr && tr.getAttribute('draggable') === 'true') {
                tr.style.backgroundColor = '#e8f4f8';
                tr.style.outline = '2px dashed #0d6efd';
            }
        }

        function yrRowDragLeave(e) {
            var tr = yrGetClosestTr(e.target);
            if (tr) {
                tr.style.backgroundColor = '';
                tr.style.outline = '';
            }
        }

        function yrRowDrop(e, targetCat, targetId) {
            e.preventDefault();
            var tr = yrGetClosestTr(e.target);
            if (tr) {
                tr.style.backgroundColor = '';
                tr.style.outline = '';
            }
            
            // ドラッグ元を変数から取得
            var sourceId = yrDragSourceId;
            var sourceCat = yrDragSourceCat;
            yrDragSourceId = null;
            yrDragSourceCat = null;

            if (!sourceId || sourceId === targetId) return;
            if (sourceCat !== targetCat) {
                yrShowAlert("異なるカテゴリの行は統合できません。", "error");
                return;
            }

            var cat = targetCat;
            var sourceItem = null;
            var targetItem = null;
            
            // sourceとtargetの取得
            for (var i=0; i<globalResults[cat].length; i++) {
                if (globalResults[cat][i].id === sourceId) sourceItem = globalResults[cat][i];
                if (globalResults[cat][i].id === targetId) targetItem = globalResults[cat][i];
            }
            
            if (!sourceItem || !targetItem) return;

            // D&D時の確認ダイアログを削除（即時実行する）
            
            // 同名薬品かどうかの判定
            if (sourceItem.name === targetItem.name) {
                // 初回の結合か、すでに結合されたものかを判定してカウント用プロパティを作る
                var targetCount = targetItem.mergeCount || 1;
                var sourceCount = sourceItem.mergeCount || 1;
                var totalCount = targetCount + sourceCount;
                
                var newInst = Math.floor(24 / totalCount) + "時間毎";
                
                targetItem.inst = newInst;
                targetItem.fullText = (targetItem.dateStr ? targetItem.dateStr + " " : "")
                    + targetItem.name
                    + (targetItem.dose ? " " + targetItem.dose + targetItem.unit : "")
                    + " " + newInst;
                    
                targetItem.mergeCount = totalCount;
                
                // ドロップ元を削除扱いにする
                sourceItem.deleted = true;
                
                renderTable();
                yrShowAlert(totalCount + "つの行を「" + newInst + "」に統合しました！", "info");

            } else {
                // 異なる薬品名の場合は単純結合（改行）
                var sep = (cat === 1) ? "\n" : (cat === 2 ? "\n" : "\n");
                var combinedStr = targetItem.fullText + sep + sourceItem.fullText;
                
                // ベース行（ドロップ先）を更新
                targetItem.fullText = combinedStr;
                targetItem.dose = "-";
                targetItem.unit = "-";
                targetItem.inst = "-";
                
                // ドロップ元を削除扱いにする
                sourceItem.deleted = true;

                renderTable();
                yrShowAlert("行を統合しました。", "info");
            }
        }


        function yrReadFromClipboard() {
            try {
                var text = window.clipboardData.getData("Text");
                if (!text || text.trim() === "") {
                    yrShowAlert("クリップボードにテキストデータがありません。", "error");
                    return;
                }
                
                // 表形式のコピー時に列区切り(タブ)が消えて取得されるHTA特有の現象の検知
                var lines = text.split('\n');
                if (text.indexOf('\t') === -1 && lines.length > 2) {
                    yrShowAlert("クリップボード直接取得では列の区切りが失われてしまいます。<br>お手数ですが、タブ②の入力欄へ直接 貼り付け(Ctrl+V) して[薬歴作成]を実行してください。", "warning");
                    document.getElementById('rawInput').value = text;
                    yrSwitchTab('yr-tab-data', document.querySelectorAll('.yr-nav-link')[1]);
                    return;
                }
                
                document.getElementById('rawInput').value = text;
                yrProcessData(text);
                yrSwitchTab('yr-tab-result', document.querySelector('.yr-nav-link'));
            } catch (err) {
                yrShowAlert("クリップボードからの読み込みに失敗しました。<br>タブ②を開いて、テキストエリアに直接貼り付け(Ctrl+V)てください。", "error");
                yrSwitchTab('yr-tab-data', document.querySelectorAll('.yr-nav-link')[1]);
            }
        }

        function yrProcessData(rawData) {
            if (!rawData || rawData.trim() === "") return;

            var baseDateStr = document.getElementById('baseDate').value;
            if (!baseDateStr) {
                yrShowAlert("基準日を入力してください。", "error");
                return;
            }
            var baseDate = new Date(baseDateStr);
            var includeTiming = document.getElementById('includeTiming').value === "true";
            var isMergeEnabled = document.getElementById('set-merge').checked;

            globalResults = { 1: [], 2: [], 3: [] };
            currentSorts = { 1: 'default', 2: 'default', 3: 'default' };
            uniqueIdCounter = 0;

            var lines = rawData.split('\n');
            var maxDay = 0;

            for(var idxLine=0; idxLine<lines.length; idxLine++) { var line = lines[idxLine];
                var cols = line.split('\t');
                if (cols.length > 5 && (cols.length - 6) > maxDay) {
                    maxDay = cols.length - 6;
                }
            }

            var rDay = [], rDrug = [], rDose = [], rUnit = [], rInst = [];
            var rCat = [], rTm = [], rPRN = [], rIV = [], rPresc = [], rOrigIdx = [];
            var rSliding = [], rPeriOp = [], rIvTime = [];

            var curCategory = 1;
            var curTiming = "";
            var curPrescDay = -1;
            var currentIvBlockPeriOp = false;
            var curIvTimeStr = "";
            var curIvBlockFirstDay = -1;
            var curInjectTimeMark = "";

            for (var r = 0; r < lines.length; r++) {
                var rowStr = lines[r];
                if (!rowStr.trim()) continue;

                var cols = rowStr.replace(/\r/g, '').split('\t');

                // ★ 1列目が数字のみの場合は列をシフトして削除する（No付コピー対策）
                if (cols.length > 1 && /^[0-9０-９]+$/.test(cols[0].trim())) {
                    cols.shift();
                }

                var rawName = cols[0] || "";
                // ★ セル内の先頭に「数字＋スペース」がある場合も削除
                rawName = rawName.replace(/^[0-9０-９]+[ 　]+/, '');

                var drugName = cleanDrugName(formatText(rawName.trim()));

                // cols[0]が空の場合、他のカラムから点滴/静注等のヘッダーを探す
                if (!rawName) {
                    var foundIvHeader = false;
                    for (var ci = 1; ci < Math.min(cols.length, 6); ci++) {
                        var chk = formatText((cols[ci] || "").trim());
                        if (chk.indexOf("点滴") === 0 || chk.indexOf("静注") === 0 || chk.indexOf("皮下注") === 0 || chk.indexOf("その他注") === 0) {
                            drugName = chk;
                            rawName = chk;
                            foundIvHeader = true;
                            break;
                        }
                    }
                    if (!foundIvHeader) continue;
                }

                if (drugName.startsWith("[")) {
                    var tmpArr = drugName.substring(drugName.indexOf("]") + 1).split(" ");
                    curTiming = "";
                    if (tmpArr.length > 0) {
                        var lastWord = tmpArr[tmpArr.length - 1].trim().split("(")[0];
                        if (lastWord) curTiming = lastWord;
                        else if (tmpArr.length > 1) curTiming = tmpArr[1].trim().split("(")[0];
                    }

                    curPrescDay = -1;
                    for (var c = 1; c < cols.length; c++) {
                        var cell = cols[c].trim();
                        if (["●", "◯", "○", "◎", "▲", "*"].indexOf(cell) !== -1) {
                            curPrescDay = c;
                            break;
                        }
                    }
                    continue;
                }

                if (drugName === "点滴" || drugName.startsWith("点滴 ") || drugName.startsWith("点滴　") ||
                    drugName === "静注" || drugName.startsWith("静注 ") || drugName.startsWith("静注　") ||
                    drugName === "皮下注" || drugName.startsWith("皮下注 ") || drugName.startsWith("皮下注　") ||
                    drugName === "その他注" || drugName.startsWith("その他注 ") || drugName.startsWith("その他注　")) {

                    curCategory = 3;
                    curPrescDay = -1;
                    currentIvBlockPeriOp = false;
                    curIvTimeStr = "";
                    curIvBlockFirstDay = -1;
                    curInjectTimeMark = "";

                    for (var c = 1; c < cols.length; c++) {
                        var cell = cols[c].trim();
                        if (["●", "◯", "○", "◎", "▲", "*"].indexOf(cell) !== -1) {
                            curPrescDay = c;
                            break;
                        }
                    }

                    var blockHasPeriOp = false;
                    for (var pr = r + 1; pr < lines.length; pr++) {
                        if (lines[pr].trim() === "" || lines[pr].startsWith("[")) break;
                        var pCols = lines[pr].replace(/\r/g, '').split('\t');
                        var prName = formatText(pCols[0] || "").trim();

                        if (prName === "点滴" || prName.startsWith("点滴 ") ||
                            prName === "静注" || prName.startsWith("静注 ") ||
                            prName === "皮下注" || prName.startsWith("皮下注 ") ||
                            prName === "その他注" || prName.startsWith("その他注 ")) break;

                        for (var pc = 5; pc < pCols.length; pc++) {
                            if (["●", "◯", "○", "◎", "▲", "*"].indexOf(pCols[pc].trim()) !== -1) {
                                if (curIvBlockFirstDay === -1 || (pc - 5) < curIvBlockFirstDay) {
                                    curIvBlockFirstDay = pc - 5;
                                }
                            }
                        }

                        if (prName && prName.indexOf("開始時刻") === -1 && prName.match(/^[0-9]+:[0-9]+/) === null && prName.indexOf("mL/時") === -1 && prName.indexOf("キット生食") === -1 && prName.indexOf("静注用") === -1 && prName.indexOf("ソリタ") === -1 && prName.indexOf("アセリオ") === -1 && prName.indexOf("生理食塩液") === -1 && prName.indexOf("血糖") === -1) {
                            if (/(Ope|ope|帰室|持参|抜針|ルート|から|まで|以降|手術|術前|術後)/i.test(prName)) {
                                blockHasPeriOp = true;
                            }
                        }
                    }
                    currentIvBlockPeriOp = blockHasPeriOp;
                    continue;
                }

                if (curCategory === 3) {
                    var timeMatch = drugName.match(/^([0-9]+):([0-9]+)(?:[ 　]+<(.*?)>)?/);
                    if (timeMatch && drugName.indexOf("mL/時") === -1 && drugName.indexOf("単位") === -1) {
                        curIvTimeStr = drugName.split(/[ 　]+/)[0].trim();
                        var hh = parseInt(timeMatch[1], 10);
                        var mark = timeMatch[3];

                        if (mark) {
                            if (mark.indexOf("朝") !== -1) curInjectTimeMark = "朝";
                            else if (mark.indexOf("昼") !== -1) curInjectTimeMark = "昼";
                            else if (mark.indexOf("夕") !== -1) curInjectTimeMark = "夕";
                            else if (mark.indexOf("眠") !== -1) curInjectTimeMark = "眠前";
                            else curInjectTimeMark = mark;
                        } else {
                            if (hh >= 5 && hh <= 10) curInjectTimeMark = "朝";
                            else if (hh >= 11 && hh <= 15) curInjectTimeMark = "昼";
                            else if (hh >= 16 && hh <= 20) curInjectTimeMark = "夕";
                            else curInjectTimeMark = "眠前";
                        }
                        continue;
                    } else if (drugName.match(/^[0-9]+:[0-9]+[ 　]*～/)) {
                        curIvTimeStr = drugName.split("～")[0].trim();
                        continue;
                    } else if (drugName.indexOf("開始時刻指定無し") !== -1) {
                        curIvTimeStr = cleanDrugName(formatText(cols[0].trim()));
                        continue;
                    }
                }

                if (rawName.startsWith("　") || rawName.startsWith(" ")) continue;
                if (drugName.indexOf("～") !== -1 || drugName === "開始時刻指定無し" || drugName.indexOf("血糖:") !== -1 || drugName.indexOf("血糖：") !== -1 || drugName.match(/^[0-9]+:[0-9]+[ 　]+[0-9]+[ 　]+回/)) continue;
                if (drugName.indexOf("手術室持参") !== -1 || drugName.indexOf("院内") !== -1 || drugName.indexOf("薬効名称") !== -1 || drugName.indexOf("夕食後に変更可") !== -1 || drugName.indexOf("実数入力") !== -1 || drugName.indexOf("外来用手術前検認") !== -1 || drugName.indexOf("薬剤師による服用状況確認は未実施です") !== -1) continue;

                if (curCategory === 1) {
                    var isBroughtIn = false;
                    for (var peekR = r + 1; peekR <= r + 5 && peekR < lines.length; peekR++) {
                        var pLine = lines[peekR].replace(/\r/g, '');
                        if (!pLine.trim()) continue; // 空行はスキップ
                        var pCols = pLine.split('\t');
                        // 全列を結合して「薬効名称」「院内」を検索
                        var pJoined = pCols.join(' ');
                        if (pJoined.indexOf("薬効名称") !== -1 || pJoined.indexOf("院内") !== -1 || pJoined.indexOf("院外専用") !== -1) {
                            isBroughtIn = true; break;
                        }
                        // 次の薬品行（先頭が全角/半角スペースでない＝新しい薬剤）に到達したら終了
                        var pVal = pCols[0] || "";
                        if (pVal && !pVal.startsWith("　") && !pVal.startsWith(" ")) break;
                    }
                    if (isBroughtIn) curCategory = 2;
                }

                var isSliding = false;
                for (var peekR = r + 1; peekR <= r + 8 && peekR < lines.length; peekR++) {
                    var pCols = lines[peekR].replace(/\r/g, '').split('\t');
                    var pVal = pCols[0] ? formatText(pCols[0].trim()) : "";
                    if (pVal.indexOf("血糖:") !== -1 || pVal.indexOf("血糖：") !== -1 || pVal.indexOf("の時") !== -1) {
                        isSliding = true;
                        break;
                    }
                    if (pVal && !pVal.startsWith(" ") && !pVal.startsWith("　") && pVal.indexOf("血糖") === -1) {
                        break;
                    }
                }

                var dDose = formatText(cols[1] ? cols[1].trim() : "");
                var dUnit = formatText(cols[2] ? cols[2].trim() : "");
                var dInst = formatText(cols[4] ? cols[4].trim() : "");
                var isPRN = dInst.indexOf("頓用") !== -1;
                var isIV = (curCategory === 3 || dInst.indexOf("静注") !== -1 || dInst.indexOf("点滴") !== -1 || dInst.indexOf("皮下注") !== -1 || dInst === "");

                var extractedComment = "";
                if (isIV && currentIvBlockPeriOp) {
                    for (var offset = -2; offset <= 2; offset++) {
                        var targetIdx = r + offset;
                        if (targetIdx >= 0 && targetIdx < lines.length && targetIdx !== r) {
                            var tCols = lines[targetIdx].replace(/\r/g, '').split('\t');
                            var tName = tCols[0] ? formatText(tCols[0].trim()) : "";
                            if (tName && tName.startsWith("[") === false && tName.startsWith("点滴") === false && tName.startsWith("静注") === false && tName.startsWith("皮下注") === false && tName.indexOf("開始時刻") === -1 && tName.indexOf("mL/時") === -1 && tName.match(/^[0-9]+:[0-9]+/) === null && tName.indexOf("キット生食") === -1 && tName.indexOf("静注用") === -1 && tName.indexOf("生理食塩液") === -1) {
                                if (/(Ope|ope|帰室|持参|抜針|ルート|から|まで|以降|手術|術前|術後)/i.test(tName)) {
                                    extractedComment = tName.replace(/^[①②③④⑤⑥⑦⑧⑨⑩]/, '').trim();
                                    break;
                                }
                            }
                        }
                    }
                }

                if (isSliding) {
                    dDose = "";
                    dUnit = "";
                } else if (isIV && dUnit.indexOf("単位") !== -1 && curInjectTimeMark) {
                    dDose = curInjectTimeMark + dDose;
                    dInst = "";
                }

                for (var c = 5; c < cols.length; c++) {
                    var cellVal = cols[c].trim();
                    if (cellVal === "*") isPRN = true;
                    if (["●", "◯", "○", "◎", "▲", "*"].indexOf(cellVal) !== -1) {
                        var dayIdx = c - 5;
                        rDay.push(dayIdx);
                        rDrug.push(drugName);
                        rDose.push(dDose);
                        rUnit.push(dUnit);
                        rInst.push(extractedComment ? extractedComment : dInst);
                        rCat.push(curCategory);
                        rTm.push(curTiming);
                        rPRN.push(isPRN);
                        rIV.push(isIV);
                        rPresc.push(curPrescDay);
                        rOrigIdx.push(r);
                        rSliding.push(isSliding);
                        rPeriOp.push(isIV && currentIvBlockPeriOp && (dayIdx === curIvBlockFirstDay));
                        rIvTime.push(curIvTimeStr);
                    }
                }
            }

            var insulinMap = {};
            var toRemove = {};
            for (var i = 0; i < rDay.length; i++) {
                if (rIV[i] && rUnit[i].indexOf("単位") !== -1 && !rSliding[i] && !rPeriOp[i]) {
                    var key = rDay[i] + "|" + rDrug[i];
                    if (insulinMap.hasOwnProperty(key)) {
                        var firstIdx = insulinMap[key];
                        rDose[firstIdx] += " " + rDose[i];
                        toRemove[i] = true;
                    } else {
                        insulinMap[key] = i;
                    }
                }
            }

            var dictProf = {};
            var dictOngoing = {};
            var dictOrigIdx = {};

            for (var i = 0; i < rDay.length; i++) {
                if (toRemove[i]) continue;

                var compInst = rInst[i];

                if (rIV[i]) {
                    var specKey = rDrug[i] + "|" + rDose[i] + "|" + rUnit[i] + "|" + rDay[i];

                    if (rSliding[i]) {
                        compInst = "インスリンスライディング";
                    } else if (rPeriOp[i]) {
                        compInst = rInst[i];
                    } else if (rUnit[i].indexOf("単位") === -1) {
                        var t = rIvTime[i] || "";
                        var c = rInst[i] || "";

                        if (c === "静注" || c === "点滴" || c === "皮下注" || c === "その他注") {
                            c = "";
                        }

                        if (t && c && t.indexOf(c) === -1 && c.indexOf(t) === -1) {
                            compInst = t + " " + c;
                        } else if (t && c && t.indexOf(c) !== -1) {
                            compInst = t;
                        } else if (t && c && c.indexOf(t) !== -1) {
                            compInst = c;
                        } else {
                            compInst = t || c;
                        }
                    }
                }

                var pKeyArray = [rCat[i], rDrug[i], rDose[i], rUnit[i], compInst, rTm[i], rPRN[i], rPeriOp[i], rSliding[i]];
                if (!isMergeEnabled) {
                    pKeyArray.push(rOrigIdx[i]);
                }
                var pKey = pKeyArray.join('\t');

                if (!dictOrigIdx.hasOwnProperty(pKey)) dictOrigIdx[pKey] = rOrigIdx[i];

                if (rDay[i] === 0) {
                    if (!dictOngoing.hasOwnProperty(pKey)) {
                        dictOngoing[pKey] = (rPresc[i] === -1);
                    }
                }

                if (!dictProf.hasOwnProperty(pKey)) {
                    // new Array(maxDay + 2).fill(false) のPolyfill代わり
                    var emptyArr = [];
                    for(var fn=0; fn < maxDay + 2; fn++) emptyArr.push(false);
                    dictProf[pKey] = emptyArr;
                }
                dictProf[pKey][rDay[i]] = true;
            }

            // MapのforEachをObjectのfor...inループに変更
            for (var k in dictProf) {
                if (!dictProf.hasOwnProperty(k)) continue;
                var arrD = dictProf[k];
                var pStr = k.split('\t');
                var cat = parseInt(pStr[0]);
                var name = pStr[1];
                var dose = pStr[2];
                var unit = pStr[3];
                var inst = pStr[4];
                var timing = pStr[5];
                var isPrnFlag = pStr[6] === "true";
                var isPeriOpFlag = pStr[7] === "true";
                var origIdx = dictOrigIdx[k];

                var isOngoingFromPast = dictOngoing.hasOwnProperty(k) ? dictOngoing[k] : false;

                var blocks = [];
                var inBlock = false;
                var bStart = 0;

                for (var d = 0; d <= maxDay + 1; d++) {
                    if (arrD[d] && !inBlock) {
                        bStart = d; inBlock = true;
                    } else if (!arrD[d] && inBlock) {
                        blocks.push([bStart, d - 1]); inBlock = false;
                    }
                }

                var dateStr = "";
                var firstStartDay = blocks.length > 0 ? blocks[0][0] : 999;

                for(var idxB=0; idxB<blocks.length; idxB++) { var blk = blocks[idxB];
                    var bS = blk[0];
                    var bE = blk[1];
                    var isThisBlockOngoing = (bS === 0 && isOngoingFromPast);

                    if (isPrnFlag) {
                        var prnDate = "";
                        if (!isThisBlockOngoing) {
                            var d = new Date(baseDate); d.setDate(d.getDate() + bS);
                            prnDate = (d.getMonth() + 1) + "/" + d.getDate() + "-";
                        }
                        if (prnDate) {
                            dateStr = dateStr === "" ? prnDate : dateStr + "、" + prnDate;
                        }
                    } else {
                        var sD = new Date(baseDate); sD.setDate(sD.getDate() + bS);
                        var eD = new Date(baseDate); eD.setDate(eD.getDate() + bE);
                        var sTxt = (sD.getMonth() + 1) + "/" + sD.getDate();
                        var eTxt = (eD.getMonth() + 1) + "/" + eD.getDate();
                        var isOngoing = (bE === maxDay);

                        if (includeTiming && cat !== 3 && timing !== "") {
                            sTxt += timing;
                            var eTm = "";
                            var match = inst.match(/[（(]([^)）]+)[)）]/);
                            if (match) {
                                var uArr = match[1].replace(/，/g, '・').replace(/、/g, '・').split('・');
                                var sIdx = uArr.indexOf(timing);
                                if (sIdx >= 0) {
                                    eTm = uArr[(sIdx - 1 + uArr.length) % uArr.length];
                                }
                            }
                            if (eTm !== "") eTxt += eTm;

                            if (isThisBlockOngoing) {
                                sTxt = isOngoing ? "-" : "-" + eTxt;
                            } else {
                                if (isOngoing) sTxt += "-";
                                else if (bS === bE) {
                                    if (eTm !== "" && timing !== eTm) sTxt += "-" + eTxt;
                                } else {
                                    sTxt += "-" + eTxt;
                                }
                            }
                        } else {
                            if (isThisBlockOngoing) {
                                sTxt = isOngoing ? "-" : "-" + eTxt;
                            } else {
                                if (isOngoing) sTxt += "-";
                                else if (bS !== bE) sTxt += "-" + eTxt;
                            }
                        }

                        dateStr = dateStr === "" ? sTxt : dateStr + "，" + sTxt;
                    }
                }

                if (isPeriOpFlag && dateStr.indexOf("-") !== -1) {
                    dateStr = dateStr.split("-")[0];
                }

                var originalInst = "";
                for(var oKey in dictOrigIdx){
                     if (dictOrigIdx.hasOwnProperty(oKey) && dictOrigIdx[oKey] === origIdx) {
                         originalInst = oKey.split('\t')[4];
                     }
                }

                var displayInst = inst || originalInst;
                var fullText = (dateStr ? dateStr + " " : "") + name + (dose ? " " + dose + unit : "") + (displayInst ? " " + displayInst : "");

                var itemId = "row_" + uniqueIdCounter++;

                globalResults[cat].push({
                    id: itemId,
                    dateStr: dateStr, name: name, dose: dose, unit: unit, inst: displayInst, fullText: fullText,
                    origIdx: origIdx, firstStartDay: firstStartDay
                });
            } // Object for...in loop の終端

            if (document.getElementById('set-remove-iv-words') && document.getElementById('set-remove-iv-words').checked) {
                var ivWordsRegex = /バイアル用|ﾊﾞｲｱﾙ用|アンプル用|ｱﾝﾌﾟﾙ用|ロック用|ﾛｯｸ用/;
                for (var c = 1; c <= 3; c++) {
                    globalResults[c] = globalResults[c].filter(function(item) {
                        var txt = (item.name || '') + ' ' + (item.fullText || '');
                        return !ivWordsRegex.test(txt);
                    });
                }
            }

            if (globalResults[1].length === 0 && globalResults[2].length === 0 && globalResults[3].length === 0) {
                yrShowAlert("該当するデータが見つかりませんでした。", "error");
            } else {
                yrShowAlert("薬歴の作成が完了しました！", "info");
            }

            renderTable();
        }

function renderTable() {
    var tbody = document.querySelector('#yr-resultTable tbody');
    tbody.innerHTML = "";
    var tokuyakuCount = 0;
    var highlightEnabled = document.getElementById('set-tokuyaku-highlight') && document.getElementById('set-tokuyaku-highlight').checked;
    
    var createHeader = function(cat, title, cssClass) {
        if (globalResults[cat].length === 0) return;
        var tr = document.createElement('tr');
        tr.className = cssClass;
        var currentVal = currentSorts[cat];
        
        var h = [];
        h.push('<td colspan="7"><div class="yr-cat-header"><span class="yr-cat-title">【 ' + title + ' 】</span>');
        h.push('<span style="font-size:11px; color:#666; margin-left:10px;">※ 他の行をドラッグ＆ドロップで重ねると統合されます</span>');
        h.push('<div style="display: flex; gap: 10px; align-items: center;"><select class="yr-form-select" style="width:auto;" onchange="sortCategory(' + cat + ', this.value)">');
        h.push('<option value="default" ' + (currentVal === 'default' ? 'selected' : '') + '>▼ 並び替え (元の順)</option>');
        h.push('<option value="date_asc" ' + (currentVal === 'date_asc' ? 'selected' : '') + '>日付 (古い順)</option>');
        h.push('<option value="date_desc" ' + (currentVal === 'date_desc' ? 'selected' : '') + '>日付 (新しい順)</option>');
        h.push('<option value="name_asc" ' + (currentVal === 'name_asc' ? 'selected' : '') + '>薬品名 (昇順 ｱ-ﾝ)</option>');
        h.push('<option value="name_desc" ' + (currentVal === 'name_desc' ? 'selected' : '') + '>薬品名 (降順 ﾝ-ｱ)</option>');
        h.push('</select></div></div></td>');
        tr.innerHTML = h.join('');
        tbody.appendChild(tr);
    };

    var createRows = function(cat) {
        for(var m=0; m<globalResults[cat].length; m++){
            var item = globalResults[cat][m];
            var tr = document.createElement('tr');
            var isDeleted = item.deleted;
            var isTk = isDeleted ? false : isTokuyaku(item.name);
            var tkStyle = isTk ? 'color:#c62828; font-weight:bold;' : 'font-weight: bold; color: #2c3e50;';
            if (isTk) tokuyakuCount++;
            if (isDeleted) tr.style.cssText = 'text-decoration:line-through; opacity:0.4; background:#f9f9f9;';
            
            var delBtnTitle = isDeleted ? '復帰' : 'この行を除外';
            var delBtnStyle = isDeleted ? 'yr-btn-success-sm' : 'yr-btn-danger-sm';
            var delBtnIcon = isDeleted ? '&#8634;' : '&#10006;';
            
            var dragAttrs = isDeleted ? '' : ' draggable="true" ondragstart="yrRowDragStart(event, ' + cat + ', \'' + item.id + '\')" ondragover="yrRowDragOver(event)" ondragleave="yrRowDragLeave(event)" ondrop="yrRowDrop(event, ' + cat + ', \'' + item.id + '\')" title="重ねて統合" style="cursor: grab;"';
            
            var rowH = [];
            rowH.push('<td class="yr-text-center"' + dragAttrs + '>' + item.dateStr + '</td>');
            rowH.push('<td style="' + tkStyle + '"' + dragAttrs + '>' + (isTk ? '&#128308; ' : '') + item.name + '</td>');
            rowH.push('<td class="yr-text-center"' + dragAttrs + '>' + item.dose + '</td>');
            rowH.push('<td class="yr-text-center"' + dragAttrs + '>' + item.unit + '</td>');
            rowH.push('<td' + dragAttrs + '>' + item.inst + '</td>');
            rowH.push('<td class="yr-text-center"><input type="checkbox" class="row-checkbox" value="' + item.id + '" data-cat="' + cat + '" onchange="yrOnRowCheckboxChange()"' + (isDeleted ? ' disabled' : '') + '></td>');
            rowH.push('<td class="yr-text-center"><button class="' + delBtnStyle + '" onclick="yrDeleteRow(' + cat + ', \'' + item.id + '\')" title="' + delBtnTitle + '">' + delBtnIcon + '</button></td>');
            rowH.push('<td style="padding: 0;"><div class="yr-editable-cell" contenteditable="' + (isDeleted ? 'false' : 'true') + '" onfocus="document.execCommand(\'selectAll\',false,null)" onblur="updateText(' + cat + ', \'' + item.id + '\', this.innerText)" onkeydown="handleEnter(event, this)">' + item.fullText + '</div></td>');
            tr.innerHTML = rowH.join('');
            tbody.appendChild(tr);
        }
    };

    createHeader(1, '内服薬', 'yr-cat-oral');
    createRows(1);
    createHeader(2, '持参薬', 'yr-cat-injection');
    createRows(2);
    createHeader(3, '点滴・注射', 'yr-cat-external');
    createRows(3);
    
    var summaryEl = document.getElementById('yr-tokuyaku-summary');
    if (!summaryEl) {
        summaryEl = document.createElement('div');
        summaryEl.id = 'yr-tokuyaku-summary';
        summaryEl.style.cssText = 'font-size:12px; margin-bottom:5px; padding:4px 8px; border-radius:4px;';
        var tbl = document.getElementById('yr-resultTable');
        if (tbl) tbl.parentNode.insertBefore(summaryEl, tbl);
    }
    var totalItems = globalResults[1].length + globalResults[2].length + globalResults[3].length;
    if (totalItems > 0 && highlightEnabled && tokuyakuCount > 0) {
        summaryEl.style.display = 'block';
        summaryEl.style.background = '#ffebee';
        summaryEl.style.color = '#c62828';
        summaryEl.innerHTML = '● <b>薬剤管理指導１対象: ' + tokuyakuCount + '件</b> / 全' + totalItems + '件';
    } else if (totalItems > 0 && highlightEnabled) {
        summaryEl.style.display = 'block';
        summaryEl.style.background = '#e8f5e9';
        summaryEl.style.color = '#2e7d32';
        summaryEl.innerHTML = '✔ 薬管１対象薬剤なし (全' + totalItems + '件)';
    } else {
        summaryEl.style.display = 'none';
    }

    if (tbody.innerHTML === "") {
        tbody.innerHTML = '<tr><td colspan="8" class="text-center text-muted" style="padding: 30px;">データがありません。</td></tr>';
    }
}
        function sortCategory(cat, sortType) {
            currentSorts[cat] = sortType;
            var arr = globalResults[cat];

            if (sortType === 'default') {
                arr.sort(function(a, b) { return a.origIdx - b.origIdx; });
            } else if (sortType === 'date_asc') {
                arr.sort(function(a, b) { return a.firstStartDay - b.firstStartDay || a.name.localeCompare(b.name, 'ja') || a.origIdx - b.origIdx; });
            } else if (sortType === 'date_desc') {
                arr.sort(function(a, b) { return b.firstStartDay - a.firstStartDay || a.name.localeCompare(b.name, 'ja') || a.origIdx - b.origIdx; });
            } else if (sortType === 'name_asc') {
                arr.sort(function(a, b) { return a.name.localeCompare(b.name, 'ja') || a.firstStartDay - b.firstStartDay || a.origIdx - b.origIdx; });
            } else if (sortType === 'name_desc') {
                arr.sort(function(a, b) { return b.name.localeCompare(a.name, 'ja') || a.firstStartDay - b.firstStartDay || a.origIdx - b.origIdx; });
            }
            renderTable();
        }

        function updateText(cat, id, newText) {
            var item = null; for(var kz=0;kz<globalResults[cat].length;kz++){if(globalResults[cat][kz].id===id) item=globalResults[cat][kz];}
            if (item) {
                item.fullText = newText.replace(/\r?\n/g, "");
            }
        }

        function handleEnter(e, el) {
            if (e.key === 'Enter') {
                e.preventDefault();
                el.blur();
            }
        }

        function yrDeleteRow(cat, id) {
            var useSoftDelete = document.getElementById('set-softdelete') && document.getElementById('set-softdelete').checked;
            for (var kz = 0; kz < globalResults[cat].length; kz++) {
                if (globalResults[cat][kz].id === id) {
                    if (useSoftDelete) {
                        globalResults[cat][kz].deleted = !globalResults[cat][kz].deleted;
                    } else {
                        globalResults[cat].splice(kz, 1);
                    }
                    break;
                }
            }
            renderTable();
        }

        function yrCopyResultTable() {
            var copyText = "";

            var appendText = function(cat) {
                if (globalResults[cat].length > 0) {
                    for(var i2=0; i2<globalResults[cat].length; i2++) { var item = globalResults[cat][i2];
                        if (!item.deleted) copyText += item.fullText + "\r\n";
                    }
                }
            };

            if (globalResults[1].length > 0) copyText += "【内服・外用等】\r\n";
            appendText(1);
            if (globalResults[2].length > 0) copyText += "【持参薬】\r\n";
            appendText(2);
            if (globalResults[3].length > 0) copyText += "【点滴】\r\n";
            appendText(3);

            if (copyText === "") {
                yrShowAlert("コピーするデータがありません。", "error");
                return;
            }

            try {
                window.clipboardData.setData("Text", copyText);
                yrShowAlert("作成された薬歴テキストをクリップボードにコピーしました！<br>カルテ等の入力欄にそのまま貼り付け(Ctrl+V)できます。");
            } catch(err) {
                yrShowAlert("コピーに失敗しました。", "error");
            }
        }

        function yrInit() {
            // --- Migration for dischargedArchive ---
            if (appData && appData.dischargedArchive) {
                if (!appData.patients) appData.patients = {};
                if (!appData.patients["退院"]) appData.patients["退院"] = [];
                
                var archiveObj = appData.dischargedArchive;
                if (archiveObj instanceof Array) {
                    for (var i = 0; i < archiveObj.length; i++) {
                         var pArc = archiveObj[i];
                         if (pArc && pArc.id) {
                              if (!findPatientById(pArc.id)) {
                                  appData.patients["退院"].push({ id: pArc.id, name: "退院患者(復元)" });
                              }
                         }
                    }
                } else {
                    for (var arcId in archiveObj) {
                        if (archiveObj.hasOwnProperty(arcId)) {
                            if (!findPatientById(arcId)) {
                                appData.patients["退院"].push({ id: arcId, name: "退院患者(復元)" });
                            }
                        }
                    }
                }
                delete appData.dischargedArchive;
                saveData(false); // migrate silently
            }
            // ---------------------------------------
            // 基準日 (baseDate) の初期化: 当日-3日を設定
            var today = new Date();
            today.setDate(today.getDate() - 3);
            var dateStr = today.getFullYear() + '-' + ('0' + (today.getMonth() + 1)).slice(-2) + '-' + ('0' + today.getDate()).slice(-2);
            var bDateInput = document.getElementById('baseDate');
            if (bDateInput) bDateInput.value = dateStr;

            // 設定のロードと反映

            if (document.getElementById('set-halfwidth'))
                document.getElementById('set-halfwidth').checked = myStorage.getItem('set-halfwidth') !== 'false';
            
            if (document.getElementById('set-merge'))
                document.getElementById('set-merge').checked = myStorage.getItem('set-merge') !== 'false';
            
            if (document.getElementById('set-softdelete'))
                document.getElementById('set-softdelete').checked = myStorage.getItem('set-softdelete') !== 'false';
            
            if (document.getElementById('set-remove-form'))
                document.getElementById('set-remove-form').checked = myStorage.getItem('set-remove-form') !== 'false';
            
            if (document.getElementById('set-remove-iv-words'))
                document.getElementById('set-remove-iv-words').checked = myStorage.getItem('set-remove-iv-words') !== 'false';
            
            if (document.getElementById('set-remove-salt'))
                document.getElementById('set-remove-salt').checked = myStorage.getItem('set-remove-salt') !== 'false';
            
            if (document.getElementById('set-remove-maker'))
                document.getElementById('set-remove-maker').checked = myStorage.getItem('set-remove-maker') !== 'false';
            
            // if (document.getElementById('set-add-number'))
            //     document.getElementById('set-add-number').checked = myStorage.getItem('set-add-number') === 'true';

            var abbrDictSetting = myStorage.getItem('set-abbr-dict');
            if (abbrDictSetting !== null) {
                var chk = document.getElementById('chk-use-abbr-dict');
                if(chk) chk.checked = (abbrDictSetting === 'true');
            }
            
            var hlToggle = document.getElementById('set-tokuyaku-highlight');
            if(hlToggle) {
                hlToggle.checked = myStorage.getItem('set-tokuyaku-highlight') !== 'false';
            }

            var kanaFormat = myStorage.getItem('set-kana-format');
            if (kanaFormat) {
                var radio = document.querySelector('input[name="set-kana-format"][value="' + kanaFormat + '"]');
                if (radio) radio.checked = true;
            } else {
                var oldFullkana = myStorage.getItem('set-fullkana');
                if (oldFullkana === 'false') {
                    var rNone = document.querySelector('input[name="set-kana-format"][value="none"]');
                    if (rNone) rNone.checked = true;
                } else {
                    var rFull = document.querySelector('input[name="set-kana-format"][value="full"]');
                    if (rFull) rFull.checked = true;
                }
            }

            var timingSetting = myStorage.getItem('set-timing');
            if (timingSetting !== null) {
                var incTm = document.getElementById('includeTiming');
                if (incTm) incTm.value = timingSetting;
            } else {
                var incTm2 = document.getElementById('includeTiming');
                if (incTm2) incTm2.value = 'false'; // デフォルト「なし」
            }

            // フォントサイズ設定の読み込み
            var boardFontSize = myStorage.getItem('boardFontSize') || 'small';
            var selBoardFont = document.getElementById('sel-global-fontsize');
            if (selBoardFont) selBoardFont.value = boardFontSize;
            removeClass(document.body, "font-medium");
            removeClass(document.body, "font-large");
            if (boardFontSize === "medium") addClass(document.body, "font-medium");
            else if (boardFontSize === "large") addClass(document.body, "font-large");

            // 初期選択病棟の設定
            // ユーザー設定があれば最初の病棟を選択、なければデフォルトをテスト病棟(99)に設定
    var activeCodes = (appData.settings && appData.settings.activeWardCodes) || [];

    if (activeCodes.length > 0) {

        switchWard(activeCodes[0]);

    } else {

        switchWard("99");

    }
        }
/**
 * 薬歴・薬剤整理用のコアテキスト整形関数
 * 全角英数字を半角に変換し、不要な記号や空白を整理します。
 */
function yrFormatTextCore(text, keepIndentation) {
    if (!text) return "";
    var s = text;
    // 全角英数字・記号を半角に変換
    s = s.replace(/[！-～]/g, function(m) {
        return String.fromCharCode(m.charCodeAt(0) - 0xFEE0);
    });
    // 全角スペースを半角に置換
    s = s.replace(/　/g, " ");
    
    // インデント保持設定がない場合は全体をトリムしつつ連続スペースを1つにする
    if (!keepIndentation) {
        s = s.replace(/ +/g, " ");
        s = s.trim();
    } else {
        // インデント保持の場合: 各行の末尾のみトリム
        var lines = s.split(/\r\n|\r|\n/);
        for(var i=0; i<lines.length; i++) {
            lines[i] = lines[i].replace(/\s+$/, "");
        }
        s = lines.join("\n").replace(/^\s+/, ""); // 先頭の空改行などは消すがインデントは守る
    }
    
    // 改行コードの統一（CRLF）
    return s.replace(/\n/g, "\r\n");
}

// ---------- 薬剤調整加算ツール ロジック ----------
var medAdjState = { input: [], output: [] };
var manualMedAdjLinks = {};

/**
 * 薬剤テキストの解析（インデント深度・キーワードによる除外判定）
 */
function parseMedText(text) {
    if(!text) return [];
    var config = (appData.settings && appData.settings.medAdjConfig) || { useIndentation: true, autoExcludeHospital: true };
    var customKeywords = (appData.settings && appData.settings.medAdjExclusionKeywords) || [];
    var baseExcludeKeywords = ["外用", "テープ", "パップ", "点眼", "点耳", "点鼻", "坐剤", "坐薬", "軟膏", "クリーム", "ローション", "吸入", "ｴｱﾛｿﾞﾙ", "頓服", "頓用", "回分", "持参薬用法", "プロペト", "ハッカ油", "レスタミン", "輸液", "点滴", "静注", "皮下注", "注射", "ワセリン", "ヒルドイド", "ヘパリン", "生食", "ＮＳ", "NS", "注", "Ａ", "瓶", "管", "追加", "時", "不眠", "眠れない"];
    var allExcludeKeywords = baseExcludeKeywords.concat(customKeywords);

    // インデントを保持して整形
    var cleanedText = yrFormatTextCore(text, true);
    var lines = cleanedText.split('\n');
    var drugs = [];
    
    var lastBaseLevel = -1;
    var lastUsageLevel = -1;

    function getIndentLevel(s) {
        var m = s.match(/^([ ]*)/);
        return m ? m[1].length : 0;
    }

    // ★修正: 単位の前のスペースを任意にし、行全体から最後の数量・単位ペアを抽出する
    var units = "錠|ｶﾌﾟｾﾙ|カプセル|包|ml|mL|mg|g|滴|T|C|Ｔ|Ｃ|本|枚|袋|瓶|筒|ユニット|単位|V|Ｖ|管|個|ﾁｭｰﾌﾞ|チューブ";
    var drugRegex = new RegExp("^(.*?)[\\s　]*(\\d+(?:\\.\\d+)?)[\\s　]*(" + units + ")(.*)$", "i");

    for(var i=0; i<lines.length; i++) {
        var rawLine = lines[i];
        var level = getIndentLevel(rawLine);
        var line = rawLine.trim();
        if(!line) continue;

        if (config.autoExcludeHospital) {
            if (/^[◆◇▼■]/.test(line)) continue;
            if (/^\d+-\d+.*(病院|クリニック|医院|センター)/.test(line)) continue;
        }

        if (/^Rp\.?\d*/i.test(line)) {
            lastBaseLevel = level;
            lastUsageLevel = -1;
            continue;
        }

        var drugMatch = line.match(drugRegex);
        if (drugMatch) {
            var rawDrugName = drugMatch[1].trim();
            
            // ★修正: マクロ機能で付与される "1) " や "12) " などの連番を削除
            rawDrugName = rawDrugName.replace(/^\d+\)[\s　]*/, '');
            
            var qty = drugMatch[2];
            var unit = drugMatch[3];

            var drugName = rawDrugName;
            drugName = drugName.replace(/\(持参薬\)|（持参薬）/g, '');
            drugName = drugName.replace(/「.*?」/g, '');
            drugName = drugName.replace(/【.*?】/g, '');
            drugName = drugName.replace(/★|：|【般】/g, '');
            drugName = drugName.trim();

            var isExcluded = false;
            var rLine = line.replace(/ /g, "").replace(/　/g, "");
            for(var k=0; k<allExcludeKeywords.length; k++) {
                if(rLine.indexOf(allExcludeKeywords[k]) !== -1) {
                    isExcluded = true;
                    break;
                }
            }

            drugs.push({
                name: drugName,
                qty: qty,
                unit: unit,
                raw: line,
                isExcluded: isExcluded,
                checked: true,
                status: "",
                level: level
            });
            lastBaseLevel = level;
            lastUsageLevel = -1;
            continue;
        }

        var usageRegex = /(分\d|回|食後|食前|就寝前|眠前|日\d|時|服用|塗布|貼付)/;
        if (usageRegex.test(line)) {
            lastUsageLevel = level;
            continue;
        }

        if (config.useIndentation) {
            // ★修正: マクロ処理によりRpやインデントが消滅している場合、誤判定で消えるのを防ぐ
            if (lastBaseLevel !== -1) {
                var base = (lastUsageLevel !== -1) ? lastUsageLevel : lastBaseLevel;
                if (level > base) {
                    continue;
                }
            }
        }
    }
    return drugs;
}

function getDrugNameBase(raw) {
    var cleanRaw = raw.replace(/^\d+\)[\s　]*/, ''); // "1) " を消す
    var match = cleanRaw.match(/^([^\d０-９(（]+)/);
    return match ? match[1].trim() : cleanRaw;
}

function getStdForm(raw) {
    var s = raw.replace(/^\d+\)[\s　]*/, ''); // "1) " を消す
    s = s.replace(/[\s\t　]*[0-9０-９]+日(分|用)?/g, "").trim();
    s = s.replace(/ミヤBM(?:処方|細粒|錠)?(?:20[mM][gG])?/gi, "ミヤBM");
    return s;
}

function searchPatientForMedAdj() {
    var query = document.getElementById('ipt-med-adj-patient-search').value.trim();
    var resultArea = document.getElementById('med-adj-patient-result');
    if (!query) {
        resultArea.innerHTML = "";
        return;
    }

    var bestMatch = null;
    var patients = DataManager.appData.patients || {};
    
    // 全病棟を横断検索
    for (var wardId in patients) {
        var list = patients[wardId];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            // 比較用にIDと氏名を正規化
            var normPid = (p.id || "").replace(/^0+/, "");
            var normQuery = query.replace(/^0+/, "");
            var normPname = (p.name || "").replace(/[\s　]/g, "");
            var normQname = query.replace(/[\s　]/g, "");
            if (normPid === normQuery || (normPname.indexOf(normQname) !== -1)) {
                bestMatch = p;
                if (normPid === normQuery) break; // ID完全一致なら即終了
            }
        }
        if (bestMatch && bestMatch.id === query) break;
    }

    if (bestMatch) {
        var days = parseInt(bestMatch.daysInHosp, 10);
        if (isNaN(days)) {
            resultArea.innerHTML = "<b>" + escapeHtml(bestMatch.name) + "</b> (在院日数不明)";
            return;
        }

        var today = new Date();
        today.setHours(0,0,0,0);
        // 入院日 = 今日 - (在院日数 - 1)
        var admitDate = new Date(today.getTime());
        admitDate.setDate(today.getDate() - (days - 1));
        
        // 基準日 = 入院日 - 28日
        var baseDate = new Date(admitDate.getTime());
        baseDate.setDate(baseDate.getDate() - 28);
        
        function fmt(d) {
            return (d.getMonth() + 1) + "/" + d.getDate();
        }

        resultArea.innerHTML = "<span style='color:#2980b9; font-weight:bold;'>" + escapeHtml(bestMatch.name) + "</span> さん " +
                               "入:" + fmt(admitDate) + " <span style='color:#666;'>(在院" + days + "日)</span> → " +
                               "<b>28日前: <span style='color:#e74c3c;'>" + fmt(baseDate) + "</span></b> " +
                               "<span style='font-size:11px; color:#666;'>(" + fmt(baseDate) + "より以前から使用している薬が対象です)</span>";
    } else {
        resultArea.innerHTML = "<span style='color:#999;'>見つかりませんでした</span>";
    }
}

function calcMedAdj(skipFormat) {
    var inBox = document.getElementById('med-adj-in');
    var outBox = document.getElementById('med-adj-out');
    
    // ★修正: 整理あり（▶ 比較・判定 ▶）の場合は、テキスト整理タブと完全に同じ「processMacroText」を通す
    if (!skipFormat) {
        inBox.value = processMacroText(inBox.value);
        outBox.value = processMacroText(outBox.value);
    }

    var txtIn = inBox.value;
    var txtOut = outBox.value;
    
    var inDrugs = parseMedText(txtIn);
    var outDrugs = parseMedText(txtOut);
    
    if (medAdjState.input && medAdjState.input.length === inDrugs.length) {
        for(var i=0; i<inDrugs.length; i++) {
            if(inDrugs[i].raw === medAdjState.input[i].raw) {
                inDrugs[i].checked = medAdjState.input[i].checked;
            }
        }
    }
    
    var matchedOut = {};
    var matchedIn = {};
    
    // 1. 日数違いを許容した「継続」の判定
    for(var i=0; i<inDrugs.length; i++) {
        if(inDrugs[i].isExcluded) continue;
        var stdIn = getStdForm(inDrugs[i].raw);
        for(var j=0; j<outDrugs.length; j++) {
            if(outDrugs[j].isExcluded || matchedOut[j]) continue;
            var stdOut = getStdForm(outDrugs[j].raw);
            if(stdIn === stdOut) {
                inDrugs[i].status = "継続";
                outDrugs[j].status = "継続";
                outDrugs[j].inRef = i;
                inDrugs[i].outRef = j;
                matchedIn[i] = true;
                matchedOut[j] = true;
                break;
            }
        }
    }
    
    // 2. 用量変更の判定
    for(var i=0; i<inDrugs.length; i++) {
        if(inDrugs[i].isExcluded || matchedIn[i]) continue;
        var inBase = getDrugNameBase(inDrugs[i].raw);
        for(var j=0; j<outDrugs.length; j++) {
            if(outDrugs[j].isExcluded || matchedOut[j]) continue;
            var outBase = getDrugNameBase(outDrugs[j].raw);
            if(inBase.length > 2 && inBase === outBase) {
                inDrugs[i].status = "変更前";
                outDrugs[j].status = "用量変更";
                outDrugs[j].inRef = i;
                inDrugs[i].outRef = j;
                matchedIn[i] = true;
                matchedOut[j] = true;
                break;
            }
        }
    }
    
    // 3. 中止・追加の判定
    for(var i=0; i<inDrugs.length; i++) {
        if(!inDrugs[i].isExcluded && !matchedIn[i]) inDrugs[i].status = "中止";
    }
    for(var j=0; j<outDrugs.length; j++) {
        if(!outDrugs[j].isExcluded && !matchedOut[j]) { outDrugs[j].status = "追加"; outDrugs[j].inRef = -1; }
    }

    // 4. 手動紐付け情報の反映 (再定義した関数用)
    for (var j = 0; j < outDrugs.length; j++) {
        if (outDrugs[j].status === "追加" && manualMedAdjLinks[outDrugs[j].raw]) {
            var targetInRaw = manualMedAdjLinks[outDrugs[j].raw];
            for (var i = 0; i < inDrugs.length; i++) {
                if (inDrugs[i].status === "中止" && inDrugs[i].raw === targetInRaw) {
                    inDrugs[i].status = "手動紐付(継続)";
                    outDrugs[j].status = "手動紐付(継続)";
                    inDrugs[i].outRef = j;
                    outDrugs[j].inRef = i;
                    matchedIn[i] = true;
                    matchedOut[j] = true;
                    break;
                }
            }
        }
    }
    
    medAdjState.input = inDrugs;
    medAdjState.output = outDrugs;
    renderMedAdjResult();
}

function renderMedAdjResult() {
    var addedList = [];
    var discontList = [];
    var inD = medAdjState.input;
    var outD = medAdjState.output;



    var tbody = document.getElementById("med-adj-tbody");
    var html = "";
    var baseCount = 0;
    var outCount = 0;
    
    for(var i=0; i<inD.length; i++) {
        if(inD[i].isExcluded) continue;
        if(inD[i].checked) baseCount++;
        var statColor = "#666";
        var outHtml = "";
        
        if(inD[i].status === "継続" || inD[i].status === "手動紐付(継続)") {
            statColor = "#0d6efd";
            outHtml = escapeHtml(outD[inD[i].outRef].raw);
            if (inD[i].status === "手動紐付(継続)") {
                var btn1 = ' <button class="yr-btn-danger-sm" style="margin-left:10px;" ';
                var btn2 = 'onclick="unlinkMedAdjDrug(\'' + escapeHtml(outD[inD[i].outRef].raw).replace(/'/g, "\\'") + '\')">解除</button>';
                outHtml += btn1 + btn2;
            }
        } else if(inD[i].status === "変更前" || inD[i].status === "院内採用等へ変更") {
            statColor = (inD[i].status === "院内採用等へ変更") ? "#20c997" : "#fd7e14";
            outHtml = escapeHtml(outD[inD[i].outRef].raw);
            if (inD[i].status === "院内採用等へ変更") {
                var btn1 = ' <button class="yr-btn-danger-sm" style="margin-left:10px;" ';
                var btn2 = 'onclick="unlinkMedAdjDrug(\'' + escapeHtml(outD[inD[i].outRef].raw).replace(/'/g, "\\'") + '\')">解除</button>';
                outHtml += btn1 + btn2;
            }
        } else if(inD[i].status === "中止") {
            statColor = "#dc3545";
            outHtml = '<span style="color:#aaa;">(なし)</span>';
        }
        
        var dragAttrs = "";
        if (inD[i].status === "中止") {
            dragAttrs += ' ondragover="event.preventDefault(); this.style.backgroundColor=\'#e8f4f8\';" ';
            dragAttrs += 'ondragleave="this.style.backgroundColor=\'\'" ';
            dragAttrs += 'ondrop="event.preventDefault(); this.style.backgroundColor=\'\'; var d=event.dataTransfer.getData(\'text\'); if(d&&d.indexOf(\'medadj_out_\')===0){ linkMedAdjDrugs(' + i + ', d); }"';
        }
        
        html += '<tr class="yr-row-regular" ' + dragAttrs + '>';
        html += '<td style="text-align:center;"><input type="checkbox" onchange="toggleMedAdjInCheck('+i+')" '+(inD[i].checked?'checked':'')+' title="4週間以上継続している場合はチェック"></td>';
        html += '<td>' + escapeHtml(inD[i].raw) + '</td>';
        
        var isToggleable = (inD[i].outRef !== undefined && inD[i].outRef !== -1);
        var toggleStyle = isToggleable ? ' cursor:pointer; text-decoration:underline;' : '';
        var toggleAttr = isToggleable ? ' onclick="toggleMedAdjStatus(' + i + ')" title="クリックで手動切替"' : '';
        
        html += '<td style="text-align:center; font-weight:bold; color:'+statColor+';' + toggleStyle + '"' + toggleAttr + '>' + inD[i].status.replace("変更前","用量変更") + '</td>';
        html += '<td>' + outHtml + '</td>';
        html += '</tr>';
    }
    
    for(var j=0; j<outD.length; j++) {
        if(outD[j].isExcluded) continue;
        outCount++;
        if(outD[j].status === "追加") {
            var tr1 = '<tr class="yr-row-brought-in" draggable="true" ';
            var tr2 = 'ondragstart="event.dataTransfer.setData(\'text\', \'medadj_out_\' + ' + j + ')" ';
            var tr3 = 'style="cursor:grab;" title="ドラッグして紐付け">';
            html += tr1 + tr2 + tr3;
            html += '<td style="text-align:center;">-</td>';
            html += '<td style="color:#aaa;">(なし)</td>';
            html += '<td style="text-align:center; font-weight:bold; color:#198754;">追加</td>';
            html += '<td>' + escapeHtml(outD[j].raw) + '</td>';
            html += '</tr>';
        }
    }
    
    var exHtml = "";
    for(var i=0; i<inD.length; i++) {
        if(inD[i].isExcluded) {
            exHtml += '<tr style="color:#aaa;"><td style="text-align:center;">-</td><td>' + escapeHtml(inD[i].raw) + ' (除外)</td><td>-</td><td>-</td></tr>';
        }
    }
    for(var j=0; j<outD.length; j++) {
        if(outD[j].isExcluded && outD[j].status !== "継続" && outD[j].status !== "用量変更") {
            exHtml += '<tr style="color:#aaa;"><td style="text-align:center;">-</td><td>-</td><td>-</td><td>' + escapeHtml(outD[j].raw) + ' (除外)</td></tr>';
        }
    }
    if (exHtml !== "") {
        html += '<tr><td colspan="4" style="background:#f0f0f0;font-weight:bold;text-align:center;">--- 算定対象外 (外用・頓服・非薬剤行等) ---</td></tr>' + exHtml;
    }
    
    tbody.innerHTML = html;
    for(var j=0; j<outD.length; j++) {
        if(outD[j].status === "追加" && !outD[j].isExcluded) addedList.push(escapeHtml(outD[j].raw));
    }
    for(var i=0; i<inD.length; i++) {
        if(inD[i].status === "中止" && !inD[i].isExcluded) discontList.push(escapeHtml(inD[i].raw));
    }
    
    var listsHtml = "";
    if(addedList.length > 0 || discontList.length > 0) {
        listsHtml += "<div style='display:flex; gap:15px; margin-top:15px; margin-bottom:15px;'>";
        listsHtml += "<div style='flex:1; background:#fff; border:1px solid #f5c2c7; border-radius:4px; padding:8px;'>";
        listsHtml += "<div style='font-size:13px; font-weight:bold; color:#dc3545; border-bottom:1px dashed #f5c2c7; padding-bottom:4px; margin-bottom:6px;'>中止された薬 (" + discontList.length + ")</div>";
        listsHtml += "<ul style='margin:0; padding-left:20px; font-size:12px; line-height:1.4;'>";
        if (discontList.length === 0) listsHtml += "<li style='color:#999; list-style:none; margin-left:-20px;'>なし</li>";
        else for(var d=0; d<discontList.length; d++) listsHtml += "<li>" + discontList[d] + "</li>";
        listsHtml += "</ul></div>";
        listsHtml += "<div style='flex:1; background:#fff; border:1px solid #badbcc; border-radius:4px; padding:8px;'>";
        listsHtml += "<div style='font-size:13px; font-weight:bold; color:#198754; border-bottom:1px dashed #badbcc; padding-bottom:4px; margin-bottom:6px;'>追加された薬 (" + addedList.length + ")</div>";
        listsHtml += "<ul style='margin:0; padding-left:20px; font-size:12px; line-height:1.4;'>";
        if (addedList.length === 0) listsHtml += "<li style='color:#999; list-style:none; margin-left:-20px;'>なし</li>";
        else for(var a=0; a<addedList.length; a++) listsHtml += "<li>" + addedList[a] + "</li>";
        listsHtml += "</ul></div></div>";
    }
    
    var diff = baseCount - outCount;
    var summaryEl = document.getElementById("med-adj-summary");
    if (!summaryEl) return;
    var resMsg = "ベースライン <span style='font-size:24px;'>" + baseCount + "</span> 種類 → 退院時 <span style='font-size:24px;'>" + outCount + "</span> 種類 （" + (diff>=0?"-":"+") + Math.abs(diff) + "種類）";
    var hasBaselineChange = false;
    var hasAddition = (addedList.length > 0);
    for(var i=0; i<inD.length; i++) {
        if(!inD[i].isExcluded && (inD[i].status === "変更前" || inD[i].status === "中止" || inD[i].status === "院内採用等へ変更")) {
            hasBaselineChange = true;
        }
    }
    var req3Check = document.getElementById("chk-med-adj-req3");
    var isAddValid = req3Check && req3Check.checked;
    var hasAnyChange = hasBaselineChange || (hasAddition && isAddValid);
    
    var req3Container = document.getElementById("req3-container");
    if (req3Container) {
        if (hasAddition && !hasBaselineChange && baseCount >= 6) {
            req3Container.style.display = "block";
        } else {
            req3Container.style.display = "none";
            if (req3Check) req3Check.checked = false;
        }
    }
    
    var isOneYearRule = document.getElementById("chk-med-adj-1year") && document.getElementById("chk-med-adj-1year").checked;
    var prevCountEl = document.getElementById("ipt-med-adj-prev-count");
    var prevCount = prevCountEl ? (parseInt(prevCountEl.value, 10) || 0) : 0;
    
    var meet150Points = false;
    if (isOneYearRule) {
        if (prevCount > 0 && (prevCount - outCount) >= 2) meet150Points = true;
    } else {
        if (diff >= 2) meet150Points = true;
    }
    
    if (baseCount >= 6) {
        if (!hasAnyChange) {
            var reasonTxt = (hasAddition && !isAddValid) ? "追加薬が当該処方の見直しに関連するものではないため要件未達です。" : "ベースラインに（当該処方）変更がありません。";
            summaryEl.innerHTML = "<span style='color:#dc3545'>❌ 算定不可</span><div style='font-size:12px;font-weight:bold;margin-top:4px;'>※" + reasonTxt + "</div><div style='margin-top:8px; margin-bottom:8px;'>" + resMsg + "</div>" + listsHtml;
            summaryEl.style.backgroundColor = "#f8d7da";
            summaryEl.style.color = "#842029";
            summaryEl.style.border = "2px solid #f5c2c7";
        } else if (meet150Points) {
            var methodMsg = isOneYearRule ? "※前回算定時(" + prevCount + "種類)から2種類以上減少" : "※2種類以上の減少を達成";
            summaryEl.innerHTML = "<span style='color:#198754'>✅ 250点 算定可能 (評価100点 + 加算150点)</span><div style='font-size:12px;font-weight:normal;margin-top:4px;'>" + methodMsg + "</div><div style='margin-top:8px; margin-bottom:8px;'>" + resMsg + "</div>" + listsHtml;
            summaryEl.style.backgroundColor = "#d1e7dd";
            summaryEl.style.color = "#0f5132";
            summaryEl.style.border = "2px solid #badbcc";
        } else {
            summaryEl.innerHTML = "<span style='color:#0d6efd'>✅ 100点 のみ算定可能 (総合評価加算)</span><div style='font-size:12px;font-weight:normal;margin-top:4px;'>※処方内容の変更(中止/用量変更/関連する追加)はありますが、2種類以上の減少要件を満たしません</div><div style='margin-top:8px; margin-bottom:8px;'>" + resMsg + "</div>" + listsHtml;
            summaryEl.style.backgroundColor = "#cff4fc";
            summaryEl.style.color = "#055160";
            summaryEl.style.border = "2px solid #b6effb";
        }
    } else {
        summaryEl.innerHTML = "<span style='color:#dc3545'>❌ 算定不可</span><br><span style='font-size:14px;font-weight:normal;'>" + resMsg + " （ベースラインが6種類未満です）</span>" + listsHtml;
        summaryEl.style.backgroundColor = "#f8d7da";
        summaryEl.style.color = "#842029";
        summaryEl.style.border = "2px solid #f5c2c7";
    }
    
    var panel = document.getElementById("med-adj-result-panel");
    if (panel) panel.style.display = "block";
}

function toggleMedAdjInCheck(idx) {
    medAdjState.input[idx].checked = !medAdjState.input[idx].checked;
    calcMedAdj(true);
}

function copyMedAdjResult() {
    var inD = medAdjState.input;
    var outD = medAdjState.output;
    var baseCount = 0; var outCount = 0;
    var txt = "【退院時薬剤調整加算 判定】\n";
    
    var changes = [];
    for(var i=0; i<inD.length; i++) {
        if(!inD[i].isExcluded && inD[i].checked) baseCount++;
        if(!inD[i].isExcluded && inD[i].status === "中止") changes.push("[中止] " + inD[i].raw);
        if(!inD[i].isExcluded && inD[i].status === "変更前") changes.push("[用量変更/切替] " + inD[i].raw + " -> " + outD[inD[i].outRef].raw);
    }
    for(var j=0; j<outD.length; j++) {
        if(!outD[j].isExcluded) outCount++;
        if(!outD[j].isExcluded && outD[j].status === "追加") changes.push("[追加] " + outD[j].raw);
    }
    
    var diff = baseCount - outCount;
    txt += "ベースライン: " + baseCount + "種類 → 退院時: " + outCount + "種類 (" + (diff>=0?"-":"+") + Math.abs(diff) + "種類)\n";
    
    var hasAnyChange = changes.length > 0;
    
    if (baseCount >= 6) {
        if (diff >= 2) {
            txt += "判定: 【250点】算定要件を満たす (評価100点 + 加算150点)\n";
        } else if (hasAnyChange) {
            txt += "判定: 【100点】算定要件を満たす (評価100点のみ)\n";
        } else {
            txt += "判定: 算定条件未達 (変更なし)\n";
        }
    } else {
        txt += "判定: 算定条件未達 (ベース6種類未満)\n";
    }
    
    txt += "------------------------\n";
    if (changes.length > 0) {
        txt += changes.join("\n");
    } else {
        txt += "変更・追加・中止された内服薬なし";
    }
    
    try {
        window.clipboardData.setData('Text', txt);
        yrShowAlert('判定結果をクリップボードにコピーしました。', 'success');
    } catch(e) {
        yrShowAlert('コピーに失敗しました。', 'error');
    }
}

function linkMedAdjDrugs(inIdx, data) {
    if (!data || data.indexOf('medadj_out_') !== 0 || data.indexOf('medadj_out_2026_') === 0) return;
    var outIdx = parseInt(data.replace('medadj_out_', ''), 10);
    if (isNaN(outIdx)) return;
    var inRaw = medAdjState.input[inIdx].raw;
    var outRaw = medAdjState.output[outIdx].raw;
    manualMedAdjLinks[outRaw] = inRaw;
    calcMedAdj(true);
}

function unlinkMedAdjDrug(outRaw) {
    if (manualMedAdjLinks[outRaw]) {
        delete manualMedAdjLinks[outRaw];
        calcMedAdj(true);
    }
}

function toggleMedAdjStatus(inIdx) {
    if (!medAdjState.input[inIdx]) return;
    var p = medAdjState.input[inIdx];
    if (p.outRef === undefined || p.outRef === -1) return; // 紐付いていない行（中止など）は無視

    var out = medAdjState.output[p.outRef];
    if (p.status === "変更前" || p.status === "院内採用等へ変更") {
        p.status = "継続";
        out.status = "継続";
    } else if (p.status === "継続" || p.status === "手動紐付(継続)") {
        p.status = "変更前";
        out.status = "用量変更";
    }
    renderMedAdjResult();
}
// ---------- 薬剤調整加算(2026年改定版) 判定ロジック ----------
var medAdjState2026 = { input: [], output: [] };
var manualMedAdjLinks2026 = {};

function searchPatientForMedAdj2026() {
    var query = document.getElementById('ipt-med-adj-patient-search-2026').value.trim();
    var resultArea = document.getElementById('med-adj-patient-result-2026');
    if (!query) {
        resultArea.innerHTML = "";
        return;
    }

    var bestMatch = null;
    var patients = DataManager.appData.patients || {};
    // 全病棟を横断検索
    for (var wardId in patients) {
        var list = patients[wardId];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            // 比較用にIDと氏名を正規化
            var normPid = (p.id || "").replace(/^0+/, "");
            var normQuery = query.replace(/^0+/, "");
            var normPname = (p.name || "").replace(/[\s　]/g, "");
            var normQname = query.replace(/[\s　]/g, "");
            if (normPid === normQuery || (normPname.indexOf(normQname) !== -1)) {
                bestMatch = p;
                if (normPid === normQuery) break; // ID完全一致なら即終了
            }
        }
        if (bestMatch && bestMatch.id === query) break;
    }

    if (bestMatch) {
        var days = parseInt(bestMatch.daysInHosp, 10);
        if (isNaN(days)) {
            resultArea.innerHTML = "<b>" + escapeHtml(bestMatch.name) + "</b> (在院日数不明)";
            return;
        }

        var today = new Date();
        today.setHours(0,0,0,0);
        // 入院日 = 今日 - (在院日数 - 1)
        var admitDate = new Date(today.getTime());
        admitDate.setDate(today.getDate() - (days - 1));
        
        // 基準日 = 入院日 - 28日
        var baseDate = new Date(admitDate.getTime());
        baseDate.setDate(admitDate.getDate() - 28);
        
        function fmt(d) {
            return (d.getMonth() + 1) + "/" + d.getDate();
        }

        resultArea.innerHTML = "<span style='color:#2980b9; font-weight:bold;'>" + escapeHtml(bestMatch.name) + "</span> さん " +
                               "入:" + fmt(admitDate) + " <span style='color:#666;'>(在院" + days + "日)</span> → " +
                               "<b>28日前: <span style='color:#e74c3c;'>" + fmt(baseDate) + "</span></b> " +
                               "<span style='font-size:11px; color:#666;'>(" + fmt(baseDate) + "より以前から使用している薬が対象です)</span>";
    } else {
        resultArea.innerHTML = "<span style='color:#999;'>見つかりませんでした</span>";
    }
}

function linkMedAdjDrugs2026(inIdx, outData) {
    if (outData.indexOf('medadj_out_2026_') !== 0) return;
    var outIdx = parseInt(outData.replace('medadj_out_2026_', ''), 10);
    var inD = medAdjState2026.input;
    var outD = medAdjState2026.output;
    
    if (inD[inIdx] && outD[outIdx]) {
        manualMedAdjLinks2026[outD[outIdx].raw] = inD[inIdx].raw;
        calcMedAdj2026(true);
    }
}

function unlinkMedAdjDrug2026(outRaw) {
    if (manualMedAdjLinks2026[outRaw]) {
        delete manualMedAdjLinks2026[outRaw];
        calcMedAdj2026(true);
    }
}

function toggleMedAdjStatus2026(inIdx) {
    var inD = medAdjState2026.input;
    var outD = medAdjState2026.output;
    if (inD[inIdx] && inD[inIdx].outRef !== undefined) {
        var outIdx = inD[inIdx].outRef;
        if (inD[inIdx].status === "継続") {
            inD[inIdx].status = "用量変更";
            outD[outIdx].status = "用量変更";
        } else if (inD[inIdx].status === "用量変更") {
            inD[inIdx].status = "継続";
            outD[outIdx].status = "継続";
        }
        renderMedAdjResult2026();
    }
}

function calcMedAdj2026(skipFormat) {
    var inBox = document.getElementById('med-adj-in-2026');
    var outBox = document.getElementById('med-adj-out-2026');
    if (!skipFormat) {
        inBox.value = processMacroText(inBox.value);
        outBox.value = processMacroText(outBox.value);
    }
    var inDrugs = parseMedText(inBox.value);
    var outDrugs = parseMedText(outBox.value);
    
    if (medAdjState2026.input && medAdjState2026.input.length === inDrugs.length) {
        for(var i=0; i<inDrugs.length; i++) {
            if(inDrugs[i].raw === medAdjState2026.input[i].raw) inDrugs[i].checked = medAdjState2026.input[i].checked;
        }
    }
    
    var matchedOut = {};
    var matchedIn = {};
    for(var i=0; i<inDrugs.length; i++) {
        if(inDrugs[i].isExcluded) continue;
        var stdIn = getStdForm(inDrugs[i].raw);
        for(var j=0; j<outDrugs.length; j++) {
            if(outDrugs[j].isExcluded || matchedOut[j]) continue;
            var stdOut = getStdForm(outDrugs[j].raw);
            if(stdIn === stdOut) {
                inDrugs[i].status = "継続";
                outDrugs[j].status = "継続";
                outDrugs[j].inRef = i;
                inDrugs[i].outRef = j;
                matchedIn[i] = true;
                matchedOut[j] = true;
                break;
            }
        }
    }
    for(var i=0; i<inDrugs.length; i++) {
        if(inDrugs[i].isExcluded || matchedIn[i]) continue;
        var inBase = getDrugNameBase(inDrugs[i].raw);
        for(var j=0; j<outDrugs.length; j++) {
            if(outDrugs[j].isExcluded || matchedOut[j]) continue;
            var outBase = getDrugNameBase(outDrugs[j].raw);
            if(inBase.length > 2 && inBase === outBase) {
                inDrugs[i].status = "用量変更";
                outDrugs[j].status = "用量変更";
                outDrugs[j].inRef = i;
                inDrugs[i].outRef = j;
                matchedIn[i] = true;
                matchedOut[j] = true;
                break;
            }
        }
    }
    for(var i=0; i<inDrugs.length; i++) if(!inDrugs[i].isExcluded && !matchedIn[i]) inDrugs[i].status = "中止";
    for(var j=0; j<outDrugs.length; j++) if(!outDrugs[j].isExcluded && !matchedOut[j]) { outDrugs[j].status = "追加"; outDrugs[j].inRef = -1; }
    
    for (var j = 0; j < outDrugs.length; j++) {
        if (outDrugs[j].status === "追加" && manualMedAdjLinks2026[outDrugs[j].raw]) {
            var targetInRaw = manualMedAdjLinks2026[outDrugs[j].raw];
            for (var i = 0; i < inDrugs.length; i++) {
                if (inDrugs[i].status === "中止" && inDrugs[i].raw === targetInRaw) {
                    inDrugs[i].status = "院内採用等へ変更";
                    outDrugs[j].status = "院内採用等へ変更";
                    inDrugs[i].outRef = j;
                    outDrugs[j].inRef = i;
                    matchedIn[i] = true;
                    matchedOut[j] = true;
                    break;
                }
            }
        }
    }
    medAdjState2026.input = inDrugs;
    medAdjState2026.output = outDrugs;
    renderMedAdjResult2026();
}

function renderMedAdjResult2026() {
    var addedList = [];
    var discontList = [];
    var inD = medAdjState2026.input;
    var outD = medAdjState2026.output;
    var tbody = document.getElementById("med-adj-tbody-2026");
    var html = "";
    var baseCount = 0;
    var outCount = 0;
    
    for(var i=0; i<inD.length; i++) {
        if(inD[i].isExcluded) continue;
        if(inD[i].checked) baseCount++;
        var statColor = "#666";
        var outHtml = "";
        if(inD[i].status === "継続") {
            statColor = "#0d6efd";
            outHtml = escapeHtml(outD[inD[i].outRef].raw);
        } else if(inD[i].status === "用量変更" || inD[i].status === "院内採用等へ変更") {
            statColor = (inD[i].status === "院内採用等へ変更") ? "#20c997" : "#fd7e14";
            outHtml = escapeHtml(outD[inD[i].outRef].raw);
            if (inD[i].status === "院内採用等へ変更") {
                var btn1 = ' <button class="yr-btn-danger-sm" style="margin-left:10px;" ';
                var btn2 = 'onclick="unlinkMedAdjDrug2026(\'' + escapeHtml(outD[inD[i].outRef].raw).replace(/'/g, "\\'") + '\')">解除</button>';
                outHtml += btn1 + btn2;
            }
        } else if(inD[i].status === "中止") {
            statColor = "#dc3545";
            outHtml = '<span style="color:#aaa;">(なし)</span>';
        }
        
        var dragAttrs = "";
        if (inD[i].status === "中止") {
            dragAttrs += ' ondragover="event.preventDefault(); this.style.backgroundColor=\'#fce4ec\';" ';
            dragAttrs += 'ondragleave="this.style.backgroundColor=\'\'" ';
            dragAttrs += 'ondrop="event.preventDefault(); this.style.backgroundColor=\'\'; var d=event.dataTransfer.getData(\'text\'); if(d&&d.indexOf(\'medadj_out_\')===0){ linkMedAdjDrugs2026(' + i + ', d); }"';
        }
        
        html += '<tr class="yr-row-regular" ' + dragAttrs + '>';
        html += '<td style="text-align:center;"><input type="checkbox" onchange="toggleMedAdjInCheck2026('+i+')" '+(inD[i].checked?'checked':'')+' title="4週間以上継続している場合のみチェック"></td>';
        html += '<td>' + escapeHtml(inD[i].raw) + '</td>';
        
        var isToggleable = (inD[i].outRef !== undefined && inD[i].outRef !== -1);
        var toggleStyle = isToggleable ? ' cursor:pointer; text-decoration:underline;' : '';
        var toggleAttr = isToggleable ? ' onclick="toggleMedAdjStatus2026(' + i + ')" title="クリックで手動切替"' : '';
        
        html += '<td style="text-align:center; font-weight:bold; color:'+statColor+';' + toggleStyle + '"' + toggleAttr + '>' + inD[i].status + '</td>';
        html += '<td>' + outHtml + '</td>';
        html += '</tr>';
    }
    
    for(var j=0; j<outD.length; j++) {
        if(outD[j].isExcluded) continue;
        outCount++;
        if(outD[j].status === "追加") {
            var tr1 = '<tr class="yr-row-brought-in" draggable="true" ';
            var tr2 = 'ondragstart="event.dataTransfer.setData(\'text\', \'medadj_out_2026_\' + ' + j + ')" ';
            var tr3 = 'style="cursor:grab;" title="ドラッグして紐付け">';
            html += tr1 + tr2 + tr3;
            html += '<td style="text-align:center;">-</td>';
            html += '<td style="color:#aaa;">(なし)</td>';
            html += '<td style="text-align:center; font-weight:bold; color:#198754;">追加</td>';
            html += '<td>' + escapeHtml(outD[j].raw) + '</td>';
            html += '</tr>';
        }
    }
    tbody.innerHTML = html;
    for(var j=0; j<outD.length; j++) if(outD[j].status === "追加" && !outD[j].isExcluded) addedList.push(escapeHtml(outD[j].raw));
    for(var i=0; i<inD.length; i++) if(inD[i].status === "中止" && !inD[i].isExcluded) discontList.push(escapeHtml(inD[i].raw));
    
    var diff = baseCount - outCount;
    var summaryEl = document.getElementById("med-adj-summary-2026");
    var resMsg = "ベースライン <span style='font-size:24px;'>" + baseCount + "</span> 種類 → 退院時 <span style='font-size:24px;'>" + outCount + "</span> 種類 ( " + (diff>=0?"-":"+") + Math.abs(diff) + "種類 )";
    var hasBaselineChange = false;
    for(var i=0; i<inD.length; i++) if(!inD[i].isExcluded && (inD[i].status === "用量変更" || inD[i].status === "中止" || inD[i].status === "院内採用等へ変更")) hasBaselineChange = true;
    
    var isAddValid = document.getElementById("chk-med-adj-req3-2026") && document.getElementById("chk-med-adj-req3-2026").checked;
    var hasAnyChange = hasBaselineChange || (addedList.length > 0 && isAddValid);
    var req4 = document.getElementById("chk-med-adj-req4-2026").checked;
    
    if (baseCount >= 6 && hasAnyChange && req4) {
        var isOneYearRule = document.getElementById("chk-med-adj-1year-2026").checked;
        var prevCount = parseInt(document.getElementById("ipt-med-adj-prev-count-2026").value, 10) || 0;
        var meet150 = isOneYearRule ? (prevCount - outCount >= 2) : (diff >= 2);
        
        if (meet150) resMsg += "<br><span style='color:#c2185b;'>✨ 退院時薬剤調整加算 (310点: 160+150) 対象見込み</span>";
        else resMsg += "<br><span style='color:#c2185b;'>✨ 薬剤総合評価調整加算 (160点) 対象見込み</span>";
    } else if (baseCount >= 6 && hasAnyChange && !req4) {
        resMsg += "<br><span style='color:#999; font-size:14px;'>⚠️ 要件：外部連携（薬局等）の情報共有が必要です</span>";
    } else if (baseCount < 6 && baseCount > 0) {
        resMsg += "<br><span style='color:#666; font-size:14px;'>(ベースライン6種類未満のため算定対象外)</span>";
    }
    summaryEl.innerHTML = resMsg;
    summaryEl.style.backgroundColor = (baseCount >= 6 && hasAnyChange && req4) ? "#fce4ec" : "#eee";
    document.getElementById("med-adj-result-panel-2026").style.display = "block";
    document.getElementById("req3-container-2026").style.display = (baseCount >= 6 && !hasBaselineChange && addedList.length > 0) ? "block" : "none";
}

function toggleMedAdjInCheck2026(idx) {
    medAdjState2026.input[idx].checked = !medAdjState2026.input[idx].checked;
    renderMedAdjResult2026();
}

function copyMedAdjResult2026() {
    var inD = medAdjState2026.input;
    var outD = medAdjState2026.output;
    var req1 = document.getElementById("chk-med-adj-req1-2026").checked;
    var req2 = document.getElementById("chk-med-adj-req2-2026").checked;
    var req4 = document.getElementById("chk-med-adj-req4-2026").checked;
    
    var baseCount = 0; var outCount = 0;
    for(var i=0; i<inD.length; i++) if(!inD[i].isExcluded && inD[i].checked) baseCount++;
    for(var j=0; j<outD.length; j++) if(!outD[j].isExcluded) outCount++;

    var txt = "【退院時薬剤調整加算(26年改定版) 判定】\n";
    txt += "・ベースライン(4w継続): " + baseCount + " 種類\n";
    txt += "・退院時処方: " + outCount + " 種類\n";
    txt += "------------------------\n";
    var changes = [];
    for(var i=0; i<inD.length; i++) {
        if(inD[i].isExcluded) continue;
        if(inD[i].status === "用量変更") changes.push("・" + inD[i].raw + " → 用量変更");
        else if(inD[i].status === "中止") changes.push("・" + inD[i].raw + " → 中止");
        else if(inD[i].status === "院内採用等へ変更") changes.push("・" + inD[i].raw + " → 院内採用薬等へ変更");
    }
    for(var j=0; j<outD.length; j++) {
        if(outD[j].isExcluded) continue;
        if(outD[j].status === "追加") changes.push("・" + outD[j].raw + " (追加)");
    }
    if (changes.length > 0) txt += changes.join("\n") + "\n";
    else txt += "変更・追加・中止された内服薬なし\n";
    
    txt += "\n[実施要件]\n";
    txt += "・療養上必要な指導: " + (req1 ? "実施済" : "未実施") + "\n";
    txt += "・多職種連携/共有: " + (req2 ? "実施済" : "未実施") + "\n";
    txt += "・薬局等への情報連携: " + (req4 ? "実施済" : "未実施") + "\n";
    
    var diff = baseCount - outCount;
    var isOneYearRule = document.getElementById("chk-med-adj-1year-2026").checked;
    var prevCount = parseInt(document.getElementById("ipt-med-adj-prev-count-2026").value, 10) || 0;
    
    var hasBaselineChange = false;
    var hasAddition = false;
    for(var i=0; i<inD.length; i++) if(!inD[i].isExcluded && (inD[i].status === "用量変更" || inD[i].status === "中止" || inD[i].status === "院内採用等へ変更")) hasBaselineChange = true;
    for(var j=0; j<outD.length; j++) if(outD[j].status === "追加" && !outD[j].isExcluded) hasAddition = true;
    var isAddValid = document.getElementById("chk-med-adj-req3-2026") && document.getElementById("chk-med-adj-req3-2026").checked;
    
    var hasAnyChange = hasBaselineChange || (hasAddition && isAddValid);
    txt += "\n[判定結果]\n";
    if (baseCount >= 6 && hasAnyChange && req4) {
        var meet150 = isOneYearRule ? (prevCount - outCount >= 2) : (diff >= 2);
        if (meet150) txt += "✨ 退院時薬剤調整加算(310点) 算定見込み\n(調整加算160点 + 加算150点)\n";
        else txt += "✨ 薬剤総合評価調整加算(160点) 算定見込み\n";
    } else {
        txt += "加算算定要件を満たしません\n";
        if (baseCount < 6) txt += "※入院前の継続薬剤6種類以上が必要です\n";
        if (!hasAnyChange) txt += "※処方内容の変更（中止・用量変更・追加等）が必要です\n";
        if (!req4) txt += "※薬局等への文書による情報連携が必要です\n";
    }

    try {
        window.clipboardData.setData('Text', txt);
        yrShowAlert('26年改定版の判定結果をコピーしました。', 'success');
    } catch(e) { yrShowAlert('コピーに失敗しました。', 'error'); }
}

function changeBoardFontSize() {
    var sel = document.getElementById("sel-global-fontsize");
    if (!sel) return;
    var size = sel.value;
    
    removeClass(document.body, "font-medium");
    removeClass(document.body, "font-large");
    if (size === "medium") addClass(document.body, "font-medium");
    else if (size === "large") addClass(document.body, "font-large");
    
    if (typeof adjustMainContainerTopPadding === "function") {
        adjustMainContainerTopPadding();
    }
    // ローカルストレージ領域へ保存
    try { myStorage.setItem('boardFontSize', size); } catch(e){}
}

function changeSharedFontSize() {
    var sel = document.getElementById("sel-fontsize");
    if (!sel) return;
    var size = sel.value;
    var editor = document.getElementById("note-editor-rich");
    if(editor) editor.style.fontSize = size;
}

function changeSharedFontFamily() {
    var sel = document.getElementById("sel-fontfamily");
    if (!sel) return;
    var font = sel.value;
    var editor = document.getElementById("note-editor-rich");
    if(editor) editor.style.fontFamily = font;
}

// 薬歴ツール初期化 (基準日等の初期化処理含む)
// yrInit(); // ★ window.onload内に移動しました

// 全患者選択用の関数（エラー解消）
function toggleAllPatientsSelect(checked) {
    var checkboxes = document.querySelectorAll('.pat-select');
    for (var i = 0; i < checkboxes.length; i++) checkboxes[i].checked = checked;
}

// カスタムタブの状態を保持する変数
var currentFilterTag = ""; 
var currentFilterScope = "all"; // "all" または "personal"

// ★修正: ログイン中のユーザー専用のカスタムタブのみを描画する
function renderCustomTabsUI() {
    var container = document.getElementById("sub-tabs-container");
    if (!container) return;
    
    // 基本の病棟タブを描画
    var activeCodes = (appData.settings && appData.settings.activeWardCodes) || ["99"];
    var html = "";
    for (var i = 0; i < activeCodes.length; i++) {
        var code = activeCodes[i];
        var name = getWardName(code);
        var activeClass = (code === currentWard && currentFilterTag === "") ? " active" : "";
        var closeBtnColor = (code === currentWard && currentFilterTag === "") ? "rgba(255,255,255,0.8)" : "#999";
        
        html += '<div class="sub-tab' + activeClass + '" style="position:relative; padding-right:25px;" onclick="currentFilterTag=\'\'; switchWard(\'' + code + '\')">' + name;
        html += '<span class="tab-close-btn" onclick="event.stopPropagation(); removeWard(\'' + code + '\')" style="position:absolute; right:5px; top:50%; margin-top:-8px; font-size:10px; color:' + closeBtnColor + '; cursor:pointer;">&times;</span>';
        html += '</div>';
    }
    container.innerHTML = html;
    var uid = currentSystemId || "default";
    // 未ログイン時は個人用カスタムタブの読み込みをスキップして終了
    if (!uid) return;
    
    // ★修正: ログインユーザー個人のカスタムタブ配列を安全に取得
    if (!appData.settings.userCustomTabs) appData.settings.userCustomTabs = {};
    if (!appData.settings.userCustomTabs[uid]) appData.settings.userCustomTabs[uid] = [];
    
    // 常に「表示設定がONになっているタブ」と「一時的に作成されたタブ」を描画する
    if (!appData.settings.activeCustomTabs) appData.settings.activeCustomTabs = {};
    if (!appData.settings.activeCustomTabs[currentSystemId]) {
        appData.settings.activeCustomTabs[currentSystemId] = [].concat(appData.settings.userCustomTabs[currentSystemId] || []);
    }
    
    // activeCustomTabsとsessionCustomTabsを結合して重複を排除
    var baseTabs = appData.settings.activeCustomTabs[currentSystemId] || [];
    var sessionTabs = window.sessionCustomTabs || [];
    var activeCustomTabs = [].concat(baseTabs);
    
    for (var i = 0; i < sessionTabs.length; i++) {
        var sTab = sessionTabs[i];
        var isDup = false;
        for (var j = 0; j < activeCustomTabs.length; j++) {
            var aTab = activeCustomTabs[j];
            if (!aTab) continue;
            if ((typeof aTab === "string" && aTab === sTab.tag) || (typeof aTab === "object" && aTab.tag === sTab.tag && aTab.scope === sTab.scope)) {
                isDup = true; break;
            }
        }
        if (!isDup) activeCustomTabs.push(sTab);
    }
    
    for (var i = 0; i < activeCustomTabs.length; i++) {
        var tabObj = activeCustomTabs[i];
        if (!tabObj) continue;
        if (typeof tabObj === "string") { tabObj = { tag: tabObj, scope: "all" }; }
        
        var tName = tabObj.tag;
        var tScope = tabObj.scope || "all";
        var scopeLabel = (tScope === "personal") ? "(個人)" : "";
        
        var btn = document.createElement("div");
        var isActive = (currentFilterTag === tName && currentFilterScope === tScope) ? " active" : "";
        btn.className = "sub-tab" + isActive;
        
        if (tScope === "personal") {
            btn.style.cssText = "position:relative; padding-right:25px; background-color:#e8f4f8; color:#007bff; border-color:#007bff;";
        } else {
            btn.style.cssText = "position:relative; padding-right:25px; background-color:#fce4ec; color:#c2185b; border-color:#f8bbd0;";
        }
        
        btn.innerHTML = escapeHtml(tName) + '<span style="font-size:9px; font-weight:normal; opacity:0.7;">' + scopeLabel + '</span>' +
            '<span class="tab-close-btn" onclick="event.stopPropagation(); removeCustomTab(\'' + escapeHtml(tName) + '\', \'' + tScope + '\')" ' +
            'style="position:absolute; right:5px; top:50%; margin-top:-8px; font-size:10px; cursor:pointer;">&times;</span>';
        
        (function(tag, scope) {
            btn.onclick = function() {
                currentFilterTag = tag;
                currentFilterScope = scope;
                renderCustomTabsUI();
                // キャッシュされているデータで即座にUIを更新
                renderPatients();
                
                // カスタムタブ選択時（作成時）に全病棟情報を自動で取得
                fetchAllActiveWardsData(function() {
                    renderPatients();
                }, true);
            };
        })(tName, tScope);
        
        container.appendChild(btn);
    }
}

function getAvailableTags() {
    var tagCounts = {};
    for (var w in appData.patients) {
        var wList = appData.patients[w];
        if (!wList) continue;
        for (var i = 0; i < wList.length; i++) {
            var p = wList[i];
            var combinedMemo = (p.memo || "") + " " + ((p.personalMemos && p.personalMemos[currentSystemId]) ? p.personalMemos[currentSystemId] : "");
            var match = combinedMemo.match(/(#[^\s　#]+)/g);
            if (match) {
                var uniqueTags = {};
                for (var j = 0; j < match.length; j++) uniqueTags[match[j]] = true;
                for (var t in uniqueTags) {
                    tagCounts[t] = (tagCounts[t] || 0) + 1;
                }
            }
        }
    }
    var sortedTags = [];
    for (var tag in tagCounts) sortedTags.push({ tag: tag, count: tagCounts[tag] });
    sortedTags.sort(function(a, b) { return b.count - a.count; });
    return sortedTags;
}

// モーダルから全体/個人を選んでタブを作成（エラー修正版）
function createNewCustomTab() {
    var tags = getAvailableTags();
    
    var html = '<div style="background:white; padding:20px; border-radius:8px; width:360px; box-shadow: 0 4px 15px rgba(0,0,0,0.2);">';
    html += '<h3 style="margin-top:0; font-size:15px; border-bottom:2px solid #0d6efd; padding-bottom:5px;">抽出タブの新規作成</h3>';
    
    // ラジオボタンにIDを付与して安全に判定できるようにする
    html += '<div style="margin-bottom:12px; background:#f8f9fa; padding:8px; border-radius:4px; font-size:12px;">';
    html += '<b>🔍 検索するメモの範囲:</b><br>';
    html += '<label style="cursor:pointer; margin-right:15px;"><input type="radio" name="rad-tag-scope" id="rad-scope-all" value="all" checked> すべてのメモ(共有+個人)</label>';
    html += '<label style="cursor:pointer;"><input type="radio" name="rad-tag-scope" id="rad-scope-personal" value="personal"> 自分の個人メモ</label>';
    html += '</div>';
    
    // フリー入力エリア
    html += '<div style="display:flex; gap:5px; margin-bottom:15px;">';
    html += '<input type="text" id="ipt-custom-tag-manual" placeholder="新タグを自由入力 (例: #NST)" style="flex:1; padding:6px; border:1px solid #ccc; border-radius:3px; font-size:12px;" onkeypress="if(event.keyCode===13){ var v=this.value; if(v) addCustomTabFromModal(v); }">';
    html += '<button class="btn" style="background:#0d6efd; padding:4px 12px;" onclick="var v=document.getElementById(\'ipt-custom-tag-manual\').value; if(v) addCustomTabFromModal(v);">追加</button>';
    html += '</div>';

    // 実績リストエリア
    html += '<div style="font-size:11px; color:#666; margin-bottom:4px;">▼ 現在使用されているタグ一覧 (クリックで選択)</div>';
    html += '<div style="max-height:180px; overflow-y:auto; border:1px solid #eee; border-radius:3px; margin-bottom:15px; background:#fff;">';
    
    if (tags.length === 0) {
        html += '<div style="padding:10px; color:#999; text-align:center; font-size:12px;">使用中のタグがありません</div>';
    } else {
        for (var i = 0; i < tags.length; i++) {
            // onclickの中の複雑な処理を削除し、タグ名だけを関数に渡す
            html += '<div style="padding:6px 10px; border-bottom:1px solid #eee; cursor:pointer; display:flex; justify-content:space-between; align-items:center; font-size:12px;" onmouseover="this.style.background=\'#f0f0f0\'" onmouseout="this.style.background=\'white\'" onclick="addCustomTabFromModal(\'' + escapeHtml(tags[i].tag) + '\')">';
            html += '<span class="memo-tag" style="color:#007bff;">' + escapeHtml(tags[i].tag) + '</span> <span style="font-size:10px; color:#999;">共用含む件数: ' + tags[i].count + '名</span></div>';
        }
    }
    html += '</div>';
    html += '<button class="btn" onclick="closeCustomTabModal()" style="width:100%; background:#ccc; color:#333; padding:5px 0;">キャンセル</button></div>';
    
    var modal = document.createElement("div");
    modal.id = "modal-add-custom-tab";
    modal.style.cssText = "position:fixed; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.5); display:flex; justify-content:center; align-items:center; z-index:3000;";
    modal.innerHTML = html;
    document.body.appendChild(modal);
    setTimeout(function(){ document.getElementById('ipt-custom-tag-manual').focus(); }, 100);
}

function closeCustomTabModal() {
    var modal = document.getElementById("modal-add-custom-tab");
    if (modal) modal.parentNode.removeChild(modal);
}

// モーダルからの呼び出しを受け取る関数（エラー修正版）
function addCustomTabFromModal(tagName) {
    // スコープの判定は、HTMLの組み立て時ではなくここで直接HTML要素を読み取って行う
    var scope = "all";
    var radPersonal = document.getElementById("rad-scope-personal");
    if (radPersonal && radPersonal.checked) {
        scope = "personal";
    }
    
    closeCustomTabModal();
    if (!tagName || tagName.trim() === "") return;
    tagName = tagName.trim();
    if (tagName.indexOf("#") !== 0) tagName = "#" + tagName; 
    
    if (!currentSystemId) {
        alert("タブを追加するにはログインしてください。");
        return;
    }
    
    
    // 作成されたタブは sessionCustomTabs (一時表示配列) に追加して即時表示する
    if (typeof window.sessionCustomTabs === "undefined") window.sessionCustomTabs = [];
    var existsInSession = false;
    for (var i = 0; i < window.sessionCustomTabs.length; i++) {
        if (window.sessionCustomTabs[i].tag === tagName && window.sessionCustomTabs[i].scope === scope) {
            existsInSession = true; break;
        }
      }
    if (!existsInSession) window.sessionCustomTabs.push({ tag: tagName, scope: scope });
    currentFilterTag = tagName;
    currentFilterScope = scope;
    renderCustomTabsUI();
    // カスタムタブ作成時に全病棟情報を自動で取得（裏で静かに実行する前に画面更新）
    renderPatients();
    fetchAllActiveWardsData(function() {
        renderPatients();
    }, true);
}

// ★修正: タブの削除対象をユーザー個人の領域に変更
function removeCustomTab(tagName, scope) {
    if (!confirm("タブ「" + tagName + "」を削除しますか？")) return;
    
    if (currentSystemId && appData.settings && appData.settings.userCustomTabs && appData.settings.userCustomTabs[currentSystemId]) {
        var userTabs = appData.settings.userCustomTabs[currentSystemId];
        for (var i = 0; i < userTabs.length; i++) {
            var t = userTabs[i];
            if (t && t.tag === tagName && t.scope === scope) {
                userTabs.splice(i, 1);
                break;
            }
        }

        // ★追加: タブ削除後にもトランザクションを発行
        if (typeof DataManager !== "undefined") {
            DataManager.appendTransaction("UPDATE_CUSTOM_TABS", {
                userId: currentSystemId,
                tabs: userTabs
            });
        }
        
        // activeCustomTabs からも削除する
        if (appData.settings.activeCustomTabs && appData.settings.activeCustomTabs[currentSystemId]) {
            var activeTabs = appData.settings.activeCustomTabs[currentSystemId];
            for (var i = 0; i < activeTabs.length; i++) {
                var t = activeTabs[i];
                if ((typeof t === "string" && t === tagName) || (typeof t === "object" && t.tag === tagName && t.scope === scope)) {
                    activeTabs.splice(i, 1);
                    break;
                }
            }
        }
        
        // sessionCustomTabs からも削除する
        if (typeof window.sessionCustomTabs !== "undefined") {
            for (var i = 0; i < window.sessionCustomTabs.length; i++) {
                var s = window.sessionCustomTabs[i];
                if (s.tag === tagName && s.scope === scope) {
                    window.sessionCustomTabs.splice(i, 1);
                    break;
                }
            }
        }
    }
    if (currentFilterTag === tagName && currentFilterScope === scope) { currentFilterTag = ""; }
    renderCustomTabsUI();
    renderPatients();
}

// タグ検索用フィルター
var currentFilterTag = ""; // 初期化
function filterByTag(tagName) {
    currentFilterTag = tagName;
    renderPatients();
}

function showTagSuggest(textarea, event) {
    if (event && (event.key === "Shift" || event.key === "Control" || event.key === "Alt" || (event.keyCode >= 37 && event.keyCode <= 40))) return;
    
    var val = textarea.value;
    var cursor = textarea.selectionStart;
    if (typeof cursor !== 'number') return;
    var textBefore = val.substring(0, cursor);
    
    // 全角の「＃」と半角の「#」両方にマッチするように修正
    var match = textBefore.match(/[#＃]([^\s#＃]*)$/);

    var suggestBox = document.getElementById("tag-suggest-box");
    if (!suggestBox) {
        suggestBox = document.createElement("div");
        suggestBox.id = "tag-suggest-box";
        suggestBox.style.position = "absolute";
        suggestBox.style.zIndex = "9999";
        suggestBox.style.background = "#fff";
        suggestBox.style.border = "1px solid #0d6efd";
        suggestBox.style.boxShadow = "0 2px 8px rgba(0,0,0,0.2)";
        suggestBox.style.padding = "4px";
        suggestBox.style.borderRadius = "4px";
        suggestBox.style.display = "none";
        document.body.appendChild(suggestBox);
    }

    if (match) {
        var prefix = match[1];
        
        var sortedTags = getAvailableTags();
        var tags = [];
        for (var t = 0; t < Math.min(15, sortedTags.length); t++) {
            tags.push(sortedTags[t].tag);
        }
        
        var suggestions = tags.filter(function(t) { 
            // サジェストのタグリスト(t)は常に#か＃で始まっていると想定
            var tagText = t.replace(/^[#＃]/, "");
            return tagText.indexOf(prefix) === 0;
        });
        
        if (suggestions.length > 0) {
            var rect = textarea.getBoundingClientRect();
            // HTA/IE互換のスクロール量取得
            var scrollX = window.pageXOffset || document.documentElement.scrollLeft || document.body.scrollLeft || 0;
            var scrollY = window.pageYOffset || document.documentElement.scrollTop || document.body.scrollTop || 0;
            
            suggestBox.style.top = (rect.bottom + scrollY + 2) + "px";
            suggestBox.style.left = (rect.left + scrollX) + "px";
            
            var html = "";
            for (var i = 0; i < suggestions.length; i++) {
                var safeTag = escapeHtml(suggestions[i]);
                // onclickではなくonmousedownを使うことでtextareaからフォーカスが外れる(onblurが発火する)のを防ぐ
                html += '<div style="cursor:pointer; padding:4px 8px; color:#0d6efd; font-size:12px; font-weight:bold; border-bottom:1px dotted #ccc;" onmouseover="this.style.background=\'#e1f5fe\'" onmouseout="this.style.background=\'transparent\'" onmousedown="insertTagSuggest(event, \'' + safeTag + '\')">' + safeTag + '</div>';
            }
            suggestBox.innerHTML = html;
            
            // グローバル変数で安全に位置を保持
            window._tagSuggestTarget = textarea;
            window._tagSuggestStart = cursor - match[0].length;
            window._tagSuggestEnd = cursor;
            
            suggestBox.style.display = "block";
            return;
        }
    }
    suggestBox.style.display = "none";
}

function insertTagSuggest(event, tag) {
    if (event && event.preventDefault) {
        event.preventDefault(); // フォーカス移動(onblur)を防ぎ、強制リセットを回避
    } else if (event) {
        event.returnValue = false;
    }
    
    var ta = window._tagSuggestTarget;
    if (ta) {
        var val = ta.value;
        var start = window._tagSuggestStart;
        var end = window._tagSuggestEnd;
        
        if (typeof start === 'number' && typeof end === 'number' && start >= 0) {
            ta.value = val.substring(0, start) + tag + " " + val.substring(end);
        } else {
            // フェールセーフ: 全角・半角のハッシュにマッチする末尾のタグを置換
            ta.value = val.replace(/[#＃][^\s#＃]*$/, "") + tag + " ";
        }
        
        var suggestBox = document.getElementById("tag-suggest-box");
        if (suggestBox) suggestBox.style.display = "none";
        
        // 値の変更を保存する
        if (ta.onchange) ta.onchange();
        if (ta.onkeyup) {
            try { ta.onkeyup({keyCode: 0}); } catch(e){}
        }
        
        // 挿入後もフォーカスを維持させる
        ta.focus();
    }
}


// =========================================================
// タブ⑦: 退院時薬剤管理サマリー 情報自動収集・整形ツール
// =========================================================
var summaryState = {
    patientId: "",
    patientName: "",
    wardName: "",
    patientObj: null,
    admitStartDate: "",
    admitEndDate: "",
    byomeiList: [],
    shohoOrders: [],
    chushaOrders: [],
    inHospDrugRows: [],
    knownAutoDrugLines: {},
    isFetching: false,
    fetchToken: 0,
    activeIframeIds: []
};

// テキストエリア（②退院処方・③持参薬・⑤転記用テキスト）を行数に応じて自動伸長させ、コンテナ内スクロールを不要にする
function calcSummaryTextareaTargetHeight(el, minH) {
    if (!el) return minH || 200;
    var val = el.value || "";
    var lineCount = val ? val.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n").length : 1;
    var byLines = lineCount * 19 + 24;
    var target = Math.max(minH || 200, byLines);
    try {
        if (el.offsetHeight > 0 || el.scrollHeight > 0) {
            el.style.height = "auto";
            if (el.scrollHeight && el.scrollHeight + 8 > target) {
                target = el.scrollHeight + 8;
            }
        }
    } catch(e) {}
    return target;
}

function autoResizeSummaryTextareas() {
    var dEl = document.getElementById("txt-summary-discharge-rx");
    var bEl = document.getElementById("txt-summary-brought-in-rx");
    if (dEl || bEl) {
        var hD = calcSummaryTextareaTargetHeight(dEl, 200);
        var hB = calcSummaryTextareaTargetHeight(bEl, 200);
        var maxH23 = Math.max(200, hD, hB);
        if (dEl) dEl.style.height = maxH23 + "px";
        if (bEl) bEl.style.height = maxH23 + "px";
    }
    var pEl = document.getElementById("txt-summary-combined-preview");
    if (pEl) {
        var hP = calcSummaryTextareaTargetHeight(pEl, 260);
        pEl.style.height = hP + "px";
    }
}

// セクション（①または②・③）の個別折りたたみ・展開
function toggleSummaryPanel(bodyId, iconId, forceShow) {
    var bodyEl = document.getElementById(bodyId);
    var iconEl = document.getElementById(iconId);
    if (!bodyEl) return;
    var isHidden = (bodyEl.style.display === "none");
    var nextShow = (typeof forceShow === "boolean") ? forceShow : isHidden;
    if (nextShow) {
        bodyEl.style.display = (bodyId === "summary-sec23-body") ? "flex" : "block";
        if (iconEl) iconEl.innerText = "▼";
        if (bodyId === "summary-sec23-body") {
            autoResizeSummaryTextareas();
        }
    } else {
        bodyEl.style.display = "none";
        if (iconEl) iconEl.innerText = "▶";
    }
}

// ①～③を一括で折りたたみ／展開して④・⑤の作業領域を最大化する
function toggleAllSummaryUpperPanels() {
    var b1 = document.getElementById("summary-sec1-body");
    var b23 = document.getElementById("summary-sec23-body");
    var anyVisible = (b1 && b1.style.display !== "none") || (b23 && b23.style.display !== "none");
    toggleSummaryPanel("summary-sec1-body", "summary-sec1-toggle-icon", !anyVisible);
    toggleSummaryPanel("summary-sec23-body", "summary-sec23-toggle-icon", !anyVisible);
}

function padSummaryDateStr(s) {
    if (!s) return "";
    var m = String(s).match(/(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
    if (!m) return "";
    return m[1] + "/" + ("0" + m[2]).slice(-2) + "/" + ("0" + m[3]).slice(-2);
}

function formatSummaryShortDate(ymd) {
    var m = String(ymd || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return ymd || "";
    return parseInt(m[2], 10) + "/" + parseInt(m[3], 10);
}

function addSummaryDaysStr(ymd, addDays) {
    var m = String(ymd || "").match(/^(\d{4})\/(\d{2})\/(\d{2})$/);
    if (!m) return ymd || "";
    var d = new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
    d.setDate(d.getDate() + addDays);
    return d.getFullYear() + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + ("0" + d.getDate()).slice(-2);
}

function getTodayYmdStr() {
    var d = new Date();
    return d.getFullYear() + "/" + ("0" + (d.getMonth() + 1)).slice(-2) + "/" + ("0" + d.getDate()).slice(-2);
}

function stripSummaryHtmlTags(htmlStr) {
    if (!htmlStr) return "";
    return String(htmlStr)
        .replace(/<br\s*\/?>/gi, "\n")
        .replace(/<[^>]+>/g, "")
        .replace(/&nbsp;/gi, " ")
        .replace(/&lt;/gi, "<")
        .replace(/&gt;/gi, ">")
        .replace(/&amp;/gi, "&")
        .replace(/&quot;/gi, '"');
}

function trimSummaryStr(s) {
    if (!s) return "";
    return String(s).replace(/^[\s\u3000]+|[\s\u3000]+$/g, "");
}

function extractSummaryRowCellsFromTrHtml(trHtml) {
    var cells = [];
    if (!trHtml) return cells;
    var closeTr = trHtml.search(/<\/tr>/i);
    var rowBody = (closeTr !== -1) ? trHtml.substring(0, closeTr) : trHtml;
    var tdRe = /<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi;
    var m;
    while ((m = tdRe.exec(rowBody)) !== null) {
        cells.push(trimSummaryStr(stripSummaryHtmlTags(m[1])));
    }
    return cells;
}

// 患者検索（入院中病棟・退院リスト・退院アーカイブ・入院予定・履歴を横断検索）
function findSummaryPatient(query) {
    var q = trimSummaryStr(query);
    if (!q) return null;
    var normQueryId = q.replace(/^0+/, "");
    var normQueryName = q.replace(/[\s\u3000]/g, "");

    var appD = (typeof DataManager !== "undefined" && DataManager.appData) ? DataManager.appData : (typeof appData !== "undefined" ? appData : {});
    var patients = appD.patients || {};
    var bestMatch = null;
    var matchedWard = "";

    // 1. 現在入院中の病棟を優先検索
    for (var wardId in patients) {
        if (!patients.hasOwnProperty(wardId) || wardId === "退院") continue;
        var list = patients[wardId];
        if (!list) continue;
        for (var i = 0; i < list.length; i++) {
            var p = list[i];
            if (!p) continue;
            var normPid = String(p.id || "").replace(/^0+/, "");
            var normPname = String(p.name || "").replace(/[\s\u3000]/g, "");
            if ((normQueryId && normPid === normQueryId) || (normQueryName && normPname.indexOf(normQueryName) !== -1)) {
                bestMatch = p;
                matchedWard = wardId;
                if (normQueryId && normPid === normQueryId) return { patient: bestMatch, ward: matchedWard, status: "入院中" };
            }
        }
    }
    if (bestMatch) return { patient: bestMatch, ward: matchedWard, status: "入院中" };

    // 2. 退院リスト (patients["退院"]) を検索
    var disList = patients["退院"] || [];
    for (var d = 0; d < disList.length; d++) {
        var dp = disList[d];
        if (!dp) continue;
        var normDpid = String(dp.id || "").replace(/^0+/, "");
        var normDpname = String(dp.name || "").replace(/[\s\u3000]/g, "");
        if ((normQueryId && normDpid === normQueryId) || (normQueryName && normDpname.indexOf(normQueryName) !== -1)) {
            return { patient: dp, ward: dp.ward || "退院", status: "退院済" };
        }
    }

    // 3. 退院アーカイブ (dischargedArchive) を新しい順に検索
    var archive = appD.dischargedArchive || [];
    for (var a = archive.length - 1; a >= 0; a--) {
        var ap = archive[a];
        if (!ap) continue;
        var normApid = String(ap.id || "").replace(/^0+/, "");
        var normApname = String(ap.name || "").replace(/[\s\u3000]/g, "");
        if ((normQueryId && normApid === normQueryId) || (normQueryName && normApname.indexOf(normQueryName) !== -1)) {
            return { patient: ap, ward: ap.ward || "退院アーカイブ", status: "退院済" };
        }
    }

    // 4. 入院予定リスト (admissionSchedule)
    var sched = appD.admissionSchedule || [];
    for (var s = 0; s < sched.length; s++) {
        var sp = sched[s];
        if (!sp) continue;
        var normSpid = String(sp.id || "").replace(/^0+/, "");
        var normSpname = String(sp.name || "").replace(/[\s\u3000]/g, "");
        if ((normQueryId && normSpid === normQueryId) || (normQueryName && normSpname.indexOf(normQueryName) !== -1)) {
            return { patient: sp, ward: sp.ward || "入院予定", status: "入院予定" };
        }
    }

    return null;
}

function setSummaryStatus(msg, isError) {
    var el = document.getElementById("summary-fetch-status");
    if (!el) return;
    el.style.color = isError ? "#c62828" : "#00838f";
    el.innerText = msg || "";
}

// 収集中の画面操作ロック用オーバーレイ＆進捗バー制御
function setSummaryLoadingOverlay(visible, stepText, progressPct) {
    var overlay = document.getElementById("summary-loading-overlay");
    if (overlay) {
        overlay.style.display = visible ? "block" : "none";
    }
    if (stepText !== undefined && stepText !== null) {
        var stepEl = document.getElementById("summary-loading-step-text");
        if (stepEl) stepEl.innerText = stepText;
    }
    if (progressPct !== undefined && progressPct !== null) {
        var barEl = document.getElementById("summary-loading-progress-bar");
        if (barEl) barEl.style.width = Math.max(0, Math.min(100, progressPct)) + "%";
    }
    var btnFetch = document.getElementById("btn-summary-fetch");
    if (btnFetch) {
        btnFetch.disabled = !!visible;
        btnFetch.innerText = visible ? "⏳ 収集中..." : "🔍 カルテから情報収集";
    }
    // アイドル自動取得タイマーの誤発火を防ぐため最終操作時刻を更新
    if (typeof lastActivityTime !== "undefined") {
        lastActivityTime = new Date().getTime();
    }
}

// 収集中の隠しiframeをすべて安全に破棄するヘルパー
function cleanupAllSummaryIframes() {
    var ids = (summaryState && summaryState.activeIframeIds) ? summaryState.activeIframeIds.slice() : [];
    if (summaryState) summaryState.activeIframeIds = [];
    if (summaryState && summaryState.patientId) {
        ids.push("surgery-fetch-iframe-" + summaryState.patientId);
    }
    for (var i = 0; i < ids.length; i++) {
        try {
            var ifr = document.getElementById(ids[i]);
            if (ifr) {
                try { ifr.onload = null; ifr.src = "about:blank"; } catch(e1) {}
                if (ifr.parentNode) ifr.parentNode.removeChild(ifr);
            }
        } catch(e) {}
    }
}

// 収集の中断ボタン処理
function cancelSummaryFetch() {
    if (!summaryState.isFetching) {
        setSummaryLoadingOverlay(false);
        return;
    }
    summaryState.fetchToken = (summaryState.fetchToken || 0) + 1;
    summaryState.isFetching = false;
    cleanupAllSummaryIframes();
    setSummaryLoadingOverlay(false);
    setSummaryStatus("⏹ 情報収集を中断しました（取得済みの項目まで反映しています）", true);
    try {
        updateSummaryPatientBadge();
        processAndRenderSummaryMedications();
    } catch(e) {}
}

function clearSummaryTab() {
    if (summaryState && summaryState.isFetching) {
        cancelSummaryFetch();
    }
    var nextToken = (summaryState && summaryState.fetchToken ? summaryState.fetchToken : 0) + 1;
    summaryState = {
        patientId: "",
        patientName: "",
        wardName: "",
        patientObj: null,
        admitStartDate: "",
        admitEndDate: "",
        byomeiList: [],
        shohoOrders: [],
        chushaOrders: [],
        saishinOrders: [],
        inHospDrugRows: [],
        knownAutoDrugLines: {},
        isFetching: false,
        fetchToken: nextToken,
        activeIframeIds: []
    };
    var lockChk = document.getElementById("chk-summary-lock-combined");
    if (lockChk) lockChk.checked = false;
    var ids = [
        "ipt-summary-patient-search",
        "ipt-summary-start-date",
        "ipt-summary-end-date",
        "ipt-summary-main-disease",
        "ipt-summary-surgery",
        "ipt-summary-comorbidities",
        "ipt-summary-saishin",
        "txt-summary-discharge-rx",
        "txt-summary-brought-in-rx",
        "txt-summary-combined-preview"
    ];
    for (var i = 0; i < ids.length; i++) {
        var el = document.getElementById(ids[i]);
        if (el) el.value = "";
    }
    var badgeIds = [
        "summary-patient-info-badge",
        "summary-discharge-rx-badge",
        "summary-brought-in-badge",
        "summary-inhosp-count-badge",
        "summary-fetch-status"
    ];
    for (var j = 0; j < badgeIds.length; j++) {
        var bEl = document.getElementById(badgeIds[j]);
        if (bEl) bEl.innerHTML = "";
    }
    var chipsEl = document.getElementById("summary-byomei-chips");
    if (chipsEl) {
        chipsEl.innerHTML = '<span style="font-size:11px; color:#999;">（患者情報を収集すると有効病名が表示されます）</span>';
    }
    var tbody = document.getElementById("tbody-summary-inhosp-drugs");
    if (tbody) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:12px;">患者IDを入力して「カルテから情報収集」をクリックしてください</td></tr>';
    }
    autoResizeSummaryTextareas();
}

// 隠しiframeを用いてカルテURLのHTMLを取得する共通ヘルパー
function fetchSummaryHtmlViaIframe(url, timeoutMs, callback) {
    var iframeId = "summary-fetch-iframe-" + new Date().getTime() + "-" + Math.floor(Math.random() * 10000);
    var iframe = document.createElement("iframe");
    iframe.id = iframeId;
    iframe.style.display = "none";
    iframe.application = "yes";
    document.body.appendChild(iframe);

    if (!summaryState.activeIframeIds) summaryState.activeIframeIds = [];
    summaryState.activeIframeIds.push(iframeId);

    var isDone = false;
    var timer = null;

    function removeActiveId() {
        if (!summaryState || !summaryState.activeIframeIds) return;
        for (var i = summaryState.activeIframeIds.length - 1; i >= 0; i--) {
            if (summaryState.activeIframeIds[i] === iframeId) {
                summaryState.activeIframeIds.splice(i, 1);
            }
        }
    }

    function collectFrameText(win) {
        var text = "";
        try {
            if (win.document && win.document.body) {
                text += (win.document.body.innerHTML || win.document.body.innerText || "") + "\n";
            }
        } catch(e) {}
        try {
            if (win.frames && win.frames.length > 0) {
                for (var f = 0; f < win.frames.length; f++) {
                    text += collectFrameText(win.frames[f]);
                }
            }
        } catch(e2) {}
        return text;
    }

    function finish(htmlStr, isErr) {
        if (isDone) return;
        isDone = true;
        if (timer) clearTimeout(timer);
        removeActiveId();
        if (typeof lastActivityTime !== "undefined") {
            lastActivityTime = new Date().getTime();
        }
        setTimeout(function() {
            try {
                var ifr = document.getElementById(iframeId);
                if (ifr) {
                    try { ifr.onload = null; ifr.src = "about:blank"; } catch(e1) {}
                    if (ifr.parentNode) ifr.parentNode.removeChild(ifr);
                }
            } catch(e) {}
        }, 200);
        callback(htmlStr || "", !!isErr);
    }

    timer = setTimeout(function() {
        try {
            var htmlT = iframe.contentWindow ? collectFrameText(iframe.contentWindow) : "";
            if (htmlT && trimSummaryStr(htmlT) !== "") {
                finish(htmlT, false);
                return;
            }
        } catch(e) {}
        finish("", true);
    }, timeoutMs || 25000);

    iframe.onload = function() {
        setTimeout(function() {
            if (isDone) return;
            try {
                var bodyHtml = iframe.contentWindow ? collectFrameText(iframe.contentWindow) : "";
                finish(bodyHtml, false);
            } catch(e) {
                finish("", true);
            }
        }, 350);
    };

    try {
        iframe.src = url;
    } catch(e) {
        finish("", true);
    }
}

// サマリ専用の手術情報取得ヘルパー（SurgeryFetcher.fetchSingleを呼び出し、180日以上の過去手術も漏れなく取得）
function fetchSummarySurgerySafe(pObj, userId, myToken, callback) {
    if (!pObj || !pObj.id) {
        if (callback) callback();
        return;
    }
    if (typeof SurgeryFetcher !== "undefined" && typeof SurgeryFetcher.fetchSingle === "function") {
        var originalDays = pObj.daysInHosp;
        // サマリでは入院前・過去の手術も確実に拾えるよう、最低180日以上の検索範囲を一時的に設定
        var targetDays = Math.max(parseInt(originalDays, 10) || 0, 180);
        pObj.daysInHosp = targetDays;

        SurgeryFetcher.fetchSingle(pObj, function() {
            // 在院日数を元に戻す
            if (originalDays !== undefined) {
                pObj.daysInHosp = originalDays;
            } else {
                delete pObj.daysInHosp;
            }
            if (typeof summaryState !== "undefined" && summaryState.fetchToken && myToken !== summaryState.fetchToken) return;
            if (callback) callback();
        });
    } else {
        if (callback) callback();
    }
}

// カルテHTMLから再診予約(0081)のオーダ情報を抽出
function parseSummarySaishinOrders(bodyHtml) {
    if (!bodyHtml) return [];
    var parts = bodyHtml.split(/<a\s+name=["']#karte_/i);
    var parsed = [];
    var dayNames = ["日", "月", "火", "水", "木", "金", "土"];

    for (var i = 1; i < parts.length; i++) {
        var sec = parts[i];
        if (!sec || sec.indexOf("再診予約") === -1) continue;

        // 先頭の日付: YYYY/MM/DD
        var topDateMatch = sec.match(/^(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})/);
        var y = 0, mth = 0, d = 0, dow = "";
        if (topDateMatch) {
            y = parseInt(topDateMatch[1], 10);
            mth = parseInt(topDateMatch[2], 10);
            d = parseInt(topDateMatch[3], 10);
        }

        // 見出し内の日付・曜日
        var dateMatch = sec.match(/(\d{4})年(\d{1,2})月(\d{1,2})日(?:\((.+?)\))?/);
        if (dateMatch) {
            y = parseInt(dateMatch[1], 10);
            mth = parseInt(dateMatch[2], 10);
            d = parseInt(dateMatch[3], 10);
            dow = dateMatch[4] ? trimSummaryStr(dateMatch[4]) : "";
        }
        if (!y || !mth || !d) continue;

        var ymd = ("000" + y).slice(-4) + "/" + ("0" + mth).slice(-2) + "/" + ("0" + d).slice(-2);
        if (!dow) {
            var dObj = new Date(y, mth - 1, d);
            dow = dayNames[dObj.getDay()];
        }

        // 診療科の抽出（外来見出しの診療科名、または<PRE>医師行から）
        var dept = "";
        var headerMatch = sec.match(/<B>[\s\S]*?外来[\s\u3000\xa0]*(?:\d{1,2}:\d{2}[\s\u3000\xa0]*)?([^\s<　\xa0]+)[\s\S]*?<\/B>/i);
        if (headerMatch) {
            dept = trimSummaryStr(headerMatch[1]);
        }
        if (!dept) {
            var docMatch = sec.match(/\(([^)]+)\)\s*&lt;医師&gt;/i);
            if (docMatch) {
                dept = trimSummaryStr(docMatch[1]);
            }
        }
        if (!dept) {
            dept = "外来";
        }

        parsed.push({
            ymd: ymd,
            mth: mth,
            d: d,
            dow: dow,
            dept: dept,
            formatted: mth + "/" + d + "(" + dow + ") " + dept
        });
    }
    return parsed;
}

// 再診予約リストから退院日以降で最も早い予約を1診療科1件として抽出し、整形文字列を生成
function calcSummaryNextVisitText(saishinOrders, admitEndDate) {
    if (!saishinOrders || saishinOrders.length === 0) return "";
    var today = new Date();
    var todayStr = ("000" + today.getFullYear()).slice(-4) + "/" + ("0" + (today.getMonth() + 1)).slice(-2) + "/" + ("0" + today.getDate()).slice(-2);
    var filterDate = admitEndDate || todayStr;

    var deptMap = {};
    for (var i = 0; i < saishinOrders.length; i++) {
        var ord = saishinOrders[i];
        if (ord.ymd >= filterDate) {
            var dName = ord.dept;
            if (!deptMap[dName] || ord.ymd < deptMap[dName].ymd) {
                deptMap[dName] = ord;
            }
        }
    }

    var filtered = [];
    for (var k in deptMap) {
        if (deptMap.hasOwnProperty(k)) {
            filtered.push(deptMap[k]);
        }
    }
    if (filtered.length === 0) return "";

    // 予約日の昇順にソート
    filtered.sort(function(a, b) {
        if (a.ymd !== b.ymd) return a.ymd < b.ymd ? -1 : 1;
        return a.dept < b.dept ? -1 : 1;
    });

    var parts = [];
    for (var j = 0; j < filtered.length; j++) {
        parts.push(filtered[j].formatted);
    }
    return parts.join("、");
}

// 患者オブジェクトの手術情報を表示用文字列に整形
function formatSummarySurgeryText(p) {
    if (!p) return "なし";
    var sDate = trimSummaryStr(p.surgeryDate || "");
    var sProc = trimSummaryStr(p.surgeryProcedure || "");
    if ((!sDate || sDate === "なし" || sDate === "-") && (!sProc || sProc === "なし" || sProc === "タイムアウト" || sProc === "解析エラー")) {
        return "なし";
    }
    var shortDate = "";
    if (sDate && sDate !== "なし" && sDate !== "-" && sDate !== "不明") {
        shortDate = formatSummaryShortDate(padSummaryDateStr(sDate) || sDate);
    }
    if (shortDate && sProc) return shortDate + " " + sProc;
    if (sProc) return sProc;
    if (shortDate) return shortDate;
    return "なし";
}

// メイン処理：患者ID/氏名からサマリ情報を一括収集
function fetchSummaryPatientData() {
    if (summaryState.isFetching) {
        return;
    }
    var queryEl = document.getElementById("ipt-summary-patient-search");
    var query = queryEl ? trimSummaryStr(queryEl.value) : "";
    if (!query) {
        yrShowAlert("患者IDまたは氏名を入力してください。", "error");
        return;
    }

    var found = findSummaryPatient(query);
    var pObj = found ? found.patient : null;
    var pId = pObj ? String(pObj.id) : "";
    if (!pId) {
        // ボード未登録の退院患者でも、数字IDが直接入力された場合はカルテから直接取得可能にする
        if (/^\d+$/.test(query)) {
            pId = query.replace(/^0+/, "");
            pObj = { id: pId, name: "ID:" + pId + " (ボード外患者)", disease: "", daysInHosp: "" };
        } else {
            yrShowAlert("該当する患者が見つかりませんでした。患者ID（半角数字）で入力してください。", "error");
            return;
        }
    }

    summaryState.fetchToken = (summaryState.fetchToken || 0) + 1;
    var myToken = summaryState.fetchToken;
    cleanupAllSummaryIframes();

    summaryState.patientId = pId;
    summaryState.patientName = pObj.name || ("ID:" + pId);
    summaryState.wardName = found ? (found.ward + " / " + found.status) : "カルテ直接参照";
    summaryState.patientObj = pObj;
    summaryState.byomeiList = [];
    summaryState.shohoOrders = [];
    summaryState.chushaOrders = [];
    summaryState.inHospDrugRows = [];
    summaryState.knownAutoDrugLines = {};
    var lockChk = document.getElementById("chk-summary-lock-combined");
    if (lockChk) lockChk.checked = false;

    // 入院期間（初期値）の算出
    var todayStr = getTodayYmdStr();
    var endDateInput = document.getElementById("ipt-summary-end-date");
    var startDateInput = document.getElementById("ipt-summary-start-date");

    var calcEnd = todayStr;
    if (pObj.dischargeDate) {
        var dPad = padSummaryDateStr(pObj.dischargeDate);
        if (dPad) calcEnd = dPad;
    }
    var calcStart = "";
    var hospDays = parseInt(pObj.daysInHosp, 10);
    if (!isNaN(hospDays) && hospDays > 0) {
        calcStart = addSummaryDaysStr(calcEnd, -(hospDays - 1));
    } else if (pObj.admissionDate) {
        calcStart = padSummaryDateStr(pObj.admissionDate);
    }

    summaryState.admitStartDate = calcStart;
    summaryState.admitEndDate = calcEnd;
    if (startDateInput) startDateInput.value = calcStart || "";
    if (endDateInput) endDateInput.value = calcEnd || todayStr;

    // 主病名・手術情報の初期反映
    var mainDisEl = document.getElementById("ipt-summary-main-disease");
    if (mainDisEl) mainDisEl.value = pObj.disease || "";
    var comorbEl = document.getElementById("ipt-summary-comorbidities");
    if (comorbEl) comorbEl.value = "";
    var surgEl = document.getElementById("ipt-summary-surgery");
    if (surgEl) surgEl.value = formatSummarySurgeryText(pObj);

    updateSummaryPatientBadge();
    updateSummaryCombinedPreview("init");

    var userId = (typeof currentSystemId !== "undefined" && currentSystemId) ? currentSystemId : "16622";
    summaryState.isFetching = true;
    setSummaryLoadingOverlay(true, "ステップ 1/5: 手術記録を確認中...", 15);
    setSummaryStatus("1/5 手術情報を確認中...", false);

    // ステップ1: 手術情報の取得（未取得または「なし」の場合は180日範囲で確実に取得）
    function step1_surgery(next) {
        if (myToken !== summaryState.fetchToken) return;
        var sProc = pObj.surgeryProcedure || "";
        var sDate = pObj.surgeryDate || "";
        var hasValidSurgery = (sProc && sProc !== "なし" && sProc !== "タイムアウト" && sProc !== "解析エラー" && sProc !== "情報なし") ||
                             (sDate && sDate !== "なし" && sDate !== "-" && sDate !== "不明");
        if (hasValidSurgery) {
            if (surgEl) surgEl.value = formatSummarySurgeryText(pObj);
            updateSummaryCombinedPreview("surgery");
            next();
            return;
        }
        fetchSummarySurgerySafe(pObj, userId, myToken, function() {
            if (myToken !== summaryState.fetchToken) return;
            if (surgEl) surgEl.value = formatSummarySurgeryText(pObj);
            updateSummaryCombinedPreview("surgery");
            next();
        });
    }

    // ステップ2: 有効病名の取得 (kanja_byomei_info_disp.php)
    function step2_byomei(next) {
        if (myToken !== summaryState.fetchToken) return;
        setSummaryLoadingOverlay(true, "ステップ 2/5: 有効病名を取得中...", 35);
        setSummaryStatus("2/5 有効病名を取得中...", false);
        var byomeiDate = (summaryState.admitEndDate || todayStr).replace(/\//g, "");
        var byomeiUrl = "http://10.5.171.42:8082/karte/kanja_profile/parts/kanja_byomei_info_disp.php"
            + "?kanja_id=" + encodeURIComponent(pId)
            + "&user_id=" + encodeURIComponent(userId)
            + "&section_code=0000022"
            + "&disp_start_date=" + byomeiDate
            + "&disp_end_date=" + byomeiDate
            + "&shindan_kind=2"
            + "&mysection_flg=1"
            + "&disp_range_kind=1"
            + "&risk_manage_kind=0"
            + "&byomei_status_kind=0"
            + "&_t=" + new Date().getTime();

        fetchSummaryHtmlViaIframe(byomeiUrl, 20000, function(bodyHtml, isErr) {
            if (myToken !== summaryState.fetchToken) return;
            var list = [];
            try {
                if (!isErr && bodyHtml) {
                    var trChunks = bodyHtml.split(/<tr\b[^>]*>/i);
                    for (var r = 1; r < trChunks.length; r++) {
                        var cells = extractSummaryRowCellsFromTrHtml(trChunks[r]);
                        if (cells.length >= 9) {
                            var numTxt = cells[0];
                            if (numTxt === "" || numTxt === "番号") continue;
                            var byomeiName = cells[3];
                            var utagaiTxt = cells[4];
                            var tenkiTxt = cells[5];
                            var startDateTxt = cells[7] || "";
                            var endDateTxt = cells[8] || "";
                            if (byomeiName !== "") {
                                var isSuspected = (utagaiTxt === "○" || byomeiName.indexOf("の疑い") !== -1);
                                list.push({
                                    name: byomeiName,
                                    suspected: isSuspected,
                                    tenki: tenkiTxt,
                                    startDate: startDateTxt,
                                    endDate: endDateTxt
                                });
                            }
                        }
                    }
                }
            } catch(e) {}
            summaryState.byomeiList = list;
            renderSummaryByomeiChips();
            next();
        });
    }

    // ステップ3: 処方データ(0011: 持参薬検認・入院処方・退院処方すべて含む)の取得
    function step3_shoho(next) {
        if (myToken !== summaryState.fetchToken) return;
        setSummaryLoadingOverlay(true, "ステップ 3/4: 処方・持参薬・退院処方を取得中...", 68);
        setSummaryStatus("3/4 処方・持参薬・退院処方を取得中...", false);
        var rDays = (!isNaN(hospDays) && hospDays > 0) ? Math.min(550, Math.max(hospDays + 14, 21)) : 90;
        var fetchStart = addSummaryDaysStr(todayStr, -rDays);
        if (summaryState.admitStartDate) {
            var candStart = addSummaryDaysStr(summaryState.admitStartDate, -10);
            if (candStart < fetchStart) fetchStart = candStart;
        }
        var fetchEnd = addSummaryDaysStr(todayStr, 14);

        var shohoUrl = "http://10.5.171.42:8082/karte/karte.php"
            + "?disp_flgs=0/0/2/0/0/0/1/0/0/1/0/0/0/0/0"
            + "&kanja_id=" + encodeURIComponent(pId)
            + "&user_id=" + encodeURIComponent(userId)
            + "&start_date=" + fetchStart
            + "&end_date=" + fetchEnd
            + "&hakkou_date=" + fetchStart
            + "&kijun_date=" + todayStr
            + "&range_date=" + rDays + "/7/1/1"
            + "&disp_selectsection="
            + "&disp_selectukind=1,2,3,91"
            + "&disp_usection_code=0"
            + "&disp_ukind_code=2122"
            + "&order_kind_set_code=0011"
            + "&order_kind_code_str=0011"
            + "&no_log_flg=1&nyugai_kind=&min_date=&max_date=&disp_zoom=100"
            + "&_t=" + new Date().getTime();

        fetchSummaryHtmlViaIframe(shohoUrl, 30000, function(bodyHtml, isErr) {
            if (myToken !== summaryState.fetchToken) return;
            try {
                if (!isErr && bodyHtml) {
                    var parsedShoho = parseSummaryKarteOrders(bodyHtml, "0011");
                    summaryState.shohoOrders = parsedShoho.orders;
                    // カルテ本文に「YYYY年MM月DD日(曜) HH:MM入院」見出しがあれば正確な入院日として反映
                    if (parsedShoho.detectedAdmitDate && !summaryState.admitStartDate) {
                        summaryState.admitStartDate = parsedShoho.detectedAdmitDate;
                        if (startDateInput) startDateInput.value = parsedShoho.detectedAdmitDate;
                    } else if (parsedShoho.detectedAdmitDate && parsedShoho.hasExplicitAdmitHeader) {
                        summaryState.admitStartDate = parsedShoho.detectedAdmitDate;
                        if (startDateInput) startDateInput.value = parsedShoho.detectedAdmitDate;
                    }
                }
            } catch(e) {}
            next();
        });
    }

    // ステップ4: 注射データ(0031)の取得
    function step4_chusha(next) {
        if (myToken !== summaryState.fetchToken) return;
        setSummaryLoadingOverlay(true, "ステップ 4/5: 注射歴を取得中...", 90);
        setSummaryStatus("4/5 注射歴を取得中...", false);
        var rDays = (!isNaN(hospDays) && hospDays > 0) ? Math.min(550, Math.max(hospDays + 14, 21)) : 90;
        var fetchStart = addSummaryDaysStr(todayStr, -rDays);
        if (summaryState.admitStartDate) {
            var candStart = addSummaryDaysStr(summaryState.admitStartDate, -10);
            if (candStart < fetchStart) fetchStart = candStart;
        }
        var fetchEnd = addSummaryDaysStr(todayStr, 14);

        var chushaUrl = "http://10.5.171.42:8082/karte/karte.php"
            + "?disp_flgs=0/0/2/0/0/0/1/0/0/1/0/0/0/0/0"
            + "&kanja_id=" + encodeURIComponent(pId)
            + "&user_id=" + encodeURIComponent(userId)
            + "&start_date=" + fetchStart
            + "&end_date=" + fetchEnd
            + "&hakkou_date=" + fetchStart
            + "&kijun_date=" + todayStr
            + "&range_date=" + rDays + "/7/1/1"
            + "&disp_selectsection="
            + "&disp_selectukind=1,2,3,91"
            + "&disp_usection_code=0"
            + "&disp_ukind_code=2122"
            + "&order_kind_set_code=0031"
            + "&order_kind_code_str=0031"
            + "&no_log_flg=1&nyugai_kind=&min_date=&max_date=&disp_zoom=100"
            + "&_t=" + new Date().getTime();

        fetchSummaryHtmlViaIframe(chushaUrl, 30000, function(bodyHtml, isErr) {
            if (myToken !== summaryState.fetchToken) return;
            try {
                if (!isErr && bodyHtml) {
                    var parsedChusha = parseSummaryKarteOrders(bodyHtml, "0031");
                    summaryState.chushaOrders = parsedChusha.orders;
                    if (parsedChusha.detectedAdmitDate && !summaryState.admitStartDate) {
                        summaryState.admitStartDate = parsedChusha.detectedAdmitDate;
                        if (startDateInput) startDateInput.value = parsedChusha.detectedAdmitDate;
                    }
                }
            } catch(e) {}
            next();
        });
    }

    // ステップ5: 再診予約データ(0081)の取得
    function step5_saishin(next) {
        if (myToken !== summaryState.fetchToken) return;
        setSummaryLoadingOverlay(true, "ステップ 5/5: 再診予約を取得中...", 90);
        setSummaryStatus("5/5 再診予約を取得中...", false);

        var rDays = 180;
        var fetchStart = addSummaryDaysStr(todayStr, -rDays);
        var fetchEnd = addSummaryDaysStr(todayStr, 180);

        var saishinUrl = "http://10.5.171.42:8082/karte/karte.php"
            + "?disp_flgs=1/0/2/0/0/0/1/0/0/1/0/0/0/0/0"
            + "&kanja_id=" + encodeURIComponent(pId)
            + "&user_id=" + encodeURIComponent(userId)
            + "&start_date=" + fetchStart
            + "&end_date=" + fetchEnd
            + "&hakkou_date=" + fetchStart
            + "&kijun_date=" + todayStr
            + "&range_date=" + rDays + "/7/1/1"
            + "&disp_selectsection="
            + "&disp_selectukind=1,2,3,91"
            + "&disp_usection_code=0"
            + "&disp_ukind_code=2122"
            + "&order_kind_set_code=0081"
            + "&order_kind_code_str=0081"
            + "&no_log_flg=1&nyugai_kind=&min_date=&max_date=&disp_zoom=100"
            + "&_t=" + new Date().getTime();

        fetchSummaryHtmlViaIframe(saishinUrl, 30000, function(bodyHtml, isErr) {
            if (myToken !== summaryState.fetchToken) return;
            try {
                if (!isErr && bodyHtml) {
                    var parsedSaishin = parseSummarySaishinOrders(bodyHtml);
                    summaryState.saishinOrders = parsedSaishin;
                    var nextVisitText = calcSummaryNextVisitText(parsedSaishin, summaryState.admitEndDate);
                    var saishinEl = document.getElementById("ipt-summary-saishin");
                    if (saishinEl) {
                        saishinEl.value = nextVisitText;
                    }
                    updateSummaryCombinedPreview("saishin");
                }
            } catch(e) {}
            next();
        });
    }

    step1_surgery(function() {
        step2_byomei(function() {
            step3_shoho(function() {
                step4_chusha(function() {
                    step5_saishin(function() {
                        if (myToken !== summaryState.fetchToken) return;
                        summaryState.isFetching = false;
                        setSummaryLoadingOverlay(false, "", 100);
                        try {
                            updateSummaryPatientBadge();
                            processAndRenderSummaryMedications();
                            setSummaryStatus("✔ 情報収集完了 (" + getTimeString() + ")", false);
                        } catch(e) {
                            setSummaryStatus("⚠ 情報収集完了（一部表示処理でエラー）", true);
                        }
                    });
                });
            });
        });
    });
}

function updateSummaryPatientBadge() {
    var badgeEl = document.getElementById("summary-patient-info-badge");
    if (!badgeEl) return;
    if (!summaryState.patientId) {
        badgeEl.innerHTML = "";
        return;
    }
    var p = summaryState.patientObj || {};
    var daysTxt = p.daysInHosp ? ("在院 " + p.daysInHosp + "日") : "";
    var periodTxt = (summaryState.admitStartDate || "未設定") + " ～ " + (summaryState.admitEndDate || "未設定");
    badgeEl.innerHTML =
        '<span style="background:#00838f; color:#fff; padding:2px 8px; border-radius:3px; font-weight:bold; margin-right:6px;">ID: ' + escapeHtml(summaryState.patientId) + '</span>' +
        '<span style="font-size:14px; font-weight:bold; color:#006064; margin-right:8px;">' + escapeHtml(summaryState.patientName) + ' 様</span>' +
        '<span style="color:#555; margin-right:10px;">[' + escapeHtml(summaryState.wardName) + (daysTxt ? " / " + escapeHtml(daysTxt) : "") + ']</span>' +
        '<span style="color:#0d47a1; font-weight:bold;">対象入院期間: ' + escapeHtml(periodTxt) + '</span>';
}

function refetchSummarySurgery() {
    if (summaryState.isFetching) return;
    if (!summaryState.patientId || !summaryState.patientObj) {
        yrShowAlert("先に患者IDを検索してください。", "error");
        return;
    }
    var userId = (typeof currentSystemId !== "undefined" && currentSystemId) ? currentSystemId : "16622";
    summaryState.fetchToken = (summaryState.fetchToken || 0) + 1;
    var myToken = summaryState.fetchToken;
    summaryState.isFetching = true;
    setSummaryLoadingOverlay(true, "手術記録を再取得中...", 50);
    setSummaryStatus("手術情報を再取得中...", false);
    // 既存の値をクリアして確実に最新を取得
    summaryState.patientObj.surgeryDate = undefined;
    summaryState.patientObj.surgeryProcedure = undefined;
    fetchSummarySurgerySafe(summaryState.patientObj, userId, myToken, function() {
        if (myToken !== summaryState.fetchToken) return;
        summaryState.isFetching = false;
        setSummaryLoadingOverlay(false);
        var surgEl = document.getElementById("ipt-summary-surgery");
        if (surgEl) surgEl.value = formatSummarySurgeryText(summaryState.patientObj);
        updateSummaryCombinedPreview("surgery");
        setSummaryStatus("✔ 手術情報を更新しました", false);
    });
}

// 有効病名チップの描画とクリックによる併存疾患への追加・解除
function renderSummaryByomeiChips() {
    var container = document.getElementById("summary-byomei-chips");
    if (!container) return;
    var list = summaryState.byomeiList || [];
    if (list.length === 0) {
        container.innerHTML = '<span style="font-size:11px; color:#999;">（有効病名データなし）</span>';
        return;
    }

    var excludeSuspected = false;
    var chkEx = document.getElementById("chk-summary-exclude-suspected");
    if (chkEx && chkEx.checked) excludeSuspected = true;

    var comorbEl = document.getElementById("ipt-summary-comorbidities");
    var currentComorbs = getSummaryComorbidityArray();
    var selectedMap = {};
    for (var c = 0; c < currentComorbs.length; c++) {
        selectedMap[currentComorbs[c]] = true;
    }

    var mainDisEl = document.getElementById("ipt-summary-main-disease");
    var mainDisease = mainDisEl ? trimSummaryStr(mainDisEl.value) : "";

    var html = "";
    var seen = {};
    var shownCount = 0;

    for (var i = 0; i < list.length; i++) {
        var item = list[i];
        if (excludeSuspected && item.suspected) continue;
        // 終了日が入っている治癒・中止病名は除外
        if (item.endDate && trimSummaryStr(item.endDate) !== "") continue;
        if (item.tenki && (item.tenki.indexOf("治癒") !== -1 || item.tenki.indexOf("中止") !== -1 || item.tenki.indexOf("死亡") !== -1)) continue;

        var bName = item.name;
        if (!bName || seen[bName]) continue;
        seen[bName] = true;
        shownCount++;

        var isSelected = !!selectedMap[bName];
        var isMain = (mainDisease && bName === mainDisease);
        var bg = isSelected ? "#00838f" : (isMain ? "#fff3cd" : "#f1f8e9");
        var fg = isSelected ? "#ffffff" : (isMain ? "#856404" : "#1b5e20");
        var border = isSelected ? "#006064" : (isMain ? "#ffc107" : "#a5d6a7");
        var prefix = isSelected ? "✔ " : (isMain ? "★主: " : "＋ ");
        var safeNameAttr = escapeHtml(bName).replace(/'/g, "\\'");

        html += '<span onclick="toggleSummaryComorbidity(\'' + safeNameAttr + '\')" ' +
                'style="cursor:pointer; user-select:none; font-size:11px; padding:3px 8px; border-radius:12px; ' +
                'background:' + bg + '; color:' + fg + '; border:1px solid ' + border + '; font-weight:' + (isSelected ? 'bold' : 'normal') + ';" ' +
                'title="クリックで併存疾患に追加／解除">' +
                prefix + escapeHtml(bName) + '</span>';
    }

    if (shownCount === 0) {
        container.innerHTML = '<span style="font-size:11px; color:#999;">（条件に一致する有効病名はありません）</span>';
    } else {
        container.innerHTML = html;
    }
}

function getSummaryComorbidityArray() {
    var el = document.getElementById("ipt-summary-comorbidities");
    if (!el || !trimSummaryStr(el.value)) return [];
    var parts = el.value.split(/[、,，\n]+/);
    var res = [];
    for (var i = 0; i < parts.length; i++) {
        var t = trimSummaryStr(parts[i]);
        if (t) res.push(t);
    }
    return res;
}

function toggleSummaryComorbidity(bName) {
    if (summaryState.isFetching) return;
    if (!bName) return;
    var el = document.getElementById("ipt-summary-comorbidities");
    if (!el) return;
    var arr = getSummaryComorbidityArray();
    var idx = -1;
    for (var i = 0; i < arr.length; i++) {
        if (arr[i] === bName) {
            idx = i;
            break;
        }
    }
    if (idx !== -1) {
        arr.splice(idx, 1);
    } else {
        arr.push(bName);
    }
    el.value = arr.join("、");
    renderSummaryByomeiChips();
    updateSummaryCombinedPreview("comorbidities");
}

// =========================================================
// カルテHTML (処方0011 / 注射0031) の解析ロジック
// ※初回発行日(入力日)ではなく、オーダー日およびRp内の「開始日：YYYY/MM/DD」を参照する
// =========================================================
function parseSummaryKarteOrders(bodyHtml, orderKind) {
    var result = {
        orders: [],
        detectedAdmitDate: "",
        hasExplicitAdmitHeader: false
    };
    if (!bodyHtml) return result;

    // 1. まずカルテ内の日付見出しから「YYYY年MM月DD日(曜) HH:MM入院」または最初の「入院中」を検出
    var headerRe = /<td\b[^>]*bgcolor=["']?#DEB887["']?[^>]*>([\s\S]*?)<\/td>/gi;
    var hm;
    var firstInpatientDate = "";
    var latestExplicitAdmitDate = "";
    while ((hm = headerRe.exec(bodyHtml)) !== null) {
        var hText = trimSummaryStr(stripSummaryHtmlTags(hm[1]));
        var dm = hText.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
        if (dm) {
            var dStr = padSummaryDateStr(dm[1] + "/" + dm[2] + "/" + dm[3]);
            if (hText.indexOf("入院中") === -1 && hText.indexOf("入院") !== -1) {
                latestExplicitAdmitDate = dStr;
            }
            if (!firstInpatientDate && hText.indexOf("入院") !== -1) {
                firstInpatientDate = dStr;
            }
        }
    }
    if (latestExplicitAdmitDate) {
        result.detectedAdmitDate = latestExplicitAdmitDate;
        result.hasExplicitAdmitHeader = true;
    } else if (firstInpatientDate) {
        result.detectedAdmitDate = firstInpatientDate;
    }

    // 2. <PRE> ごとに分割し、直前の日付セクション・<SPAN>見出し・発行日時を解析
    var preChunks = bodyHtml.split(/<pre\b[^>]*>/i);
    var currentSectionDate = "";
    var currentSectionIsOutpatient = false;

    for (var i = 1; i < preChunks.length; i++) {
        var prevHtml = preChunks[i - 1];

        // 直前チャンク内のカルテ日付見出し (<TD bgcolor="#ccffcc">外来 or <TD bgcolor="#DEB887">入院) を追跡
        var secRe = /<td\b[^>]*bgcolor=["']?#(ccffcc|DEB887)["']?[^>]*>([\s\S]*?)<\/td>/gi;
        var secM;
        while ((secM = secRe.exec(prevHtml)) !== null) {
            var bgCol = secM[1].toLowerCase();
            var secTxt = trimSummaryStr(stripSummaryHtmlTags(secM[2]));
            var sdm = secTxt.match(/(\d{4})年(\d{1,2})月(\d{1,2})日/);
            if (sdm) {
                currentSectionDate = padSummaryDateStr(sdm[1] + "/" + sdm[2] + "/" + sdm[3]);
            }
            currentSectionIsOutpatient = (bgCol === "ccffcc" || secTxt.indexOf("外来") !== -1);
        }

        // 直前チャンク内の <SPAN>【...】... YYYY/MM/DD</SPAN> を取得
        var lastHeaderTxt = "";
        var lastHeaderDate = "";
        var spanRe = /<span\b[^>]*>([\s\S]*?)<\/span>/gi;
        var sm;
        while ((sm = spanRe.exec(prevHtml)) !== null) {
            var sTxt = trimSummaryStr(stripSummaryHtmlTags(sm[1]));
            if (sTxt.indexOf("【") !== -1) {
                lastHeaderTxt = sTxt;
                var dmSpan = sTxt.match(/(\d{4}\/\d{2}\/\d{2})\s*$/);
                if (dmSpan) {
                    lastHeaderDate = dmSpan[1];
                } else {
                    var dmIn = sTxt.match(/(\d{4}\/\d{2}\/\d{2})/);
                    if (dmIn) lastHeaderDate = dmIn[1];
                }
            }
        }

        // 直前チャンク内の初回発行・更新タイムスタンプ (<FONT SIZE=-1>...により初回発行...</FONT>) を取得（持参薬複数結合時のラベル用）
        var issueStamp = "";
        var fontRe = /<font\b[^>]*size=["']?-1["']?[^>]*>([\s\S]*?)<\/font>/gi;
        var fm;
        while ((fm = fontRe.exec(prevHtml)) !== null) {
            var fTxt = trimSummaryStr(stripSummaryHtmlTags(fm[1]));
            if (fTxt.indexOf("初回発行") !== -1 || fTxt.indexOf("により更新") !== -1) {
                var linesF = fTxt.split(/\r?\n/);
                issueStamp = trimSummaryStr(linesF[linesF.length - 1]);
            }
        }

        var curChunk = preChunks[i];
        var closeIdx = curChunk.search(/<\/pre>/i);
        var rawPreHtml = (closeIdx !== -1) ? curChunk.substring(0, closeIdx) : curChunk;
        var preTxt = stripSummaryHtmlTags(rawPreHtml);
        if (!preTxt) continue;

        // オーダー全体が[中止]または×の場合はスキップ
        if (lastHeaderTxt.indexOf("[中止]") !== -1 || lastHeaderTxt.indexOf("×") !== -1) {
            continue;
        }

        var preLines = preTxt.split(/\r?\n/);
        var orderDate = lastHeaderDate || currentSectionDate;
        var orderTimeSlot = "";
        var orderCancelled = false;
        var preHeaderLines = [];

        for (var p = 0; p < preLines.length; p++) {
            var pl = trimSummaryStr(preLines[p]);
            if (/^Rp\d+/i.test(pl)) break;
            preHeaderLines.push(pl);
            var pdm = pl.match(/^(\d{4}\/\d{2}\/\d{2})(?:\s+(\S+))?/);
            if (pdm) {
                orderDate = pdm[1];
                if (pdm[2]) orderTimeSlot = pdm[2];
            }
            if (/No\.\d+\s+中止/.test(pl)) {
                orderCancelled = true;
            }
        }
        if (orderCancelled || !orderDate) continue;

        var preHeaderJoined = preHeaderLines.join("\n");

        // オーダー区分の判定
        var category = "inhosp_rx";
        if (orderKind === "0031") {
            category = "chusha";
        } else if (lastHeaderTxt.indexOf("【持参薬】（検認）") !== -1 || /【持参薬】.*検認/.test(preHeaderJoined)) {
            category = "jisan_kennin";
        } else if (lastHeaderTxt.indexOf("【持参薬】") !== -1 || /【持参薬】/.test(preHeaderJoined)) {
            category = "jisan_order";
        } else if (lastHeaderTxt.indexOf("[退院]") !== -1 || /^退院\s*\(\d+\)\s*No\.\d+/m.test(preHeaderJoined)) {
            category = "taiin";
        } else if (lastHeaderTxt.indexOf("[院外]") !== -1 || /^院外\s*\(\d+\)\s*No\.\d+/m.test(preHeaderJoined)) {
            category = "gairai";
        } else if (currentSectionIsOutpatient && lastHeaderTxt.indexOf("[定期]") === -1 && lastHeaderTxt.indexOf("[臨時]") === -1 && lastHeaderTxt.indexOf("[退院]") === -1) {
            category = "gairai";
        }

        // Rpブロックごとの解析（開始日・日数・中止日・薬剤リスト）
        var rps = [];
        var inRp = false;
        var rpDrugs = [];
        var rpRawDrugLines = [];
        var rpUsageLines = [];
        var rpDuration = 1;
        var rpStartDate = orderDate;
        var rpStopDate = "";

        for (var rIdx = 0; rIdx <= preLines.length; rIdx++) {
            var rawL = (rIdx < preLines.length) ? preLines[rIdx] : "Rp999999";
            var trimmedL = trimSummaryStr(rawL);

            if (/^Rp\d+/i.test(trimmedL)) {
                if (inRp && rpDrugs.length > 0) {
                    var effStart = rpStartDate || orderDate;
                    var effEnd = addSummaryDaysStr(effStart, (rpDuration > 1 ? rpDuration - 1 : 0));
                    var skipRp = false;
                    if (rpStopDate) {
                        if (rpStopDate <= effStart) {
                            skipRp = true;
                        } else {
                            var stopPrev = addSummaryDaysStr(rpStopDate, -1);
                            if (stopPrev < effEnd) effEnd = stopPrev;
                        }
                    }
                    if (!skipRp) {
                        rps.push({
                            startDate: effStart,
                            endDate: effEnd,
                            duration: rpDuration,
                            drugs: rpDrugs,
                            rawDrugLines: rpRawDrugLines,
                            usageText: rpUsageLines.join(" ")
                        });
                    }
                }
                inRp = true;
                rpDrugs = [];
                rpRawDrugLines = [];
                rpUsageLines = [];
                rpDuration = 1;
                rpStartDate = orderDate;
                rpStopDate = "";
                continue;
            }

            if (!inRp) continue;

            // 「開始日：YYYY/MM/DD」行の検出（入力日ではなく開始日を優先して期間算出）
            var startMatch = trimmedL.match(/開始日[：:]\s*(\d{4})[\/\-年](\d{1,2})[\/\-月](\d{1,2})/);
            if (startMatch) {
                rpStartDate = padSummaryDateStr(startMatch[1] + "/" + startMatch[2] + "/" + startMatch[3]);
                continue;
            }

            // 全角スペース1個で始まる行＝薬剤名行
            if (/^\u3000[^\s\u3000]/.test(rawL)) {
                var dClean = cleanSummaryDrugNameOnly(rawL);
                if (dClean && dClean.indexOf("----") === -1) {
                    rpDrugs.push(dClean);
                    rpRawDrugLines.push(trimmedL);
                }
            } else if (/^\u3000{2}/.test(rawL) || trimmedL !== "") {
                rpUsageLines.push(trimmedL);
                var durMatch = rawL.match(/(\d+)\s*日分/);
                if (durMatch) {
                    var dNum = parseInt(durMatch[1], 10);
                    if (!isNaN(dNum) && dNum > rpDuration) {
                        rpDuration = dNum;
                    }
                }
                var stopMatch = rawL.match(/【中止】\s*(\d{4})年(\d{1,2})月(\d{1,2})日/);
                if (stopMatch) {
                    rpStopDate = padSummaryDateStr(stopMatch[1] + "/" + stopMatch[2] + "/" + stopMatch[3]);
                }
            }
        }

        result.orders.push({
            orderKind: orderKind,
            category: category,
            sectionDate: currentSectionDate,
            orderDate: orderDate,
            orderTimeSlot: orderTimeSlot,
            headerText: lastHeaderTxt,
            issueStamp: issueStamp,
            rawPreText: preTxt,
            rps: rps
        });
    }

    return result;
}

// 薬品名のみを抽出する整形関数（用量・単位・先頭記号・メーカー名等を除去）
function cleanSummaryDrugNameOnly(rawLine) {
    if (!rawLine) return "";
    var s = String(rawLine).replace(/\u00a0/g, " ");
    s = trimSummaryStr(s);
    // 先頭の記号・持参薬・毒劇麻向・先後般表記を除去
    s = s.replace(/^(?:[★●◎○◆■▲▽▼※]|[\(（](?:持参薬|院外|院内|向|麻|劇|毒|劇・向|毒・向|向・劇|先|後|般|要届出|要許可)[\)）]|【般】|[\s\u3000])+/, "");
    // 末尾の【契機外/他院】【分割】【一包化】等のタグを除去
    s = s.replace(/\s*【[^】]*】\s*$/g, "");
    // 注射の「バイアル用 1本」「溶解用 1管」等を除去
    s = s.replace(/\s+(?:バイアル用|溶解用|希釈用|側管用)\s+\d+(?:\.\d+)?\s*(?:本|管|Ａ|Ｖ|袋|筒|キット|mL|ｍＬ).*$/i, "");
    // 末尾の「(入院 )?数値+単位」を除去
    s = s.replace(/\s+(?:(?:入院用|入院|外来)\s+)?\d+(?:\.\d+)?\s*(?:Ｔ|T|ＣＰ|CP|Ｃ|C|カプセル|ｶﾌﾟｾﾙ|包|ｇ|g|ｍｇ|mg|μｇ|μg|ｍＬ|ｍｌ|mL|ml|Ｌ|L|本|枚|個|管|Ａ|A|Ｖ|V|袋|筒|キット|ｷｯﾄ|単位|滴|ブリスター|シート|吸入|パフ|押し|錠|丸|パック|セット|瓶|バイアル|アンプル|ﾁｭｰﾌﾞ|チューブ)[^\s]*\s*$/i, "");
    s = trimSummaryStr(s);

    // 薬歴ツールのformatText設定（全角英数→半角、半角カナ→全角カナ）を適用
    if (typeof formatText === "function") {
        s = formatText(s);
    }
    // メーカー名「...」を除去
    s = s.replace(/「.*?」/g, "");
    // 外用薬等の末尾の容器規格表記 (1本25g) 等はそのまま残すか整理
    s = s.replace(/[ 　]*入院用$|[ 　]*入院$/g, "");
    return trimSummaryStr(s);
}

// 初期設定でクリック選択から外す薬剤（生食・維持輸液・溶解液・単回検査薬等）の判定
function isSummaryDefaultExcludedDrug(drugName, category, durationDays, usageText) {
    if (!drugName) return true;
    var n = String(drugName);

    // 1. 生理食塩液・注射用水・溶解液・ロック用薬・維持輸液・電解質輸液・栄養輸液
    var fluidKeywords = [
        "生食", "生理食塩", "注射用水", "蒸留水", "キット生食", "大塚生食", "大塚蒸留水",
        "ブドウ糖注", "大塚糖液", "5%ブドウ糖", "10%ブドウ糖", "20%ブドウ糖", "50%ブドウ糖", "5%TZ", "TZ注",
        "ソリタ", "ラクテック", "ヴィーン", "フィジオ", "リンゲル", "ビカネイト",
        "ソルアセト", "ソルデム", "ソルラクト", "ポタコール", "リプラス", "開始液", "維持液",
        "ビーフリード", "パレプラス", "イントラリポス", "エルネオパ", "フルカリック", "ネオパレン", "ミキシッド",
        "ヘパリンNaロック", "ヘパリンロック", "生食ロック"
    ];
    for (var i = 0; i < fluidKeywords.length; i++) {
        if (n.indexOf(fluidKeywords[i]) !== -1) {
            return { excluded: true, reason: "輸液・溶解液" };
        }
    }

    // 2. 検査薬・前処置薬・造影剤・局所麻酔等
    var examKeywords = [
        "オムニパーク", "イオパミロン", "オプチレイ", "イオメロン", "ビジパーク",
        "ガドビスト", "マグネビスト", "プロハンス", "プリモビスト", "バリウム", "ガストログラフィン",
        "ニフレック", "モビプレップ", "マグコロール", "ピコプレップ", "ビジクリア", "サルプレップ",
        "ガスコンドロップ", "バルギン", "プロナーゼ", "グルカゴン",
        "キシロカインゼリー", "キシロカインビスカス", "キシロカインポンプスプレー",
        "インジゴカルミン", "フルオレセイン"
    ];
    for (var j = 0; j < examKeywords.length; j++) {
        if (n.indexOf(examKeywords[j]) !== -1) {
            return { excluded: true, reason: "検査・処置薬" };
        }
    }

    // 3. 注射の単回検査・処置補助薬（ブスコパン注、アトロピン注など単日1回のみ）
    if (category === "注射" && durationDays === 1) {
        if (n.indexOf("ブスコパン注") !== -1 || n.indexOf("アトロピン注") !== -1 || n.indexOf("キシロカイン注") !== -1 || n.indexOf("リドカイン注") !== -1) {
            return { excluded: true, reason: "単回処置・検査注" };
        }
    }

    return { excluded: false, reason: "" };
}

// 期間変更ボタン押下時の再集計
function recalcSummaryByDateRange() {
    if (summaryState.isFetching) return;
    var sEl = document.getElementById("ipt-summary-start-date");
    var eEl = document.getElementById("ipt-summary-end-date");
    if (sEl && trimSummaryStr(sEl.value)) {
        summaryState.admitStartDate = padSummaryDateStr(sEl.value) || trimSummaryStr(sEl.value);
        sEl.value = summaryState.admitStartDate;
    }
    if (eEl && trimSummaryStr(eEl.value)) {
        summaryState.admitEndDate = padSummaryDateStr(eEl.value) || trimSummaryStr(eEl.value);
        eEl.value = summaryState.admitEndDate;
    }
    updateSummaryPatientBadge();
    processAndRenderSummaryMedications();
    yrShowAlert("指定した期間で処方・注射データを再集計しました。", "info");
}

// 処方テキストをprocessMacroTextに通したあと、先頭の◇入院・▼持参薬検認・■持参薬見出しを整形するヘルパー
function formatOrderWithMacro(rawPreText, addRpNum) {
    if (!rawPreText) return "";
    // addRpNum未指定時は従来通り「テキスト整理」タブのRp番号設定に従う
    var useRpNum = (typeof addRpNum === "boolean") ? addRpNum : undefined;
    var formatted = (typeof processMacroText === "function") ? processMacroText(rawPreText, useRpNum) : rawPreText;
    // 先頭の「◇入院」「▼持参薬検認」「■持参薬」「◆外来」単独行を除去してスッキリさせる
    formatted = formatted.replace(/^(?:[\s\r\n]*)(?:◇入院|▼持参薬検認|■持参薬|◆外来)\s*[\r\n]+/g, "");
    formatted = formatted.replace(/\n(?:◇入院|▼持参薬検認|■持参薬|◆外来)\s*\n/g, "\n");
    // Rp番号付与時に「1) 　薬品名」のように残る番号直後の余分な空白を1つに詰める
    formatted = formatted.replace(/^(\d+\))[ \t\u3000]+/gm, "$1 ");
    return trimSummaryStr(formatted);
}

// ③ 入院時持参薬エリアのみを再描画（「③にRp番号を付与」チェック切替時にも呼ばれる）
function reRenderSummaryBroughtInRx() {
    if (summaryState.isFetching) return;
    var startDate = summaryState.admitStartDate || "0000/00/00";
    var endDate = summaryState.admitEndDate || "9999/99/99";
    var shohoOrders = summaryState.shohoOrders || [];
    var jisanAllowStart = (startDate !== "0000/00/00") ? addSummaryDaysStr(startDate, -7) : "0000/00/00";

    var kenninOrders = [];
    var jisanDocOrders = [];
    for (var i = 0; i < shohoOrders.length; i++) {
        var ord = shohoOrders[i];
        if (ord.category === "jisan_kennin") {
            if (ord.orderDate >= jisanAllowStart && ord.orderDate <= endDate) {
                kenninOrders.push(ord);
            }
        } else if (ord.category === "jisan_order") {
            if (ord.orderDate >= jisanAllowStart && ord.orderDate <= endDate) {
                jisanDocOrders.push(ord);
            }
        }
    }

    var chkRp = document.getElementById("chk-summary-jisan-rp-num");
    var addRpNum = !!(chkRp && chkRp.checked);

    var broughtInEl = document.getElementById("txt-summary-brought-in-rx");
    var broughtInBadge = document.getElementById("summary-brought-in-badge");
    var targetJisanList = [];
    var jisanTypeLabel = "【持参薬】（検認）";

    if (kenninOrders.length > 0) {
        targetJisanList = kenninOrders;
        jisanTypeLabel = "【持参薬】（検認）";
    } else if (jisanDocOrders.length > 0) {
        targetJisanList = jisanDocOrders;
        jisanTypeLabel = "【持参薬】（医師指示※検認なし）";
    }

    if (targetJisanList.length === 0) {
        if (broughtInEl) broughtInEl.value = "なし";
        if (broughtInBadge) broughtInBadge.innerHTML = '<span style="color:#777;">(該当なし)</span>';
    } else if (targetJisanList.length === 1) {
        var singleText = formatOrderWithMacro(targetJisanList[0].rawPreText, addRpNum);
        if (broughtInEl) broughtInEl.value = singleText || "なし";
        if (broughtInBadge) {
            broughtInBadge.innerHTML = '<span style="color:#2e7d32; font-weight:bold;">✔ ' + escapeHtml(jisanTypeLabel) + ' 1件取得 (' + escapeHtml(targetJisanList[0].orderDate) + ')</span>';
        }
    } else {
        // 複数回に分けて入力されている場合：すべて結合し、それぞれ何件目・いつ入力されたか分かる見出しを付与
        var combinedBlocks = [];
        for (var k = 0; k < targetJisanList.length; k++) {
            var kOrd = targetJisanList[k];
            var kFormatted = formatOrderWithMacro(kOrd.rawPreText, addRpNum);
            if (!kFormatted) continue;
            var stampInfo = kOrd.issueStamp ? (" / " + kOrd.issueStamp) : "";
            var headerLine = "▼" + jisanTypeLabel + " (" + (k + 1) + "/" + targetJisanList.length + "件目: " + kOrd.orderDate + (kOrd.orderTimeSlot ? " " + kOrd.orderTimeSlot : "") + stampInfo + ")";
            combinedBlocks.push(headerLine + "\n" + kFormatted);
        }
        if (broughtInEl) broughtInEl.value = combinedBlocks.join("\n\n");
        if (broughtInBadge) {
            broughtInBadge.innerHTML = '<span style="background:#fff3cd; color:#b71c1c; border:1px solid #ffecb5; padding:1px 6px; border-radius:3px; font-weight:bold;">⚠️ ' +
                escapeHtml(jisanTypeLabel) + ' が複数回（' + targetJisanList.length + '件）入力されているため全て結合しました</span>';
        }
    }
    autoResizeSummaryTextareas();
}

// 収集した処方・注射データから「持参薬」「退院処方」「入院中使用薬」を生成して描画
function processAndRenderSummaryMedications() {
    var startDate = summaryState.admitStartDate || "0000/00/00";
    var endDate = summaryState.admitEndDate || "9999/99/99";
    var shohoOrders = summaryState.shohoOrders || [];

    var taiinOrders = [];
    for (var i = 0; i < shohoOrders.length; i++) {
        var ord = shohoOrders[i];
        if (ord.category === "taiin") {
            if (ord.orderDate >= startDate && ord.orderDate <= addSummaryDaysStr(endDate, 7)) {
                taiinOrders.push(ord);
            }
        }
    }

    // ---------------------------------------------------------
    // A. 入院時持参薬の生成（【持参薬】（検認）を最優先、複数件は結合して明示）
    // ---------------------------------------------------------
    reRenderSummaryBroughtInRx();

    // ---------------------------------------------------------
    // B. 退院処方の生成（[退院]区分、未入力時は「なし」）
    // ---------------------------------------------------------
    var dischargeEl = document.getElementById("txt-summary-discharge-rx");
    var dischargeBadge = document.getElementById("summary-discharge-rx-badge");
    if (taiinOrders.length === 0) {
        if (dischargeEl) dischargeEl.value = "なし";
        if (dischargeBadge) dischargeBadge.innerHTML = '<span style="color:#777;">(未入力 →「なし」)</span>';
    } else {
        var taiinBlocks = [];
        for (var t = 0; t < taiinOrders.length; t++) {
            var tFormatted = formatOrderWithMacro(taiinOrders[t].rawPreText);
            if (tFormatted) {
                if (taiinOrders.length > 1) {
                    taiinBlocks.push("▼[退院処方 " + (t + 1) + " (" + taiinOrders[t].orderDate + ")]\n" + tFormatted);
                } else {
                    taiinBlocks.push(tFormatted);
                }
            }
        }
        if (dischargeEl) dischargeEl.value = taiinBlocks.length > 0 ? taiinBlocks.join("\n\n") : "なし";
        if (dischargeBadge) {
            dischargeBadge.innerHTML = '<span style="color:#1565c0; font-weight:bold;">✔ [退院]処方 ' + taiinOrders.length + '件取得</span>';
        }
    }

    // ---------------------------------------------------------
    // C. 入院中に使用した薬剤一覧の集計
    // ---------------------------------------------------------
    recalcSummaryInHospList();
    autoResizeSummaryTextareas();
}

function detectSummaryRpSubCategory(orderKind, drugsText, usageText) {
    if (orderKind === "0031") return "注射";
    var u = String(usageText || "");
    var d = String(drugsText || "");
    if (/回分|不眠時|痛む時|疼痛時|発熱時|頓用|頓服|発作時|嘔気時|悪心時|便秘時|下痢時|不穏時|興奮時|血圧上昇時|頭痛時|腹痛時|胸痛時|呼吸苦時|めまい時|かゆみ時|痙攣時|けいれん時|動悸時|血糖[^\s]*時|症状[^\s]*時/.test(u)) {
        return "頓用";
    }
    if (!/日分/.test(u) && /塗布|貼付|点眼|点鼻|点耳|吸入|うがい|含嗽|坐剤|注腸|湿布|テープ|パップ|クリーム|軟膏|ローション|ゲル|スプレー/.test(u + " " + d)) {
        return "外用";
    }
    return "内服";
}

function recalcSummaryInHospList() {
    var startDate = summaryState.admitStartDate || "0000/00/00";
    var endDate = summaryState.admitEndDate || "9999/99/99";
    var includeJisanOrder = false;
    var chkJisan = document.getElementById("chk-summary-include-jisan-order");
    if (chkJisan && chkJisan.checked) includeJisanOrder = true;

    var mergeAllSpan = true;
    var chkMergeAll = document.getElementById("chk-summary-merge-all-periods");
    if (chkMergeAll && !chkMergeAll.checked) mergeAllSpan = false;

    var allOrders = (summaryState.shohoOrders || []).concat(summaryState.chushaOrders || []);
    var drugMap = {};
    var drugKeysOrder = [];

    for (var i = 0; i < allOrders.length; i++) {
        var ord = allOrders[i];
        // 入院処方(inhosp_rx)・退院処方(taiin)・注射(chusha)（およびオプションで持参薬医師指示）を対象とする
        if (ord.category === "inhosp_rx" || ord.category === "taiin" || ord.category === "chusha" || (includeJisanOrder && ord.category === "jisan_order")) {
            var rps = ord.rps || [];
            // 退院処方は退院予定日（終了日+7日まで）に開始日が設定されているケースも許容する
            var allowEnd = (ord.category === "taiin" && endDate !== "9999/99/99") ? addSummaryDaysStr(endDate, 7) : endDate;
            for (var r = 0; r < rps.length; r++) {
                var rp = rps[r];
                // 入院期間と重なるRpのみ対象
                if (rp.endDate < startDate || rp.startDate > allowEnd) continue;

                var clampedStart = (startDate !== "0000/00/00" && rp.startDate < startDate) ? startDate : rp.startDate;
                var clampedEnd = rp.endDate;
                // 入院中の使用期間は入院期間の終了日を超えないよう丸める（退院処方は除く）
                if (ord.category !== "taiin" && endDate !== "9999/99/99" && clampedEnd > endDate) clampedEnd = endDate;

                var rawSubCat = detectSummaryRpSubCategory(ord.orderKind, rp.drugs.join(" "), rp.usageText);
                var isTonyo = (rawSubCat === "頓用");
                // 持参薬指示分（jisan_order）は区分を「持参薬」とする
                var subCat = (ord.category === "jisan_order") ? "持参薬" : rawSubCat;

                for (var d = 0; d < rp.drugs.length; d++) {
                    var dName = rp.drugs[d];
                    if (!dName) continue;
                    // 注射・持参薬・頓用・通常内服/外用をそれぞれ別キーとして集計（頓用が定期内服の期間に混ざるのを防ぐ）
                    var keyPrefix = "shoho";
                    if (ord.orderKind === "0031") {
                        keyPrefix = "chusha";
                    } else if (ord.category === "jisan_order") {
                        keyPrefix = isTonyo ? "jisan_tonyo" : "jisan";
                    } else if (isTonyo) {
                        keyPrefix = "tonyo";
                    }
                    var key = keyPrefix + "::" + dName;
                    if (!drugMap[key]) {
                        drugMap[key] = {
                            name: dName,
                            category: subCat,
                            isTonyo: isTonyo,
                            intervals: [],
                            maxDuration: 0,
                            hasInHosp: false,
                            hasTaiin: false,
                            hasJisan: (ord.category === "jisan_order"),
                            usageSamples: []
                        };
                        drugKeysOrder.push(key);
                    }
                    if (ord.category === "taiin") {
                        drugMap[key].hasTaiin = true;
                    } else if (ord.category === "jisan_order") {
                        drugMap[key].hasJisan = true;
                    } else {
                        drugMap[key].hasInHosp = true;
                    }
                    drugMap[key].intervals.push({
                        start: clampedStart,
                        end: clampedEnd
                    });
                    if (rp.duration > drugMap[key].maxDuration) {
                        drugMap[key].maxDuration = rp.duration;
                    }
                }
            }
        }
    }

    var rows = [];
    for (var k = 0; k < drugKeysOrder.length; k++) {
        var item = drugMap[drugKeysOrder[k]];
        var ivs = item.intervals.slice();
        ivs.sort(function(a, b) {
            if (a.start !== b.start) return a.start < b.start ? -1 : 1;
            return a.end < b.end ? -1 : (a.end > b.end ? 1 : 0);
        });

        // 連続または重複する期間を結合
        var merged = [];
        for (var m = 0; m < ivs.length; m++) {
            var cur = { start: ivs[m].start, end: ivs[m].end };
            if (merged.length === 0) {
                merged.push(cur);
            } else {
                var prev = merged[merged.length - 1];
                var prevNextDay = addSummaryDaysStr(prev.end, 1);
                if (cur.start <= prevNextDay) {
                    if (cur.end > prev.end) prev.end = cur.end;
                } else {
                    merged.push(cur);
                }
            }
        }

        var periodStr = "";
        var firstStart = merged.length > 0 ? merged[0].start : "";
        var lastEnd = merged.length > 0 ? merged[merged.length - 1].end : "";

        // 頓用の場合は期間を日付（1日等）にするのではなく「頓用」と記載する
        if (item.isTonyo || item.category === "頓用") {
            periodStr = "頓用";
        } else if (mergeAllSpan && merged.length > 0) {
            if (firstStart === lastEnd) {
                periodStr = formatSummaryShortDate(firstStart);
            } else {
                periodStr = formatSummaryShortDate(firstStart) + "～" + formatSummaryShortDate(lastEnd);
            }
        } else {
            var pParts = [];
            for (var p = 0; p < merged.length; p++) {
                if (merged[p].start === merged[p].end) {
                    pParts.push(formatSummaryShortDate(merged[p].start));
                } else {
                    pParts.push(formatSummaryShortDate(merged[p].start) + "～" + formatSummaryShortDate(merged[p].end));
                }
            }
            periodStr = pParts.join("、");
        }

        var exInfo = isSummaryDefaultExcludedDrug(item.name, item.category, (firstStart === lastEnd ? 1 : 2), "");
        var noteParts = [];
        if (exInfo.excluded) {
            noteParts.push("自動除外: " + exInfo.reason);
        } else {
            if (item.hasJisan) {
                noteParts.push("持参薬指示");
            }
            if (item.hasTaiin && item.hasInHosp) {
                noteParts.push("退院処方含む");
            } else if (item.hasTaiin) {
                noteParts.push("退院処方");
            }
            if (!item.isTonyo && merged.length > 1 && mergeAllSpan) {
                noteParts.push("計" + merged.length + "期間を結合");
            }
        }
        rows.push({
            checked: !exInfo.excluded,
            category: item.category,
            isTonyo: !!item.isTonyo,
            name: item.name,
            period: periodStr,
            firstStart: firstStart,
            autoExcluded: exInfo.excluded,
            note: noteParts.join(" / ")
        });
    }

    // 区分順（内服→持参薬→外用→頓用→注射）＆開始日順でソート
    var catPriority = { "内服": 1, "持参薬": 2, "外用": 3, "頓用": 4, "頓服": 4, "注射": 5 };
    rows.sort(function(a, b) {
        var pa = catPriority[a.category] || 9;
        var pb = catPriority[b.category] || 9;
        if (pa !== pb) return pa - pb;
        if (a.firstStart !== b.firstStart) return a.firstStart < b.firstStart ? -1 : 1;
        return a.name < b.name ? -1 : 1;
    });

    summaryState.inHospDrugRows = rows;
    if (!summaryState.knownAutoDrugLines) summaryState.knownAutoDrugLines = {};
    for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        var stdL = getSummaryDrugRowStdLine(rows[rIdx]);
        rows[rIdx]._lastStdLine = stdL;
        rows[rIdx]._prevStdLine = stdL;
        if (stdL) summaryState.knownAutoDrugLines[stdL] = true;
    }
    renderSummaryInHospTable();
    updateSummaryCombinedPreview("inhosp");

    // 次回受診予定の再計算・反映（退院日以降で最も早い1件/科）
    if (summaryState.saishinOrders && summaryState.saishinOrders.length > 0) {
        var nextVisitText = calcSummaryNextVisitText(summaryState.saishinOrders, summaryState.admitEndDate);
        var saishinEl = document.getElementById("ipt-summary-saishin");
        if (saishinEl) {
            saishinEl.value = nextVisitText;
        }
        updateSummaryCombinedPreview("saishin");
    }
}

function getSummaryDrugRowStdLine(r) {
    if (!r) return "";
    var n = trimSummaryStr(r.name);
    var p = trimSummaryStr(r.period);
    if (!n && !p) return "";
    return n + (p ? " " + p : "");
}

function renderSummaryInHospTable() {
    var tbody = document.getElementById("tbody-summary-inhosp-drugs");
    var badge = document.getElementById("summary-inhosp-count-badge");
    if (!tbody) return;
    var rows = summaryState.inHospDrugRows || [];

    if (rows.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:#999; padding:12px;">対象期間内の入院処方・退院処方・注射データはありません（「➕ 行追加」で手動追加も可能です）</td></tr>';
        if (badge) badge.innerHTML = "(0件)";
        return;
    }

    var selectedCount = 0;
    var html = "";
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (r.checked) selectedCount++;
        var rowBg = r.checked ? "#ffffff" : "#f8f9fa";
        var rowColor = r.checked ? "#212529" : "#888888";

        var catBg = "#e3f2fd";
        var catFg = "#0d47a1";
        if (r.category === "注射") { catBg = "#fce4ec"; catFg = "#c2185b"; }
        else if (r.category === "頓用" || r.category === "頓服") { catBg = "#fff3cd"; catFg = "#856404"; }
        else if (r.category === "外用") { catBg = "#e0f2f1"; catFg = "#00695c"; }
        else if (r.category === "持参薬") { catBg = "#e8f5e9"; catFg = "#1b5e20"; }

        html += '<tr id="sum-inhosp-tr-' + i + '" style="background:' + rowBg + '; color:' + rowColor + ';">';
        html += '<td style="text-align:center; vertical-align:middle; cursor:pointer; padding:2px;" onclick="toggleSummaryInHospRow(' + i + ', event)">' +
                '<input type="checkbox" id="sum-inhosp-chk-' + i + '" ' + (r.checked ? 'checked' : '') + ' onclick="onSummaryInHospCheckChange(' + i + ', this, event)" style="cursor:pointer; width:14px; height:14px; margin:0;">' +
                '</td>';
        html += '<td style="text-align:center; vertical-align:middle; cursor:pointer; padding:2px;" onclick="toggleSummaryInHospRow(' + i + ', event)">' +
                '<span style="background:' + catBg + '; color:' + catFg + '; font-size:10px; font-weight:bold; padding:1px 5px; border-radius:3px;">' + escapeHtml(r.category || "内服") + '</span>' +
                '</td>';
        html += '<td style="vertical-align:middle; padding:2px 4px;">' +
                '<input type="text" class="yr-form-control" style="width:100%; height:23px; padding:1px 5px; font-size:12px; color:' + rowColor + '; font-weight:' + (r.checked ? 'bold' : 'normal') + ';" ' +
                'value="' + escapeHtml(r.name) + '" oninput="onSummaryInHospNameEdit(' + i + ', this.value)" onchange="onSummaryInHospNameEdit(' + i + ', this.value)">' +
                '</td>';
        html += '<td style="vertical-align:middle; padding:2px 4px;">' +
                '<input type="text" class="yr-form-control" style="width:100%; height:23px; padding:1px 5px; font-size:12px; color:' + rowColor + ';" ' +
                'value="' + escapeHtml(r.period) + '" placeholder="MM/DD～MM/DD / 頓用" oninput="onSummaryInHospPeriodEdit(' + i + ', this.value)" onchange="onSummaryInHospPeriodEdit(' + i + ', this.value)">' +
                '</td>';
        html += '<td style="vertical-align:middle; padding:2px 4px; font-size:10px; color:' + (r.autoExcluded ? '#d81b60' : '#666') + ';">' +
                escapeHtml(r.note || "") +
                '</td>';
        html += '</tr>';
    }

    tbody.innerHTML = html;
    if (badge) {
        badge.innerHTML = '全 <b>' + rows.length + '</b> 剤中 <b style="color:#00838f;">' + selectedCount + '</b> 剤を選択中';
    }
}

function toggleSummaryInHospRow(idx, evt) {
    if (summaryState.isFetching) return;
    if (evt && evt.target && evt.target.tagName && evt.target.tagName.toLowerCase() === "input") return;
    var rows = summaryState.inHospDrugRows || [];
    if (!rows[idx]) return;
    rows[idx].checked = !rows[idx].checked;
    renderSummaryInHospTable();
    updateSummaryCombinedPreview("inhosp");

    // 次回受診予定の再計算・反映（退院日以降で最も早い1件/科）
    if (summaryState.saishinOrders && summaryState.saishinOrders.length > 0) {
        var nextVisitText = calcSummaryNextVisitText(summaryState.saishinOrders, summaryState.admitEndDate);
        var saishinEl = document.getElementById("ipt-summary-saishin");
        if (saishinEl) {
            saishinEl.value = nextVisitText;
        }
        updateSummaryCombinedPreview("saishin");
    }
}

function onSummaryInHospCheckChange(idx, chkEl, evt) {
    if (summaryState.isFetching) return;
    if (evt && evt.stopPropagation) evt.stopPropagation();
    else if (window.event) window.event.cancelBubble = true;
    var rows = summaryState.inHospDrugRows || [];
    if (!rows[idx]) return;
    rows[idx].checked = !!chkEl.checked;
    renderSummaryInHospTable();
    updateSummaryCombinedPreview("inhosp");

    // 次回受診予定の再計算・反映（退院日以降で最も早い1件/科）
    if (summaryState.saishinOrders && summaryState.saishinOrders.length > 0) {
        var nextVisitText = calcSummaryNextVisitText(summaryState.saishinOrders, summaryState.admitEndDate);
        var saishinEl = document.getElementById("ipt-summary-saishin");
        if (saishinEl) {
            saishinEl.value = nextVisitText;
        }
        updateSummaryCombinedPreview("saishin");
    }
}

function onSummaryInHospNameEdit(idx, val) {
    var rows = summaryState.inHospDrugRows || [];
    if (!rows[idx]) return;
    rows[idx]._prevStdLine = getSummaryDrugRowStdLine(rows[idx]);
    rows[idx].name = val;
    var newStd = getSummaryDrugRowStdLine(rows[idx]);
    if (newStd) {
        if (!summaryState.knownAutoDrugLines) summaryState.knownAutoDrugLines = {};
        summaryState.knownAutoDrugLines[newStd] = true;
    }
    updateSummaryCombinedPreview("inhosp");
}

function onSummaryInHospPeriodEdit(idx, val) {
    var rows = summaryState.inHospDrugRows || [];
    if (!rows[idx]) return;
    rows[idx]._prevStdLine = getSummaryDrugRowStdLine(rows[idx]);
    rows[idx].period = val;
    var newStd = getSummaryDrugRowStdLine(rows[idx]);
    if (newStd) {
        if (!summaryState.knownAutoDrugLines) summaryState.knownAutoDrugLines = {};
        summaryState.knownAutoDrugLines[newStd] = true;
    }
    updateSummaryCombinedPreview("inhosp");
}

function setSummaryInHospSelection(mode) {
    if (summaryState.isFetching) return;
    var rows = summaryState.inHospDrugRows || [];
    for (var i = 0; i < rows.length; i++) {
        if (mode === "all") {
            rows[i].checked = true;
        } else if (mode === "none") {
            rows[i].checked = false;
        } else if (mode === "default") {
            rows[i].checked = !rows[i].autoExcluded;
        } else if (mode === "exclude_tonyo") {
            if (rows[i].category === "頓用" || rows[i].category === "頓服" || rows[i].isTonyo || trimSummaryStr(rows[i].period) === "頓用") {
                rows[i].checked = false;
            }
        }
    }
    renderSummaryInHospTable();
    updateSummaryCombinedPreview("inhosp");

    // 次回受診予定の再計算・反映（退院日以降で最も早い1件/科）
    if (summaryState.saishinOrders && summaryState.saishinOrders.length > 0) {
        var nextVisitText = calcSummaryNextVisitText(summaryState.saishinOrders, summaryState.admitEndDate);
        var saishinEl = document.getElementById("ipt-summary-saishin");
        if (saishinEl) {
            saishinEl.value = nextVisitText;
        }
        updateSummaryCombinedPreview("saishin");
    }
}

function addSummaryManualDrugRow() {
    if (summaryState.isFetching) return;
    if (!summaryState.inHospDrugRows) summaryState.inHospDrugRows = [];
    summaryState.inHospDrugRows.push({
        checked: true,
        category: "内服",
        name: "",
        period: "",
        firstStart: "9999/99/99",
        autoExcluded: false,
        note: "手動追加",
        _lastStdLine: "",
        _prevStdLine: ""
    });
    renderSummaryInHospTable();
    updateSummaryCombinedPreview("inhosp");

    // 次回受診予定の再計算・反映（退院日以降で最も早い1件/科）
    if (summaryState.saishinOrders && summaryState.saishinOrders.length > 0) {
        var nextVisitText = calcSummaryNextVisitText(summaryState.saishinOrders, summaryState.admitEndDate);
        var saishinEl = document.getElementById("ipt-summary-saishin");
        if (saishinEl) {
            saishinEl.value = nextVisitText;
        }
        updateSummaryCombinedPreview("saishin");
    }
}

// 入院中使用薬（選択分）の整形テキスト生成
function getSummarySelectedInHospText() {
    var rows = summaryState.inHospDrugRows || [];
    var lines = [];
    for (var i = 0; i < rows.length; i++) {
        var r = rows[i];
        if (!r.checked) continue;
        var std = getSummaryDrugRowStdLine(r);
        if (!std) continue;
        lines.push(std);
    }
    return lines.join("\n");
}

// ⑤内の指定見出し行（【主病名】・【併存疾患】・【手術】）のみをピンポイント更新・挿入・削除するヘルパー
function upsertOrRemoveSummaryHeaderLine(lines, tagPrefix, newValue, afterTagPrefixes) {
    var existingIdx = -1;
    for (var i = 0; i < lines.length; i++) {
        if (lines[i].indexOf(tagPrefix) === 0) {
            existingIdx = i;
            break;
        }
    }
    if (!newValue) {
        if (existingIdx !== -1) {
            lines.splice(existingIdx, 1);
        }
        return;
    }
    var newLine = tagPrefix + newValue;
    if (existingIdx !== -1) {
        lines[existingIdx] = newLine;
        return;
    }
    // 挿入位置を決定（afterTagPrefixes の直後、なければ先頭）
    var insertIdx = 0;
    if (afterTagPrefixes && afterTagPrefixes.length > 0) {
        for (var j = 0; j < lines.length; j++) {
            for (var p = 0; p < afterTagPrefixes.length; p++) {
                if (lines[j].indexOf(afterTagPrefixes[p]) === 0) {
                    insertIdx = j + 1;
                }
            }
        }
    }
    lines.splice(insertIdx, 0, newLine);
}

// ⑤を初期整形状態にリセットするボタン処理
function resetSummaryCombinedPreview() {
    if (summaryState.isFetching) return;
    var lockChk = document.getElementById("chk-summary-lock-combined");
    if (lockChk) lockChk.checked = false;
    var rows = summaryState.inHospDrugRows || [];
    for (var i = 0; i < rows.length; i++) {
        rows[i]._inlineSuffix = "";
    }
    updateSummaryCombinedPreview("reset");
    yrShowAlert("⑤の転記用テキストを初期整形状態に戻しました。", "info");
}

// ⑤ <特記事項><入院中に使用された主なお薬> 用の一括整形テキストを更新（手書き追記・編集保持対応）
function updateSummaryCombinedPreview(source) {
    var previewEl = document.getElementById("txt-summary-combined-preview");
    if (!previewEl) return;

    // 自動反映ロックがONの場合は、初期生成(init)と明示的リセット(reset)以外では書き換えない
    var lockChk = document.getElementById("chk-summary-lock-combined");
    if (lockChk && lockChk.checked && source !== "init" && source !== "reset") {
        return;
    }

    var mainDisEl = document.getElementById("ipt-summary-main-disease");
    var comorbEl = document.getElementById("ipt-summary-comorbidities");
    var surgEl = document.getElementById("ipt-summary-surgery");
    var saishinEl = document.getElementById("ipt-summary-saishin");

    var mainDis = mainDisEl ? trimSummaryStr(mainDisEl.value) : "";
    var comorb = comorbEl ? trimSummaryStr(comorbEl.value) : "";
    var surg = surgEl ? trimSummaryStr(surgEl.value) : "";
    var validSurg = (surg && surg !== "なし") ? surg : "";
    var saishinVal = saishinEl ? trimSummaryStr(saishinEl.value) : "";
    var rows = summaryState.inHospDrugRows || [];

    var currentVal = previewEl.value || "";

    // 初期状態・リセット時・または現在⑤が空欄の場合は全体を生成
    if (source === "init" || source === "reset" || trimSummaryStr(currentVal) === "") {
        var inhospTxt = getSummarySelectedInHospText();
        var parts = [];
        if (mainDis) parts.push("【主病名】" + mainDis);
        if (comorb) parts.push("【併存疾患】" + comorb);
        if (validSurg) parts.push("【手術】" + validSurg);
        if (saishinVal) parts.push("【次回受診】" + saishinVal);
        if (inhospTxt) parts.push("【入院中に使用した主な薬剤】\n" + inhospTxt);
        previewEl.value = parts.join("\n");
        if (!summaryState.knownAutoDrugLines) summaryState.knownAutoDrugLines = {};
        for (var i0 = 0; i0 < rows.length; i0++) {
            var s0 = getSummaryDrugRowStdLine(rows[i0]);
            rows[i0]._lastStdLine = s0;
            rows[i0]._prevStdLine = s0;
            if (s0) summaryState.knownAutoDrugLines[s0] = true;
        }
        autoResizeSummaryTextareas();
        return;
    }

    var lines = currentVal.replace(/\r\n/g, "\n").replace(/\r/g, "\n").split("\n");

    // 1. ①の特定項目が編集された場合は、該当する見出し行のみをピンポイント更新し、他の手書き内容は一切消さない
    if (source === "main_disease") {
        upsertOrRemoveSummaryHeaderLine(lines, "【主病名】", mainDis, []);
        previewEl.value = lines.join("\n");
        autoResizeSummaryTextareas();
        return;
    }
    if (source === "comorbidities") {
        upsertOrRemoveSummaryHeaderLine(lines, "【併存疾患】", comorb, ["【主病名】"]);
        previewEl.value = lines.join("\n");
        autoResizeSummaryTextareas();
        return;
    }
    if (source === "surgery") {
        upsertOrRemoveSummaryHeaderLine(lines, "【手術】", validSurg, ["【主病名】", "【併存疾患】"]);
        previewEl.value = lines.join("\n");
        autoResizeSummaryTextareas();
        return;
    }
    if (source === "saishin") {
        upsertOrRemoveSummaryHeaderLine(lines, "【次回受診】", saishinVal, ["【主病名】", "【併存疾患】", "【手術】"]);
        previewEl.value = lines.join("\n");
        autoResizeSummaryTextareas();
        return;
    }

    // 2. ④（入院中に使用した薬剤一覧）が変更された場合（または引数なし呼び出し時）：
    //    ⑤内の手書き特記事項・フリーコメント・各薬剤行末への手書き追記を保持したまま薬剤リスト部分のみを更新する
    if (!source) {
        upsertOrRemoveSummaryHeaderLine(lines, "【主病名】", mainDis, []);
        upsertOrRemoveSummaryHeaderLine(lines, "【併存疾患】", comorb, ["【主病名】"]);
        upsertOrRemoveSummaryHeaderLine(lines, "【手術】", validSurg, ["【主病名】", "【併存疾患】"]);
        upsertOrRemoveSummaryHeaderLine(lines, "【次回受診】", saishinVal, ["【主病名】", "【併存疾患】", "【手術】"]);
    }

    var drugHeader = "【入院中に使用した主な薬剤】";
    var hdrIdx = -1;
    for (var h = 0; h < lines.length; h++) {
        if (lines[h].indexOf(drugHeader) === 0) {
            hdrIdx = h;
            break;
        }
    }

    if (!summaryState.knownAutoDrugLines) summaryState.knownAutoDrugLines = {};

    // 既存の【入院中に使用した主な薬剤】ブロックから、ユーザーが手書き追記したインラインコメントや自由記述行を抽出して保護する
    var blockEndIdx = lines.length;
    var customBlockLines = [];
    if (hdrIdx !== -1) {
        for (var b = hdrIdx + 1; b < lines.length; b++) {
            // 別の【...】見出し行が下にあればそこまでを薬剤ブロックとする
            if (/^【[^】]+】/.test(lines[b])) {
                blockEndIdx = b;
                break;
            }
        }
        var existingDrugLines = lines.slice(hdrIdx + 1, blockEndIdx);
        for (var e = 0; e < existingDrugLines.length; e++) {
            var exLine = existingDrugLines[e];
            var exTrim = trimSummaryStr(exLine);
            if (!exTrim) continue;

            var matchedRow = null;
            var matchedBase = "";
            for (var rIdx = 0; rIdx < rows.length; rIdx++) {
                var rObj = rows[rIdx];
                var candPrev = rObj._prevStdLine || rObj._lastStdLine || "";
                var candCurr = getSummaryDrugRowStdLine(rObj);
                if (candPrev && (exLine === candPrev || exLine.indexOf(candPrev) === 0)) {
                    matchedRow = rObj;
                    matchedBase = candPrev;
                    break;
                }
                if (candCurr && (exLine === candCurr || exLine.indexOf(candCurr) === 0)) {
                    matchedRow = rObj;
                    matchedBase = candCurr;
                    break;
                }
            }

            if (matchedRow) {
                var suffix = exLine.substring(matchedBase.length);
                matchedRow._inlineSuffix = suffix;
            } else if (!summaryState.knownAutoDrugLines[exTrim]) {
                // 自動生成された薬剤行ではない行＝ユーザーが⑤に直接書き込んだコメント・メモ行として保持
                customBlockLines.push(exLine);
            }
        }
    }

    // 現在選択されている薬剤行（＋保持された行末手書きコメント）＋ユーザー自由記述行を組み立てる
    var newDrugLines = [];
    for (var k = 0; k < rows.length; k++) {
        var row = rows[k];
        var stdLine = getSummaryDrugRowStdLine(row);
        row._lastStdLine = stdLine;
        row._prevStdLine = stdLine;
        if (stdLine) {
            summaryState.knownAutoDrugLines[stdLine] = true;
        }
        if (!row.checked || !stdLine) continue;
        newDrugLines.push(stdLine + (row._inlineSuffix || ""));
    }
    for (var c = 0; c < customBlockLines.length; c++) {
        newDrugLines.push(customBlockLines[c]);
    }

    if (hdrIdx !== -1) {
        var beforeLines = lines.slice(0, hdrIdx);
        var afterLines = lines.slice(blockEndIdx);
        var middleLines = (newDrugLines.length > 0) ? [drugHeader].concat(newDrugLines) : [];
        lines = beforeLines.concat(middleLines).concat(afterLines);
    } else if (newDrugLines.length > 0) {
        lines.push(drugHeader);
        for (var nIdx = 0; nIdx < newDrugLines.length; nIdx++) {
            lines.push(newDrugLines[nIdx]);
        }
    }

    previewEl.value = lines.join("\n");
    autoResizeSummaryTextareas();
}

// 各項目および一括テキストのクリップボードコピー
function copySummarySection(sectionType) {
    if (summaryState.isFetching) return;
    var textToCopy = "";
    var label = "";

    if (sectionType === "main_disease") {
        var mEl = document.getElementById("ipt-summary-main-disease");
        textToCopy = mEl ? trimSummaryStr(mEl.value) : "";
        label = "主病名";
    } else if (sectionType === "comorbidities") {
        var cEl = document.getElementById("ipt-summary-comorbidities");
        textToCopy = cEl ? trimSummaryStr(cEl.value) : "";
        label = "併存疾患";
    } else if (sectionType === "surgery") {
        var sEl = document.getElementById("ipt-summary-surgery");
        textToCopy = sEl ? trimSummaryStr(sEl.value) : "";
        label = "手術情報";
    } else if (sectionType === "saishin") {
        var saiEl = document.getElementById("ipt-summary-saishin");
        textToCopy = saiEl ? trimSummaryStr(saiEl.value) : "";
        label = "次回受診予定";
    } else if (sectionType === "disease_surgery") {
        var mVal = trimSummaryStr((document.getElementById("ipt-summary-main-disease") || {}).value || "");
        var cVal = trimSummaryStr((document.getElementById("ipt-summary-comorbidities") || {}).value || "");
        var sVal = trimSummaryStr((document.getElementById("ipt-summary-surgery") || {}).value || "");
        var saiVal = trimSummaryStr((document.getElementById("ipt-summary-saishin") || {}).value || "");
        var dsLines = [];
        if (mVal) dsLines.push("【主病名】" + mVal);
        if (cVal) dsLines.push("【併存疾患】" + cVal);
        if (sVal && sVal !== "なし") dsLines.push("【手術】" + sVal);
        if (saiVal) dsLines.push("【次回受診】" + saiVal);
        textToCopy = dsLines.join("\n");
        label = "病名・手術・受診情報";
    } else if (sectionType === "discharge_rx") {
        var dEl = document.getElementById("txt-summary-discharge-rx");
        textToCopy = dEl ? trimSummaryStr(dEl.value) : "";
        label = "退院処方";
    } else if (sectionType === "brought_in_rx") {
        var bEl = document.getElementById("txt-summary-brought-in-rx");
        textToCopy = bEl ? trimSummaryStr(bEl.value) : "";
        label = "入院時持参薬";
    } else if (sectionType === "inhosp") {
        textToCopy = getSummarySelectedInHospText();
        label = "入院中使用薬剤一覧";
    } else if (sectionType === "combined") {
        var pEl = document.getElementById("txt-summary-combined-preview");
        textToCopy = pEl ? trimSummaryStr(pEl.value) : "";
        label = "＜特記事項・入院中薬剤＞一括テキスト";
    }

    if (!textToCopy) {
        yrShowAlert(label + " が空です。", "error");
        return;
    }

    try {
        window.clipboardData.setData("Text", textToCopy);
        yrShowAlert("「" + label + "」をクリップボードにコピーしました！", "info");
    } catch(e) {
        yrShowAlert("コピーに失敗しました。", "error");
    }
}

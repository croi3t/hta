/**
 * Board2 - Core Controller
 * アプリケーションの初期化、タブ切り替え、ユーザー管理、自動保存・同期を統括します。
 */

// グローバル状態
var currentWard = 1;
var currentUserName = "guest";
var currentSystemId = "";
var isEditMode = false;
var ALL_WARDS = [
    { code: "6A", name: "6A病棟" }, { code: "6B", name: "6B病棟" }, { code: "7A", name: "7A病棟" },
    { code: "7B", name: "7B病棟" }, { code: "8A", name: "8A病棟" }, { code: "8B", name: "8B病棟" },
    { code: "9A", name: "9A病棟" }, { code: "ICU", name: "ICU" }, { code: "HCU", name: "HCU" }
];

window.onload = function() {
    initApp();
};

function initApp() {
    try { window.resizeTo(1600, 900); } catch(e){}
    
    // 1. DataManager 初期化
    if (!DataManager.init()) {
        alert("FileSystemObject の初期化に失敗しました。HTA環境で実行してください。");
        return;
    }

    // 2. データ読み込み
    DataManager.loadAll();
    
    // 3. UI 初期描画
    updateLoginDisplay();
    applySettings();
    updateAnnouncementArea();
    switchTab('tab-patients');
    
    // 4. 定期同期 (1分) - Req.4: 入力中はスキップ
    setInterval(function(){
        // テキストエリアや入力欄にフォーカスがある場合は自動更新をスキップ
        var activeEl = document.activeElement;
        var isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
        
        if (!isTyping) {
            DataManager.loadAll();
            applyAnnouncement(); // お知らせの反映
            renderActiveTab();
            
            var now = new Date();
            var timeStr = (("0"+now.getHours()).slice(-2)) + ":" + (("0"+now.getMinutes()).slice(-2));
            var elTime = document.getElementById("last-update-time");
            if(elTime) elTime.innerText = "【自動同期: " + timeStr + "】";
        }
    }, 60000);
}

function switchTab(tabId) {
    var tabs = document.querySelectorAll('.tab');
    var contents = document.querySelectorAll('.tab-content');
    
    for(var i=0; i<tabs.length; i++) {
        tabs[i].classList.remove('active');
        contents[i].classList.remove('active');
        if(tabs[i].id === 'tab-btn-' + tabId.replace('tab-','')) tabs[i].classList.add('active');
        if(contents[i].id === tabId) contents[i].classList.add('active');
    }
    renderActiveTab();
}

function renderActiveTab() {
    var activeTab = document.querySelector('.tab-content.active');
    if (!activeTab) return;
    
    switch(activeTab.id) {
        case 'tab-patients': PatientUI.render(); break;
        case 'tab-todo': TodoUI.render(); break;
        case 'tab-history': HistoryUI.render(); break;
        case 'tab-settings': renderSettings(); break;
    }
}

function switchWard(w) {
    currentWard = w;
    var btns = document.querySelectorAll('.sub-tab');
    for(var i=0; i<btns.length; i++) {
        btns[i].classList.remove('active');
        if(btns[i].id === 'btn-ward-' + w) btns[i].classList.add('active');
    }
    PatientUI.render();
}

// ユーザー管理
function openLoginModal() {
    document.getElementById('modal-login').style.display = 'flex';
}

function login() {
    var name = document.getElementById('ipt-login-user').value.trim();
    if(!name) return;
    currentUserName = name;
    currentSystemId = name; // 簡易化のため名前をIDとする
    isEditMode = true;
    
    document.getElementById('modal-login').style.display = 'none';
    
    // Req.7: 個別病棟設定の読み込み
    var userWards = DataManager.appData.userWards || {};
    if (userWards[currentSystemId]) {
        currentWard = userWards[currentSystemId];
    }
    
    updateLoginDisplay();
    applySettings();
    updateAnnouncementArea();
    
    // 編集モード有効化
    var editBtns = ["btn-save", "btn-reset", "btn-reset-chk", "btn-fetch", "btn-excel-import", "btn-save-settings", "btn-edit-announcement"];
    for(var i=0; i<editBtns.length; i++) {
        var el = document.getElementById(editBtns[i]);
        if(el) { el.style.display = "inline-block"; el.disabled = false; }
    }
    
    renderActiveTab();
}

function updateLoginDisplay() {
    var lbl = document.getElementById('current-user-display');
    if(isEditMode) {
        lbl.innerText = currentUserName + " (ログイン済)";
        lbl.style.color = "#2ecc71";
    } else {
        lbl.innerText = "👀 閲覧モード (クリックしてログイン)";
    }
}

function applySettings() {
    // タブ表示の更新 (currentWard に基づく)
    var btns = document.querySelectorAll('.sub-tab');
    for(var i=0; i<btns.length; i++) {
        btns[i].classList.remove('active');
        if(btns[i].id === 'btn-ward-' + currentWard) btns[i].classList.add('active');
    }
}

function updateAnnouncementArea() {
    var area = document.getElementById("global-announcement-area");
    var txtEl = document.getElementById("announcement-text");
    var msg = DataManager.appData.announcement || "";
    
    if(msg && area && txtEl) {
        txtEl.innerText = msg;
        area.style.display = "flex";
    } else if(area) {
        area.style.display = "none";
    }
}

function applyAnnouncement() {
    updateAnnouncementArea();
}

function editAnnouncement() {
    if(!isEditMode) return;
    var current = DataManager.appData.announcement || "";
    var newVal = prompt("お知らせを入力してください（空白で削除）", current);
    if(newVal !== null) {
        DataManager.appData.announcement = newVal;
        updateAnnouncementArea();
        DataManager.saveCategory("settings", DataManager.appData);
    }
}

function saveData(manual) {
    // Req.5: 入力中は再描画を伴う保存を抑制（手動保存以外）
    var activeEl = document.activeElement;
    var isTyping = activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName === "TEXTAREA");
    
    DataManager.saveAll(DataManager.appData);
    
    if(manual) {
        alert("データを保存しました。");
        renderActiveTab();
    } else if (!isTyping) {
        renderActiveTab();
    }
}

function loadData(manual) {
    DataManager.loadAll();
    applyAnnouncement();
    renderActiveTab();
    if(manual) alert("最新データを読み込みました。");
}

function renderSettings() {
    var container = document.getElementById('ward-select-container');
    if(!container) return;
    
    var h = '<h4>ログイン時に表示する病棟を選択してください</h4>';
    h += '<select id="sel-default-ward" style="padding:5px; font-size:14px;">';
    for(var i=0; i<ALL_WARDS.length; i++) {
        var w = ALL_WARDS[i];
        var sel = (currentWard == (i+1)) ? "selected" : "";
        h += '<option value="' + (i+1) + '" ' + sel + '>' + w.name + '</option>';
    }
    h += '</select>';
    container.innerHTML = h;
}

function saveSettingsForm() {
    var sel = document.getElementById('sel-default-ward');
    if(!sel) return;
    
    var newWard = parseInt(sel.value, 10);
    currentWard = newWard;
    
    // Req.7: ユーザー別設定の保存
    if(!DataManager.appData.userWards) DataManager.appData.userWards = {};
    DataManager.appData.userWards[currentSystemId] = newWard;
    
    DataManager.saveCategory("settings", DataManager.appData);
    alert("設定を保存しました。次回ログイン時から反映されます。");
    switchTab('tab-patients');
}

// 共通ユーティリティ
function escapeHtml(str) {
    if(!str) return "";
    return str.toString().replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

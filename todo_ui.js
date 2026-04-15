/**
 * Board2 - Todo UI Module
 * (ID-based Safe Version)
 */

var TodoUI = {
    currentTodoTab: "common", // "common", ward code (e.g. "31"), or "personal"
    pendingDeadline: "",
    editingTodoId: null,

    render: function() {
        this.renderSubTabs();
        var tbody = document.getElementById("tbody-todo");
        var tbodyDeleted = document.getElementById("tbody-todo-deleted");
        if (!tbody) return;

        var todos = DataManager.appData.todos || [];
        var activeHtml = "";
        var deletedHtml = "";
        
        for (var i = 0; i < todos.length; i++) {
            var t = todos[i];
            if (t.archived) continue;

            // フィルタリングロジック
            if (!this.isMatchCurrentTab(t)) continue;

            if (t.deleted) {
                deletedHtml += this.generateDeletedRowHtml(t);
            } else {
                activeHtml += this.generateActiveRowHtml(t);
            }
        }

        tbody.innerHTML = activeHtml || '<tr><td colspan="4" align="center" style="padding:20px; color:#999;">このカテゴリのタスクはありません。</td></tr>';
        if (tbodyDeleted) {
            if (deletedHtml) {
                var headerHtml = '<tr style="background:#eee; font-weight:bold;"><td colspan="4" style="padding:5px 10px; font-size:11px; color:#666;">▼ 削除済みのタスク (保存・同期後に完全に消去されます)</td></tr>';
                tbodyDeleted.innerHTML = headerHtml + deletedHtml;
            } else {
                tbodyDeleted.innerHTML = "";
            }
        }
    },

    renderSubTabs: function() {
        var container = document.getElementById("todo-sub-tabs");
        if (!container) return;

        // グローバルな appData.settings.activeWardCodes を参照する
        var activeCodes = (typeof appData !== "undefined" && appData.settings && appData.settings.activeWardCodes) || 
                          (DataManager.appData.settings && DataManager.appData.settings.activeWardCodes) || 
                          ["99", "32", "33"];
        
        var tabs = [
            { id: "common", name: "🏠 共通" }
        ];

        // 設定されている病棟のみを表示
        for (var i = 0; i < activeCodes.length; i++) {
            var code = activeCodes[i];
            var name = typeof getWardName === "function" ? getWardName(code) : code;
            tabs.push({ id: code, name: name });
        }

        tabs.push({ id: "personal", name: "👤 Private" });

        var h = "";
        for (var j = 0; j < tabs.length; j++) {
            var tab = tabs[j];
            var activeClass = (this.currentTodoTab === tab.id) ? "active" : "";
            h += '<div class="sub-tab ' + activeClass + '" onclick="TodoUI.switchSubTab(\'' + tab.id + '\')">' + tab.name + '</div>';
        }
        
        // 患者タブと同様の +ボタン
        h += '<div class="sub-tab tab-plus" onclick="showAddWardModal()" style="font-weight:bold; color:#2980b9;">+</div>';

        container.innerHTML = h;
    },

    switchSubTab: function(tabId) {
        this.currentTodoTab = tabId;
        this.render();
        // 入力欄の活性化状態を更新
        var ipt = document.getElementById("ipt-new-todo");
        var btn = document.getElementById("btn-add-todo");
        if (ipt && btn) {
            ipt.disabled = !isEditMode;
            btn.disabled = !isEditMode;
        }
    },

    isMatchCurrentTab: function(t) {
        if (this.currentTodoTab === "personal") {
            // ID または 名前のいずれかが一致すれば表示（過去データとの互換性確保）
            return t.assignee === currentSystemId || t.assignee === currentUserName;
        }
        if (this.currentTodoTab === "common") {
            return !t.wardId || t.wardId === "0" || t.wardId === "common";
        }
        // 病棟タブ
        return t.wardId === this.currentTodoTab;
    },

    generateActiveRowHtml: function(t) {
        var checked = t.done ? "checked" : "";
        var rowStyle = "";
        var deadlineInfo = "";
        
        if (t.deadline) {
            var dState = this.parseDate(t.deadline);
            var dlStyle = dState.isOverdue ? "color:#e74c3c; font-weight:bold;" : "color:#666;";
            deadlineInfo = '<div style="font-size:10px; margin-top:2px; ' + dlStyle + '">期限: ' + escapeHtml(t.deadline) + '</div>';
            
            if (dState.isOverdue) rowStyle = "background-color: #fff3cd;";
            else if (dState.isToday) rowStyle = "background-color: #ffebee;";
        }
        
        if (t.done) rowStyle = "text-decoration: line-through; color: #999; background-color: #f9f9f9;";
        
        var assigneeStr = t.assignee ? '<span style="color:#2980b9; font-size:10px; margin-left:5px; font-weight:bold;">@' + escapeHtml(t.assignee) + '</span>' : '';
        
        // 全て t.id ベースの操作に書き換え
        var h = '<tr style="' + rowStyle + '">';
        h += '<td align="center"><input type="checkbox" ' + checked + ' onclick="TodoUI.toggleDone(\'' + t.id + '\')"></td>';
        h += '<td style="cursor:pointer;" onclick="TodoUI.editTodo(\'' + t.id + '\')">' + escapeHtml(t.text) + assigneeStr + deadlineInfo + '</td>';
        h += '<td style="font-size:11px; color:#666;">' + escapeHtml(t.author || "不明") + '<br>' + escapeHtml(t.date || "") + '</td>';
        h += '<td align="center" style="white-space:nowrap;">';
        h += '<button class="btn" onclick="TodoUI.editTodo(\'' + t.id + '\')" style="background:#3498db; padding:2px 6px; color:white; margin-right:3px;" title="編集">✎</button>';
        h += '<button class="btn" onclick="TodoUI.deleteTodo(\'' + t.id + '\')" style="background:#e74c3c; padding:2px 6px; color:white;" title="削除">✕</button>';
        h += '</td>';
        h += '</tr>';
        return h;
    },

    generateDeletedRowHtml: function(t) {
        var statusLabel = t.done ? '<span style="color:#27ae60;font-size:10px;">[完了済]</span>' : '<span style="color:#c0392b;font-size:10px;">[未完了]</span>';
        var h = '<tr style="background-color:#f9f9f9; color:#999; text-decoration:line-through;">';
        h += '<td align="center">-</td>';
        h += '<td>' + statusLabel + ' ' + escapeHtml(t.text) + '</td>';
        h += '<td style="font-size:11px;">' + escapeHtml(t.author || "") + '</td>';
        h += '<td align="center" style="white-space:nowrap;">';
        h += '<button class="btn" onclick="TodoUI.restoreTodo(\'' + t.id + '\')" style="background:#2ecc71; padding:2px 6px; color:white; margin-right:3px; font-size:10px;" title="元に戻す">↺</button>';
        h += '<button class="btn" onclick="TodoUI.permanentlyDeleteTodo(\'' + t.id + '\')" style="background:#95a5a6; padding:2px 6px; color:white; font-size:10px;" title="完全に削除">🗑</button>';
        h += '</td>';
        h += '</tr>';
        return h;
    },

    parseDate: function(deadlineStr) {
        if (!deadlineStr || deadlineStr.trim() === "") return { isToday: false, isOverdue: false };
        var now = new Date();
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
            if (curMonth - targetMonth === -11) return { isToday: false, isOverdue: false };
            return { isToday: false, isOverdue: true };
        }
        if (targetMonth - curMonth === 11) return { isToday: false, isOverdue: true };
        return { isToday: false, isOverdue: false };
    },

    toggleDone: function(id) {
        if (!isEditMode) return;
        var todos = DataManager.appData.todos || [];
        for (var i = 0; i < todos.length; i++) {
            if (String(todos[i].id) === String(id)) {
                todos[i].done = !todos[i].done;
                if (todos[i].done && todos[i].notifyOnDone && typeof showGhostNotification === "function") {
                    showGhostNotification("ToDo完了: " + todos[i].text);
                }
                break;
            }
        }
        this.render();
        if (typeof autoSave === "function") autoSave();
    },

    deleteTodo: function(id) {
        if (!isEditMode) return;
        var todos = DataManager.appData.todos || [];
        for (var i = 0; i < todos.length; i++) {
            if (String(todos[i].id) === String(id)) {
                todos[i].deleted = {
                    date: (new Date().getMonth()+1) + "/" + new Date().getDate(),
                    author: currentUserName,
                    wasDone: !!todos[i].done
                };
                break;
            }
        }
        this.render();
        if (typeof autoSave === "function") autoSave();
    },

    restoreTodo: function(id) {
        if (!isEditMode) return;
        var todos = DataManager.appData.todos || [];
        for (var i = 0; i < todos.length; i++) {
            if (String(todos[i].id) === String(id)) {
                todos[i].deleted = false;
                break;
            }
        }
        this.render();
        if (typeof autoSave === "function") autoSave();
    },

    permanentlyDeleteTodo: function(id) {
        if (!isEditMode) return;
        if (confirm("このタスクを完全に削除してもよろしいですか？\n(この操作は取り消せません)")) {
            var todos = DataManager.appData.todos || [];
            for (var i = 0; i < todos.length; i++) {
                if (String(todos[i].id) === String(id)) {
                    todos.splice(i, 1);
                    break;
                }
            }
            this.render();
            if (typeof autoSave === "function") autoSave();
        }
    },

    editTodo: function(id) {
        if (!isEditMode) return;
        var t = null;
        var todos = DataManager.appData.todos || [];
        for (var i = 0; i < todos.length; i++) {
            if (String(todos[i].id) === String(id)) { t = todos[i]; break; }
        }
        if (!t) return;

        this.editingTodoId = t.id;

        var ipt = document.getElementById("ipt-new-todo");
        var btnAdd = document.getElementById("btn-add-todo");
        var btnCancel = document.getElementById("btn-cancel-todo");
        var selAssignee = document.getElementById("sel-todo-assignee");

        if (ipt) { ipt.value = t.text; ipt.focus(); }
        if (btnAdd) btnAdd.innerText = "更新";
        if (btnCancel) btnCancel.style.display = "inline-block";
        if (selAssignee && t.assignee) selAssignee.value = t.assignee;
        
        if (t.deadline) {
            this.pendingDeadline = t.deadline;
            var lbl = document.getElementById("lbl-todo-deadline");
            if (lbl) { lbl.innerText = "[" + this.pendingDeadline + "]"; lbl.style.display = "inline"; }
        }
    },

    cancelEditTodo: function() {
        this.editingTodoId = null;
        var ipt = document.getElementById("ipt-new-todo");
        var btnAdd = document.getElementById("btn-add-todo");
        var btnCancel = document.getElementById("btn-cancel-todo");
        var lbl = document.getElementById("lbl-todo-deadline");

        if (ipt) ipt.value = "";
        if (btnAdd) btnAdd.innerText = "追加";
        if (btnCancel) btnCancel.style.display = "none";
        if (lbl) { lbl.innerText = ""; lbl.style.display = "none"; }
        this.pendingDeadline = "";
    },

    getPendingDeadline: function() {
        return this.pendingDeadline;
    },

    setPendingDeadline: function(val) {
        this.pendingDeadline = val;
    },

    addNewTodoUI: function() {
        if(!isEditMode) return;
        var ipt = document.getElementById("ipt-new-todo");
        var val = (ipt.value || "").trim();
        if(val === "") { alert("ToDoの内容を入力してください。"); return; }
        
        var assigneeSel = document.getElementById("sel-todo-assignee");
        var assignee = assigneeSel ? assigneeSel.value : "";
        
        if(!DataManager.appData.todos) DataManager.appData.todos = [];
        
        if (this.editingTodoId !== null) {
            // IDベースでの更新処理
            var todos = DataManager.appData.todos || [];
            for (var i = 0; i < todos.length; i++) {
                if (String(todos[i].id) === String(this.editingTodoId)) {
                    var t = todos[i];
                    t.text = val;
                    t.deadline = this.pendingDeadline;
                    t.assignee = (this.currentTodoTab === "personal") ? currentUserName : assignee;
                    break;
                }
            }
            this.cancelEditTodo();
        } else {
            // 新規追加
            var now = new Date();
            var dateStr = (now.getMonth() + 1) + "/" + now.getDate();
            var wardId = this.currentTodoTab;
            if (wardId === "personal") {
                assignee = currentUserName;
            }

            DataManager.appData.todos.push({
                id: now.getTime(),
                text: val,
                author: currentUserName || "不明",
                date: dateStr,
                deadline: this.pendingDeadline,
                assignee: assignee,
                wardId: wardId,
                done: false,
                deleted: false
            });
        }

        ipt.value = "";
        this.pendingDeadline = "";
        var lbl = document.getElementById("lbl-todo-deadline");
        if(lbl) { lbl.style.display = "none"; lbl.innerText = ""; }
        
        this.render();
        if (typeof autoSave === "function") autoSave();
    },

    addTodo: function() {
        this.addNewTodoUI();
    },

    openCustomDatePicker: function(el) {
        var val = prompt("期限を入力してください (例: 3/25)", this.pendingDeadline);
        if (val !== null) {
            this.pendingDeadline = val;
            var lbl = document.getElementById("lbl-todo-deadline");
            if(!lbl) {
                lbl = document.createElement("span");
                lbl.id = "lbl-todo-deadline";
                lbl.style.cssText = "margin-left:5px; font-weight:bold; color:#e74c3c;";
                el.parentNode.appendChild(lbl);
            }
            lbl.innerText = "[" + this.pendingDeadline + "]";
            lbl.style.display = "inline";
        }
    }
};
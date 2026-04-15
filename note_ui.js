/**
 * Board2 - Note UI Module (Shared Notes)
 * リッチテキスト編集とページ管理を担当します。
 */

var NoteUI = {
    currentNoteId: null,
    
    render: function() {
        var container = document.getElementById("note-list-container");
        if (!container) return;

        var notes = DataManager.appData.wardNotes || [];
        var html = "";
        for (var i = 0; i < notes.length; i++) {
            var n = notes[i];
            var active = (this.currentNoteId === n.id) ? "active" : "";
            html += '<div class="note-item ' + active + '" onclick="NoteUI.loadNote(' + i + ')">';
            html += '<div class="note-item-title">' + (n.title || "無題のページ") + '</div>';
            html += '<div class="note-item-meta">' + (n.updatedAtStr || "") + '</div>';
            html += '</div>';
        }
        container.innerHTML = html || '<div style="padding:10px; color:#999;">ノートはありません</div>';
    },

    loadNote: function(index) {
        var n = DataManager.appData.wardNotes[index];
        if (!n) return;
        
        this.currentNoteId = n.id;
        document.getElementById("note-title").value = n.title || "";
        document.getElementById("note-editor-rich").innerHTML = n.content || "";
        this.render();
    },

    saveCurrent: function() {
        if (!this.currentNoteId) return;
        
        var notes = DataManager.appData.wardNotes;
        for (var i = 0; i < notes.length; i++) {
            if (notes[i].id === this.currentNoteId) {
                notes[i].title = document.getElementById("note-title").value;
                notes[i].content = document.getElementById("note-editor-rich").innerHTML;
                notes[i].updatedAtStr = new Date().toLocaleString();
                break;
            }
        }
        DataManager.saveCategory("notes", DataManager.appData);
        this.render();
    }
};

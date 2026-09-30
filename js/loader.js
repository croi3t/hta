/**
 * js/loader.js
 * 外部JavaScriptファイルを一括で読み込みます。
 * HTAファイル本体の記述を簡略化し、管理レベルを向上させるためのローダーです。
 */
(function() {
    var scripts = [
        "js/data_manager.js",   // 共通データ管理
        "js/merge_logic.js",    // データ統合ロジック
        "js/todo_ui.js",        // ToDo機能
        "js/tokuyaku_list.js"   // 薬剤リスト (旧 tokuyaku_list.js)
    ];

    for (var i = 0; i < scripts.length; i++) {
        document.write('<script src="' + scripts[i] + '"></script>');
    }
})();

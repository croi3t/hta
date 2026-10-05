@echo off
setlocal

rem === 設定セクション ===
rem %~dp0 はこのバッチファイルが存在するフォルダを指します
set "SRC_DIR=%~dp0"
rem デスクトップを汚さないよう、TEMPフォルダ内に一時実行場所を作成します
set "DEST_DIR=%TEMP%\PharmacyBoard_TEMP"
rem プログラムのファイル名（実態に合わせて変更してください）
set "HTA_NAME=board_batch_refactor.hta"
rem ====================

echo ツールの更新を確認しています...

if exist "%SRC_DIR%%HTA_NAME%" (
    if not exist "%DEST_DIR%" mkdir "%DEST_DIR%"
    rem 変更があったファイルのみコピーします (/D /Y)
    xcopy /d /y "%SRC_DIR%%HTA_NAME%" "%DEST_DIR%\" >nul
    xcopy /d /y /e /i "%SRC_DIR%js" "%DEST_DIR%\js" >nul
    xcopy /d /y /e /i "%SRC_DIR%css" "%DEST_DIR%\css" >nul
    echo [完了] 最新版を一時フォルダに同期しました。
) else (
    if not exist "%DEST_DIR%\%HTA_NAME%" (
        echo [エラー] 共有フォルダが見つからず、以前のコピーも存在しません。
        pause & exit /b
    )
    echo [情報] 共有フォルダに接続できません。一時フォルダ内の前回コピー版で起動します。
)

echo アプリケーションを起動しています...
cd /d "%DEST_DIR%"

rem start /wait mshta を使うことで、HTAを閉じるまでバッチが待機します
start /wait mshta "%DEST_DIR%\%HTA_NAME%"

echo 終了処理中 (一時フォルダをクリーンアップしています)...
cd /d %USERPROFILE%
rd /s /q "%DEST_DIR%"

echo 全ての処理が完了しました。
exit



// options.js

document.addEventListener('DOMContentLoaded', () => {
  const listBody = document.getElementById('list-body');
  const exportJsonButton = document.getElementById('export-json');
  const exportCsvButton = document.getElementById('export-csv');
  const importFileInput = document.getElementById('import-file');
  const importModeSelect = document.getElementById('import-mode');
  const importButton = document.getElementById('import-button');

  let readingListData = []; // データを保持する配列

  // リスト表示を更新する関数
  async function renderList() {
    try {
      const result = await chrome.storage.local.get({ readingList: [] });
      readingListData = result.readingList;
      // 追加日の降順でソート
      readingListData.sort((a, b) => new Date(b.added_at) - new Date(a.added_at));

      listBody.innerHTML = ''; // 一旦クリア

      if (readingListData.length === 0) {
        // データがない場合の表示 (colspanを修正)
        listBody.innerHTML = '<tr><td colspan="5">保存されたアイテムはありません。</td></tr>';
        return;
      }

      readingListData.forEach((item, index) => {
        const row = listBody.insertRow();
        row.dataset.id = item.id; // 行にIDを紐付ける

        // タイトル (URLの常時表示なし)
        const cellTitle = row.insertCell();
        cellTitle.innerHTML = `
          <a href="${item.url}" target="_blank" title="${item.url}">
             ${item.title || '(タイトルなし)'}
          </a>
        `;

        // ステータス (編集可能)
        const cellStatus = row.insertCell();
        const statusSelect = document.createElement('select');
        statusSelect.innerHTML = `
          <option value="unread">未読</option>
          <option value="reading">読み中</option>
          <option value="read">読了</option>
        `;
        statusSelect.value = item.status;
        statusSelect.addEventListener('change', (e) => updateItem(item.id, { status: e.target.value }));
        cellStatus.appendChild(statusSelect);

        // コメント (編集可能)
        const cellComment = row.insertCell();
        const commentTextarea = document.createElement('textarea');
        commentTextarea.value = item.comment || '';
        commentTextarea.rows = 2; // textareaのデフォルト行数 (CSSでmin-heightも指定)
        commentTextarea.addEventListener('change', (e) => updateItem(item.id, { comment: e.target.value.trim() }));
        cellComment.appendChild(commentTextarea);

        // 追加日
        const cellDate = row.insertCell();
        cellDate.textContent = new Date(item.added_at).toLocaleString('ja-JP');
        // CSS (.col-date) で white-space: nowrap; を指定しているので、ここでは不要

        // 操作ボタン
        const cellActions = row.insertCell();
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '削除';
        // options.css で定義したクラスを付与
        deleteButton.classList.add('button', 'button-danger');
        deleteButton.addEventListener('click', () => deleteItem(item.id));
        cellActions.appendChild(deleteButton);
        // CSS (.col-actions) で text-align: center; を指定しているので、ここでは不要
      });
    } catch (error) {
      console.error("リストの表示に失敗:", error);
      // エラー表示 (colspanを修正)
      listBody.innerHTML = '<tr><td colspan="5">データの読み込みに失敗しました。</td></tr>';
    }
  }

  // アイテムの更新
  async function updateItem(id, changes) {
    const itemIndex = readingListData.findIndex(item => item.id === id);
    if (itemIndex > -1) {
      // オブジェクトをマージして更新
      readingListData[itemIndex] = { ...readingListData[itemIndex], ...changes };
      try {
        await chrome.storage.local.set({ readingList: readingListData });
        console.log(`アイテム ${id} を更新しました:`, changes);
      } catch (error) {
        console.error("アイテムの更新に失敗:", error);
        alert('データの更新に失敗しました。');
        renderList(); // エラー時はリストを再読み込み
      }
    }
  }

  // アイテムの削除
  async function deleteItem(id) {
    if (confirm('このアイテムを削除してもよろしいですか？')) {
      readingListData = readingListData.filter(item => item.id !== id);
      try {
        await chrome.storage.local.set({ readingList: readingListData });
        console.log(`アイテム ${id} を削除しました`);
        renderList(); // リストを再描画
      } catch (error) {
        console.error("アイテムの削除に失敗:", error);
        alert('データの削除に失敗しました。');
        renderList(); // エラー時はリストを再読み込み
      }
    }
  }

 // --- エクスポート機能 ---
  function exportData(format) {
    if (readingListData.length === 0) {
      alert('エクスポートするデータがありません。');
      return;
    }

    let content;
    let filename;
    let mimeType;
    const timestamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-'); // YYYY-MM-DD-HH-mm-ss

    if (format === 'json') {
      content = JSON.stringify(readingListData, null, 2); // 整形して出力
      filename = `reading_list_${timestamp}.json`;
      mimeType = 'application/json;charset=utf-8;'; // UTF-8を指定
    } else if (format === 'csv') {
      try {
        // CSVのヘッダーをデータのキーから動的に生成
        const header = readingListData.length > 0 ? Object.keys(readingListData[0]).join(',') : '';
        if (!header) {
             alert('CSVヘッダーの生成に失敗しました。データが空か不正です。');
             return;
        }

        const rows = readingListData.map(item => {
          // CSV用に各値をエスケープ (ダブルクォートとカンマ、改行を考慮)
          return Object.values(item).map(value => {
              const strValue = String(value === null || value === undefined ? '' : value);
              if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                return `"${strValue.replace(/"/g, '""')}"`; // ダブルクォートは二重にする
              }
              return strValue;
          }).join(',');
        });
        content = header + '\n' + rows.join('\n');
        filename = `reading_list_${timestamp}.csv`;
        mimeType = 'text/csv;charset=utf-8;'; // UTF-8を指定
      } catch (error) {
          console.error("CSV生成エラー:", error);
          alert("CSVデータの生成に失敗しました。");
          return;
      }
    } else {
      console.error("未対応のエクスポートフォーマット:", format);
      return;
    }

    // BOM (Byte Order Mark) を追加してExcelでの文字化けを防ぐ
    const bom = new Uint8Array([0xEF, 0xBB, 0xBF]);
    const blob = new Blob([bom, content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // ダウンロードを実行 (chrome.downloads API を使用)
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true // 保存ダイアログを表示
    }).then(downloadId => {
        if (downloadId) {
            console.log(`ダウンロード開始: ID ${downloadId}`);
        } else {
             // APIが利用できない場合 (権限がない、など) は代替手段
             console.warn("chrome.downloads.download が利用できません。代替ダウンロードを試みます。");
             const a = document.createElement('a');
             a.href = url;
             a.download = filename;
             document.body.appendChild(a);
             a.click();
             document.body.removeChild(a);
        }
        // Blob URLを解放 (少し遅延させる)
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(error => {
        console.error("ダウンロードエラー:", error);
        // エラー時も代替ダウンロードを試みる
        try {
            const a = document.createElement('a');
            a.href = url;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            setTimeout(() => URL.revokeObjectURL(url), 1000); // メモリ解放
        } catch (fallbackError) {
            console.error("代替ダウンロードエラー:", fallbackError);
            alert("エクスポートファイルのダウンロードに失敗しました。");
            URL.revokeObjectURL(url); // エラー時も解放
        }
    });

  }

  exportJsonButton.addEventListener('click', () => exportData('json'));
  exportCsvButton.addEventListener('click', () => exportData('csv'));


  // --- インポート機能 ---
  let fileToImport = null;

  importFileInput.addEventListener('change', (event) => {
      fileToImport = event.target.files[0];
      importButton.disabled = !fileToImport; // ファイルが選択されたらボタンを有効化
  });

  importButton.addEventListener('click', () => {
      if (!fileToImport) return;
      const mode = importModeSelect.value; // 'append' or 'overwrite'
      importDataFromFile(fileToImport, mode);
  });

  async function importDataFromFile(file, mode) {
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        let importedData = [];
        const content = event.target.result;

        if (file.type === 'application/json' || file.name.endsWith('.json')) {
          importedData = JSON.parse(content);
          // 簡単なバリデーション
          if (!Array.isArray(importedData)) {
            throw new Error("JSONファイルが配列形式ではありません。");
          }
          // 必要なキーの存在チェックとデフォルト値設定、IDの保証
          importedData = importedData.map(item => {
              if (!item || typeof item !== 'object') return null; // 不正な要素はスキップ
              return {
                  id: (item.id && typeof item.id === 'string') ? item.id : crypto.randomUUID(),
                  url: item.url || '',
                  title: item.title || '(タイトルなし)',
                  status: ['unread', 'reading', 'read'].includes(item.status) ? item.status : 'unread', // 不正なステータスはunreadに
                  comment: item.comment || '',
                  added_at: item.added_at || new Date().toISOString(), // 日付がなければ現在日時
              };
          }).filter(item => item && item.url); // nullやURLがないものは除外

        } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          // CSVパース (簡易版、ライブラリ推奨)
          const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
          if (lines.length < 1) throw new Error("CSVデータが空です。");

          const headerLine = lines[0].trim();
          // ヘッダーのパース改善 (ダブルクォート対応)
          const headers = (headerLine.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [])
                          .map(h => h.replace(/^"|"$/g, '').replace(/""/g, '"').trim());

          const requiredHeaders = ['url', 'status', 'added_at']; // 最低限必要なヘッダー
          if (!requiredHeaders.every(h => headers.includes(h))) {
              throw new Error(`CSVファイルに必要なヘッダー (${requiredHeaders.join(', ')}) が見つかりません。`);
          }

          importedData = lines.slice(1).map((line, lineIndex) => {
            if (!line.trim()) return null; // 空行はスキップ

            // 値のパース改善 (ダブルクォート対応)
            const values = (line.match(/(".*?"|[^",]+)(?=\s*,|\s*$)/g) || [])
                           .map(v => v.replace(/^"|"$/g, '').replace(/""/g, '"').trim());


            if (values.length !== headers.length) {
                console.warn(`CSV ${lineIndex + 2} 行目: 列数がヘッダー (${headers.length}) と一致しません (${values.length})。スキップします。 Line: ${line}`);
                return null;
            }

            const entry = {};
            headers.forEach((header, index) => {
                // headerが空文字列の場合を除外
                if (header) {
                    entry[header] = values[index];
                }
            });

            // 必須項目のチェックとデフォルト値/バリデーション
            if (!entry.url) {
                 console.warn(`CSV ${lineIndex + 2} 行目: url がありません。スキップします。`);
                 return null;
            }
            if (!entry.status || !['unread', 'reading', 'read'].includes(entry.status)) {
                entry.status = 'unread'; // 不正なステータスはunreadに
            }
             if (!entry.added_at) {
                 entry.added_at = new Date().toISOString(); // 日付がなければ現在日時
             }
             // ID がない場合は生成
             if (!entry.id) {
                 entry.id = crypto.randomUUID();
             }
             // title, commentがなければ空文字に
             if (!entry.title) entry.title = '(タイトルなし)';
             if (!entry.comment) entry.comment = '';

            return entry;
          }).filter(item => item !== null); // 不正な行を除外

        } else {
          throw new Error("サポートされていないファイル形式です (JSONまたはCSVを選択してください)。");
        }

        if (importedData.length === 0) {
            alert("ファイルから有効なデータを読み込めませんでした。");
            return;
        }

        // --- データのマージ処理 ---
        const result = await chrome.storage.local.get({ readingList: [] });
        let currentList = result.readingList;
        const currentIds = new Set(currentList.map(item => item.id));
        const currentUrls = new Map(currentList.map(item => [item.url, item]));

        // インポートデータのID重複チェックと修正 (インポートデータ内 & 既存データとの重複)
        const importedIds = new Set();
        importedData = importedData.map(item => {
            let newId = item.id;
            // IDが既存リストまたは今回のインポートリストで既に使われている場合、新しいIDを生成
            while(currentIds.has(newId) || importedIds.has(newId)) {
                newId = crypto.randomUUID();
            }
            item.id = newId;
            importedIds.add(newId); // 今回のインポートで使うIDを記録
            return item;
        });

        let updatedList;
        let addedCount = 0;
        let updatedCount = 0;

        if (mode === 'overwrite') {
          updatedList = importedData;
          addedCount = importedData.length; // 上書きの場合は追加数=総数
          console.log(`インポート(上書き): ${addedCount} 件のデータでリストを置き換えます。`);
        } else { // append (追記/更新)
          updatedList = [...currentList]; // 現在のリストをコピー
           importedData.forEach(newItem => {
               const existingItem = currentUrls.get(newItem.url);
               if (existingItem) {
                   // URLが重複する場合は既存のアイテムを更新 (IDは既存のものを維持)
                   Object.assign(existingItem, { ...newItem, id: existingItem.id }); // ID以外を更新
                   updatedCount++;
               } else {
                   // URLが重複しない場合は新しいアイテムとして追加
                   updatedList.push(newItem);
                   addedCount++;
               }
           });
           console.log(`インポート(追記): ${addedCount} 件を追加, ${updatedCount} 件を更新します。`);
        }


        await chrome.storage.local.set({ readingList: updatedList });
        alert(`インポート完了。\n${mode === 'overwrite' ? addedCount + ' 件で上書きしました。' : addedCount + ' 件を追加し、' + updatedCount + ' 件を更新しました。'}`);
        renderList(); // リストを再描画
        importFileInput.value = ''; // ファイル選択をクリア
        importButton.disabled = true; // ボタンを無効化


      } catch (error) {
        console.error('インポートエラー:', error);
        alert(`データのインポートに失敗しました: ${error.message}`);
      } finally {
          // 成功・失敗に関わらずファイル選択をクリアしボタンを無効化
          importFileInput.value = '';
          importButton.disabled = true;
      }
    };

    reader.onerror = () => {
      alert(`ファイルの読み込みに失敗しました: ${reader.error}`);
      importFileInput.value = '';
      importButton.disabled = true;
    };

    reader.readAsText(file); // ファイルをテキストとして読み込む
  }


  // --- 初期表示 ---
  renderList();
});

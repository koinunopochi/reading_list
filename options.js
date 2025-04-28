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
        listBody.innerHTML = '<tr><td colspan="5">保存されたアイテムはありません。</td></tr>';
        return;
      }

      readingListData.forEach((item, index) => {
        const row = listBody.insertRow();
        row.dataset.id = item.id; // 行にIDを紐付ける

        // タイトルとURL
        const cellTitle = row.insertCell();
        cellTitle.innerHTML = `
          <a href="${item.url}" target="_blank" title="${item.url}">${item.title || '(タイトルなし)'}</a>
          <br>
          <small>${item.url}</small>
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
        commentTextarea.rows = 2;
        commentTextarea.addEventListener('change', (e) => updateItem(item.id, { comment: e.target.value.trim() }));
        cellComment.appendChild(commentTextarea);

        // 追加日
        const cellDate = row.insertCell();
        cellDate.textContent = new Date(item.added_at).toLocaleString('ja-JP');

        // 操作ボタン
        const cellActions = row.insertCell();
        const deleteButton = document.createElement('button');
        deleteButton.textContent = '削除';
        deleteButton.classList.add('delete-button');
        deleteButton.addEventListener('click', () => deleteItem(item.id));
        cellActions.appendChild(deleteButton);
      });
    } catch (error) {
      console.error("リストの表示に失敗:", error);
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
        // 必要に応じて画面を再描画（今回は変更がその場で反映されるので不要かも）
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
      mimeType = 'application/json';
    } else if (format === 'csv') {
      try {
        const header = Object.keys(readingListData[0]).join(',');
        const rows = readingListData.map(item => {
          // CSV用に各値をエスケープ (簡易版: ダブルクォートとカンマを考慮)
          return Object.values(item).map(value => {
              const strValue = String(value === null || value === undefined ? '' : value);
              // 値にカンマ、ダブルクォート、改行が含まれる場合はダブルクォートで囲む
              if (strValue.includes(',') || strValue.includes('"') || strValue.includes('\n')) {
                // ダブルクォートは二重にする
                return `"${strValue.replace(/"/g, '""')}"`;
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
      return; // 未対応フォーマット
    }

    // BOM (Byte Order Mark) を追加してExcelでの文字化けを防ぐ (CSVの場合)
    const bom = format === 'csv' ? new Uint8Array([0xEF, 0xBB, 0xBF]) : new Uint8Array([]);
    const blob = new Blob([bom, content], { type: mimeType });
    const url = URL.createObjectURL(blob);

    // ダウンロードリンクを作成してクリック
    chrome.downloads.download({
        url: url,
        filename: filename,
        saveAs: true // 保存ダイアログを表示
    }).then(downloadId => {
        console.log(`ダウンロード開始: ID ${downloadId}`);
        // Blob URLを解放 (少し遅延させる)
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }).catch(error => {
        console.error("ダウンロードエラー:", error);
        alert("エクスポートファイルのダウンロードに失敗しました。");
        URL.revokeObjectURL(url); // エラー時も解放
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
          // 各要素に必要なキーがあるかチェック (url, status, added_at は欲しい)
          importedData = importedData.filter(item => item && item.url && item.status && item.added_at);
          // ID がない、または不正な場合は生成/修正
           importedData = importedData.map(item => ({
               ...item, // 既存のプロパティを維持
               id: item.id && typeof item.id === 'string' ? item.id : crypto.randomUUID(), // IDを保証
               title: item.title || '(タイトルなし)',
               comment: item.comment || '',
           }));


        } else if (file.type === 'text/csv' || file.name.endsWith('.csv')) {
          // CSVパース (簡易版、ライブラリ推奨)
          const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
          if (lines.length < 2) throw new Error("CSVデータが空か、ヘッダーしかありません。");

          const headerLine = lines[0].trim();
          const headers = headerLine.split(',').map(h => h.replace(/^"|"$/g, '').trim()); // ヘッダー取得

          const requiredHeaders = ['url', 'status', 'added_at']; // 最低限必要なヘッダー
          if (!requiredHeaders.every(h => headers.includes(h))) {
              throw new Error(`CSVファイルに必要なヘッダー (${requiredHeaders.join(', ')}) が見つかりません。`);
          }

          importedData = lines.slice(1).map((line, lineIndex) => {
            if (!line.trim()) return null; // 空行はスキップ

            // カンマ区切りを考慮したパース (非常に簡易的)
            // ダブルクォート内のカンマを無視する正規表現 (完璧ではない)
            const values = [];
            let currentVal = '';
            let inQuotes = false;
            for (let i = 0; i < line.length; i++) {
                const char = line[i];
                if (char === '"') {
                    if (inQuotes && line[i+1] === '"') { // "" はエスケープされた "
                        currentVal += '"';
                        i++; // 次の " をスキップ
                    } else {
                        inQuotes = !inQuotes;
                    }
                } else if (char === ',' && !inQuotes) {
                    values.push(currentVal.trim());
                    currentVal = '';
                } else {
                    currentVal += char;
                }
            }
            values.push(currentVal.trim()); // 最後の値


            if (values.length !== headers.length) {
                console.warn(`CSV ${lineIndex + 2} 行目: 列数がヘッダーと一致しません。スキップします。`);
                return null;
            }

            const entry = {};
            headers.forEach((header, index) => {
              // ダブルクォートで囲まれていたら外す (開始と終了のみ)
              let value = values[index];
               if (value.startsWith('"') && value.endsWith('"')) {
                   value = value.slice(1, -1).replace(/""/g, '"'); // "" を " に戻す
               }
              entry[header] = value;
            });

            // 必須項目のチェック
            if (!entry.url || !entry.status || !entry.added_at) {
                 console.warn(`CSV ${lineIndex + 2} 行目: 必須項目 (url, status, added_at) が不足しています。スキップします。`);
                 return null;
            }
             // ID がない場合は生成
             if (!entry.id) entry.id = crypto.randomUUID();
            return entry;
          }).filter(item => item !== null); // 不正な行を除外

        } else {
          throw new Error("サポートされていないファイル形式です (JSONまたはCSVを選択してください)。");
        }

        if (importedData.length === 0) {
            alert("ファイルから有効なデータを読み込めませんでした。");
            return;
        }

        // ストレージのデータを取得
        const result = await chrome.storage.local.get({ readingList: [] });
        let currentList = result.readingList;
        const currentIds = new Set(currentList.map(item => item.id));
        const currentUrls = new Map(currentList.map(item => [item.url, item]));

        // インポートデータのID重複チェックと修正
         importedData = importedData.map(item => {
             if (currentIds.has(item.id)) {
                 // 既存IDと重複する場合は新しいIDを生成
                 item.id = crypto.randomUUID();
             }
             currentIds.add(item.id); // 新しいIDも一時的にセットに追加
             return item;
         });


        let updatedList;
        let addedCount = 0;
        let updatedCount = 0;

        if (mode === 'overwrite') {
          updatedList = importedData;
          console.log(`インポート: ${importedData.length} 件のデータで上書きします。`);
        } else { // append (追記)
          updatedList = [...currentList]; // 現在のリストをコピー
           importedData.forEach(newItem => {
               if (currentUrls.has(newItem.url)) {
                   // URLが重複する場合は既存のアイテムを更新 (IDは既存のものを維持)
                   const existingItem = updatedList.find(item => item.url === newItem.url);
                   if (existingItem) {
                       Object.assign(existingItem, { ...newItem, id: existingItem.id }); // ID以外を更新
                       updatedCount++;
                   }
               } else {
                   // URLが重複しない場合は新しいアイテムとして追加
                   updatedList.push(newItem);
                   addedCount++;
               }
           });
           console.log(`インポート: ${addedCount} 件を追加, ${updatedCount} 件を更新します。`);
        }


        await chrome.storage.local.set({ readingList: updatedList });
        alert(`インポート完了。\n${mode === 'overwrite' ? updatedList.length + ' 件で上書きしました。' : addedCount + ' 件を追加し、' + updatedCount + ' 件を更新しました。'}`);
        renderList(); // リストを再描画
        importFileInput.value = ''; // ファイル選択をクリア
        importButton.disabled = true; // ボタンを無効化


      } catch (error) {
        console.error('インポートエラー:', error);
        alert(`データのインポートに失敗しました: ${error.message}`);
      } finally {
          importFileInput.value = ''; // 成功・失敗に関わらずクリア
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


  // 初期表示
  renderList();
});

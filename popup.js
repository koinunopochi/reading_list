document.addEventListener('DOMContentLoaded', async () => {
  const urlDisplay = document.getElementById('current-url');
  const titleDisplay = document.getElementById('current-title');
  const statusSelect = document.getElementById('status');
  const commentTextarea = document.getElementById('comment');
  const saveButton = document.getElementById('save-button');
  const optionsLink = document.getElementById('options-link');

  let currentTab = null;
  let currentTitle = '';

  // 現在のタブ情報を取得して表示
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    currentTab = tab;
    if (currentTab && currentTab.url && !currentTab.url.startsWith('chrome://')) {
      urlDisplay.textContent = currentTab.url;
      // タイトルを取得 (Content Script を実行)
      const results = await chrome.scripting.executeScript({
        target: { tabId: currentTab.id },
        func: () => document.title
      });
      if (results && results[0] && results[0].result) {
        currentTitle = results[0].result;
        titleDisplay.textContent = currentTitle;
      } else {
        titleDisplay.textContent = 'タイトルを取得できませんでした';
      }
    } else {
      urlDisplay.textContent = '有効なページではありません';
      titleDisplay.textContent = '-';
      saveButton.disabled = true; // 保存ボタンを無効化
    }
  } catch (error) {
    console.error("タブ情報の取得に失敗:", error);
    urlDisplay.textContent = 'エラーが発生しました';
    titleDisplay.textContent = '-';
    saveButton.disabled = true;
  }

  // 保存ボタンの処理
  saveButton.addEventListener('click', async () => {
    if (!currentTab || !currentTab.url || currentTab.url.startsWith('chrome://')) {
      alert("このページは保存できません。");
      return;
    }

    const newEntry = {
      id: crypto.randomUUID(), // 一意なID
      url: currentTab.url,
      title: currentTitle || 'タイトルなし', // タイトルが取得できていなければデフォルト値
      status: statusSelect.value,
      comment: commentTextarea.value.trim(),
      added_at: new Date().toISOString() // 保存日時
    };

    try {
      const result = await chrome.storage.local.get({ readingList: [] });
      const list = result.readingList;

      // 同じURLが既に存在するかチェック（任意: 上書きや通知など）
      const existingIndex = list.findIndex(item => item.url === newEntry.url);
      if (existingIndex > -1) {
        // 確認ダイアログを出す例
        if (confirm(`"${newEntry.title}" は既にリストに存在します。情報を更新しますか？`)) {
            // IDは既存のものを使い、他の情報を更新
            list[existingIndex] = { ...list[existingIndex], ...newEntry, id: list[existingIndex].id };
             console.log("既存の項目を更新:", newEntry.url);
        } else {
            return; // 更新しない場合は処理中断
        }
      } else {
        list.push(newEntry);
        console.log("新しい項目を追加:", newEntry.url);
      }

      await chrome.storage.local.set({ readingList: list });
      alert('保存しました！');
      window.close(); // ポップアップを閉じる
    } catch (error) {
      console.error("保存エラー:", error);
      alert('データの保存に失敗しました。');
    }
  });

  // 管理ページへのリンク
  optionsLink.addEventListener('click', (e) => {
    e.preventDefault();
    chrome.runtime.openOptionsPage();
  });
});

const http = require('http');
const url = require('url');

const PORT = process.env.PORT || 3000;

// Chatwork API Fetcher
async function cwFetch(endpoint, apiKey, options = {}) {
  const reqUrl = 'https://api.chatwork.com/v2' + endpoint;
  const headers = {
    'X-ChatWorkToken': apiKey,
    ...(options.headers || {})
  };

  const response = await fetch(reqUrl, {
    method: options.method || 'GET',
    headers: headers,
    body: options.body
  });

  const contentType = response.headers.get('content-type') || '';
  let data;
  if (contentType.includes('application/json')) {
    data = await response.json();
  } else {
    data = await response.text();
  }

  if (!response.ok) {
    const errorMsg = typeof data === 'object' ? JSON.stringify(data) : data;
    throw new Error('Chatwork API Error (' + response.status + '): ' + errorMsg);
  }

  return data;
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = url.parse(req.url, true);
  const pathname = parsedUrl.pathname;

  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-ChatWorkToken');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  const sendJSON = (status, payload) => {
    res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify(payload));
  };

  const sendHTML = (html) => {
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(html);
  };

  try {
    if (pathname === '/' || pathname === '/index.html') {
      sendHTML(getHtmlPage());
      return;
    }

    const apiKey = req.headers['x-chatworktoken'] || req.headers['x-api-key'];

    if (pathname.startsWith('/api/')) {
      if (!apiKey) {
        return sendJSON(401, { error: 'API Key (X-ChatWorkToken) は必須です' });
      }

      if (pathname === '/api/me' && req.method === 'GET') {
        const data = await cwFetch('/me', apiKey);
        return sendJSON(200, data);
      }

      if (pathname === '/api/rooms' && req.method === 'GET') {
        const data = await cwFetch('/rooms', apiKey);
        return sendJSON(200, data);
      }

      if (pathname === '/api/messages' && req.method === 'GET') {
        const roomId = parsedUrl.query.room_id;
        if (!roomId) return sendJSON(400, { error: 'room_id が指定されていません' });
        const data = await cwFetch('/rooms/' + roomId + '/messages?force=1', apiKey);
        return sendJSON(200, data);
      }

      if (pathname === '/api/members' && req.method === 'GET') {
        const roomId = parsedUrl.query.room_id;
        if (!roomId) return sendJSON(400, { error: 'room_id が指定されていません' });
        const data = await cwFetch('/rooms/' + roomId + '/members', apiKey);
        return sendJSON(200, data);
      }

      if (pathname === '/api/send' && req.method === 'POST') {
        let bodyStr = '';
        req.on('data', chunk => { bodyStr += chunk.toString(); });
        req.on('end', async () => {
          try {
            const params = JSON.parse(bodyStr);
            if (!params.room_id || !params.body) {
              return sendJSON(400, { error: 'room_id と body は必須です' });
            }
            const postBody = new URLSearchParams({ body: params.body }).toString();
            const data = await cwFetch('/rooms/' + params.room_id + '/messages', apiKey, {
              method: 'POST',
              headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
              body: postBody
            });
            return sendJSON(200, data);
          } catch (e) {
            return sendJSON(500, { error: e.message });
          }
        });
        return;
      }

      return sendJSON(404, { error: 'API Route Not Found' });
    }

    sendJSON(404, { error: 'Not Found' });
  } catch (err) {
    console.error(err);
    sendJSON(500, { error: err.message });
  }
});

function getHtmlPage() {
  return `<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Chatwork Client</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif; }
    body { display: flex; flex-direction: column; height: 100vh; overflow: hidden; background-color: #f4f5f7; color: #333; }

    /* Alert Bar */
    .alert-bar { background-color: #fcf1f1; color: #c53929; font-size: 12px; padding: 6px 16px; display: flex; align-items: center; border-bottom: 1px solid #f8d7da; }
    .alert-bar span { margin-left: 8px; font-weight: bold; cursor: pointer; text-decoration: underline; }

    /* Header */
    header { background-color: #1b2538; color: #fff; height: 50px; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; flex-shrink: 0; }
    .header-left { display: flex; align-items: center; gap: 20px; }
    .logo { font-size: 20px; font-weight: bold; color: #fff; display: flex; align-items: center; gap: 6px; }
    .logo-icon { width: 22px; height: 22px; background-color: #e24e42; border-radius: 50%; display: inline-block; }
    .search-box input { background: #2b364a; border: none; padding: 6px 12px; border-radius: 4px; color: #fff; font-size: 13px; width: 240px; }
    .header-right { display: flex; align-items: center; gap: 12px; }
    .api-key-input { display: flex; gap: 6px; align-items: center; background: #2b364a; padding: 4px 8px; border-radius: 4px; }
    .api-key-input input { background: transparent; border: none; color: #fff; font-size: 12px; width: 200px; outline: none; }
    .btn-api-save { background: #0080ff; color: #fff; border: none; padding: 4px 10px; border-radius: 3px; font-size: 12px; cursor: pointer; }
    .user-info { font-size: 12px; color: #ccc; display: flex; align-items: center; gap: 6px; }

    /* Main Container */
    .main-container { display: flex; flex: 1; overflow: hidden; }

    /* Left Sidebar - Chat List */
    .sidebar-left { width: 260px; background-color: #eef1f4; border-right: 1px solid #dce1e6; display: flex; flex-direction: column; flex-shrink: 0; }
    .chat-list-header { padding: 12px 14px; font-size: 13px; font-weight: bold; color: #1b2538; display: flex; justify-content: space-between; border-bottom: 1px solid #dce1e6; }
    .chat-list { flex: 1; overflow-y: auto; }
    .chat-item { display: flex; align-items: center; padding: 10px 12px; gap: 10px; cursor: pointer; border-bottom: 1px solid #e2e7ec; position: relative; }
    .chat-item:hover { background-color: #e2e7ec; }
    .chat-item.active { background-color: #2e3a4e; color: #fff; }
    .chat-item.active .chat-item-title { color: #fff; }
    .chat-avatar { width: 36px; height: 36px; border-radius: 50%; background: #ccc; flex-shrink: 0; object-fit: cover; }
    .chat-item-info { flex: 1; overflow: hidden; }
    .chat-item-title { font-size: 13px; font-weight: bold; color: #2c3e50; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
    .chat-item-sub { font-size: 11px; color: #888; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 2px; }
    .chat-item.active .chat-item-sub { color: #aaa; }
    .pin-icon { color: #0080ff; font-size: 12px; }
    .chat-item.active .pin-icon { color: #64b5f6; }

    /* Center Chat Area */
    .chat-view { flex: 1; display: flex; flex-direction: column; background-color: #fff; overflow: hidden; position: relative; }
    .room-header { height: 50px; border-bottom: 1px solid #e1e6eb; display: flex; align-items: center; justify-content: space-between; padding: 0 16px; background: #fafbfc; }
    .room-title { font-size: 16px; font-weight: bold; display: flex; align-items: center; gap: 8px; }
    .room-actions { display: flex; align-items: center; gap: 8px; }
    .member-avatars { display: flex; align-items: center; margin-right: 8px; }
    .member-avatars img { width: 24px; height: 24px; border-radius: 50%; margin-left: -6px; border: 2px solid #fff; }
    .member-count-badge { background: #4a5568; color: #fff; font-size: 10px; padding: 2px 6px; border-radius: 10px; margin-left: -4px; }
    .btn-action { border: 1px solid #ccc; background: #fff; padding: 4px 10px; font-size: 12px; border-radius: 4px; cursor: pointer; display: flex; align-items: center; gap: 4px; }

    /* Message Log Area */
    .messages-area { flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 16px; background-color: #ffffff; }
    .msg-item { display: flex; gap: 12px; font-size: 13px; line-height: 1.5; padding: 6px 8px; border-radius: 6px; transition: background 0.2s; position: relative; }
    .msg-item:hover { background-color: #f7f9fa; }
    .msg-item:hover .msg-actions { display: flex; }
    .msg-avatar { width: 40px; height: 40px; border-radius: 50%; object-fit: cover; flex-shrink: 0; }
    .msg-content { flex: 1; }
    .msg-header { display: flex; align-items: baseline; gap: 8px; margin-bottom: 4px; }
    .msg-author { font-weight: bold; color: #1b2538; font-size: 13px; }
    .msg-time { font-size: 11px; color: #888; }
    .msg-body { color: #222; word-break: break-word; }

    /* Highlighted or Special Message Styles */
    .msg-item.highlight { background-color: #eefbf3; border-left: 4px solid #2ecc71; }
    .cw-reply-badge { display: inline-flex; align-items: center; gap: 4px; background-color: #e8f4f8; color: #1d70b8; padding: 2px 6px; border-radius: 3px; font-size: 11px; font-weight: bold; margin-bottom: 4px; cursor: pointer; }
    .cw-to-badge { display: inline-flex; align-items: center; gap: 4px; background-color: #e1f5fe; color: #0288d1; padding: 1px 5px; border-radius: 3px; font-size: 11px; font-weight: bold; }
    .cw-info-box { border: 1px solid #c8d6e5; border-radius: 4px; padding: 8px 12px; background: #f8fafc; margin: 4px 0; font-size: 12px; }
    .cw-info-title { font-weight: bold; margin-bottom: 4px; color: #2c3e50; border-bottom: 1px solid #e1e6eb; padding-bottom: 2px; }
    .cw-quote { border-left: 3px solid #b2bec3; padding-left: 8px; color: #636e72; font-style: italic; margin: 4px 0; }

    /* Action Buttons on Hover */
    .msg-actions { display: none; position: absolute; right: 12px; top: 6px; background: #fff; border: 1px solid #ccc; border-radius: 4px; overflow: hidden; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .msg-actions button { background: #fff; border: none; padding: 4px 8px; font-size: 11px; cursor: pointer; color: #333; }
    .msg-actions button:hover { background: #f0f0f0; color: #0080ff; }

    /* Message Input Box */
    .input-container { border-top: 1px solid #e1e6eb; background: #fafbfc; padding: 10px 16px; flex-shrink: 0; }
    .input-toolbar { display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px; }
    .toolbar-left { display: flex; gap: 10px; }
    .tool-btn { background: none; border: none; cursor: pointer; font-size: 14px; color: #555; padding: 2px 6px; border-radius: 3px; }
    .tool-btn:hover { background: #e0e0e0; }
    .chat-textarea { width: 100%; height: 70px; border: 1px solid #ccc; border-radius: 4px; padding: 8px; font-size: 13px; resize: none; outline: none; }
    .chat-textarea:focus { border-color: #0080ff; }
    .input-footer { display: flex; align-items: center; justify-content: flex-end; gap: 12px; margin-top: 6px; }
    .send-option { font-size: 12px; color: #666; display: flex; align-items: center; gap: 4px; }
    .btn-send { background-color: #1573e6; color: #fff; border: none; padding: 6px 18px; border-radius: 4px; font-weight: bold; cursor: pointer; font-size: 13px; }
    .btn-send:hover { background-color: #115bb7; }

    /* Right Sidebar - Info/Task */
    .sidebar-right { width: 260px; background-color: #f8fafc; border-left: 1px solid #dce1e6; padding: 12px; display: flex; flex-direction: column; gap: 16px; flex-shrink: 0; overflow-y: auto; }
    .panel-box { background: #fff; border: 1px solid #e1e6eb; border-radius: 6px; padding: 12px; }
    .panel-title { font-size: 13px; font-weight: bold; color: #1b2538; margin-bottom: 8px; display: flex; justify-content: space-between; align-items: center; }
    .panel-content { font-size: 12px; color: #666; }
    .notice-box { background: #fff8e1; border: 1px solid #ffe082; color: #8d6e63; padding: 8px; border-radius: 4px; font-size: 12px; display: flex; align-items: center; gap: 6px; }

    /* TO Selector Modal/Dropdown */
    .member-dropdown { position: absolute; bottom: 110px; left: 16px; width: 220px; background: #fff; border: 1px solid #ccc; border-radius: 6px; box-shadow: 0 4px 12px rgba(0,0,0,0.15); max-height: 200px; overflow-y: auto; display: none; z-index: 100; }
    .member-dropdown-item { padding: 8px 12px; font-size: 12px; cursor: pointer; display: flex; align-items: center; gap: 8px; }
    .member-dropdown-item:hover { background-color: #f0f4f8; }
    .member-dropdown-item img { width: 20px; height: 20px; border-radius: 50%; }

    /* Loading / Empty States */
    .empty-state { display: flex; justify-content: center; align-items: center; height: 100%; color: #999; font-size: 14px; }
  </style>
</head>
<body>

  <!-- Top Alert Bar -->
  <div class="alert-bar">
    ⚠️ フリープラン利用中。一部機能が制限されています。<span>制限の詳細 ▸</span>
  </div>

  <!-- Header -->
  <header>
    <div class="header-left">
      <div class="logo">
        <span class="logo-icon"></span> Chatwork
      </div>
      <div class="search-box">
        <input type="text" placeholder="チャット名、メッセージ内容..." />
      </div>
    </div>
    <div class="header-right">
      <div class="api-key-input">
        <input type="password" id="apiKeyInput" placeholder="API Keyを入力..." />
        <button class="btn-api-save" onclick="saveApiKey()">保存</button>
      </div>
      <div class="user-info" id="userInfo">未ログイン</div>
    </div>
  </header>

  <!-- Main Area -->
  <div class="main-container">

    <!-- Left Sidebar: Chat List -->
    <div class="sidebar-left">
      <div class="chat-list-header">
        <span>すべてのチャット <span id="roomCount">(0)</span> ▾</span>
        <span style="cursor:pointer;" onclick="loadRooms()">🔄</span>
      </div>
      <div class="chat-list" id="chatList">
        <div class="empty-state">API Keyを入力してください</div>
      </div>
    </div>

    <!-- Center Chat Area -->
    <div class="chat-view">
      <!-- Room Header -->
      <div class="room-header" id="roomHeader">
        <div class="room-title">チャットを選択してください</div>
        <div class="room-actions">
          <div class="member-avatars" id="memberAvatars"></div>
          <button class="btn-action">+ 招待</button>
        </div>
      </div>

      <!-- Messages Area -->
      <div class="messages-area" id="messagesArea">
        <div class="empty-state">左メニューからチャットを選択してください</div>
      </div>

      <!-- Input Area -->
      <div class="input-container">
        <!-- TO Dropdown -->
        <div class="member-dropdown" id="toDropdown"></div>

        <div class="input-toolbar">
          <div class="toolbar-left">
            <button class="tool-btn" onclick="toggleToDropdown()">TO</button>
            <button class="tool-btn" onclick="insertSymbol('😊')">😊</button>
            <button class="tool-btn">📎</button>
            <button class="tool-btn">🎥</button>
          </div>
        </div>
        <textarea class="chat-textarea" id="chatInput" placeholder="ここにメッセージ内容を入力 (Shift + Enterキーで改行)"></textarea>
        <div class="input-footer">
          <label class="send-option">
            <input type="checkbox" id="enterSendCheck" checked> Enterで送信
          </label>
          <button class="btn-send" onclick="sendMessage()">送信</button>
        </div>
      </div>
    </div>

    <!-- Right Sidebar -->
    <div class="sidebar-right">
      <div class="notice-box">
        ℹ️ 参加承認待ちのメンバーがいます (1件)
      </div>

      <div class="panel-box">
        <div class="panel-title">
          <span>概要</span>
          <span style="cursor:pointer; font-size:11px; color:#0080ff;">✏️</span>
        </div>
        <div class="panel-content" id="roomDescription">
          概要はありません
        </div>
      </div>

      <div class="panel-box">
        <div class="panel-title">
          <span>タスク</span>
          <span style="cursor:pointer; font-size:11px; color:#0080ff;">テンプレートを選択 ▾</span>
        </div>
        <div class="panel-content">
          <button class="btn-action" style="width:100%; justify-content:center; color:#0080ff; font-weight:bold;">+ タスク追加</button>
        </div>
      </div>
    </div>

  </div>

  <script>
    var currentApiKey = localStorage.getItem('cw_api_key') || '';
    var currentRoomId = null;
    var currentMembersMap = {};
    var pollingTimer = null;

    document.addEventListener('DOMContentLoaded', function() {
      if (currentApiKey) {
        document.getElementById('apiKeyInput').value = currentApiKey;
        initChat();
      }

      document.getElementById('chatInput').addEventListener('keydown', function(e) {
        if (e.key === 'Enter' && !e.shiftKey) {
          if (document.getElementById('enterSendCheck').checked) {
            e.preventDefault();
            sendMessage();
          }
        }
      });
    });

    function saveApiKey() {
      var key = document.getElementById('apiKeyInput').value.trim();
      if (!key) return alert('API Keyを入力してください');
      localStorage.setItem('cw_api_key', key);
      currentApiKey = key;
      initChat();
    }

    async function apiRequest(endpoint, options) {
      options = options || {};
      var headers = Object.assign({
        'X-ChatWorkToken': currentApiKey
      }, options.headers || {});

      var res = await fetch(endpoint, Object.assign({}, options, { headers: headers }));
      if (!res.ok) {
        var errData = await res.json().catch(function() { return { error: res.statusText }; });
        throw new Error(errData.error || 'エラーが発生しました');
      }
      return await res.json();
    }

    async function initChat() {
      try {
        var me = await apiRequest('/api/me');
        document.getElementById('userInfo').innerText = me.name;
        loadRooms();
      } catch (err) {
        alert('ログイン失敗: ' + err.message);
      }
    }

    async function loadRooms() {
      try {
        var rooms = await apiRequest('/api/rooms');
        document.getElementById('roomCount').innerText = '(' + rooms.length + ')';
        renderRoomList(rooms);
      } catch (err) {
        console.error(err);
      }
    }

    function renderRoomList(rooms) {
      var listEl = document.getElementById('chatList');
      if (!rooms || rooms.length === 0) {
        listEl.innerHTML = '<div class="empty-state">チャットがありません</div>';
        return;
      }

      listEl.innerHTML = rooms.map(function(room) {
        var activeClass = room.room_id === currentRoomId ? 'active' : '';
        var pin = room.sticky ? '<span class="pin-icon">📌</span>' : '';
        var avatar = room.icon_path || 'https://assets.chatwork.com/images/common/avatar/default_room.svg';

        return '<div class="chat-item ' + activeClass + '" onclick="selectRoom(' + room.room_id + ', \'' + escapeHtml(room.name) + '\')">' +
          '<img class="chat-avatar" src="' + avatar + '" onerror="this.src=\'https://assets.chatwork.com/images/common/avatar/default_room.svg\'" />' +
          '<div class="chat-item-info">' +
            '<div class="chat-item-title">' + escapeHtml(room.name) + '</div>' +
            '<div class="chat-item-sub">' + (room.unread_num > 0 ? room.unread_num + '件の未読' : 'メッセージを表示') + '</div>' +
          '</div>' +
          pin +
        '</div>';
      }).join('');
    }

    async function selectRoom(roomId, roomName) {
      currentRoomId = roomId;
      document.querySelector('.room-title').innerHTML = '📌 ' + roomName;

      loadRooms();

      document.getElementById('messagesArea').innerHTML = '<div class="empty-state">メッセージ読み込み中...</div>';

      await loadMembers(roomId);
      await loadMessages(roomId, true);

      if (pollingTimer) clearInterval(pollingTimer);
      pollingTimer = setInterval(function() {
        if (currentRoomId) loadMessages(currentRoomId, false);
      }, 3000);
    }

    async function loadMembers(roomId) {
      try {
        var members = await apiRequest('/api/members?room_id=' + roomId);
        currentMembersMap = {};
        members.forEach(function(m) { currentMembersMap[m.account_id] = m; });

        var avatarsEl = document.getElementById('memberAvatars');
        avatarsEl.innerHTML = members.slice(0, 5).map(function(m) {
          return '<img src="' + m.avatar_image_url + '" title="' + escapeHtml(m.name) + '" />';
        }).join('') + (members.length > 5 ? '<span class="member-count-badge">+' + (members.length - 5) + '</span>' : '');

        var dropdownEl = document.getElementById('toDropdown');
        dropdownEl.innerHTML = members.map(function(m) {
          return '<div class="member-dropdown-item" onclick="insertToTag(' + m.account_id + ', \'' + escapeHtml(m.name) + '\')">' +
            '<img src="' + m.avatar_image_url + '" />' +
            '<span>' + escapeHtml(m.name) + '</span>' +
          '</div>';
        }).join('');

      } catch (err) {
        console.error('Members error:', err);
      }
    }

    async function loadMessages(roomId, shouldScroll) {
      try {
        var messages = await apiRequest('/api/messages?room_id=' + roomId);
        renderMessages(messages, shouldScroll);
      } catch (err) {
        console.error('Messages error:', err);
      }
    }

    function renderMessages(messages, shouldScroll) {
      var area = document.getElementById('messagesArea');
      if (!messages || messages.length === 0) {
        if (shouldScroll) area.innerHTML = '<div class="empty-state">メッセージはありません</div>';
        return;
      }

      var html = messages.map(function(msg) {
        var isHighlight = msg.body.includes('[reply') || msg.body.includes('[To');
        var parsedBody = parseChatworkText(msg.body);
        var timeStr = formatTime(msg.send_time);

        return '<div class="msg-item ' + (isHighlight ? 'highlight' : '') + '" id="msg-' + msg.message_id + '">' +
          '<img class="msg-avatar" src="' + msg.account.avatar_image_url + '" />' +
          '<div class="msg-content">' +
            '<div class="msg-header">' +
              '<span class="msg-author">' + escapeHtml(msg.account.name) + '</span>' +
              '<span class="msg-time">' + timeStr + '</span>' +
            '</div>' +
            '<div class="msg-body">' + parsedBody + '</div>' +
          '</div>' +
          '<div class="msg-actions">' +
            '<button onclick="replyToMessage(' + msg.account.account_id + ', \'' + msg.message_id + '\', \'' + escapeHtml(msg.account.name) + '\')">RE 返信</button>' +
            '<button onclick="insertToTag(' + msg.account.account_id + ', \'' + escapeHtml(msg.account.name) + '\')">TO</button>' +
          '</div>' +
        '</div>';
      }).join('');

      area.innerHTML = html;

      if (shouldScroll) {
        area.scrollTop = area.scrollHeight;
      }
    }

    async function sendMessage() {
      var input = document.getElementById('chatInput');
      var text = input.value.trim();
      if (!text || !currentRoomId) return;

      try {
        await apiRequest('/api/send', {
          method: 'POST',
          body: JSON.stringify({ room_id: currentRoomId, body: text })
        });
        input.value = '';
        loadMessages(currentRoomId, true);
      } catch (err) {
        alert('送信失敗: ' + err.message);
      }
    }

    function replyToMessage(aid, mid, name) {
      var input = document.getElementById('chatInput');
      input.value = '[reply account_id=' + aid + ' mid=' + mid + '] ' + name + '\n' + input.value;
      input.focus();
    }

    function toggleToDropdown() {
      var dd = document.getElementById('toDropdown');
      dd.style.display = dd.style.display === 'block' ? 'none' : 'block';
    }

    function insertToTag(aid, name) {
      var input = document.getElementById('chatInput');
      input.value = '[To:' + aid + '] ' + name + '\n' + input.value;
      document.getElementById('toDropdown').style.display = 'none';
      input.focus();
    }

    function insertSymbol(symbol) {
      var input = document.getElementById('chatInput');
      input.value += symbol;
      input.focus();
    }

    function parseChatworkText(text) {
      if (!text) return '';
      var html = escapeHtml(text);

      html = html.replace(/\[info\]([\s\S]*?)\[\/info\]/gi, function(m, p1) { return '<div class="cw-info-box">' + p1 + '</div>'; });
      html = html.replace(/\[title\]([\s\S]*?)\[\/title\]/gi, function(m, p1) { return '<div class="cw-info-title">' + p1 + '</div>'; });

      html = html.replace(/\[reply account_id=(\d+) mid=(\d+)\]/gi, function(m, aid, mid) {
        var name = currentMembersMap[aid] ? currentMembersMap[aid].name : aid;
        return '<span class="cw-reply-badge">←RE 返信元 <b>' + escapeHtml(name) + '</b></span>';
      });

      html = html.replace(/\[To:(\d+)\]/gi, function(m, aid) {
        var name = currentMembersMap[aid] ? currentMembersMap[aid].name : aid;
        return '<span class="cw-to-badge">TO <b>' + escapeHtml(name) + '</b></span>';
      });

      html = html.replace(/\[qt\]([\s\S]*?)\[\/qt\]/gi, '<blockquote class="cw-quote">$1</blockquote>');
      html = html.replace(/(https?:\/\/[^\s<]+)/gi, '<a href="$1" target="_blank" rel="noopener">$1</a>');
      html = html.replace(/\n/g, '<br>');

      return html;
    }

    function formatTime(timestamp) {
      if (!timestamp) return '';
      var d = new Date(timestamp * 1000);
      var m = d.getMonth() + 1;
      var date = d.getDate();
      var h = String(d.getHours()).padStart(2, '0');
      var min = String(d.getMinutes()).padStart(2, '0');
      return m + '月' + date + '日 ' + h + ':' + min;
    }

    function escapeHtml(str) {
      if (!str) return '';
      return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    }
  </script>
</body>
</html>`;
}

server.listen(PORT, () => {
  console.log('Chatwork Web App listening on http://localhost:' + PORT);
});

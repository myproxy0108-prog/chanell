const express = require('express');
const app = express();

app.use(express.json());

// --- (中略：前回と同じ「フリモメン語録JSON」と「おみくじの重み設定」をここに書きます) ---

app.post('/function/bot', (req, res) => {
    // Channel.worksのカスタム関数から送られてくるテキストを受け取る
    // ※パラメータ名は設定画面で "message" と指定する前提
    const text = req.body.message || "";

    let replyText = "";

    // 1. おみくじの処理
    if (text.includes('おみくじ')) {
        replyText = drawOmikuji();
    } 
    // 2. キーワードマッチング
    else {
        const keys = Object.keys(responses).filter(k => k !== 'all');
        const matchedKey = keys.find(k => text.includes(k));

        let selectedItem;
        if (matchedKey) {
            const list = responses[matchedKey];
            selectedItem = list[Math.floor(Math.random() * list.length)];
        } else {
            const list = responses['all'];
            selectedItem = list[Math.floor(Math.random() * list.length)];
        }

        // 配列の中に配列が入っていた場合の処理（製作者てすとぉ対応）
        if (Array.isArray(selectedItem)) {
            replyText = selectedItem[0]; 
        } else {
            replyText = selectedItem;
        }
    }

    // --- ここが重要！ ---
    // Channel.worksのAPIを叩きにいくのではなく、カスタム関数の結果としてJSONを返す
    res.json({
        "resultText": replyText
    });
});

const PORT = process.env.PORT || 10000;
app.listen(PORT, () => console.log(`カスタム関数API稼働中 (Port: ${PORT})`));

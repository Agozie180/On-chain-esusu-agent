// Optional Telegram alerts. Silent no-op unless TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are set.
async function notify(text) {
  const { TELEGRAM_BOT_TOKEN: tok, TELEGRAM_CHAT_ID: chat } = process.env;
  if (!tok || !chat) return false;
  try {
    const res = await fetch(`https://api.telegram.org/bot${tok}/sendMessage`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: chat, text, disable_web_page_preview: true }),
    });
    return res.ok;
  } catch { return false; }
}
module.exports = { notify };

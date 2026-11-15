import { bundleUnavailable, proofBundleHeaders } from "@/modules/portfolio/api/proof-bundle";
import { exportSelection } from "@/modules/portfolio/api/proof-export";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (!await exportSelection(query)) return bundleUnavailable();
  const inline = query.get("inline") === "1";
  const source = "/api/portfolio/proof-export?" + new URLSearchParams({
    access: query.get("access")!, purchase: query.get("purchase")!, expires: query.get("expires")!, signature: query.get("signature")!
  }).toString().replaceAll("&", "&amp;");
  return new Response(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Save your photo ZIP to Google Drive</title>
<style>body{background:#faf8f4;color:#211f1d;font:1rem/1.6 Arial,sans-serif;margin:0;padding:1rem}main{margin:auto;max-width:32rem}h1{font:400 1.8rem/1 Georgia,serif;letter-spacing:-.03em}p{color:#6f6860}a{color:#713a3c}</style>
<main>${inline ? "" : "<h1>Save to Google Drive</h1><p>Choose a Google account and where to save your photo ZIP. Keep this tab open until Google finishes.</p>"}
<div id="drive-widget" class="g-savetodrive" data-src="${source}" data-filename="Selected-photos.zip" data-sitename="Photo delivery"></div>
<p id="drive-status" role="status">Start your save within five minutes. If this transfer link expires, use Refresh Drive link or start again from your photo page.</p>
${inline ? "" : `<p>If Google does not open or the save stalls, <a href="${source}">download the ZIP</a> and upload it to Drive from your device.</p>`}</main>
<script>
  const status = document.getElementById("drive-status");
  const widget = document.getElementById("drive-widget");
  const expires = ${Number(query.get("expires")) * 1000};
  function checkExpiry() {
    if (Date.now() < expires) return;
    widget.inert = true;
    status.textContent = "This Drive link has expired. Use Refresh Drive link, or close this dialog and choose Save to Google Drive again. Download ZIP is also available on your photo page.";
  }
  setInterval(checkExpiry, 1000);
  document.addEventListener("visibilitychange", checkExpiry);
  function loadFailed() {
    if (Date.now() >= expires) return checkExpiry();
    status.textContent = "Google Drive could not load. Refresh the Drive link, or download the ZIP and upload it to Drive from your device.";
  }
  setTimeout(() => { if (!widget.querySelector("iframe")) loadFailed(); }, 15000);
</script>
<script async src="https://apis.google.com/js/platform.js" referrerpolicy="no-referrer" onerror="loadFailed()"></script></html>`, { headers: { ...proofBundleHeaders, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow",
    ...(inline ? { "Content-Security-Policy": "frame-ancestors 'self' https://admin.jazzrphotography.com" } : {})
  } });
}

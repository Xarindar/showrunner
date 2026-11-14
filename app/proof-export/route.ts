import { bundleUnavailable, proofBundleHeaders } from "@/modules/portfolio/api/proof-bundle";
import { exportSelection } from "@/modules/portfolio/api/proof-export";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams;
  if (!await exportSelection(query)) return bundleUnavailable();
  const source = "/api/portfolio/proof-export?" + new URLSearchParams({
    access: query.get("access")!, purchase: query.get("purchase")!, expires: query.get("expires")!, signature: query.get("signature")!
  }).toString().replaceAll("&", "&amp;");
  if (query.get("inline") === "1") {
    return new Response(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="referrer" content="no-referrer"><title>Save to Google Drive</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>html,body{margin:0;overflow:hidden}.drive{position:absolute;inset:0}.drive iframe[data-gapiattached]{opacity:0;transform-origin:top left}</style>
<div class="drive"><div class="g-savetodrive" data-src="${source}" data-filename="Selected-photos.zip" data-sitename="Jazzr Photography"></div></div>
<noscript><a href="${source}">Download ZIP</a></noscript>
<script>
  const host = document.querySelector(".drive");
  const resize = new ResizeObserver(() => {
    const button = host.querySelector("iframe[data-gapiattached]");
    if (button?.offsetWidth && button.offsetHeight) {
      button.style.transform = "scale(" + innerWidth / button.offsetWidth + "," + innerHeight / button.offsetHeight + ")";
    }
  });
  resize.observe(host);
  // Match the visible Jazzr row to Google's live hit area so the browser delivers the actual click.
  new MutationObserver(() => {
    const button = host.querySelector("iframe[data-gapiattached]");
    if (button) {
      button.title = "Save to Google Drive";
      resize.observe(button);
    }
  }).observe(host, {childList: true, subtree: true});
</script>
<script async src="https://apis.google.com/js/platform.js" referrerpolicy="no-referrer"></script></html>`, {
      headers: { ...proofBundleHeaders, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow",
        "Content-Security-Policy": "frame-ancestors https://admin.jazzrphotography.com" }
    });
  }
  return new Response(`<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="robots" content="noindex,nofollow">
<title>Save your photo ZIP to Google Drive</title>
<style>body{background:#faf8f4;color:#211f1d;font:1rem/1.6 Arial,sans-serif;margin:0;padding:clamp(1.5rem,8vw,6rem)}main{margin:auto;max-width:32rem}h1{font:400 clamp(2.5rem,6vw,4rem)/1 Georgia,serif;letter-spacing:-.03em}p{color:#6f6860}a{color:#713a3c}</style>
<main><h1>Save to Google Drive</h1><p>Choose a Google account and where to save your photo ZIP. Keep this tab open until Google finishes.</p>
<div class="g-savetodrive" data-src="${source}" data-filename="Selected-photos.zip" data-sitename="Photo delivery"></div>
<p>If the Google button doesn’t appear, <a href="${source}">download the ZIP</a> and upload it from your device.</p></main>
<script async src="https://apis.google.com/js/platform.js" referrerpolicy="no-referrer"></script></html>`, { headers: { ...proofBundleHeaders, "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow" } });
}

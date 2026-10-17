import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test } from "node:test";

test("header selects matching orientation and scopes candidates to public published tenant photos", async () => {
  type Query = { where: { asset: { siteId: string; isPrivate: boolean; deletedAt: null; portfolioItems: { some: { gallery: { siteId: string; status: string; visibility: string; clientId: null } } } } } };
  const captured = {} as { query: Query };
  let candidates = [{assetId:"landscape",width:1920,height:1280},{assetId:"portrait",width:1280,height:1920},{assetId:"square",width:1000,height:1000}];
  const exports = {} as { getPortfolioHeader: typeof import("../lib/embed/portfolio-header").getPortfolioHeader };
  const output = ts.transpileModule(readFileSync("lib/embed/portfolio-header.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(output, {exports, encodeURIComponent, Math, require:(name:string)=> name === "server-only" ? {} : {prisma:{mediaAssetVariant:{findMany:async(q:Query)=>{captured.query=q;return candidates;}}}}});
  const desktop = await exports.getPortfolioHeader("site-a", "desktop");
  assert(desktop);
  assert.match(desktop.imageUrl, /landscape\?variant=HERO$/);
  const mobile = await exports.getPortfolioHeader("site-a", "mobile");
  assert(mobile);
  assert.match(mobile.imageUrl, /portrait\?variant=HERO$/);
  assert.equal(captured.query.where.asset.siteId,"site-a");
  assert.equal(captured.query.where.asset.isPrivate,false);
  assert.equal(captured.query.where.asset.deletedAt,null);
  assert.equal(captured.query.where.asset.portfolioItems.some.gallery.siteId,"site-a");
  assert.equal(captured.query.where.asset.portfolioItems.some.gallery.status,"PUBLISHED");
  assert.equal(captured.query.where.asset.portfolioItems.some.gallery.visibility,"PUBLIC");
  assert.equal(captured.query.where.asset.portfolioItems.some.gallery.clientId,null);
  candidates=[];
  assert.equal(await exports.getPortfolioHeader("site-a","desktop"),null);
});

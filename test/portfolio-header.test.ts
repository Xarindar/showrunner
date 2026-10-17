import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { test } from "node:test";

test("header selects matching orientation and scopes candidates to public published tenant photos", async () => {
  let query: any;
  let candidates = [{assetId:"landscape",width:1920,height:1280},{assetId:"portrait",width:1280,height:1920},{assetId:"square",width:1000,height:1000}];
  const exports: any = {};
  const output = ts.transpileModule(readFileSync("lib/embed/portfolio-header.ts", "utf8"), {compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText;
  runInNewContext(output, {exports, encodeURIComponent, Math, require:(name:string)=> name === "server-only" ? {} : {prisma:{mediaAssetVariant:{findMany:async(q:any)=>{query=q;return candidates;}}}}});
  assert.match((await exports.getPortfolioHeader("site-a","desktop")).imageUrl, /landscape\?variant=HERO$/);
  assert.match((await exports.getPortfolioHeader("site-a","mobile")).imageUrl, /portrait\?variant=HERO$/);
  assert.equal(query.where.asset.siteId,"site-a");
  assert.equal(query.where.asset.isPrivate,false);
  assert.equal(query.where.asset.deletedAt,null);
  assert.equal(query.where.asset.portfolioItems.some.gallery.siteId,"site-a");
  assert.equal(query.where.asset.portfolioItems.some.gallery.status,"PUBLISHED");
  assert.equal(query.where.asset.portfolioItems.some.gallery.visibility,"PUBLIC");
  assert.equal(query.where.asset.portfolioItems.some.gallery.clientId,null);
  candidates=[];
  assert.equal(await exports.getPortfolioHeader("site-a","desktop"),null);
});

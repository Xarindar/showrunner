import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { z } from "zod";

function harness() {
  const writes: any[] = [];
  const require = createRequire(import.meta.url);
  const mocks: Record<string, unknown> = {
    "next/cache": { revalidatePath() {} }, "next/navigation": { redirect(url: string) { throw new Error(url); } },
    "@/lib/admin-validation": { requiredText: z.string().min(1), optionalStoredText: z.string().trim(), parseForm: async (schema: z.ZodType, data: FormData) => schema.parse(Object.fromEntries(data)) },
    "@/lib/auth": { requireAdmin: async (permission: string) => { assert.equal(permission,"media:manage"); return {id:"admin"}; }, getAccessibleMediaWhere: async () => ({id:"asset",siteId:"site"}) },
    "@/lib/site": {getCurrentSiteId: async()=>"site"},
    "@/lib/media": { normalizeMediaFolder: (v: string)=>v, mediaTagsFromInput: (v: string)=>v.split(","), supportsPrivateMediaDriver: ()=>true, ensureMediaAssetVariants: async()=>{} },
    "@/lib/media-usage": {}, "@/modules/content/hero-presentation": {},
    "@/lib/prisma": {prisma:{mediaAsset:{ findFirst: async()=>({id:"asset",driver:"S3",isPrivate:true,clientFiles:[],portfolioItems:[],purchasedSelections:[]}), updateMany: async (query: any)=>{writes.push(query);return {count:1};} }}}
  };
  const api: any = {};
  const source=ts.transpileModule(readFileSync("modules/media/actions.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports:api,require:(name:string)=>name in mocks?mocks[name]:require(name),File,FormData,console});
  const data=new FormData();for(const [key,value] of Object.entries({id:"asset",filename:"Updated.jpg",alt:"Garden",caption:"Caption",credit:"Credit",folder:"Photos",tags:"Garden,Events",usageContext:"existing",focalPointX:"0.2",focalPointY:"0.8",isPrivate:"on"})) data.set(key,value);
  return {data,writes,save:api.updateMediaAssetAction};
}
test("metadata saves filename and selected tags while preserving hidden privacy and framing",async()=>{
 const h=harness();assert.equal((await h.save(h.data)).success,true);
 const saved=h.writes[0];assert.equal(saved.where.AND[0].siteId,"site");assert.equal(saved.data.filename,"Updated.jpg");
 assert.equal(JSON.stringify(saved.data.tags),JSON.stringify(["Garden","Events"]));assert.equal(saved.data.isPrivate,true);assert.equal(saved.data.focalPointX,0.2);assert.equal(saved.data.focalPointY,0.8);assert.equal(saved.data.usageContext,"existing");
 const invalid=harness();invalid.data.set("filename","../invalid.jpg");assert.ok((await invalid.save(invalid.data)).error);assert.equal(invalid.writes.length,0);
});

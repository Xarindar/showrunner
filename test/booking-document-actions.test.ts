import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as documents from "../lib/scheduling/booking-documents";

test("document saves enforce permissions, tenant scope, defaults and optimistic versions", async () => {
  let authorized = true;
  let writes = 0;
  const rows = [{ id: "own", siteId: "one", name: "Existing", nameKey: "existing", kind: "TERMS", version: 2, isDefault: true, rules: [] as unknown[] }];
  const require = createRequire(import.meta.url);
  const matches = (row: typeof rows[number], where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => typeof value === "object" && value !== null ? row[key as keyof typeof row] !== (value as {not:string}).not : row[key as keyof typeof row] === value);
  const prisma = { $transaction: async (callback: (tx: unknown) => Promise<unknown>) => {
    const backup = structuredClone(rows);
    const table = {
      findFirst: async ({where}: {where:Record<string,unknown>}) => rows.find(row=>matches(row,where)),
      findFirstOrThrow: async ({where}: {where:Record<string,unknown>}) => rows.find(row=>matches(row,where))!,
      updateMany: async ({where,data}: {where:Record<string,unknown>;data:Record<string,unknown>}) => {
        let count=0;
        for (const row of rows.filter(row=>matches(row,where))) { Object.assign(row,{...data,version:typeof data.version==="object" ? row.version+1 : row.version}); count++;writes++; }
        return {count};
      },
      create: async ({data}: {data:typeof rows[number]}) => {const row={...data,id:"new",version:1};rows.push(row);writes++;return row;}
    };
    try {return await callback({bookingRuleSet:table});} catch(error) {rows.splice(0,rows.length,...backup);throw error;}
  }};
  const mocks:Record<string,unknown>={
    "@/lib/auth":{requireAdmin:async (permission:string)=>{assert.equal(permission,"scheduling:manage");if(!authorized)throw Error("Forbidden");}},
    "@/lib/site":{getSiteSettings:async()=>({siteId:"one"})},
    "@/lib/prisma":{prisma}, "@/lib/scheduling/booking-documents":documents,"next/cache":{revalidatePath(){}}
  };
  const exports:{saveBookingDocument?:(input:unknown)=>Promise<{document?:documents.BookingDocument;error?:string}>}={};
  const source=ts.transpileModule(readFileSync("modules/appointments/forms-terms-actions.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  runInNewContext(source,{exports,Error,require:(id:string)=>id in mocks?mocks[id]:require(id)});
  const save=exports.saveBookingDocument!;
  const input={name:"Studio terms",kind:"TERMS",isDefault:true,rules:[{id:"terms",kind:"policy",category:"Terms",label:"Review these terms.",type:"TEXT",required:true,options:[],helpText:"",placeholder:""}]};
  authorized=false;await assert.rejects(save(input),/Forbidden/);assert.equal(writes,0);authorized=true;
  assert((await save({...input,rules:[]})).error);assert.equal(writes,0);
  assert((await save({...input,id:"foreign",version:2})).error);assert.equal(writes,0);
  const created=await save(input);assert.equal(created.document?.isDefault,true);assert.equal(rows[0].isDefault,false);
  const edited=await save({...input,id:"new",version:1,name:"Updated terms"});assert.equal(edited.document?.version,2);
  const before=writes;assert.match((await save({...input,id:"new",version:1})).error!,/changed/);assert.equal(writes,before);
});

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { bookingRuleSchema, validateBookingRuleAnswers } from "../lib/scheduling/booking-rules";
import { bookingDocumentInputSchema, resolveBookingRequirements, validateBookingRequirementsRevision, type BookingDocument } from "../lib/scheduling/booking-documents";
const question=bookingRuleSchema.parse({id:"style",kind:"intake",category:"Portraits",label:"Preferred style",type:"RADIO",required:true,options:["Candid","Posed"]});
const policy=bookingRuleSchema.parse({...question,id:"policy",kind:"policy",label:"The agreed booking terms.",type:"TEXT",options:[]});
const documents:BookingDocument[]=[{id:"global-form",name:"Portrait details",kind:"INTAKE",version:1,isDefault:true,rules:[question]},{id:"global-terms",name:"Booking agreement",kind:"TERMS",version:2,isDefault:true,rules:[policy]},{id:"wedding-form",name:"Wedding details",kind:"INTAKE",version:3,isDefault:false,rules:[{...question,label:"Wedding style"}]}];
test("global defaults resolve once and session choices override each document independently",()=>{
 const defaults=resolveBookingRequirements({},documents);
 assert.equal(defaults.rules.length,2);assert(defaults.requirePolicy);assert.equal(defaults.documents[0].name,"Portrait details");
 const custom=resolveBookingRequirements({bookingDocumentSelection:{intake:"wedding-form",terms:"none"}},documents);
 assert.deepEqual(custom.documents.map(document=>document.id),["wedding-form"]);assert.equal(custom.requirePolicy,false);
 assert.equal(resolveBookingRequirements({bookingDocumentSelection:{intake:"none",terms:"none"}},documents).rules.length,0);
 assert.throws(()=>resolveBookingRequirements({bookingDocumentSelection:{intake:"foreign-business-id",terms:"default"}},documents),/no longer available/);
 assert.throws(()=>resolveBookingRequirements({bookingDocumentSelection:{intake:"global-terms",terms:"default"}},documents),/no longer available/);
});
test("effective rules validate answers, reject stale terms and preserve accepted snapshots",()=>{
 const requirements=resolveBookingRequirements({},documents);
 const intake=requirements.rules.find(rule=>rule.kind==="intake")!;
 assert.throws(()=>validateBookingRuleAnswers(requirements.rules,{}, {customerName:"Client",customerEmail:"client@example.test"}),/Answer/);
 assert.throws(()=>validateBookingRuleAnswers(requirements.rules,{[intake.id]:"Forged"},{customerName:"Client",customerEmail:"client@example.test"}),/available option/);
 assert.match(validateBookingRuleAnswers(requirements.rules,{[intake.id]:"Candid"},{customerName:"Client",customerEmail:"client@example.test"}),/Candid/);
 assert.throws(()=>validateBookingRequirementsRevision(requirements),/changed/);
 validateBookingRequirementsRevision(requirements,requirements.revision);
 const snapshot=structuredClone(requirements);
 const edited=documents.map(document=>document.kind==="TERMS"?{...document,version:3,rules:[{...policy,label:"Updated terms"}]}:document);
 assert.throws(()=>validateBookingRequirementsRevision(resolveBookingRequirements({},edited),requirements.revision),/changed/);
 assert.equal(snapshot.policyText,"The agreed booking terms.");assert.equal(snapshot.documents[1].version,2);
});
test("legacy rules and contact details remain compatible without duplicate questions",()=>{
 const resolved=resolveBookingRequirements({bookingRules:[question,{...question,id:"contact",type:"TEXT",contactField:"customerName",options:[]}]},documents);
 assert.equal(resolved.rules.filter(rule=>rule.kind==="intake").length,1);
 const legacy=resolveBookingRequirements({intakePrompt:"Old question",policyText:"Old terms",requirePolicy:true},[]);
 assert.equal(legacy.bookingRules,null);assert.equal(legacy.policyText,"Old terms");assert(legacy.requirePolicy);
 validateBookingRequirementsRevision(legacy);
 assert.equal(bookingDocumentInputSchema.safeParse({name:"Contact",kind:"INTAKE",isDefault:false,rules:[{...question,type:"TEXT",options:[],contactField:"customerEmail"}]}).success,false);
 assert.equal(bookingDocumentInputSchema.safeParse({name:"Wrong terms",kind:"TERMS",isDefault:true,rules:[question]}).success,false);
});
test("forms-and-terms migration preserves saved rules and enforces one default per kind and business",async()=>{
 const db=new PGlite();try{
  await db.exec('CREATE TABLE "BookingRuleSet"(id TEXT PRIMARY KEY,"siteId" TEXT,rules JSONB); CREATE TABLE "Service"(id TEXT);CREATE TABLE "Booking"(id TEXT);');
  await db.query('INSERT INTO "BookingRuleSet" VALUES ($1,$2,$3),($4,$5,$6)',["intake","one",[question],"terms","one",[policy]]);
  await db.exec(readFileSync("prisma/migrations/20261107020000_booking_forms_terms/migration.sql","utf8"));
  const rows=await db.query<{id:string;kind:string;version:number;isDefault:boolean;rules:unknown}>('SELECT id,kind,version,"isDefault",rules FROM "BookingRuleSet" ORDER BY id');
  assert.equal(rows.rows[0].kind,"INTAKE");assert.equal(rows.rows[1].kind,"TERMS");assert.deepEqual(rows.rows[1].rules,[policy]);
  await db.exec('UPDATE "BookingRuleSet" SET "isDefault"=true');
  await assert.rejects(db.query('INSERT INTO "BookingRuleSet"(id,"siteId",rules,kind,"isDefault") VALUES ($1,$2,$3,$4,true)',["duplicate","one",[question],"INTAKE"]),/unique/i);
 }finally{await db.close();}
});

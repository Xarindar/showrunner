import assert from "node:assert/strict";
import test from "node:test";
import { bookingRuleSchema } from "../lib/scheduling/booking-rules";
import { bookingTermsValues, plainTermsDocument, renderTermsDocument, validateTermsDocument, type TermsNode } from "../clients/booking/scripts/booking-terms.js";

test("dynamic terms render safe formatting and booked package details without changing old text",()=>{
  const doc:TermsNode={type:"doc",content:[{type:"heading",attrs:{level:2},content:[{type:"text",text:"Agreement"}]},{type:"paragraph",content:[{type:"dynamicField",attrs:{field:"clientName"}},{type:"text",text:" books ",marks:[{type:"italic"}]},{type:"dynamicField",attrs:{field:"packageName"}},{type:"text",text:" for "},{type:"dynamicField",attrs:{field:"total"},marks:[{type:"bold"}]}]}]};
  const values=bookingTermsValues({serviceName:"Wedding",durationMinutes:60,timezone:"America/Chicago",startsAt:"2030-11-13T15:00:00Z",customerName:'<img src=x onerror="alert(1)">',package:{name:"Gold",priceCents:52000,unlimitedDuration:true,deliverables:{finalPhotos:null},extras:[{name:"Albums",quantity:2}]}});
  const rendered=renderTermsDocument(doc,values);
  assert.match(rendered.html,/<strong>\$520\.00<\/strong>/);
  assert(!rendered.html.includes('<img'));
  assert.match(rendered.text,/books Gold for \$520.00/);
  assert.equal(values.finalPhotos,"Unlimited");assert.equal(values.extras,"Albums × 2");assert.equal(values.time,"9:00 AM");
  const old="Line one\n\n<script>alert(1)</script>";
  assert.equal(renderTermsDocument(plainTermsDocument(old)).text,old);
  assert(!renderTermsDocument(plainTermsDocument(old)).html.includes('<script>'));
});

test("terms reject unknown fields, executable content, unsupported formatting and oversized documents",()=>{
  for(const child of [{type:'dynamicField',attrs:{field:'secret'}},{type:'script',text:'evil'},{type:'text',text:'x',marks:[{type:'link',attrs:{href:'javascript:evil'}}]},{type:'text',text:'x'.repeat(20001)}]) {
    const doc={type:'doc',content:[{type:'paragraph',content:[child]}]};
    assert.throws(()=>validateTermsDocument(doc));
    assert.equal(bookingRuleSchema.safeParse({id:'terms',kind:'policy',category:'Terms',label:'Terms',richText:doc,type:'TEXT',required:true,options:[]}).success,false);
  }
});

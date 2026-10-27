import assert from "node:assert/strict";
import test from "node:test";
import strips from "../clients/cottage616/page-strips.json";
import { cottageTeamBlock } from "../clients/cottage616/team-blocks";
import type { ContentBlockConfig } from "../modules/content/studio/manifest";
import { resolveStudioPayload, validateBlockUpdate, type StoredBlock } from "../modules/content/studio/state";
import { resolveMobilePayload, mobileOverrides } from "../modules/content/studio/mobile-overrides";
for (const [id, count, offset] of [["home-section-7",4,1],["hive-section-4",2,3]] as const) test(`${id} preserves existing members and permits add/remove with mobile overrides`, () => {
 const raw = strips.find(block=>block.id===id)! as ContentBlockConfig;
 const legacy = structuredClone(raw.defaults!) as any;
 legacy.texts[offset].text="Saved name";
 legacy.images[0].imagePositionX=23;
 legacy.mobileOverrides=[{path:["texts",legacy.texts[offset].id,"text"],value:"Mobile name"},{path:["images",legacy.images[0].id,"url"],value:"/mobile.jpg"}];
 const block=cottageTeamBlock(raw,legacy);
 const payload=block.defaults! as any;
 assert.equal(payload.items.length,count); assert.equal(payload.items[0].name,"Saved name"); assert.equal(payload.items[0].imagePositionX,23);
 const mobile=resolveMobilePayload(payload) as any;
 assert.equal(mobile.items[0].name,"Mobile name"); assert.equal(mobile.items[0].imageUrl,"/mobile.jpg");
 const stored: StoredBlock={schemaVersion:1,revision:2,payload:legacy,pageIds:block.pageIds,updatedAt:"",updatedBy:""};
 assert.deepEqual(resolveStudioPayload(block,stored),payload);
 const baseline={...stored,payload};
 for(const items of [[],payload.items.slice(1),[...payload.items,{...payload.items[0],id:"new-member"}]]) {
  const result=validateBlockUpdate(block,baseline,{id,revision:2,pageIds:block.pageIds,payload:{items}});
  assert.equal((result.payload.items as unknown[]).length,items.length);
 }
 const changed={...payload,items:payload.items.slice(1)};
 const mobileOnly={...payload,mobileOverrides:mobileOverrides(payload,changed)};
 validateBlockUpdate(block,baseline,{id,revision:2,pageIds:block.pageIds,payload:{mobileOverrides:mobileOnly.mobileOverrides}});
 assert.equal(mobileOnly.items.length,count); assert.equal((resolveMobilePayload(mobileOnly).items as unknown[]).length,count-1);
 assert.deepEqual(cottageTeamBlock(block,payload).defaults,payload);
});

import type { ContentBlockConfig } from "@/modules/content/studio/manifest";
import { mobileOverrides, resolveMobilePayload, type MobileOverride } from "@/modules/content/studio/mobile-overrides";

export function cottageTeamBlock(block: ContentBlockConfig, payload = block.defaults || {}): ContentBlockConfig {
  if (!["home-section-7", "hive-section-4"].includes(block.id)) return block;
  const hive = block.id === "hive-section-4";
  const offset = hive ? 3 : 1;
  const convert = (source: Record<string, unknown>) => {
    const texts = (source.texts || []) as {id: string; text: string}[];
    const images = (source.images || []) as Record<string, unknown>[];
    return { copy: "", heading: texts[hive ? 1 : 0]?.text || "", items: images.map((image, index) => ({
      id: String(image.id), name: texts[offset + index * 2]?.text || "", role: texts[offset + index * 2 + 1]?.text || "", bio: "",
      imageUrl: String(image.url || ""), imageAlt: String(image.alt || ""),
      imagePositionX: image.imagePositionX ?? 50, imagePositionY: image.imagePositionY ?? 50, imageZoom: image.imageZoom ?? 1
    })) };
  };
  let defaults = payload;
  if (!Array.isArray(payload.items)) {
    defaults = convert(payload);
    if (Array.isArray(payload.mobileOverrides)) {
      const texts = (payload.texts || []) as {id: string}[];
      const images = (payload.images || []) as {id: string}[];
      const mapped: MobileOverride[] = [];
      for (const override of payload.mobileOverrides as MobileOverride[]) {
        const [list, id, field] = override.path;
        const index = (list === "texts" ? texts : images).findIndex(row => row.id === id);
        if (index < 0) continue;
        if (list === "texts" && index === (hive ? 1 : 0)) mapped.push({...override,path:["heading"]});
        else if (list === "texts" && index >= offset && images[Math.floor((index-offset)/2)]) mapped.push({...override,path:["items",images[Math.floor((index-offset)/2)].id,(index-offset)%2 ? "role" : "name"]});
        else if (list === "images" && ["url","alt","imagePositionX","imagePositionY","imageZoom"].includes(field)) mapped.push({...override,path:["items",id,field === "url" ? "imageUrl" : field === "alt" ? "imageAlt" : field]});
      }
      defaults.mobileOverrides = (payload.mobileOverrides as MobileOverride[]).some(override=>override.path.length<3)
        ? mobileOverrides(defaults, convert(resolveMobilePayload(payload))) : mapped;
    }
  }
  return { ...block, type:"team", label:hive ? "The Hive team" : "Cottage 616 team", editableFields:["heading","items"], fixedRows:false, editorGroups:undefined,
    limits:{items:30}, defaults, presentation:{...block.presentation,variant:"team-cards",bindings:[{path:"heading",selector:"#team .section-heading > p"}]} };
}

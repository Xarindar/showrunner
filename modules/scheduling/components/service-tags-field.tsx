"use client";

import { useState } from "react";
import { MediaTagPicker } from "@/modules/media/media-tag-picker";

export function ServiceTagsField({ tags, initialTags = [] }: { tags: string[]; initialTags?: string[] }) {
  const [selected, setSelected] = useState(initialTags);
  return <>
    <input type="hidden" name="tags" value={selected.join(",")} />
    <MediaTagPicker tags={tags} selected={selected} onChange={setSelected} />
  </>;
}

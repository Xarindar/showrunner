"use client";
import { useEffect, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, List, ListOrdered, Undo2, Redo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/field";
import { termsFields, renderTermsDocument, type TermsNode } from "@/clients/booking/scripts/booking-terms.js";
import styles from "./terms-editor.module.css";

const DynamicField=Node.create({
  name:"dynamicField",group:"inline",inline:true,atom:true,
  addAttributes:()=>({field:{default:null}}),
  parseHTML:()=>[{tag:"span[data-terms-field]",getAttrs:element=>({field:(element as HTMLElement).dataset.termsField})}],
  renderHTML:({node,HTMLAttributes})=>["span",mergeAttributes(HTMLAttributes,{"data-terms-field":node.attrs.field,contenteditable:"false"}),termsFields[node.attrs.field]||"Unknown field"]
});
const extensions=[StarterKit.configure({heading:{levels:[2,3]},link:false,code:false,codeBlock:false,horizontalRule:false,trailingNode:false}),DynamicField];

export function TermsEditor({value,disabled,onChange}:{value:TermsNode;disabled:boolean;onChange:(value:TermsNode,label:string)=>void}) {
  const [,refresh]=useState(0);
  const editor=useEditor({extensions,content:value,immediatelyRender:false,editable:!disabled,
    editorProps:{attributes:{role:"textbox","aria-label":"Booking terms","aria-multiline":"true",class:styles.document}},
    onUpdate:({editor})=>{
      // ProseMirror attributes have null prototypes, which React server actions cannot serialize.
      const document:TermsNode=JSON.parse(JSON.stringify(editor.getJSON()));
      let label;try{label=renderTermsDocument(document).text;}catch{label=editor.getText()||"Invalid terms";}onChange(document,label);
    },
    onTransaction:()=>refresh(value=>value+1)
  });
  useEffect(()=>{editor?.setEditable(!disabled);},[editor,disabled]);
  if(!editor) return <p role="status">Loading terms editor…</p>;
  return <div className={styles.editor}>
    <div className={styles.toolbar} role="group" aria-label="Terms formatting">
      <Select aria-label="Text style" disabled={disabled} value={editor.isActive('heading',{level:2})?'2':editor.isActive('heading',{level:3})?'3':'paragraph'} onChange={event=>event.target.value==='paragraph'?editor.chain().focus().setParagraph().run():editor.chain().focus().setHeading({level:Number(event.target.value) as 2|3}).run()}><option value="paragraph">Paragraph</option><option value="2">Heading</option><option value="3">Subheading</option></Select>
      <Button type="button" size="sm" variant="ghost" aria-label="Bold" aria-pressed={editor.isActive('bold')} disabled={disabled} onClick={()=>editor.chain().focus().toggleBold().run()}><Bold size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Italic" aria-pressed={editor.isActive('italic')} disabled={disabled} onClick={()=>editor.chain().focus().toggleItalic().run()}><Italic size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Underline" aria-pressed={editor.isActive('underline')} disabled={disabled} onClick={()=>editor.chain().focus().toggleUnderline().run()}><Underline size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Bullet list" aria-pressed={editor.isActive('bulletList')} disabled={disabled} onClick={()=>editor.chain().focus().toggleBulletList().run()}><List size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Numbered list" aria-pressed={editor.isActive('orderedList')} disabled={disabled} onClick={()=>editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Undo" disabled={disabled||!editor.can().undo()} onClick={()=>editor.chain().focus().undo().run()}><Undo2 size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Redo" disabled={disabled||!editor.can().redo()} onClick={()=>editor.chain().focus().redo().run()}><Redo2 size={16}/></Button>
      <Select aria-label="Insert dynamic field" disabled={disabled} value="" onChange={event=>{if(event.target.value)editor.chain().focus().insertContent({type:'dynamicField',attrs:{field:event.target.value}}).run();}}><option value="" disabled>Insert field</option>{Object.entries(termsFields).map(([key,label])=><option value={key} key={key}>{label}</option>)}</Select>
    </div>
    <EditorContent editor={editor}/>
    <p className="muted-text">Fields fill in from the selected package, appointment, and client details at checkout.</p>
  </div>;
}

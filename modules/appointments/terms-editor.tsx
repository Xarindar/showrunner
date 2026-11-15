"use client";
import { useEffect, useRef, useState } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import { Node, mergeAttributes } from "@tiptap/core";
import { closeHistory } from "@tiptap/pm/history";
import StarterKit from "@tiptap/starter-kit";
import { Bold, Italic, Underline, List, ListOrdered, Undo2, Redo2, Plus, Pilcrow, Heading2, Heading3 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { termsFields, renderTermsDocument, type TermsNode } from "@/clients/booking/scripts/booking-terms.js";
import styles from "./terms-editor.module.css";

const DynamicField=Node.create({
  name:"dynamicField",group:"inline",inline:true,atom:true,
  addAttributes:()=>({field:{default:null}}),
  parseHTML:()=>[{tag:"span[data-terms-field]",getAttrs:element=>({field:(element as HTMLElement).dataset.termsField})}],
  renderHTML:({node,HTMLAttributes})=>["span",mergeAttributes(HTMLAttributes,{"data-terms-field":node.attrs.field,contenteditable:"false"}),termsFields[node.attrs.field]||"Unknown field"]
});
const extensions=[StarterKit.configure({heading:{levels:[2,3]},link:false,code:false,codeBlock:false,horizontalRule:false,trailingNode:false}),DynamicField];
const fieldGroups=[
  {label:"Package and coverage",fields:['serviceName','packageName','duration','finalPhotos','locations','outfitChanges','includedServices']},
  {label:"Booking",fields:['extras','total','date','time']},
  {label:"Client",fields:['clientName','clientEmail','clientPhone']}
];

export function TermsEditor({value,disabled,onChange,onSave}:{value:TermsNode;disabled:boolean;onSave:()=>void;onChange:(value:TermsNode,label:string)=>void}) {
  const toolbarSlot=useRef<HTMLDivElement>(null);
  const toolbar=useRef<HTMLDivElement>(null);
  const [dock,setDock]=useState<{left:number;width:number;height:number}|null>(null);
  const [,refresh]=useState(0);
  const [fieldPickerOpen,setFieldPickerOpen]=useState(false);
  const insertion=useRef<{range:{from:number;to:number};field?:string}|null>(null);
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
  useEffect(()=>{
    if(fieldPickerOpen||!editor||!insertion.current?.field) return;
    const {range,field}=insertion.current;
    insertion.current=null;
    // Restore selection after the native dialog closes and the editor is no longer inert.
    editor.chain().focus().command(({tr})=>{closeHistory(tr);return true;}).setTextSelection(range).insertContent({type:'dynamicField',attrs:{field}}).run();
  },[fieldPickerOpen,editor]);
  useEffect(()=>{
    const slot=toolbarSlot.current,bar=toolbar.current;
    if(!slot||!bar) return;
    let scroller=slot.parentElement;
    while(scroller&&!/(auto|scroll)/.test(getComputedStyle(scroller).overflowY)) scroller=scroller.parentElement;
    const update=()=>{
      const bounds=slot.getBoundingClientRect();
      const height=bar.getBoundingClientRect().height;
      slot.style.height=`${height}px`;
      const top=Math.max(0,scroller?.getBoundingClientRect().top||0);
      setDock(bounds.bottom<=top?{left:bounds.left,width:bounds.width,height}:null);
    };
    const observer=new ResizeObserver(update);
    observer.observe(slot);observer.observe(bar);
    window.addEventListener('scroll',update,true);
    window.addEventListener('resize',update);
    update();
    return()=>{observer.disconnect();window.removeEventListener('scroll',update,true);window.removeEventListener('resize',update);};
  },[editor]);
  if(!editor) return <p role="status">Loading terms editor…</p>;
  return <div className={styles.editor} style={dock?{paddingBottom:dock.height}:undefined}>
    <div ref={toolbarSlot}><div ref={toolbar} className={`${styles.toolbar} ${dock?styles.docked:""}`} style={dock?{left:dock.left,width:dock.width}:undefined} data-docked={!!dock} role="group" aria-label="Terms formatting">
      <div className={styles.toolGroup} role="group" aria-label="Text style">
        <Button type="button" size="sm" variant="ghost" aria-label="Paragraph" title="Paragraph" aria-pressed={editor.isActive('paragraph')} disabled={disabled} onClick={()=>editor.chain().focus().setParagraph().run()}><Pilcrow size={16}/></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Heading" title="Heading" aria-pressed={editor.isActive('heading',{level:2})} disabled={disabled} onClick={()=>editor.chain().focus().setHeading({level:2}).run()}><Heading2 size={16}/></Button>
        <Button type="button" size="sm" variant="ghost" aria-label="Subheading" title="Subheading" aria-pressed={editor.isActive('heading',{level:3})} disabled={disabled} onClick={()=>editor.chain().focus().setHeading({level:3}).run()}><Heading3 size={16}/></Button>
      </div>
      <div className={styles.toolGroup} role="group" aria-label="Text emphasis">
      <Button type="button" size="sm" variant="ghost" aria-label="Bold" aria-pressed={editor.isActive('bold')} disabled={disabled} onClick={()=>editor.chain().focus().toggleBold().run()}><Bold size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Italic" aria-pressed={editor.isActive('italic')} disabled={disabled} onClick={()=>editor.chain().focus().toggleItalic().run()}><Italic size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Underline" aria-pressed={editor.isActive('underline')} disabled={disabled} onClick={()=>editor.chain().focus().toggleUnderline().run()}><Underline size={16}/></Button>
      </div>
      <div className={styles.toolGroup} role="group" aria-label="Lists">
      <Button type="button" size="sm" variant="ghost" aria-label="Bullet list" aria-pressed={editor.isActive('bulletList')} disabled={disabled} onClick={()=>editor.chain().focus().toggleBulletList().run()}><List size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Numbered list" aria-pressed={editor.isActive('orderedList')} disabled={disabled} onClick={()=>editor.chain().focus().toggleOrderedList().run()}><ListOrdered size={16}/></Button>
      </div>
      <div className={styles.toolGroup} role="group" aria-label="Edit history">
      <Button type="button" size="sm" variant="ghost" aria-label="Undo" disabled={disabled||!editor.can().undo()} onClick={()=>editor.chain().focus().undo().run()}><Undo2 size={16}/></Button>
      <Button type="button" size="sm" variant="ghost" aria-label="Redo" disabled={disabled||!editor.can().redo()} onClick={()=>editor.chain().focus().redo().run()}><Redo2 size={16}/></Button>
      </div>
      <Button type="button" variant="secondary" disabled={disabled} onClick={()=>{
        const {from,to}=editor.state.selection;
        insertion.current={range:{from,to}};
        setFieldPickerOpen(true);
      }}><Plus size={16} aria-hidden="true"/>Add Dynamic Field</Button>
      <Button type="button" disabled={disabled} onClick={onSave}>{disabled?"Saving…":"Save terms"}</Button>
    </div></div>
    <EditorContent editor={editor}/>
    <p className="muted-text">Fields fill in from the selected package, appointment, and client details at checkout.</p>
    <Modal open={fieldPickerOpen} title="Add Dynamic Field" className={styles.fieldPicker} bodyClassName={styles.fieldPickerBody} onClose={()=>setFieldPickerOpen(false)}>
      <p className="ui-field-hint">Choose a field to insert at your cursor. It fills in with the client’s booking details.</p>
      {fieldGroups.map(group=><section key={group.label} className={styles.fieldGroup} aria-label={group.label}>
        <h3 className="ui-zero">{group.label}</h3>
        <div className={styles.fieldOptions}>{group.fields.map(field=><Button type="button" variant="secondary" key={field} disabled={disabled} onClick={()=>{
          if(insertion.current) insertion.current.field=field;
          setFieldPickerOpen(false);
        }}>{termsFields[field]}</Button>)}</div>
      </section>)}
    </Modal>
  </div>;
}

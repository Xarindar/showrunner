"use client";
import { ResponsiveTableFrame } from "@/components/ui/responsive-table";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { Switch } from "@/components/ui/switch";
import { useNotify } from "@/components/ui/notifications";
import { bookingDocumentInputSchema, type BookingDocument, type BookingDocumentKind } from "@/lib/scheduling/booking-documents";
import { saveBookingDocument } from "./forms-terms-actions";
import { IntakeFormBuilder } from "./intake-form-builder";
import styles from "./forms-terms.module.css";

type Draft=Omit<BookingDocument,"id"|"version"> & {id?:string;version?:number};
export function FormsTerms({initialDocuments}:{initialDocuments:BookingDocument[]}) {
  const [documents,setDocuments]=useState(initialDocuments);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  const notify=useNotify();
  function open(kind:BookingDocumentKind,document?:BookingDocument) {
    setDraft(document?{...document,rules:document.rules.filter(rule=>!rule.contactField)}:{kind,name:"",isDefault:false,rules:[]});setError("");
  }
  async function save() {
    const parsed=bookingDocumentInputSchema.safeParse(draft);
    if (!parsed.success) {setError(parsed.error.issues[0].message);return;}
    setPending(true);setError("");
    try {
      const result=await saveBookingDocument(parsed.data);
      if (result.error || !result.document) {setError(result.error || "Could not save this document.");return;}
      const saved=result.document;
      setDocuments(current=>[...current.filter(item=>item.id!==saved.id).map(item=>saved.isDefault&&item.kind===saved.kind?{...item,isDefault:false}:item),saved].sort((a,b)=>a.name.localeCompare(b.name)));
      setDraft(null);notify(saved.kind==="INTAKE"?"Intake form saved.":"Booking terms saved.");
    } catch {setError("Could not save. Your changes are still here; please retry.");} finally {setPending(false);}
  }
  if (draft?.kind === "INTAKE") return <IntakeFormBuilder value={draft} onChange={value => setDraft({ ...draft, ...value })} onSave={() => void save()} onCancel={() => setDraft(null)} pending={pending} error={error} />;
  return <div className={`stack ${styles.workspace}`}>
    <header className="page-header"><h1>Forms &amp; Terms</h1></header>
    <div className={styles.tables}>
    {(["INTAKE","TERMS"] as const).map(kind=><section key={kind} className={`ui-section-card ui-table-card ${styles.card}`} aria-label={kind==="INTAKE"?"Intake forms":"Booking terms"}>
      <div className="ui-section-header"><h2>{kind==="INTAKE"?"Intake forms":"Booking terms"}</h2><Button variant="secondary" size="sm" onClick={()=>open(kind)}><Plus size={16}/>{kind==="INTAKE"?"New form":"New terms"}</Button></div>
      <ResponsiveTableFrame className={`catalog-table-scroll ${styles.table}`}><table className="catalog-product-table"><thead><tr><th>Name</th><th>{kind==="INTAKE"?"Questions":"Version"}</th><th>Global default</th><th>Actions</th></tr></thead><tbody>
        {documents.filter(item=>item.kind===kind).map(item=><tr key={item.id}><td>{item.name}</td><td>{kind==="INTAKE"?item.rules.filter(rule=>rule.kind==="intake"&&!rule.contactField).length:item.version}</td><td>{item.isDefault?<span className="ui-badge ui-badge-success">Default</span>:"—"}</td><td><Button size="sm" variant="ghost" aria-label={`Edit ${item.name}`} onClick={()=>open(kind,item)}><Pencil size={16}/></Button></td></tr>)}

      </tbody></table>{!documents.some(item=>item.kind===kind)&&<p className={styles.empty}>{kind==="INTAKE"?"No intake forms yet":"No booking terms yet"}</p>}</ResponsiveTableFrame>
    </section>)}
    </div>
    <Modal open={Boolean(draft)} title={draft?.id?"Edit booking terms":"New booking terms"} onClose={()=>{if(!pending)setDraft(null);}} className={styles.modal} bodyClassName={styles.body}>
      {draft&&<>
        <div className={`ui-dialog-scroll ${styles.content}`}>
          <Field label="Terms name"><Input autoComplete="off" value={draft.name} required maxLength={100} disabled={pending} onChange={event=>setDraft({...draft,name:event.target.value})}/></Field>
          <Field label="Booking terms" className={styles.termsField}><Textarea aria-label="Booking terms" className={styles.terms} disabled={pending} required maxLength={20000} value={draft.rules.map(rule=>rule.label).join("\n\n")} onChange={event=>setDraft({...draft,rules:[{id:draft.rules[0]?.id ?? crypto.randomUUID(),kind:"policy",category:"Booking Terms & Conditions",label:event.target.value,type:"TEXT",required:true,placeholder:"",helpText:"",options:[]}]})}/></Field>
          <Switch label="Default for all bookings" description="Sessions use this unless they choose another document or none." variant="inline" checked={draft.isDefault} disabled={pending} onChange={event=>setDraft({...draft,isDefault:event.target.checked})}/>
          {error&&<p role="alert" className="error">{error}</p>}
        </div>
        <div className="module-modal-actions"><Button variant="ghost" disabled={pending} onClick={()=>setDraft(null)}>Cancel</Button><Button disabled={pending} onClick={()=>void save()}>{pending?"Saving…":"Save"}</Button></div>
      </>}
    </Modal>
  </div>;
}

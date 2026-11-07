"use client";
import { ResponsiveTableFrame } from "@/components/ui/responsive-table";
import { useState } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Modal } from "@/components/ui/modal";
import { BookingQuestionChoices } from "@/modules/scheduling/components/booking-question-choices";
import { Switch } from "@/components/ui/switch";
import { useNotify } from "@/components/ui/notifications";
import { bookingRuleSchema, type BookingRule } from "@/lib/scheduling/booking-rules";
import { bookingDocumentInputSchema, type BookingDocument, type BookingDocumentKind } from "@/lib/scheduling/booking-documents";
import { saveBookingDocument } from "./forms-terms-actions";
import styles from "./forms-terms.module.css";

type Draft=Omit<BookingDocument,"id"|"version"> & {id?:string;version?:number};
const labels={TEXT:"Text answer",RADIO:"Single choice",SELECT:"Dropdown"};
export function FormsTerms({initialDocuments}:{initialDocuments:BookingDocument[]}) {
  const [documents,setDocuments]=useState(initialDocuments);
  const [draft,setDraft]=useState<Draft|null>(null);
  const [question,setQuestion]=useState<{index:number;rule:BookingRule}|null>(null);
  const [choices,setChoices]=useState<string[]>([""]);
  const [error,setError]=useState("");
  const [pending,setPending]=useState(false);
  const notify=useNotify();
  function open(kind:BookingDocumentKind,document?:BookingDocument) {
    setDraft(document?{...document,rules:document.rules.filter(rule=>!rule.contactField)}:{kind,name:"",isDefault:false,rules:[]});setQuestion(null);setError("");
  }
  function editQuestion(index:number) {
    if (!draft) return;
    const rule=draft.rules[index] ?? {id:crypto.randomUUID(),kind:"intake",category:draft.name.slice(0,80) || "Session details",label:"",type:"TEXT",required:false,placeholder:"",helpText:"",options:[]};
    setQuestion({index,rule});setChoices(rule.options.length ? [...rule.options] : [""]);setError("");
  }
  function applyQuestion() {
    if (!question || !draft) return;
    const parsed=bookingRuleSchema.safeParse({...question.rule,options:question.rule.type==="TEXT"?[]:choices.map(value=>value.trim()).filter(Boolean)});
    if (!parsed.success) {setError(parsed.error.issues[0].message);return;}
    const rules=[...draft.rules];rules[question.index]=parsed.data;
    setDraft({...draft,rules});setQuestion(null);setError("");
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
    <Modal open={Boolean(draft)} title={question?question.rule.kind==="policy"?"Edit booking terms":"Configure question":draft?.kind==="TERMS"?draft.id?"Edit booking terms":"New booking terms":draft?.id?"Edit intake form":"New intake form"} onClose={()=>{if(!pending){setDraft(null);setQuestion(null);}}} className={styles.modal} bodyClassName={styles.body}>
      {draft&&<>
        <div className={`ui-dialog-scroll ${styles.content}`}>
        {question?<>
          <Field label={question.rule.kind==="policy"?"Booking terms":"Question"}><Textarea value={question.rule.label} maxLength={question.rule.kind==="policy"?20000:2000} onChange={event=>setQuestion({...question,rule:{...question.rule,label:event.target.value}})}/></Field>
          {question.rule.kind==="intake"&&<>
            <Field label="Answer type"><Select value={question.rule.type} onChange={event=>setQuestion({...question,rule:{...question.rule,type:event.target.value as BookingRule["type"]}})}>{Object.entries(labels).map(([value,label])=><option key={value} value={value}>{label}</option>)}</Select></Field>
            {question.rule.type!=="TEXT"?<BookingQuestionChoices value={choices} onChange={setChoices} />:<Field label="Placeholder"><Input value={question.rule.placeholder} maxLength={200} onChange={event=>setQuestion({...question,rule:{...question.rule,placeholder:event.target.value}})}/></Field>}
            <Field label="Help text"><Input value={question.rule.helpText} maxLength={500} onChange={event=>setQuestion({...question,rule:{...question.rule,helpText:event.target.value}})}/></Field>
            <Switch label="Required answer" checked={question.rule.required} onChange={event=>setQuestion({...question,rule:{...question.rule,required:event.target.checked}})}/>
          </>}
        </>:<>
          <Field label={draft.kind==="INTAKE"?"Form name":"Terms name"}><Input autoComplete="off" value={draft.name} required maxLength={100} disabled={pending} onChange={event=>setDraft({...draft,name:event.target.value})}/></Field>
          {draft.kind==="TERMS"?<Field label="Booking terms" className={styles.termsField}><Textarea aria-label="Booking terms" className={styles.terms} disabled={pending} required maxLength={20000} value={draft.rules.map(rule=>rule.label).join("\n\n")} onChange={event=>setDraft({...draft,rules:[{id:draft.rules[0]?.id ?? crypto.randomUUID(),kind:"policy",category:"Booking Terms & Conditions",label:event.target.value,type:"TEXT",required:true,placeholder:"",helpText:"",options:[]}]})}/></Field>:<section className={`ui-section-card ui-table-card ${styles.questions}`}>
            <div className="ui-section-header"><h3 className="ui-zero">Questions</h3><Button variant="secondary" size="sm" disabled={draft.rules.length>=40||pending} onClick={()=>editQuestion(draft.rules.length)}><Plus size={16}/>Add question</Button></div>
            <ResponsiveTableFrame className={`catalog-table-scroll ${styles.table}`}><table className="catalog-product-table"><thead><tr><th>Question</th><th>Required</th><th>Actions</th></tr></thead><tbody>
              {draft.rules.map((rule,index)=><tr key={rule.id}><td>{rule.label}</td><td>{rule.required?"Yes":"No"}</td><td><div className="catalog-row-actions"><Button size="sm" variant="ghost" aria-label={`Edit ${rule.label}`} disabled={pending} onClick={()=>editQuestion(index)}><Pencil size={15}/></Button><Button size="sm" variant="ghost" aria-label={`Remove ${rule.label}`} disabled={pending} onClick={()=>setDraft({...draft,rules:draft.rules.filter((_,position)=>position!==index)})}><Trash2 size={15}/></Button></div></td></tr>)}

            </tbody></table>{!draft.rules.length&&<p className={styles.empty}>No questions added</p>}</ResponsiveTableFrame>
          </section>}
          <Switch label="Default for all bookings" description="Sessions use this unless they choose another document or none." variant="inline" checked={draft.isDefault} disabled={pending} onChange={event=>setDraft({...draft,isDefault:event.target.checked})}/>
        </>}
        {error&&<p role="alert" className="error">{error}</p>}
        </div>
        <div className="module-modal-actions"><Button variant="ghost" disabled={pending} onClick={()=>{if(question){setQuestion(null);setError("");}else setDraft(null);}}>{question?"Back":"Cancel"}</Button><Button disabled={pending} onClick={()=>{if(question)applyQuestion();else void save();}}>{question?"Apply question":pending?"Saving…":"Save"}</Button></div>
      </>}
    </Modal>
  </div>;
}

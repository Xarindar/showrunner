export const termsFields = {
  serviceName: 'Session name', packageName: 'Package name', duration: 'Duration',
  finalPhotos: 'Included photos', locations: 'Locations', outfitChanges: 'Outfit changes',
  includedServices: 'Included services', extras: 'Selected extras', total: 'Booking total',
  clientName: 'Client name', clientEmail: 'Client email', clientPhone: 'Client phone',
  date: 'Appointment date', time: 'Appointment start time'
};
const blockTags = { paragraph: 'p', bulletList: 'ul', orderedList: 'ol', listItem: 'li', blockquote: 'blockquote' };
const markTags = { bold: 'strong', italic: 'em', underline: 'u', strike: 's' };
const escape = value => String(value).replace(/[&<>"']/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

export function validateTermsDocument(document) {
  let count=0, characters=0;
  function visit(node,depth,parent) {
    if (!node || typeof node !== 'object' || Array.isArray(node) || depth>12 || ++count>4000) throw Error('Terms are too complex. Use simpler paragraphs and lists.');
    if (Object.keys(node).some(key=>!['type','content','text','attrs','marks'].includes(key))) throw Error('Unsupported terms content.');
    const inline=['text','dynamicField','hardBreak'].includes(node.type);
    if (parent && (['paragraph','heading'].includes(parent) ? !inline : ['bulletList','orderedList'].includes(parent) ? node.type!=='listItem' : !['paragraph','heading','bulletList','orderedList','blockquote'].includes(node.type))) throw Error('Invalid terms structure.');
    if (node.type==='text') { if(typeof node.text!=='string'||!node.text.length) throw Error('Invalid terms text.'); characters+=node.text.length; }
    else if(node.type==='dynamicField') { if(!Object.hasOwn(termsFields,node.attrs?.field)) throw Error('Choose a supported dynamic field.'); }
    else if(node.type==='heading') { if(![2,3].includes(node.attrs?.level)) throw Error('Choose Heading or Subheading.'); }
    else if(node.type!=='doc'&&node.type!=='hardBreak'&&!Object.hasOwn(blockTags,node.type)) throw Error('Unsupported terms formatting.');
    if(node.text!==undefined&&node.type!=='text') throw Error('Invalid terms text.');
    if(node.attrs && Object.keys(node.attrs).some(key=>!(node.type==='dynamicField'?['field']:node.type==='heading'?['level']:node.type==='orderedList'?['start','type']:[]).includes(key))) throw Error('Unsupported terms attributes.');
    if(node.type==='orderedList'&&node.attrs?.start!==undefined&&(!Number.isInteger(node.attrs.start)||node.attrs.start<1||node.attrs.start>10000)) throw Error('Invalid list start.');
    if(node.marks && (!inline||!Array.isArray(node.marks)||node.marks.length>4||node.marks.some(mark=>!Object.hasOwn(markTags,mark.type)||Object.keys(mark).some(key=>key!=='type')))) throw Error('Unsupported terms formatting.');
    if(inline && node.content?.length) throw Error('Invalid terms field.');
    if(node.content!==undefined&&!Array.isArray(node.content)) throw Error('Invalid terms content.');
    for(const child of node.content||[]) visit(child,depth+1,node.type);
  }
  if(document?.type!=='doc') throw Error('Invalid terms document.');
  visit(document,0,null);
  if(characters>20000) throw Error('Booking terms must be 20,000 characters or less.');
  return document;
}

export function plainTermsDocument(text) {
  return {type:'doc',content:String(text).split('\n').map(line=>({type:'paragraph',...(line?{content:[{type:'text',text:line}]}:{})}))};
}

export function renderTermsText(text, values = {}) {
  const fields = Object.fromEntries(Object.entries(termsFields).map(([key, label]) => [label, key]));
  return String(text).replace(/\[([^\]\r\n]+)\]/g, (placeholder, label) =>
    Object.hasOwn(fields, label) && values[fields[label]] != null ? String(values[fields[label]]) : placeholder);
}

export function bookingTermsValues(input) {
  const pack=input.package || {}, counts=pack.deliverables||{};
  const allowance=key=>counts[key]===null?'Unlimited':counts[key]===undefined?'Not specified':String(counts[key]);
  const date=input.startsAt?new Date(input.startsAt):null;
  const money=pack.priceCents??input.priceCents;
  return {
    serviceName:input.serviceName||'',packageName:pack.name||input.serviceName||'',
    duration:pack.unlimitedDuration?'Unlimited (rest of day reserved)':`${pack.durationMinutes??input.durationMinutes} minutes`,
    finalPhotos:allowance('finalPhotos'),locations:allowance('locations'),outfitChanges:allowance('outfitChanges'),
    includedServices:(pack.coverage||[]).join(', ')||'None specified',
    extras:(pack.extras||[]).map(item=>`${item.name}${item.quantity>1?` × ${item.quantity}`:''}`).join(', ')||'None',
    total:money==null?'To be confirmed':new Intl.NumberFormat('en-US',{style:'currency',currency:'USD'}).format(money/100),
    clientName:input.customerName?.trim()||'',clientEmail:input.customerEmail?.trim().toLowerCase()||'',clientPhone:input.customerPhone?.trim()||'',
    date:date?new Intl.DateTimeFormat('en-US',{timeZone:input.timezone,year:'numeric',month:'long',day:'numeric'}).format(date):'',
    time:date?new Intl.DateTimeFormat('en-US',{timeZone:input.timezone,hour:'numeric',minute:'2-digit',hour12:true}).format(date):''
  };
}

export function renderTermsDocument(document,values={}) {
  validateTermsDocument(document);
  function render(node) {
    if(node.type==='hardBreak') return {html:'<br>',text:'\n'};
    if(node.type==='text'||node.type==='dynamicField') {
      const text=node.type==='text'?renderTermsText(node.text,values):String(values[node.attrs.field]??`[${termsFields[node.attrs.field]}]`);
      return {text,html:(node.marks||[]).reduce((html,mark)=>`<${markTags[mark.type]}>${html}</${markTags[mark.type]}>`,escape(text))};
    }
    const children=(node.content||[]).map(render),tag=node.type==='heading'?`h${node.attrs.level}`:blockTags[node.type];
    return {html:tag?`<${tag}>${children.map(child=>child.html).join('')}</${tag}>`:children.map(child=>child.html).join(''),
      text:children.map(child=>child.text).join(['paragraph','heading'].includes(node.type)?'':'\n')};
  }
  return render(document);
}

export function renderBookingTerms(rules,values) {
  const documents=rules.filter(rule=>rule.kind==='policy').map(rule=>renderTermsDocument(rule.richText||plainTermsDocument(rule.label),values));
  return {html:documents.map(document=>document.html).join(''),text:documents.map(document=>document.text).join('\n\n')};
}

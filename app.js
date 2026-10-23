'use strict';

const STORAGE_KEY = 'fieldwork.workspace.v1';
const STAGES = [
  { id:'site', title:'Site feasibility', short:'Understand the land', description:'Survey, parcel evidence, topography, zoning, and the sun’s relationship to the site.', tasks:['Identify parcel and jurisdiction','Link survey and GIS boundary data','Document topography, access, trees, and utilities','Record zoning rules and source citations','Study solar orientation and seasonal shadows','Record assumptions and missing site evidence'] },
  { id:'brief', title:'Brief & requirements', short:'Define a good home', description:'Turn the client’s needs, priorities, budget, and constraints into a working program.', tasks:['Define occupants and patterns of use','Set room schedule and target floor area','Rank priorities and acceptable tradeoffs','Set construction budget and pricing assumptions','Record site and design constraints','Review and agree the client brief'] },
  { id:'concepts', title:'Concept exploration', short:'Compare possibilities', description:'Compare floor plans and simple 3D massing before committing to a direction.', tasks:['Sketch three spatial concepts','Link floor plans and block massing studies','Compare light, privacy, circulation, and site fit','Compare complexity and preliminary cost','Record the selected concept and rationale'] },
  { id:'model', title:'Design & modeling', short:'Develop the chosen idea', description:'Develop the selected design into a dimensional, semantic building model.', tasks:['Develop selected floor plan and dimensions','Coordinate elevations, sections, and roof form','Define walls, slabs, doors, and windows','Record assemblies and building-system assumptions','Export a versioned BIM / IFC model','Review model quality and outstanding questions'] },
  { id:'package', title:'Review & package', short:'Bring the work together', description:'Assemble drawings, perspectives, studies, quantities, and a clear record of what remains unresolved.', tasks:['Assemble site and feasibility report','Link dimensioned plans, elevations, and sections','Produce exterior and interior perspectives','Link solar and energy analysis','Document quantities and cost assumptions','Include IFC model and review report','Review package consistency and unresolved issues'] }
];
const CHECKS = [
  ['zoning','Zoning','site','Setbacks, height, coverage, and applicable restrictions'],
  ['solar','Solar','site','Sun paths, seasonal exposure, and shadow studies'],
  ['environmental','Environmental & energy','model','Climate, drainage, envelope, and energy assumptions'],
  ['space','Space planning','brief','Room program, circulation, privacy, and area targets'],
  ['structural','Structural feasibility','model','Early review of spans, load paths, supports, and foundation assumptions; record questions for an engineer'],
  ['cost','Cost & quantities','brief','Material quantities, pricing basis, and budget impact'],
  ['bim','BIM quality','model','Element data, relationships, units, and model consistency']
];
const ARTIFACTS = [
  ['site-report','Site & zoning feasibility report','site','Assumptions, constraints, and source citations'],
  ['drawings','Conceptual drawing set','model','Dimensioned plans, elevations, and sections'],
  ['renderings','Perspectives & interior renderings','package','Views tied to the selected model revision'],
  ['analysis','Solar & energy analysis','package','Study inputs, settings, outcomes, and limitations'],
  ['quantities','Material quantities & cost assumptions','package','Takeoffs, pricing sources, exclusions, and uncertainty'],
  ['ifc','BIM / IFC model & review report','model','Versioned model with check results and unresolved issues']
];
const TOOLS = [
  ['NYC ZoLa','https://zola.planning.nyc.gov/','site','Zoning research candidate; use for an NYC site.'],
  ['USGS 3DEP','https://www.usgs.gov/3d-elevation-program','site','Elevation data candidate; verify coverage and resolution.'],
  ['Rhino / Grasshopper','https://www.rhino3d.com/','concepts','Candidate for conceptual and parametric modeling.'],
  ['Bonsai','https://bonsaibim.org/','model','Candidate for semantic IFC authoring.'],
  ['IfcOpenShell','https://ifcopenshell.org/','model','Candidate for IFC processing and model checks.'],
  ['Ladybug Tools','https://www.ladybug.tools/','package','Candidate for climate, solar, daylight, and energy workflows.']
];
const STAGE_STATUSES = ['Not started','In progress','Blocked','Complete'];
const CHECK_STATUSES = ['Not run','In review','Pass','Fail','Unknown','Not applicable'];
const ARTIFACT_STATUSES = ['Not started','In progress','Ready'];
const $ = s => document.querySelector(s);
const escapeHTML = v => String(v ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const e = escapeHTML;
const slug = s => s.toLowerCase().replaceAll(' ','-');
const badge = (value) => `<span class="badge ${slug(value)}">${e(value)}</span>`;
const id = () => globalThis.crypto?.randomUUID?.() || `p-${Date.now()}-${Math.random().toString(36).slice(2)}`;
const now = () => new Date().toISOString();
const stageName = stage => STAGES.find(s=>s.id===stage)?.title || 'Project';
const date = value => value ? new Date(value).toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'}) : 'No review recorded';
function safeURL(value){try{const url=new URL(value);return ['http:','https:'].includes(url.protocol)?url.href:'';}catch{return '';}}
const link = (url,label='Open reference') => safeURL(url) ? `<a class="source-link" href="${e(safeURL(url))}" target="_blank" rel="noopener noreferrer">${e(label)} ↗</a>` : '';
function makeProject(name,location='',demo=false){
  return {id:id(),name,location,client:demo?'Fictional client':'',area:demo?'1,400–1,600 sq ft':'',budget:'',summary:demo?'A compact weekend home with natural light, a quiet workspace, and a connection to the landscape. Example brief only; no parcel selected or analyses completed.':'',createdAt:now(),updatedAt:now(),revision:1,demo,
    stages:STAGES.map(s=>({id:s.id,status:'Not started',notes:'',tasks:s.tasks.map((title,i)=>({id:`${s.id}-${i}`,title,done:false})),references:[]})),
    checks:CHECKS.map(([id,title,stage,description])=>({id,title,stage,description,status:'Not run',notes:'',url:'',source:'',modelRevision:'',reviewedAt:'',stale:false})),
    artifacts:ARTIFACTS.map(([id,title,stage,description])=>({id,title,stage,description,status:'Not started',url:'',notes:'',source:'',modelRevision:'',updatedAt:'',stale:false})),
    decisions:[],tools:TOOLS.map(([name,url,stage,notes])=>({id:id(),name,url,stage,notes,status:'Candidate'})),activity:[]};
}
let state;
let storageError='';
try{
  const stored=localStorage.getItem(STORAGE_KEY);
  if(stored){state=validateWorkspace(JSON.parse(stored));}
  else {const example=makeProject('Hudson Valley House','Site to be selected',true);state={schemaVersion:1,activeProjectId:example.id,projects:[example]};}
}catch(error){storageError='Saved data could not be loaded. Import a backup to recover; this session will not overwrite it.';state={schemaVersion:1,activeProjectId:'',projects:[]};}
const HYDEPARK_BRIEF_NOTES='Customer requirements (noted 2026-10-22, for later):\n• Site: treat Lot 25 as one site. The two parcels are not combined yet; the customer will combine them before construction (D-020).\n• Additional dwellings: customer is interested in ADUs. Research Chicago rules for detached (coach house) and internal / conversion units on an RT-4 lot.\n• Garage: car lifts for stacked parking. Check clear height, slab and power, garage height limits and alley access.';
const HYDEPARK_BRIEF_TASKS=['Research Chicago ADU rules (coach house and conversion units) for an RT-4 lot','Plan a garage with car lifts for stacked parking'];
// One-time seed: adds the Hydepark Home project to new and existing workspaces; deleting it later sticks.
if(!storageError&&!state.seeds?.includes('hydepark-home')){
  const p=Object.assign(makeProject('Hydepark Home','5418 & 5420 S. Kimbark Ave, Chicago, IL'),{siteKey:'hydepark',summary:'Two adjoining 20 ft lots, the north and south halves of Lot 25 in Kimbark’s Addition to Hyde Park: about 40 × 175 ft between S. Kimbark Ave and a 24 ft alley, designed as one site (the customer will combine the parcels before construction). Brief to be defined.'});
  p.stages[0].references=SITE_HYDEPARK.documents.map(d=>({id:id(),title:d.title,url:'',source:d.file,notes:`${d.credit} · ${d.date}. Original PDF: ${d.pdf}`,createdAt:now()}));
  Object.assign(p.stages[1],{notes:HYDEPARK_BRIEF_NOTES});p.stages[1].tasks.push(...HYDEPARK_BRIEF_TASKS.map(title=>({id:id(),title,done:false})));
  p.activity.unshift({at:now(),message:'Project created with two plats of survey'});
  state.projects.push(p);state.activeProjectId=p.id;state.seeds=[...(state.seeds||[]),'hydepark-home'];
}
let tab = location.hash.slice(1) || 'overview';
let editing = null;
let toastTimeout;
function project(){return state.projects.find(p=>p.id===state.activeProjectId);}
function notify(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimeout);toastTimeout=setTimeout(()=>$('#toast').classList.remove('visible'),4500);}
function persist(){
  if(storageError){$('#save-state').textContent='Not saved — export a backup';return false;}
  try{localStorage.setItem(STORAGE_KEY,JSON.stringify(state));$('#save-state').textContent='Saved in this browser';return true;}
  catch{ $('#save-state').textContent='Storage full or unavailable — export a backup';notify('Changes are in memory only. Export JSON to keep them.');return false; }
}
function changed(message){const p=project();p.revision++;p.updatedAt=now();p.activity.unshift({at:now(),message});persist();render();notify(message);}
function go(next){tab=next;location.hash=next;render();}
window.addEventListener('hashchange',()=>{tab=location.hash.slice(1)||'overview';render();});
function progress(p){const tasks=p.stages.flatMap(s=>s.tasks);return {total:tasks.length,done:tasks.filter(t=>t.done).length,stages:p.stages.filter(s=>s.status==='Complete').length};}
function header(title,description,actions=''){return `<div class="heading"><div><h1>${e(title)}</h1><p class="subtitle">${e(description)}</p></div><div class="heading-actions">${actions}</div></div>`;}
function action(label,name,extra='',secondary=false){return `<button class="button${secondary?' secondary':''}" data-action="${name}" ${extra}>${e(label)}</button>`;}
function empty(title,description){return `<div class="empty"><strong>${e(title)}</strong>${e(description)}</div>`;}
function nav(p){
  const item=(key,label,num,status='')=>`<button class="nav-item ${tab===key?'active':''}" data-view="${key}" ${tab===key?'aria-current="page"':''}><span class="nav-num">${num}</span>${label}${status?`<span class="nav-dot ${slug(status)}" title="${e(status)}"></span>`:''}</button>`;
  $('#nav').innerHTML=item('overview','Overview','◈')+'<p class="nav-label">Design process</p>'+STAGES.map((s,i)=>item(s.id,s.title,`0${i+1}`,p?.stages[i].status)).join('')+'<p class="nav-label">Project record</p>'+item('checks','Checks & analysis','⊙')+item('decisions','Decision log','≡')+item('deliverables','Deliverable package','▤')+item('tools','Tools & references','↗');
}
function render(){
  const p=project();
  $('#project-select').innerHTML=state.projects.length?state.projects.map(x=>`<option value="${e(x.id)}" ${x.id===state.activeProjectId?'selected':''}>${e(x.name)}</option>`).join(''):'<option>No projects yet</option>';
  const valid=['overview','checks','decisions','deliverables','tools',...STAGES.map(s=>s.id)];if(!valid.includes(tab))tab='overview';
  nav(p);$('#breadcrumb').textContent=STAGES.find(s=>s.id===tab)?.title || {overview:'Overview',checks:'Checks & analysis',decisions:'Decision log',deliverables:'Deliverable package',tools:'Tools & references'}[tab];
  $('[data-action="edit-project"]').hidden=!p;
  if(!p){$('#main').innerHTML=`<div class="empty-project"><h1>Every home starts with a place.</h1><p>Create a project to bring site evidence, design decisions, checks, and your final package into one working record.</p>${storageError?`<p class="error">${e(storageError)}</p>`:''}${action('Create your first project','new-project')}</div>`;return;}
  const views={overview,checks:checksView,decisions:decisionsView,deliverables:deliverablesView,tools:toolsView};
  if(typeof disposeSiteViewer3d==='function')disposeSiteViewer3d();
  if(typeof disposeHydeparkViewer3d==='function')disposeHydeparkViewer3d();
  $('#main').innerHTML=(views[tab]?views[tab](p):stageView(p,tab))+`<div class="mobile-transfer"><button data-action="export">Export JSON</button><button data-action="import">Import JSON</button></div>`;
  document.title=`${p.name} — Groundwork`;
  const dannemora=tab==='site'&&p.siteKey!=='hydepark';
  if(dannemora&&siteEvidenceTab==='terrain')requestAnimationFrame(initSiteTerrain);
  if(dannemora&&siteEvidenceTab==='sun3d')requestAnimationFrame(initSiteViewer3d);
  if(tab==='site'&&p.siteKey==='hydepark'&&hydeparkTab==='sun3d'&&typeof initHydeparkViewer3d==='function')requestAnimationFrame(initHydeparkViewer3d);
}
function drawing(){return `<div class="site-drawing" aria-label="Illustrative architectural massing sketch, not a model of this project"><svg viewBox="0 0 520 270" fill="none" role="img"><title>Illustrative massing and contour sketch</title><defs><pattern id="grid" width="24" height="24" patternUnits="userSpaceOnUse"><path d="M 24 0 L 0 0 0 24" stroke="#cad9e4" stroke-width=".6"/></pattern></defs><rect width="520" height="270" fill="url(#grid)"/><g stroke="#b4c8d6" stroke-width="1.1"><path d="M-30 205C70 170 77 250 175 222S280 159 374 181 470 170 555 122"/><path d="M-30 224C70 189 77 269 175 241S280 178 374 200 470 189 555 141"/><path d="M-30 186C70 151 77 231 175 203S280 140 374 162 470 151 555 103"/><path d="M-30 167C70 132 77 212 175 184S280 121 374 143 470 132 555 84"/><path d="M-30 148C70 113 77 193 175 165S280 102 374 124 470 113 555 65"/><path d="M-30 129C70 94 77 174 175 146S280 83 374 105 470 94 555 46"/></g><path d="M97 166 280 71 448 142 265 238Z" stroke="#6e8ca3" stroke-dasharray="5 5"/><path d="M176 154 287 98 371 137 261 196Z" fill="#7f9ab0" opacity=".18"/><path d="M176 154V104L287 48V98Z" fill="#f7fafc" stroke="#718da3"/><path d="M287 48 371 87V137L287 98Z" fill="#abc0d0" stroke="#718da3"/><path d="M176 104 260 144 371 87 287 48Z" fill="#eaf1f6" stroke="#718da3"/><path d="M176 104 260 144V194L176 154Z" fill="#cfdee9" stroke="#718da3"/><path d="M260 144 371 87V137L260 194Z" fill="#eef4f7" stroke="#718da3"/><path d="M280 149 300 139V166L280 177Z M317 130 353 111V132L317 151Z" fill="#a3bdcf" stroke="#718da3"/><path d="M200 136 233 152V172L200 156Z" fill="#91acc1" stroke="#718da3"/><path d="M424 72V36M418 46 424 36 430 46" stroke="#546f85"/><text x="420" y="27" font-size="10" fill="#546f85">N</text><path d="M82 93C108 35 180 14 226 26" stroke="#b19764" stroke-dasharray="4 4"/><circle cx="111" cy="52" r="10" fill="#dcc99b" stroke="#b19764"/></svg><span class="drawing-note">Illustrative massing study</span></div>`;}
function overview(p){
  const stats=progress(p);const ready=p.artifacts.filter(a=>a.status==='Ready'&&!a.stale).length;const stale=p.checks.filter(c=>c.stale).length;
  return header(p.name,p.location||'No site selected',action('Record decision','new-decision'))+
  `<section class="project-hero"><div class="hero-content">${badge(p.demo?'Example project':'Project in development')}<h2>From the first site visit<br>to the final perspective.</h2><p>${e(p.summary||'Build a clear record of the land, the brief, the ideas, and the decisions that shape this home.')}</p><div class="hero-meta"><div><span>Area target</span><strong>${e(p.area||'Not set')}</strong></div><div><span>Construction budget</span><strong>${e(p.budget||'Not set')}</strong></div><div><span>Project revision</span><strong>${p.revision}</strong></div></div></div>${drawing()}</section>`+
  `<div class="metrics"><div class="metric"><strong>${stats.stages}<small> / 5</small></strong><span>Stages complete</span></div><div class="metric"><strong>${stats.done}<small> / ${stats.total}</small></strong><span>Tasks checked off</span></div><div class="metric"><strong>${p.decisions.length.toString().padStart(2,'0')}</strong><span>Decisions recorded</span></div><div class="metric"><strong>${ready}<small> / 6</small></strong><span>Deliverables ready</span></div></div>`+
  `<section><div class="section-header"><div><h2>The design process</h2><p>Five connected stages. Return to any stage as the design evolves.</p></div></div><div class="phase-grid">${STAGES.map((s,i)=>{const st=p.stages[i];return `<button class="phase-card" data-view="${s.id}"><span class="step">0${i+1}</span><h3>${s.title}</h3><small>${st.tasks.filter(t=>t.done).length} of ${st.tasks.length} tasks</small>${badge(st.status)}</button>`;}).join('')}</div></section>`+
  `<div class="lower-grid"><section class="panel"><div class="section-header"><h2>Recent decisions</h2><button class="text-button" data-view="decisions">View decision log</button></div>${p.decisions.length?p.decisions.slice(0,3).map(d=>`<article class="decision-item"><h3>${e(d.title)}</h3><p>${e(d.rationale)}</p><div class="meta"><span>${e(stageName(d.stage))}</span><span>${date(d.createdAt)}</span></div></article>`).join(''):empty('The reasoning belongs here.','Record a choice, why you made it, and what needs another look.')}</section><section class="panel"><div class="section-header"><h2>Review queue</h2><button class="text-button" data-view="checks">View all checks</button></div>${stale?`<p class="subtitle">${stale} check${stale===1?'':'s'} affected by design decisions.</p>`:''}${p.checks.slice(0,5).map(c=>`<div class="mini-row"><span>${e(c.title)}</span>${badge(c.stale?'Needs review':c.status)}</div>`).join('')}<p class="subtitle">A recorded result evaluates a specific revision, not the whole design.</p></section></div>`;
}
function stageView(p,key){const def=STAGES.find(s=>s.id===key);
  return header(def.title,def.description,action('Update stage','edit-stage',`data-id="${key}"`))+
  (key==='site'?(p.siteKey==='hydepark'?hydeparkSiteView(p):siteResearchView(p)):stageOverviewView(p,key));
}
function stageOverviewView(p,key){const s=p.stages.find(s=>s.id===key);const complete=s.tasks.filter(t=>t.done).length;
  return `<div class="stage-layout"><div class="stack"><section class="panel"><div class="section-header"><h2>Stage checklist</h2>${badge(s.status)}</div>${s.tasks.map(t=>`<div class="task ${t.done?'done':''}"><input type="checkbox" id="${e(t.id)}" data-task="${e(t.id)}" data-stage="${s.id}" ${t.done?'checked':''}><label for="${e(t.id)}">${e(t.title)}</label></div>`).join('')}<div class="stage-summary">${complete} of ${s.tasks.length} complete. Stage status is set separately.</div><div class="progress-track"><span style="width:${complete/s.tasks.length*100}%"></span></div><button class="text-button" data-action="new-task" data-id="${s.id}">＋ Add task</button></section><section class="panel"><div class="section-header"><h2>Working notes</h2><button class="text-button" data-action="edit-stage" data-id="${s.id}">Edit notes</button></div>${s.notes?`<p class="note">${e(s.notes)}</p>`:empty('Keep the thinking close to the work.','Add requirements, assumptions, observations, or questions for this stage.')}</section><section class="panel"><div class="section-header"><h2>Evidence & design references</h2><button class="text-button" data-action="new-reference" data-id="${s.id}">＋ Add reference</button></div>${s.references.length?s.references.map(r=>`<article class="decision-item"><h3>${e(r.title)}</h3><p>${e(r.notes)}</p>${link(r.url)}<div class="meta"><span>${e(r.source)}</span><span>Added ${date(r.createdAt)}</span></div></article>`).join(''):empty('Link the work behind this stage.','Add surveys, GIS data, site photos, concepts, model files, or source documents by URL.')}</section></div><div class="stack"><section class="panel"><div class="section-header"><h2>Related checks</h2></div>${p.checks.filter(c=>c.stage===key || (c.id==='structural' && key==='concepts')).map(c=>`<div class="mini-row"><span>${e(c.title)}</span>${badge(c.stale?'Needs review':c.status)}</div>`).join('')||'<p class="empty">Review the complete analysis register for cross-stage checks.</p>'}<button class="text-button" data-view="checks">Open checks & analysis</button></section><section class="panel"><div class="section-header"><h2>Stage decisions</h2><button class="text-button" data-action="new-decision" data-stage="${key}">＋ Record</button></div>${p.decisions.filter(d=>d.stage===key).map(d=>`<article class="decision-item"><h3>${e(d.title)}</h3><p>${e(d.rationale)}</p><div class="meta">${date(d.createdAt)}</div></article>`).join('')||empty('No decisions recorded.','Keep alternatives and the reasons for your chosen direction.')}</section><section class="panel"><div class="section-header"><h2>Tools for this stage</h2></div>${p.tools.filter(t=>t.stage===key).map(t=>`<div class="mini-row"><span>${e(t.name)}</span>${link(t.url,'Open tool')}</div>`).join('')||'<p class="empty">Add your tools to connect this stage to your workflow.</p>'}<button class="text-button" data-view="tools">Manage tools</button></section></div></div>`;
}
function checksView(p){return header('Checks & analysis','A review register for the questions that shape the design. Record results from your tools here.')+`<div class="info-strip">Checks are manual records. When you record a design decision, select affected checks to mark their previous results for review. A pass is limited to its evidence and model revision.</div><div class="table-wrap"><table><thead><tr><th>Check</th><th>Recorded result</th><th>Evidence & revision</th><th>Last reviewed</th><th><span class="sr-only">Action</span></th></tr></thead><tbody>${p.checks.map(c=>`<tr><td><strong>${e(c.title)}</strong><p>${e(c.description)}</p></td><td>${badge(c.status)}${c.stale?`<p>${badge('Needs review')}</p>`:''}<p>${e(c.notes||'No findings recorded.')}</p></td><td>${e(c.modelRevision||'No model revision')}<p>${e(c.source||'No source recorded')}</p>${link(c.url,'View evidence')}</td><td>${date(c.reviewedAt)}</td><td><button class="text-button" data-action="edit-check" data-id="${c.id}">Update check</button></td></tr>`).join('')}</tbody></table></div>`;}
function decisionsView(p){return header('Decision log','The choices, alternatives, and reasons between the survey and the final model.',action('Record decision','new-decision'))+`<div class="info-strip">Decisions are kept as a history. Record a new decision to revise a previous choice. Affected checks and deliverables stay flagged until reviewed.</div><div class="timeline">${p.decisions.length?p.decisions.map(d=>`<article><div class="panel"><div class="section-header"><h2>${e(d.title)}</h2>${badge(stageName(d.stage))}</div><div class="meta"><span>${date(d.createdAt)}</span><span>Project revision ${d.revision}</span></div><p class="note">${e(d.rationale)}</p>${d.alternatives?`<p class="subtitle"><strong>Alternatives considered</strong><br>${e(d.alternatives)}</p>`:''}${link(d.url,'Supporting reference')}${d.checkIds.length||d.artifactIds.length?`<div class="impact">Marked for review: ${[...d.checkIds.map(x=>p.checks.find(c=>c.id===x)?.title),...d.artifactIds.map(x=>p.artifacts.find(a=>a.id===x)?.title)].filter(Boolean).map(e).join(', ')}.</div>`:''}</div></article>`).join(''):empty('Make the first choice explicit.','A site constraint, a budget tradeoff, or your selected concept can start the record.')}</div>`;}
function deliverablesView(p){return header('Deliverable package','One coordinated schematic package, with every output tied to its evidence and model.')+`<div class="info-strip">Link files or folders stored in your own tools. Files are not uploaded here. Ready means you marked the item ready; it is not an engineering or permit approval.</div><div class="table-wrap"><table><thead><tr><th>Deliverable</th><th>Status</th><th>Version & assumptions</th><th>Reference</th><th>Action</th></tr></thead><tbody>${p.artifacts.map(a=>`<tr><td><strong>${e(a.title)}</strong><p>${e(a.description)}</p></td><td>${badge(a.status)}${a.stale?`<p>${badge('Needs review')}</p>`:''}</td><td>${e(a.modelRevision||'No revision linked')}<p>${e(a.notes||'No assumptions recorded.')}</p><p>${e(a.source)}</p></td><td>${link(a.url,'Open deliverable')||'<span class="subtitle">Not linked</span>'}</td><td><button class="text-button" data-action="edit-artifact" data-id="${a.id}">Update</button></td></tr>`).join('')}</tbody></table></div>`;}
function toolsView(p){return header('Tools & references','Keep your authoring, research, and analysis tools connected to each project.',action('Add tool','new-tool'))+`<div class="info-strip">The starting tools are candidates from our planning conversation. Links open separately; no integrations are connected and no jobs run from this workspace.</div><div class="tool-grid">${p.tools.map(t=>`<article class="tool-card"><div class="section-header"><h3>${e(t.name)}</h3><button class="text-button" data-action="edit-tool" data-id="${e(t.id)}">Edit</button></div>${badge(t.status)}<p>${e(t.notes)}</p><div class="section-header"><span class="meta">${e(stageName(t.stage))}</span>${link(t.url,'Open tool')}</div></article>`).join('')}</div>`;}

function field(name,label,value='',type='text',hint='',required=false){return `<label class="field"><span>${e(label)}${required?' *':''}</span>${type==='textarea'?`<textarea name="${name}" ${required?'required':''} maxlength="12000">${e(value)}</textarea>`:`<input name="${name}" type="${type}" value="${e(value)}" ${required?'required':''} maxlength="2000">`}${hint?`<small>${e(hint)}</small>`:''}</label>`;}
function selectField(name,label,value,options){return `<label class="field"><span>${e(label)}</span><select name="${name}">${options.map(o=>{const [v,l]=Array.isArray(o)?o:[o,o];return `<option value="${e(v)}" ${v===value?'selected':''}>${e(l)}</option>`;}).join('')}</select></label>`;}
function stageSelect(value){return selectField('stage','Stage',value,STAGES.map(s=>[s.id,s.title]));}
function choices(name,label,items){return `<fieldset class="choice-group"><legend>${e(label)}</legend>${items.map(item=>`<label><input type="checkbox" name="${name}" value="${e(item.id)}">${e(item.title)}</label>`).join('')}</fieldset>`;}
function openEditor(kind,itemId='',stage=''){
  const p=project();editing={kind,itemId,stage,projectId:p?.id};let title='',fields='';
  if(kind==='new-project'||kind==='edit-project'){
    const x=kind==='edit-project'?p:{};title=kind==='new-project'?'Create a project':'Project brief';
    fields=field('name','Project name',x.name||'','text','',true)+field('location','Site / location',x.location||'','text','Use a parcel ID or address when selected.')+field('client','Client / household',x.client||'')+`<div class="field-grid">${field('area','Area target',x.area||'')}${field('budget','Construction budget',x.budget||'')}</div>`+field('summary','Brief, priorities & constraints',x.summary||'','textarea')+`<p class="subtitle">Each project starts with five stages, seven checks, six deliverables, and editable candidate tool links.</p>`;
  }else if(kind==='edit-stage'){
    const s=p.stages.find(x=>x.id===itemId);title=stageName(itemId);fields=selectField('status','Stage status',s.status,STAGE_STATUSES)+field('notes','Working notes',s.notes,'textarea','For design changes, also record a decision and flag affected checks.');
  }else if(kind==='new-task'){title='Add a stage task';fields=field('title','Task','','text','',true);
  }else if(kind==='new-reference'){title='Add a stage reference';fields=field('title','Reference title','','text','',true)+field('url','Reference URL','','url','Link a survey, drawing, source, or file in another tool.',true)+field('source','Source, date & review status','','text','Record publisher, section, effective date if known, and whether reviewed.')+field('notes','Notes & assumptions','','textarea');
  }else if(kind==='new-decision'){
    title='Record a design decision';fields=field('title','Decision','','text','What have you chosen?',true)+stageSelect(stage|| (STAGES.some(s=>s.id===tab)?tab:'site'))+field('rationale','Reasoning & tradeoffs','','textarea','Connect the choice to the brief, the site, or a design intention.',true)+field('alternatives','Alternatives considered','','textarea')+field('url','Supporting reference URL','','url')+choices('checkIds','Checks affected — mark for review',p.checks)+choices('artifactIds','Deliverables affected — mark for review',p.artifacts);
  }else if(kind==='edit-check'||kind==='edit-artifact'){
    const isCheck=kind==='edit-check';const x=(isCheck?p.checks:p.artifacts).find(x=>x.id===itemId);title=x.title;
    fields=(x.stale?'<div class="info-strip">This item was affected by a decision. Saving a new review clears its review flag.</div>':'')+selectField('status',isCheck?'Result':'Deliverable status',x.status,isCheck?CHECK_STATUSES:ARTIFACT_STATUSES)+field('modelRevision','Model / input revision',x.modelRevision,'text','Identify exactly which model or inputs this review describes.',true)+field('url',isCheck?'Evidence URL':'Deliverable URL',x.url,'url','A supporting link is required for a pass or a ready deliverable.')+field('source','Source & review basis',x.source,'text','Include source, effective date if known, reviewer, and limitations.')+field('notes',isCheck?'Findings & limitations':'Assumptions & package notes',x.notes,'textarea');
  }else if(kind==='new-tool'||kind==='edit-tool'){
    const x=p.tools.find(x=>x.id===itemId)||{};title=kind==='new-tool'?'Add a tool':'Edit tool';fields=field('name','Tool name',x.name||'','text','',true)+field('url','Tool / project URL',x.url||'','url','Link to the tool or your project within it.',true)+stageSelect(x.stage||'site')+selectField('status','Use in this project',x.status||'Candidate',['Candidate','In use','Paused'])+field('notes','Purpose & workflow notes',x.notes||'','textarea');
  }
  $('#dialog-title').textContent=title;$('#dialog-fields').innerHTML=fields;$('#form-error').textContent='';$('#editor').showModal();
}
$('#editor-form').addEventListener('submit',event=>{
  event.preventDefault();const form=new FormData(event.target);const data=Object.fromEntries([...form.entries()].map(([key,value])=>[key,String(value).trim()]));const {kind,itemId}=editing;const p=project();
  if(kind!=='new-project'&&p?.id!==editing.projectId){$('#form-error').textContent='Project changed. Close this form and try again.';return;}
  if(['name','title','rationale'].some(key=>key in data&&!data[key])){$('#form-error').textContent='Complete the required fields with more than spaces.';return;}
  if(data.url&&!safeURL(data.url)){$('#form-error').textContent='Use a complete http:// or https:// URL.';return;}
  if((data.status==='Pass'||data.status==='Ready')&&(!data.url||!data.source||!data.notes)){$('#form-error').textContent='A pass or ready deliverable needs a link, a source / review basis, and findings or assumptions.';return;}
  let message='Changes saved';
  if(kind==='new-project'){
    const x=Object.assign(makeProject(data.name,data.location),data);state.projects.push(x);state.activeProjectId=x.id;persist();go('overview');message='Project created';
  }else if(kind==='edit-project'){Object.assign(p,data,{demo:false});message='Project brief updated';
  }else if(kind==='edit-stage'){Object.assign(p.stages.find(s=>s.id===itemId),data);message='Stage updated';
  }else if(kind==='new-task'){p.stages.find(s=>s.id===itemId).tasks.push({id:id(),title:data.title,done:false});message='Task added';
  }else if(kind==='new-reference'){p.stages.find(s=>s.id===itemId).references.push({...data,id:id(),createdAt:now()});message='Reference added';
  }else if(kind==='new-decision'){
    const checkIds=form.getAll('checkIds');const artifactIds=form.getAll('artifactIds');
    p.decisions.unshift({id:id(),title:data.title,stage:data.stage,rationale:data.rationale,alternatives:data.alternatives,url:data.url,checkIds,artifactIds,createdAt:now(),revision:p.revision+1});
    p.checks.filter(c=>checkIds.includes(c.id)).forEach(c=>c.stale=true);p.artifacts.filter(a=>artifactIds.includes(a.id)).forEach(a=>a.stale=true);message='Decision recorded';
  }else if(kind==='edit-check'){Object.assign(p.checks.find(x=>x.id===itemId),data,{reviewedAt:now(),stale:false});message='Check review saved';
  }else if(kind==='edit-artifact'){Object.assign(p.artifacts.find(x=>x.id===itemId),data,{updatedAt:now(),stale:false});message='Deliverable updated';
  }else if(kind==='new-tool'){p.tools.push({...data,id:id()});message='Tool added';
  }else if(kind==='edit-tool'){Object.assign(p.tools.find(x=>x.id===itemId),data);message='Tool updated';}
  $('#editor').close();if(kind==='new-project')notify(message);else changed(message);
});
document.addEventListener('click',event=>{
  const button=event.target.closest('button');if(!button)return;
  if(button.dataset.view){go(button.dataset.view);return;}
  const a=button.dataset.action;if(!a)return;
  if(a==='close-dialog'){$('#editor').close();return;}
  if(a==='export'){
    const blob=new Blob([JSON.stringify(state,null,2)],{type:'application/json'});const url=URL.createObjectURL(blob);const anchor=document.createElement('a');anchor.href=url;anchor.download=`groundwork-${new Date().toISOString().slice(0,10)}.json`;anchor.click();setTimeout(()=>URL.revokeObjectURL(url),1000);notify('Workspace exported');return;
  }
  if(a==='import'){$('#import-file').click();return;}
  openEditor(a,button.dataset.id||'',button.dataset.stage||'');
});
$('#project-select').addEventListener('change',event=>{state.activeProjectId=event.target.value;persist();render();});
document.addEventListener('change',event=>{
  if(!event.target.dataset.task)return;
  const stage=project().stages.find(s=>s.id===event.target.dataset.stage);stage.tasks.find(t=>t.id===event.target.dataset.task).done=event.target.checked;changed('Checklist updated');
});
$('#import-file').addEventListener('change',async event=>{
  const file=event.target.files[0];if(!file)return;
  try{
    if(file.size>8*1024*1024)throw new Error('Choose a workspace export smaller than 8 MB.');
    const incoming=validateWorkspace(JSON.parse(await file.text()));
    if(!incoming.projects.length)throw new Error('This workspace contains no projects.');
    incoming.projects.forEach(p=>{p.id=id();p.name=`${p.name} (imported)`;state.projects.push(p);});state.activeProjectId=incoming.projects[0].id;
    persist();go('overview');notify(`Imported ${incoming.projects.length} project${incoming.projects.length===1?'':'s'}. Existing projects kept.`);
  }catch(error){notify(`Import failed: ${error.message}`);}
  event.target.value='';
});

function validateWorkspace(raw){
  const fail=()=>{throw new Error('Invalid Groundwork v1 export. No data was imported.');};
  const str=v=>typeof v==='string'&&v.length<=20000;
  const arr=v=>Array.isArray(v)&&v.length<=2000;
  const texts=(v,keys)=>v&&keys.every(k=>str(v[k]));
  const timestamp=v=>str(v)&&Number.isFinite(Date.parse(v));
  const url=v=>str(v)&&(!v||!!safeURL(v));
  const unique=items=>new Set(items.map(x=>x.id)).size===items.length;
  const stage=v=>STAGES.some(s=>s.id===v);
  if(!raw||raw.schemaVersion!==1||!str(raw.activeProjectId)||!arr(raw.projects)||raw.projects.length>100||!unique(raw.projects)||(raw.seeds!==undefined&&(!arr(raw.seeds)||!raw.seeds.every(str))))fail();
  for(const p of raw.projects){
    if(!texts(p,['id','name','location','client','area','budget','summary'])||!p.name.trim()||!timestamp(p.createdAt)||!timestamp(p.updatedAt)||!Number.isSafeInteger(p.revision)||p.revision<1||typeof p.demo!=='boolean'||(p.siteKey!==undefined&&p.siteKey!=='hydepark'))fail();
    if(!arr(p.stages)||p.stages.length!==5||!unique(p.stages)||!arr(p.checks)||p.checks.length!==7||!unique(p.checks)||!arr(p.artifacts)||p.artifacts.length!==6||!unique(p.artifacts)||!arr(p.decisions)||!arr(p.tools)||!arr(p.activity))fail();
    for(const s of p.stages){if(!stage(s.id)||!str(s.notes)||!STAGE_STATUSES.includes(s.status)||!arr(s.tasks)||!s.tasks.length||!unique(s.tasks)||!arr(s.references))fail();
      for(const t of s.tasks)if(!texts(t,['id','title'])||typeof t.done!=='boolean')fail();
      for(const r of s.references)if(!texts(r,['id','title','source','notes'])||!url(r.url)||!timestamp(r.createdAt))fail();
    }
    for(const c of p.checks)if(!CHECKS.some(x=>x[0]===c.id)||!texts(c,['title','description','notes','source','modelRevision'])||!stage(c.stage)||!CHECK_STATUSES.includes(c.status)||!url(c.url)||typeof c.stale!=='boolean'||(c.reviewedAt!==''&&!timestamp(c.reviewedAt)))fail();
    for(const a of p.artifacts)if(!ARTIFACTS.some(x=>x[0]===a.id)||!texts(a,['title','description','notes','source','modelRevision'])||!stage(a.stage)||!ARTIFACT_STATUSES.includes(a.status)||!url(a.url)||typeof a.stale!=='boolean'||(a.updatedAt!==''&&!timestamp(a.updatedAt)))fail();
    for(const d of p.decisions)if(!texts(d,['id','title','rationale','alternatives'])||!stage(d.stage)||!url(d.url)||!timestamp(d.createdAt)||!Number.isSafeInteger(d.revision)||!arr(d.checkIds)||!d.checkIds.every(x=>p.checks.some(c=>c.id===x))||!arr(d.artifactIds)||!d.artifactIds.every(x=>p.artifacts.some(a=>a.id===x)))fail();
    for(const t of p.tools)if(!texts(t,['id','name','notes'])||!stage(t.stage)||!url(t.url)||!['Candidate','In use','Paused'].includes(t.status))fail();
    for(const a of p.activity)if(!str(a.message)||!timestamp(a.at))fail();
    const structural=p.checks.find(c=>c.id==='structural');
    if(structural.title==='Structural')structural.title='Structural feasibility';
    if(structural.description==='Spans, supports, foundations, and questions for an engineer')structural.description=CHECKS.find(c=>c[0]==='structural')[3];
    p.stages.sort((a,b)=>STAGES.findIndex(s=>s.id===a.id)-STAGES.findIndex(s=>s.id===b.id));
  }
  if(raw.projects.length&&!raw.projects.some(p=>p.id===raw.activeProjectId))fail();
  // Only plain export data crosses the storage boundary.
  return JSON.parse(JSON.stringify(raw));
}
render();
if(storageError){$('#save-state').textContent='Saved data needs recovery';notify(storageError);}else persist();

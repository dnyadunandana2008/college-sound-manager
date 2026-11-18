const $=s=>document.querySelector(s);
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>"&#"+c.charCodeAt(0)+";");
const T=s=>isFinite(s)&&s>0?Math.floor(s/60)+":"+String(Math.floor(s%60)).padStart(2,"0"):"–:––";
const DEF=[["Welcome / Introduction","👋"],["Prayer Song","🙏"],["Lighting the Lamp","🪔"],["Guest Welcome","🎉"],["Principal Entry","🎓"],["Felicitation / Sanmana","🏅"],["Flower Welcome","💐"],["Chief Guest Speech","🎤"],["Prize Distribution","🏆"],["Cultural Programme","💃"],["Background Music","🎶"],["Vote of Thanks","🤝"],["National Anthem","🇮🇳"],["Closing Music","🔚"]];
const COL=["#22d3ee","#3b82f6","#a855f7","#ec4899","#f59e0b","#10b981"];

let S;
try{S=JSON.parse(localStorage.csm)}catch(e){}
S=S||{songs:[],board:DEF.map((d,i)=>({id:"b"+i,name:d[0],icon:d[1],color:COL[i%6],song:null})),vol:.8,fade:2,xf:true};
let cur=null,ann=null,duck=1,mute=false,rep="off",shuf=false,loading=false,seq=0,drag=false,editMode=false;
const live=new Set();
const bc=new BroadcastChannel("csm");
const save=()=>{localStorage.csm=JSON.stringify(S);bc.postMessage(1)};
bc.onmessage=()=>{try{S=JSON.parse(localStorage.csm);render()}catch(e){}};
const tv=()=>mute?0:S.vol*duck;
function toast(m){const t=$("#toast");t.textContent=m;t.classList.add("on");clearTimeout(t._t);t._t=setTimeout(()=>t.classList.remove("on"),2600)}

/* ---------- storage for audio files (IndexedDB) ---------- */
const db=new Promise(r=>{const q=indexedDB.open("csm",1);q.onupgradeneeded=()=>q.result.createObjectStore("a");q.onsuccess=()=>r(q.result)});
const idb=async(m,k,v)=>{const d=await db;return new Promise(r=>{const o=d.transaction("a",m==="get"?"readonly":"readwrite").objectStore("a");const q=m==="get"?o.get(k):m==="put"?o.put(v,k):o.delete(k);q.onsuccess=()=>r(q.result)})};
navigator.storage&&navigator.storage.persist&&navigator.storage.persist();

/* ---------- audio helpers ---------- */
let ctx,an;
function graph(el){try{ctx=ctx||new AudioContext();if(!an){an=ctx.createAnalyser();an.fftSize=128;an.connect(ctx.destination)}ctx.createMediaElementSource(el).connect(an);ctx.resume()}catch(e){}}
function fade(el,to,sec,done){clearInterval(el._f);const from=el.volume,n=Math.max(1,Math.round(sec*20));let i=0;el._f=setInterval(()=>{i++;el.volume=Math.min(1,Math.max(0,from+(to-from)*i/n));if(i>=n){clearInterval(el._f);done&&done()}},50)}

/* YouTube (official embedded player) */
let yt,ytRes;const ytReady=new Promise(r=>ytRes=r);
const ytA={get volume(){return yt?yt.getVolume()/100:0},set volume(v){yt&&yt.setVolume(Math.round(v*100))}};
window.onYouTubeIframeAPIReady=()=>{yt=new YT.Player("yt",{height:"100%",width:"100%",playerVars:{playsinline:1,rel:0},events:{onReady:()=>ytRes(),onStateChange:e=>{if(e.data===0&&cur&&cur.yt)ended(cur)}}})};
{const t=document.createElement("script");t.src="https://www.youtube.com/iframe_api";document.head.append(t)}
const ytId=u=>(String(u).match(/(?:v=|youtu\.be\/|embed\/|shorts\/|live\/)([\w-]{11})/)||[])[1];

/* ---------- playback ---------- */
const list=()=>{const q=$("#q").value.toLowerCase(),c=$("#catF").value;return S.songs.filter(s=>(!q||s.title.toLowerCase().includes(q))&&(!c||s.cat===c))};

function kill(c,sec){const f=()=>{if(c.yt){yt.stopVideo()}else{c.el.pause();live.delete(c.el);URL.revokeObjectURL(c.url)}};sec>0?fade(c.el,0,sec,f):f()}

async function play(id){
  const s=S.songs.find(x=>x.id===id);if(!s)return toast("Song not found");
  const my=++seq,old=cur;loading=true;
  try{
    if(s.type==="yt"){
      if(!ytId(s.yt))return toast("This YouTube link is not valid");
      toast("Loading YouTube…");await ytReady;if(my!==seq)return;
      old&&kill(old,0);
      cur={s,yt:true,el:ytA};$("#ytbox").classList.add("on");
      ytA.volume=0;yt.loadVideoById(ytId(s.yt));fade(ytA,tv(),S.fade);
    }else{
      const b=await idb("get",id);if(my!==seq)return;
      if(!b)return toast("Audio file is not on this device. Upload it here again.");
      const url=URL.createObjectURL(b),el=new Audio(url);el.volume=0;graph(el);
      const c={s,el,url};live.add(el);el.onended=()=>ended(c);
      await el.play();if(my!==seq){kill(c,0);return}
      old&&kill(old,old.yt||!S.xf?0:S.fade);
      cur=c;$("#ytbox").classList.remove("on");fade(el,tv(),S.fade);
    }
  }catch(e){toast("Could not play this item")}
  finally{if(my===seq)loading=false;render()}
}
function stop(sec=S.fade){if(!cur)return;const c=cur;cur=null;seq++;kill(c,sec);if(c.yt)setTimeout(()=>$("#ytbox").classList.remove("on"),sec*1000);render()}
function stopAll(){
  seq++;loading=false;cur=null;
  live.forEach(e=>{clearInterval(e._f);e.pause()});live.clear();
  yt&&yt.stopVideo&&yt.stopVideo();clearInterval(ytA._f);
  ann=null;duck=1;$("#ytbox").classList.remove("on");render();toast("All audio stopped");
}
function ended(c){
  if(c!==cur)return;
  if(rep==="one"){play(c.s.id)}else next(true);
}
function next(auto,dir=1){
  const l=list();if(!l.length)return;
  let i=cur?l.findIndex(x=>x.id===cur.s.id):-1;
  if(shuf&&l.length>1){let n;do{n=Math.floor(Math.random()*l.length)}while(n===i);i=n}
  else{i+=dir;if(i>=l.length||i<0){if(rep==="all"||!auto)i=(i+l.length)%l.length;else return stop(0)}}
  play(l[i].id);
}
function toggle(){
  if(!cur)return list().length?play(list()[0].id):toast("Add a song first");
  if(cur.yt){yt.getPlayerState()===1?yt.pauseVideo():yt.playVideo()}
  else if(cur.el.paused){cur.el.play();fade(cur.el,tv(),.3)}else cur.el.pause();
}
async function announce(id){
  const s=S.songs.find(x=>x.id===id);if(!s)return;
  if(s.type==="yt")return toast("Announcements must be uploaded audio files");
  const b=await idb("get",id);if(!b)return toast("Audio file is not on this device");
  if(ann){ann.pause();live.delete(ann)}
  duck=.25;cur&&fade(cur.el,tv(),.4);
  const el=new Audio(URL.createObjectURL(b));el.volume=mute?0:S.vol;live.add(el);ann=el;
  el.onended=()=>{live.delete(el);if(ann===el){ann=null;duck=1;cur&&fade(cur.el,tv(),1)}};
  el.play();toast("Announcement playing – music lowered");
}

/* ---------- library actions ---------- */
const meta=f=>new Promise(r=>{const a=new Audio(URL.createObjectURL(f));a.onloadedmetadata=()=>{URL.revokeObjectURL(a.src);r(a.duration)};a.onerror=()=>r(0)});
$("#files").onchange=async e=>{
  for(const f of e.target.files){
    const id="s"+Date.now()+Math.random().toString(36).slice(2,6);
    await idb("put",id,f);
    S.songs.push({id,title:f.name.replace(/\.[^.]+$/,""),cat:"General",type:"file",ext:(f.name.split(".").pop()||"audio").toUpperCase(),dur:await meta(f)});
  }
  save();render();toast("Songs added");e.target.value="";
};
$("#ytAdd").onclick=()=>{
  const u=$("#ytUrl").value.trim();if(!ytId(u))return toast("Paste a full YouTube link");
  S.songs.push({id:"s"+Date.now(),title:$("#ytTitle").value.trim()||"YouTube "+ytId(u),cat:"YouTube",type:"yt",ext:"YouTube",yt:u,dur:0});
  $("#ytUrl").value=$("#ytTitle").value="";save();render();
};
function ask(title,fields){return new Promise(res=>{
  const d=$("#dlg");
  d.innerHTML=`<form method="dialog"><h3>${title}</h3>${fields.map(f=>`<label>${f.l}${f.o?`<select name="${f.k}">${f.o.map(o=>`<option value="${esc(o[0])}" ${o[0]==f.v?"selected":""}>${esc(o[1])}</option>`).join("")}</select>`:`<input name="${f.k}" value="${esc(f.v)}" ${f.t?`type="${f.t}"`:""} ${f.dl?`list="${f.dl}"`:""}>`}</label>`).join("")}<datalist id="cats">${cats().map(c=>`<option value="${esc(c)}">`).join("")}</datalist><div class="row"><button value="ok">Save</button><button value="x" class="ghost">Cancel</button></div></form>`;
  d.onclose=()=>res(d.returnValue==="ok"?Object.fromEntries(new FormData(d.querySelector("form"))):null);
  d.returnValue="";d.showModal();
})}
const cats=()=>[...new Set(S.songs.map(s=>s.cat))].sort();
async function editSong(id){
  const s=S.songs.find(x=>x.id===id),r=await ask("Edit song",[{k:"title",l:"Title",v:s.title},{k:"cat",l:"Category",v:s.cat,dl:"cats"}]);
  if(r){s.title=r.title||s.title;s.cat=r.cat||"General";save();render()}
}
async function delSong(id){
  if(!confirm("Delete this song?"))return;
  if(cur&&cur.s.id===id)stop(0);
  await idb("del",id);S.songs=S.songs.filter(s=>s.id!==id);S.board.forEach(b=>{if(b.song===id)b.song=null});save();render();
}
async function editBtn(b){
  const r=await ask("Edit button",[
    {k:"name",l:"Button name",v:b.name},{k:"icon",l:"Icon (any emoji)",v:b.icon},{k:"color",l:"Colour",v:b.color,t:"color"},
    {k:"song",l:"Assign song",v:b.song||"",o:[["","— none —"],...S.songs.map(s=>[s.id,s.title])]},
    {k:"link",l:"Or paste a YouTube link",v:""}]);
  if(!r)return;
  b.name=r.name||b.name;b.icon=r.icon||"🎵";b.color=r.color;b.song=r.song||null;
  if(r.link){if(ytId(r.link)){const id="s"+Date.now();S.songs.push({id,title:b.name,cat:"Soundboard",type:"yt",ext:"YouTube",yt:r.link,dur:0});b.song=id}else toast("YouTube link not valid")}
  save();render();
}

/* ---------- drawing the screen ---------- */
function render(){
  const cs=cats(),cf=$("#catF"),v=cf.value;
  cf.innerHTML='<option value="">All categories</option>'+cs.map(c=>`<option ${c===v?"selected":""}>${esc(c)}</option>`).join("");
  const pid=cur&&cur.s.id;
  $("#board").innerHTML=S.board.map(b=>{const s=S.songs.find(x=>x.id===b.song);return `<div class="tile ${pid&&pid===b.song?"on":""}" style="--c:${esc(b.color)}" data-id="${b.id}"><button class="hit" data-a="go"><i>${esc(b.icon)}</i><span>${esc(b.name)}</span><small>${s?esc(s.title):"No audio assigned"}</small></button>${editMode?`<div class="tools"><button data-a="l">◀</button><button data-a="e">✎</button><button data-a="r">▶</button><button data-a="x">✕</button></div>`:""}</div>`}).join("");
  const l=list();
  $("#list").innerHTML=l.length?l.map(s=>`<div class="row ${pid===s.id?"on":""}" data-id="${s.id}"><div class="t"><b>${esc(s.title)}</b><small>${esc(s.cat)} · ${s.ext} · ${T(s.dur)}</small></div><button data-a="play" title="Play">▶</button><button data-a="ann" title="Play as announcement">📢</button><button data-a="edit" title="Edit">✎</button><button data-a="del" title="Delete">✕</button></div>`).join(""):'<div class="empty">No songs yet. Upload audio files or add a YouTube link.</div>';
}
$("#board").onclick=e=>{
  const a=e.target.closest("[data-a]"),t=e.target.closest(".tile");if(!a||!t)return;
  const i=S.board.findIndex(b=>b.id===t.dataset.id),b=S.board[i],k=a.dataset.a;
  if(k==="go")return b.song?play(b.song):toast("No audio yet. Turn on Edit board and press ✎");
  if(k==="e")return editBtn(b);
  if(k==="x"){if(confirm("Remove this button?")){S.board.splice(i,1);save();render()}return}
  const j=k==="l"?i-1:i+1;if(j<0||j>=S.board.length)return;
  [S.board[i],S.board[j]]=[S.board[j],S.board[i]];save();render();
};
$("#list").onclick=e=>{
  const a=e.target.closest("[data-a]"),r=e.target.closest(".row");if(!a||!r)return;
  ({play,ann:announce,edit:editSong,del:delSong})[a.dataset.a](r.dataset.id);
};
$("#editToggle").onchange=e=>{editMode=e.target.checked;render()};
$("#addBtn").onclick=()=>{const b={id:"b"+Date.now(),name:"New button",icon:"🎵",color:COL[S.board.length%6],song:null};S.board.push(b);save();render();editBtn(b)};
$("#q").oninput=render;$("#catF").onchange=render;

/* ---------- player controls ---------- */
$("#pp").onclick=toggle;$("#stop").onclick=()=>stop();$("#stopAll").onclick=stopAll;
$("#nxt").onclick=()=>next(false,1);$("#prev").onclick=()=>next(false,-1);
$("#shuf").onclick=()=>{shuf=!shuf;$("#shuf").classList.toggle("on",shuf)};
$("#rep").onclick=()=>{rep={off:"all",all:"one",one:"off"}[rep];$("#rep").textContent="🔁 "+{off:"Off",all:"All",one:"One"}[rep];$("#rep").classList.toggle("on",rep!=="off")};
$("#mute").onclick=()=>{mute=!mute;$("#mute").textContent=mute?"🔇":"🔊";cur&&(cur.el.volume=tv())};
$("#vol").value=S.vol;$("#vol").oninput=e=>{S.vol=+e.target.value;cur&&(cur.el.volume=tv());save()};
$("#fade").value=S.fade;$("#fade").onchange=e=>{S.fade=Math.max(0,+e.target.value||0);save()};
$("#xf").checked=S.xf;$("#xf").onchange=e=>{S.xf=e.target.checked;save()};
const sk=$("#seek");
sk.onpointerdown=()=>drag=true;
sk.onpointerup=()=>drag=false;
sk.oninput=()=>{if(!cur)return;const d=cur.yt?yt.getDuration():cur.el.duration;if(!d)return;const t=sk.value/1000*d;cur.yt?yt.seekTo(t,true):cur.el.currentTime=t};
document.onkeydown=e=>{
  if(/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)&&e.target.type!=="range"&&e.target.type!=="checkbox")return;
  const k=e.key;
  if(k===" "){e.preventDefault();toggle()}
  else if(k==="Escape")stopAll();
  else if(k==="n"||k==="N")next(false,1);
  else if(k==="p"||k==="P")next(false,-1);
  else if(k==="m"||k==="M")$("#mute").click();
  else if(k==="ArrowRight"&&cur&&!cur.yt)cur.el.currentTime+=5;
  else if(k==="ArrowLeft"&&cur&&!cur.yt)cur.el.currentTime-=5;
  else if(k==="ArrowUp"){S.vol=Math.min(1,S.vol+.05);$("#vol").value=S.vol;cur&&(cur.el.volume=tv())}
  else if(k==="ArrowDown"){S.vol=Math.max(0,S.vol-.05);$("#vol").value=S.vol;cur&&(cur.el.volume=tv())}
};

/* ---------- live status + visualiser ---------- */
const cv=$("#viz"),g=cv.getContext("2d");
function state(){
  if(loading)return "Loading";if(!cur)return "Stopped";
  if(cur.yt){const k=yt.getPlayerState();return k===1?"Playing":k===2?"Paused":k===0?"Stopped":"Loading"}
  return cur.el.paused?"Paused":"Playing";
}
function frame(t){
  cv.width=cv.clientWidth;const W=cv.width,H=cv.height,st=state();
  const c=$("#status");if(c.textContent!==st){c.textContent=st;c.className="chip "+st;$("#pp").textContent=st==="Playing"?"⏸":"▶"}
  $("#tt").textContent=cur?cur.s.title:"Nothing playing";
  $("#ts").textContent=cur?cur.s.cat+" · "+cur.s.ext:"Pick a song or a soundboard button";
  let p=0,d=0;
  if(cur){p=cur.yt?yt.getCurrentTime():cur.el.currentTime;d=cur.yt?yt.getDuration():cur.el.duration}
  $("#tc").textContent=T(p);$("#td").textContent=T(d);
  if(!drag&&d)sk.value=p/d*1000;if(!cur)sk.value=0;
  g.clearRect(0,0,W,H);
  const n=48,bw=W/n,data=new Uint8Array(64);
  if(an&&cur&&!cur.yt)an.getByteFrequencyData(data);
  const grad=g.createLinearGradient(0,0,W,0);grad.addColorStop(0,"#22d3ee");grad.addColorStop(1,"#a855f7");g.fillStyle=grad;
  for(let i=0;i<n;i++){
    let h=data[i]/255*H;
    if(cur&&cur.yt&&st==="Playing")h=(Math.sin(t/180+i*.6)*.5+.5)*H*.7;
    h=Math.max(3,h);g.fillRect(i*bw+1,H-h,bw-2,h);
  }
  requestAnimationFrame(frame);
}
render();requestAnimationFrame(frame);

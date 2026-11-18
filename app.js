/* COLLEGE SOUND MANAGER
   Configure SUPABASE_URL and SUPABASE_ANON_KEY below.
   Do not put a Supabase service-role key in this file. */
const SUPABASE_URL = "PASTE_YOUR_SUPABASE_PROJECT_URL_HERE";
const SUPABASE_ANON_KEY = "PASTE_YOUR_SUPABASE_ANON_PUBLIC_KEY_HERE";
const BUCKET = "college-audio";
const DEFAULT_BUTTONS = [
  ["Welcome / Introduction","👋"],["Prayer Song","🙏"],["Lighting the Lamp","🪔"],["Guest Welcome","🌸"],
  ["Principal Entry","🎓"],["Felicitation / Sanmana","🏅"],["Flower Welcome","💐"],["Chief Guest Speech","🎤"],
  ["Prize Distribution","🏆"],["Cultural Programme","🎭"],["Background Music","🎼"],["Vote of Thanks","🙏"],
  ["National Anthem","🇮🇳"],["Closing Music","🎵"]
];
let db=null, currentSongs=[], buttons=[], playlists=[], currentIndex=-1, activeYoutubeId=null, toastTimer=null;
const audio=document.getElementById("audioPlayer");
const $=id=>document.getElementById(id);
const fmt=s=>{if(!Number.isFinite(s))return "0:00";let m=Math.floor(s/60),sec=Math.floor(s%60);return `${m}:${String(sec).padStart(2,"0")}`};
function notify(msg){const t=$("toast");t.textContent=msg;t.classList.add("show");clearTimeout(toastTimer);toastTimer=setTimeout(()=>t.classList.remove("show"),2600)}
function configured(){return !SUPABASE_URL.includes("PASTE_")&&!SUPABASE_ANON_KEY.includes("PASTE_")}
function setConnection(ok,msg){$("connectionDot").classList.toggle("online",ok);$("connectionText").textContent=msg;$("syncText").textContent=ok?"Cloud synced":"Cloud not connected"}
function escapeHtml(s=""){return String(s).replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]))}
function showPage(name){document.querySelectorAll(".page").forEach(p=>p.classList.remove("active"));$("page-"+name)?.classList.add("active");document.querySelectorAll(".nav-item[data-page]").forEach(b=>b.classList.toggle("active",b.dataset.page===name));$("pageTitle").textContent={dashboard:"Dashboard",library:"Music Library",soundboard:"Programme Soundboard",playlists:"Playlists"}[name]||"Dashboard"}
function modal(html){$("modalContent").innerHTML=html;$("modalBackdrop").hidden=false}
function closeModal(){$("modalBackdrop").hidden=true}
function ytId(url){try{const u=new URL(url);if(u.hostname.includes("youtu.be"))return u.pathname.slice(1);if(u.hostname.includes("youtube.com"))return u.searchParams.get("v")||u.pathname.split("/").filter(Boolean).pop();}catch{}return null}
async function init(){
  if(!configured()){ $("loginScreen").hidden=false;$("appContent").hidden=true;$("loginError").textContent="First add your Supabase URL and anon key in app.js. Follow SETUP-GUIDE.txt.";return; }
  db=window.supabase.createClient(SUPABASE_URL,SUPABASE_ANON_KEY);
  const {data:{session}}=await db.auth.getSession();
  if(session) await enterApp(); else {$("loginScreen").hidden=false;$("appContent").hidden=true;setConnection(false,"Signed out")}
  db.auth.onAuthStateChange(async(_event,session)=>{if(session)await enterApp();else{$("loginScreen").hidden=false;$("appContent").hidden=true;setConnection(false,"Signed out")}});
}
async function enterApp(){
  $("loginScreen").hidden=true;$("appContent").hidden=false;
  setConnection(true,"Connected");
  await ensureDefaultButtons();
  await refreshAll();
  db.channel("college-sound-live").on("postgres_changes",{event:"*",schema:"public",table:"songs"},()=>loadSongs()).on("postgres_changes",{event:"*",schema:"public",table:"soundboard_buttons"},()=>loadButtons()).on("postgres_changes",{event:"*",schema:"public",table:"playlists"},()=>loadPlaylists()).subscribe();
}
async function ensureDefaultButtons(){
  const {data,error}=await db.from("soundboard_buttons").select("id").limit(1);
  if(error){notify("Database setup issue: "+error.message);return}
  if(!data.length){const rows=DEFAULT_BUTTONS.map((b,i)=>({title:b[0],icon:b[1],song_id:null,position:i,color:["#173b56","#2b315c","#3e2d5a","#174a4d"][i%4]}));const r=await db.from("soundboard_buttons").insert(rows);if(r.error)notify(r.error.message)}
}
async function refreshAll(){await Promise.all([loadSongs(),loadButtons(),loadPlaylists()]);renderDashboard()}
async function loadSongs(){const {data,error}=await db.from("songs").select("*").order("created_at",{ascending:false});if(error){notify("Could not load songs: "+error.message);return}currentSongs=data||[];renderLibrary();renderDashboard()}
async function loadButtons(){const {data,error}=await db.from("soundboard_buttons").select("*").order("position");if(error){notify(error.message);return}buttons=data||[];renderSoundboards();$("buttonCount").textContent=buttons.length}
async function loadPlaylists(){const {data,error}=await db.from("playlists").select("*").order("created_at",{ascending:false});if(error){notify(error.message);return}playlists=data||[];renderPlaylists();$("playlistCount").textContent=playlists.length}
function songTitle(s){return s?.title||"Untitled track"}
function songById(id){return currentSongs.find(s=>s.id===id)}
function songRow(s){return `<div class="song-row"><div class="song-cover">${s.source_type==="youtube"?"▶":"♫"}</div><div class="song-info"><strong>${escapeHtml(songTitle(s))}</strong><small>${escapeHtml(s.category||"Other")} · ${s.source_type==="youtube"?"YouTube link":escapeHtml(s.file_type||"Audio file")} · ${s.duration_seconds?fmt(s.duration_seconds):"Duration unknown"}</small></div><div class="song-actions"><button class="icon-btn" onclick="playSong('${s.id}')">▶</button><button class="icon-btn" onclick="editSong('${s.id}')">✎</button><button class="icon-btn" onclick="deleteSong('${s.id}')">×</button></div></div>`}
function renderLibrary(){const q=$("searchInput").value.toLowerCase(),cat=$("categoryFilter").value;const list=currentSongs.filter(s=>(songTitle(s).toLowerCase().includes(q))&&(!cat||s.category===cat));$("libraryList").innerHTML=list.length?list.map(songRow).join(""):'<div class="note">No tracks found. Upload audio or add a YouTube link.</div>'; }
function renderDashboard(){$("trackCount").textContent=currentSongs.length;$("recentSongs").innerHTML=currentSongs.slice(0,5).map(songRow).join("")||'<div class="note">Your uploaded tracks will appear here.</div>';$("dashboardSoundboard").innerHTML=buttons.slice(0,8).map(soundButton).join("")}
function soundButton(b){const s=songById(b.song_id);return `<button class="sound-button" style="border-color:${escapeHtml(b.color||"#263650")}" onclick="triggerButton('${b.id}')"><button class="sound-edit" onclick="event.stopPropagation();editButton('${b.id}')">✎</button><div class="sound-icon">${escapeHtml(b.icon||"♫")}</div><strong>${escapeHtml(b.title)}</strong><small>${s?escapeHtml(songTitle(s)):"No track assigned"}</small></button>`}
function renderSoundboards(){$("soundboardGrid").innerHTML=buttons.map(soundButton).join("")||'<div class="note">No soundboard buttons yet.</div>'}
function renderPlaylists(){$("playlistList").innerHTML=playlists.map(p=>`<div class="playlist-card"><div class="sound-icon">☷</div><h3>${escapeHtml(p.name)}</h3><p>${escapeHtml(p.description||"College event playlist")}</p><button class="ghost" onclick="openPlaylist('${p.id}')">Open playlist</button> <button class="ghost" onclick="deletePlaylist('${p.id}')">Delete</button></div>`).join("")||'<div class="note">Create a playlist for your next event.</div>'}
async function uploadFiles(files){for(const file of files){if(!file.type.startsWith("audio/")&&!/\.(mp3|wav|m4a|aac|ogg|flac)$/i.test(file.name)){notify("Skipped unsupported file: "+file.name);continue}const path=`${Date.now()}-${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g,"_")}`;notify("Uploading "+file.name+"…");const up=await db.storage.from(BUCKET).upload(path,file,{contentType:file.type||"audio/mpeg",upsert:false});if(up.error){notify("Upload failed: "+up.error.message);continue}const ins=await db.from("songs").insert({title:file.name.replace(/\.[^.]+$/,""),category:"Other",source_type:"upload",storage_path:path,file_type:file.type||file.name.split(".").pop(),file_size:file.size}).select().single();if(ins.error){await db.storage.from(BUCKET).remove([path]);notify("Save failed: "+ins.error.message)}}await loadSongs();notify("Upload complete. Available on your signed-in devices.")}
async function addYoutube(){modal(`<h2>Add YouTube track</h2><label>Song title</label><input id="ytTitle" placeholder="e.g. College welcome song"><label>YouTube URL</label><input id="ytUrl" placeholder="https://www.youtube.com/watch?v=..."><label>Category</label><select id="ytCategory"><option>Other</option><option>Welcome</option><option>Prayer</option><option>Background</option><option>National</option><option>Cultural</option></select><button class="primary" onclick="saveYoutube()">Save YouTube link</button>`)}
async function saveYoutube(){const title=$("ytTitle").value.trim(),url=$("ytUrl").value.trim(),id=ytId(url);if(!title||!id){notify("Enter a title and valid YouTube URL.");return}const {error}=await db.from("songs").insert({title,category:$("ytCategory").value,source_type:"youtube",youtube_id:id,youtube_url:url});if(error){notify(error.message);return}closeModal();await loadSongs();notify("YouTube link saved.")}
async function editSong(id){const s=songById(id);if(!s)return;modal(`<h2>Edit track</h2><label>Title</label><input id="editTitle" value="${escapeHtml(s.title)}"><label>Category</label><select id="editCategory">${["Other","Welcome","Prayer","Background","National","Cultural"].map(c=>`<option ${s.category===c?"selected":""}>${c}</option>`).join("")}</select><button class="primary" onclick="saveSongEdit('${id}')">Save changes</button>`)}
async function saveSongEdit(id){const {error}=await db.from("songs").update({title:$("editTitle").value.trim(),category:$("editCategory").value}).eq("id",id);if(error){notify(error.message);return}closeModal();await loadSongs()}
async function deleteSong(id){const s=songById(id);if(!s||!confirm(`Delete "${songTitle(s)}" from the shared library?`))return;if(s.storage_path)await db.storage.from(BUCKET).remove([s.storage_path]);const {error}=await db.from("songs").delete().eq("id",id);if(error){notify(error.message);return}await loadSongs();await loadButtons();notify("Track deleted")}
async function getPlayableUrl(s){if(s.source_type==="youtube")return null;const {data,error}=await db.storage.from(BUCKET).createSignedUrl(s.storage_path,3600);if(error)throw error;return data.signedUrl}
async function playSong(id){const index=currentSongs.findIndex(s=>s.id===id);if(index<0)return;currentIndex=index;const s=currentSongs[index];stopYoutube();audio.pause();audio.removeAttribute("src");if(s.source_type==="youtube"){activeYoutubeId=s.youtube_id;playYoutube(s);setNow(s.title,"YouTube embedded player");return}try{const url=await getPlayableUrl(s);audio.src=url;audio.volume=Number($("volumeBar").value)/100;await audio.play();setNow(s.title,s.category||"Cloud audio");$("playBtn").textContent="Ⅱ"}catch(e){notify("Cannot play track: "+e.message)}}
function setNow(title,sub){$("nowTitle").textContent=title;$("nowSub").textContent=sub}
function playYoutube(s){$("youtubeHost").innerHTML=`<iframe id="ytFrame" width="1" height="1" src="https://www.youtube-nocookie.com/embed/${encodeURIComponent(s.youtube_id)}?autoplay=1&enablejsapi=1&playsinline=1" title="YouTube player" allow="autoplay; encrypted-media; picture-in-picture" referrerpolicy="strict-origin-when-cross-origin"></iframe>`;$("playBtn").textContent="Ⅱ"}
function stopYoutube(){$("youtubeHost").innerHTML="";activeYoutubeId=null}
function stopAll(){audio.pause();audio.currentTime=0;audio.removeAttribute("src");stopYoutube();$("playBtn").textContent="▶";$("seekBar").value=0;$("currentTime").textContent="0:00";setNow("Nothing playing","Choose a track from your library")}
function togglePlay(){if(activeYoutubeId){const f=document.getElementById("ytFrame");if(f){notify("Use the YouTube player controls to pause or resume this video.");}return}if(!audio.src){if(currentSongs.length)playSong(currentSongs[0].id);return}if(audio.paused){audio.play();$("playBtn").textContent="Ⅱ"}else{audio.pause();$("playBtn").textContent="▶"}}
function nextTrack(){if(!currentSongs.length)return;playSong(currentSongs[(currentIndex+1)%currentSongs.length].id)}
function previousTrack(){if(audio.currentTime>3){audio.currentTime=0;return}if(!currentSongs.length)return;playSong(currentSongs[(currentIndex-1+currentSongs.length)%currentSongs.length].id)}
async function triggerButton(id){const b=buttons.find(x=>x.id===id);if(!b)return;if(!b.song_id){editButton(id);notify("Assign a track to this button first.");return}await playSong(b.song_id)}
function editButton(id){const b=buttons.find(x=>x.id===id);if(!b)return;modal(`<h2>Edit soundboard button</h2><label>Button name</label><input id="bTitle" value="${escapeHtml(b.title)}"><label>Icon (emoji)</label><input id="bIcon" value="${escapeHtml(b.icon||"♫")}"><label>Assigned track</label><select id="bSong"><option value="">No track assigned</option>${currentSongs.map(s=>`<option value="${s.id}" ${s.id===b.song_id?"selected":""}>${escapeHtml(s.title)}</option>`).join("")}</select><label>Button colour</label><input id="bColor" type="color" value="${b.color||"#173b56"}"><button class="primary" onclick="saveButton('${id}')">Save button</button> <button class="ghost" onclick="removeButton('${id}')">Delete</button>`)}
async function saveButton(id){const {error}=await db.from("soundboard_buttons").update({title:$("bTitle").value.trim(),icon:$("bIcon").value.trim()||"♫",song_id:$("bSong").value||null,color:$("bColor").value}).eq("id",id);if(error){notify(error.message);return}closeModal();await loadButtons()}
async function removeButton(id){if(!confirm("Delete this soundboard button?"))return;const {error}=await db.from("soundboard_buttons").delete().eq("id",id);if(error){notify(error.message);return}closeModal();await loadButtons()}
async function addButton(){const pos=buttons.length;const {error}=await db.from("soundboard_buttons").insert({title:"New programme cue",icon:"♫",position:pos,color:"#173b56"});if(error){notify(error.message);return}await loadButtons();const b=buttons[buttons.length-1];if(b)editButton(b.id)}
async function createPlaylist(){modal(`<h2>Create playlist</h2><label>Playlist name</label><input id="plName" placeholder="Annual Day 2026"><label>Description</label><input id="plDesc" placeholder="Music running order"><button class="primary" onclick="savePlaylist()">Create playlist</button>`)}
async function savePlaylist(){const name=$("plName").value.trim();if(!name){notify("Enter a playlist name");return}const {error}=await db.from("playlists").insert({name,description:$("plDesc").value.trim()});if(error){notify(error.message);return}closeModal();await loadPlaylists()}
async function deletePlaylist(id){if(!confirm("Delete this playlist?"))return;const {error}=await db.from("playlists").delete().eq("id",id);if(error)notify(error.message);else loadPlaylists()}
async function openPlaylist(id){const p=playlists.find(x=>x.id===id);if(!p)return;modal(`<h2>${escapeHtml(p.name)}</h2><p class="note">Playlist creation and naming are available in this version. Use the library play controls to run tracks. Track ordering inside playlists is planned for the next version.</p><button class="primary" onclick="closeModal()">Close</button>`)}
function fadeOutStop(){if(activeYoutubeId){stopAll();return}if(!audio.src){stopAll();return}const start=audio.volume,steps=20;let i=0;const timer=setInterval(()=>{i++;audio.volume=Math.max(0,start*(1-i/steps));if(i>=steps){clearInterval(timer);stopAll();audio.volume=Number($("volumeBar").value)/100}},50)}
$("loginBtn").addEventListener("click",async()=>{if(!db){notify("Configure Supabase first");return}const {error}=await db.auth.signInWithPassword({email:$("emailInput").value.trim(),password:$("passwordInput").value});$("loginError").textContent=error?error.message:""});
$("signOutBtn").addEventListener("click",async()=>{await db.auth.signOut()});
$("fileInput").addEventListener("change",e=>{if(e.target.files.length)uploadFiles([...e.target.files]);e.target.value=""});
$("searchInput").addEventListener("input",renderLibrary);$("categoryFilter").addEventListener("change",renderLibrary);
$("addYoutubeBtn").addEventListener("click",addYoutube);$("addButtonBtn").addEventListener("click",addButton);$("createPlaylistBtn").addEventListener("click",createPlaylist);
$("modalClose").addEventListener("click",closeModal);$("modalBackdrop").addEventListener("click",e=>{if(e.target===$("modalBackdrop"))closeModal()});
document.querySelectorAll("[data-page]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.page)));
document.querySelectorAll("[data-goto]").forEach(b=>b.addEventListener("click",()=>showPage(b.dataset.goto)));
$("playBtn").addEventListener("click",togglePlay);$("stopBtn").addEventListener("click",stopAll);$("stopAllBtn").addEventListener("click",stopAll);$("nextBtn").addEventListener("click",nextTrack);$("prevBtn").addEventListener("click",previousTrack);
$("muteBtn").addEventListener("click",()=>{audio.muted=!audio.muted;$("muteBtn").textContent=audio.muted?"MUTED":"◖))"});
$("volumeBar").addEventListener("input",e=>{audio.volume=Number(e.target.value)/100;audio.muted=false});
$("seekBar").addEventListener("input",e=>{if(audio.duration)audio.currentTime=audio.duration*(Number(e.target.value)/1000)});
audio.addEventListener("timeupdate",()=>{if(audio.duration){$("seekBar").value=audio.currentTime/audio.duration*1000;$("currentTime").textContent=fmt(audio.currentTime);$("duration").textContent=fmt(audio.duration)}});
audio.addEventListener("play",()=>$("playBtn").textContent="Ⅱ");audio.addEventListener("pause",()=>$("playBtn").textContent="▶");audio.addEventListener("ended",nextTrack);
document.addEventListener("keydown",e=>{if(["INPUT","TEXTAREA","SELECT"].includes(document.activeElement.tagName))return;if(e.code==="Space"){e.preventDefault();togglePlay()}if(e.key.toLowerCase()==="s")stopAll();if(e.key==="ArrowRight"&&audio.duration)audio.currentTime=Math.min(audio.duration,audio.currentTime+5);if(e.key==="ArrowLeft"&&audio.duration)audio.currentTime=Math.max(0,audio.currentTime-5)});
init();

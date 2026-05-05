import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── PATH HELPERS ─────────────────────────────────────────────────────────────
function catmullPath(pts, closed = true) {
  if (!pts || pts.length < 2) return "";
  const n = pts.length, T = 0.5 / 3;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  const len = closed ? n : n - 1;
  for (let i = 0; i < len; i++) {
    const p0=pts[(i-1+n)%n],p1=pts[i],p2=pts[(i+1)%n],p3=pts[(i+2)%n];
    const c1x=(p1[0]+(p2[0]-p0[0])*T).toFixed(1),c1y=(p1[1]+(p2[1]-p0[1])*T).toFixed(1);
    const c2x=(p2[0]-(p3[0]-p1[0])*T).toFixed(1),c2y=(p2[1]-(p3[1]-p1[1])*T).toFixed(1);
    d+=` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
  }
  return closed?d+"Z":d;
}
function sectorPath(pts,from,to){return catmullPath(pts.slice(Math.max(0,from),Math.min(pts.length,to+1)),false);}
function lerpPos(a,b,t){if(b==null)return a;let diff=b-a;if(diff<-0.5)diff+=1;if(diff>0.5)diff-=1;return((a+diff*t)%1+1)%1;}

// ─── CAR SILHOUETTE ────────────────────────────────────────────────────────────
function CarShape({color,scale=1,dimmed=false}){
  const s=scale, o=dimmed?0.35:1;
  return(<g transform={`scale(${s})`} opacity={o}>
    {/* rear wing */}
    <rect x={-12.5} y={-6.2} width={2.3} height={12.4} rx={0.7} fill={color} opacity={0.92}/>
    <rect x={-12.3} y={-6.9} width={3.0} height={1.1} rx={0.3} fill={color} opacity={0.7}/>
    <rect x={-12.3} y={5.8} width={3.0} height={1.1} rx={0.3} fill={color} opacity={0.7}/>
    {/* rear diffuser */}
    <path d="M-8,-1.5 L-12.5,-2.8 L-12.5,2.8 L-8,1.5Z" fill={color} opacity={0.5}/>
    {/* rear tyres */}
    <ellipse cx={-6.5} cy={-4.3} rx={2.2} ry={1.4} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <ellipse cx={-6.5} cy={4.3} rx={2.2} ry={1.4} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    {/* sidepods */}
    <path d="M-7,-3 L3,-4.5 L3,-5.2 L-8,-4Z" fill={color} opacity={0.8}/>
    <path d="M-7,3 L3,4.5 L3,5.2 L-8,4Z" fill={color} opacity={0.8}/>
    {/* floor edges */}
    <path d="M-9,-4.2 L1,-5 L1,-4.6 L-9,-3.8Z" fill={color} opacity={0.38}/>
    <path d="M-9,4.2 L1,5 L1,4.6 L-9,3.8Z" fill={color} opacity={0.38}/>
    {/* main body */}
    <path d="M-8,-2 C-3,-3 3,-3.5 5.5,-2.5 L8.5,0 L5.5,2.5 C3,3.5 -3,3 -8,2Z" fill={color}/>
    {/* center spine highlight */}
    <line x1={-7} y1={0} x2={8} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.6}/>
    {/* cockpit */}
    <ellipse cx={0.5} cy={0} rx={2.9} ry={1.8} fill="#050610"/>
    <ellipse cx={0.5} cy={0} rx={3.2} ry={2.0} fill="none" stroke={color} strokeWidth={0.4} opacity={0.4}/>
    {/* halo */}
    <path d="M-1.5,0 Q0.5,-3.8 2.5,0" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" opacity={0.88}/>
    <rect x={0} y={-4.0} width={1.0} height={1.7} rx={0.3} fill={color} opacity={0.45}/>
    {/* front tyres */}
    <ellipse cx={4.5} cy={-4.0} rx={1.9} ry={1.2} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <ellipse cx={4.5} cy={4.0} rx={1.9} ry={1.2} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    {/* nose cone */}
    <path d="M5.5,-2 L11,0 L5.5,2Z" fill={color}/>
    {/* front wing endplates */}
    <rect x={10.5} y={-6} width={2.3} height={12} rx={0.7} fill={color} opacity={0.92}/>
    <rect x={10.2} y={-6.6} width={2.9} height={1.0} rx={0.3} fill={color} opacity={0.7}/>
    <rect x={10.2} y={5.6} width={2.9} height={1.0} rx={0.3} fill={color} opacity={0.7}/>
    {/* front wing cascade elements */}
    <path d="M5.5,-2.6 L10.5,-5.0 L10.5,-4.2 L5.5,-2Z" fill={color} opacity={0.68}/>
    <path d="M5.5,2.6 L10.5,5.0 L10.5,4.2 L5.5,2Z" fill={color} opacity={0.68}/>
  </g>);
}

// ─── SPARKLINE ────────────────────────────────────────────────────────────────
function Sparkline({data,color,width=200,height=48,min=0,max=360,label}){
  if(!data||data.length<2)return null;
  const pts=data.map((v,i)=>`${((i/(data.length-1))*width).toFixed(1)},${(height-(Math.max(min,Math.min(max,v))/max)*height).toFixed(1)}`);
  const fill=`0,${height} ${pts.join(" ")} ${width},${height}`;
  return(<div>
    {label&&<div style={{fontSize:6,color:"#2a2d42",letterSpacing:2,marginBottom:3,fontFamily:"'DM Mono',monospace"}}>{label}</div>}
    <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height,display:"block"}}>
      {[0,max*0.33,max*0.66,max].map(v=>(<line key={v} x1={0} y1={height-(v/max)*height} x2={width} y2={height-(v/max)*height} stroke="#1a1d2e" strokeWidth={0.5} strokeDasharray="2 4"/>))}
      <polygon points={fill} fill={color} opacity={0.12}/>
      <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  </div>);
}

function TireBar({stints=[],currentLap=1,totalLaps=52}){
  const C={SOFT:"#ff4444",MEDIUM:"#FFD700",HARD:"#d8d8d8",INTERMEDIATE:"#00ff88",WET:"#4488ff"};
  return(<div style={{display:"flex",height:10,borderRadius:3,overflow:"hidden",gap:1}}>
    {stints.map((st,i)=>{
      const w=((st.end-st.start)/totalLaps)*100;
      const isActive=currentLap>=st.start&&currentLap<=st.end;
      return(<div key={i} style={{width:`${w}%`,background:C[st.compound]||"#888",opacity:isActive?1:0.4,position:"relative",boxShadow:isActive?`0 0 6px ${C[st.compound]||"#888"}`:undefined}}>
        {w>8&&<span style={{position:"absolute",left:3,top:"50%",transform:"translateY(-50%)",fontSize:5,fontWeight:700,color:"#000"}}>{st.compound[0]}</span>}
      </div>);
    })}
  </div>);
}

// ─── SESSIONS LIST ─────────────────────────────────────────────────────────────
// Add new sessions here after running fastf1_backend.py for each race.
// The backend prints the exact entry to add at the end of each run.
const SESSIONS = [
  { key:"british_2024_race", flag:"🇬🇧", name:"British GP", year:2024, type:"Race", file:"/data/british_2024_race.json", circuit:"Silverstone" },
  { key:"monaco_2024_race",  flag:"🇲🇨", name:"Monaco GP",  year:2024, type:"Race", file:"/data/monaco_2024_race.json",  circuit:"Monaco"      },
  { key:"miami_2026_race",   flag:"🇺🇸", name:"Miami GP",   year:2026, type:"Race", file:"/data/miami_2026_race.json",   circuit:"Miami"       },
];
 

// ─── MOCK FALLBACK (shown before any session is selected) ────────────────────
const MOCK_DRIVERS=[
  {code:"NOR",name:"Lando Norris",    team:"McLaren",        color:"#FF8000"},
  {code:"HAM",name:"Lewis Hamilton",  team:"Mercedes",       color:"#27F4D2"},
  {code:"LEC",name:"Charles Leclerc",  team:"Ferrari",        color:"#E8002D"},
  {code:"VER",name:"Max Verstappen",  team:"Red Bull Racing",color:"#3671C6"},
  {code:"PIA",name:"Oscar Piastri",   team:"McLaren",        color:"#FF9F1C"},
  {code:"RUS",name:"George Russell",  team:"Mercedes",       color:"#00C8BA"},
  {code:"ALO",name:"Fernando Alonso", team:"Aston Martin",   color:"#358C75"},
  {code:"SAI",name:"Carlos Sainz",    team:"Ferrari",        color:"#FF2D55"},
  {code:"PER",name:"Sergio Perez",    team:"Red Bull Racing",color:"#1E50BE"},
  {code:"GAS",name:"Pierre Gasly",    team:"Alpine",         color:"#FF87BC"},
];
const MOCK_WP=[[299.3,249.6],[346.6,254.2],[399.4,258.7],[452.3,263.2],[499.6,236.1],[527.4,186.3],[544.1,136.5],[555.2,100.3],[563.6,73.1],[569.1,55.0],[574.7,68.6],[588.6,91.2],[605.3,109.3],[619.2,118.4],[630.3,150.1],[622.0,181.7],[605.3,199.8],[577.5,213.4],[541.3,213.4],[485.7,208.9],[424.5,204.4],[360.5,199.8],[304.9,195.3],[249.2,195.3],[207.5,208.9],[185.2,245.1],[179.7,285.8],[182.5,326.6],[199.1,362.8],[229.7,380.9],[265.9,376.4],[288.2,349.2],[296.5,313.0],[290.9,281.3],[293.7,254.2],[302.1,222.5],[316.0,199.8],[329.9,199.8],[343.8,222.5],[349.4,249.6],[341.0,276.8],[327.1,299.4],[310.4,313.0],[296.5,326.6],[282.6,335.6],[274.3,344.7],[271.5,353.7],[277.0,367.3],[288.2,371.8],[307.6,376.4],[332.7,371.8],[374.4,362.8],[427.3,358.3],[477.3,353.7],[524.6,353.7],[558.0,371.8],[577.5,399.0],[583.0,430.7],[574.7,457.8],[558.0,480.5],[535.7,485.0],[519.1,471.4],[505.1,448.8],[482.9,421.6],[455.1,389.9],[421.7,358.3],[380.0,326.6],[341.0,299.4],[313.2,272.3]];
const MOCK_STEPS=5000,MOCK_LAPS=52,MOCK_LAP_S=89;
const SPD_F=MOCK_DRIVERS.map((_,i)=>1+i*0.001+Math.sin(i*1.9+0.3)*0.0006);
const GRD_O=MOCK_DRIVERS.map((_,i)=>-i*(0.9/MOCK_LAPS));
const MOCK_TL=(()=>{const out=[];for(let s=0;s<=MOCK_STEPS;s++){const t=s/MOCK_STEPS,fr={pos:{},raw:{},lap:{}};MOCK_DRIVERS.forEach((d,i)=>{const raw=(t*MOCK_LAPS)/SPD_F[i]+GRD_O[i];fr.raw[d.code]=raw;fr.pos[d.code]=((raw%1)+1)%1;fr.lap[d.code]=Math.max(1,Math.min(MOCK_LAPS,Math.floor(raw)+1));});out.push(fr);}return out;})();
const MOCK_CORNER_LABELS=[["ABBEY",510,248,"start"],["FARM",572,72,"start"],["VILLAGE",618,88,"start"],["THE LOOP",645,152,"start"],["AINTREE",556,202,"middle"],["WELLINGTON",372,183,"middle"],["BROOKLANDS",168,241,"end"],["LUFFIELD",166,333,"end"],["COPSE",303,189,"middle"],["MAGGOTTS",356,265,"start"],["BECKETTS",260,336,"end"],["CHAPEL",296,393,"start"],["HANGAR",455,343,"middle"],["STOWE",595,396,"start"],["VALE",590,462,"start"],["CLUB",450,500,"middle"]];
const TURN_NAMES={1:"ABBEY",2:"FARM",3:"VILLAGE",4:"THE LOOP",5:"AINTREE",6:"BROOKLANDS",7:"LUFFIELD",8:"WOODCOTE",9:"COPSE",10:"MAGGOTTS",11:"BECKETTS",12:"BECKETTS",13:"BECKETTS",14:"CHAPEL",15:"STOWE",16:"VALE",17:"VALE",18:"CLUB"};

function buildMock(){
  return{wp:MOCK_WP,tl:MOCK_TL,drivers:MOCK_DRIVERS,steps:MOCK_STEPS,totalLaps:MOCK_LAPS,lapTimeS:MOCK_LAP_S,viewBox:"145 35 525 470",cornerLabels:MOCK_CORNER_LABELS,s1end:32,s2end:54,drs1:[20,24],drs2:[50,54],sessionName:"Select a session →",pitLanePath:[]};
}

function processRealData(json){
  const{track,race}=json,wp=track.points,n=wp.length;
  const xs=wp.map(p=>p[0]),ys=wp.map(p=>p[1]);
  const xMin=Math.min(...xs)-30,yMin=Math.min(...ys)-30;
  const vbW=Math.max(...xs)-xMin+30,vbH=Math.max(...ys)-yMin+30;
  const hasPosFor=new Set(Object.keys(race.positions));
  const drivers=race.drivers.filter(d=>hasPosFor.has(d.code))
    .map(d=>({code:d.code,name:d.name||d.code,team:d.team||"",color:d.color.startsWith("#")?d.color:"#"+d.color,
              retiredAtStep:d.retired_at_step??null,pitLaps:d.pit_laps??[],pitWindows:d.pit_windows??[]}));
  const pitLanePath=(track.pit_lane_points||[]).map(p=>[p[0],p[1]]);
  const rawProg={};
  drivers.forEach(d=>{
    const pos=race.positions[d.code];if(!pos)return;
    const raw=new Float64Array(pos.length);let laps=0;raw[0]=pos[0];
    for(let i=1;i<pos.length;i++){if(pos[i]<pos[i-1]-0.5)laps++;raw[i]=laps+pos[i];}
    rawProg[d.code]=raw;
  });
  const steps=race.timeline_length-1,tl=[];
  for(let s=0;s<=steps;s++){
    const fr={pos:{},raw:{},lap:{}};
    drivers.forEach(d=>{
      const pos=race.positions[d.code];if(!pos)return;
      const rw=rawProg[d.code]?.[s]||0;
      fr.pos[d.code]=pos[s]||0;fr.raw[d.code]=rw;
      fr.lap[d.code]=Math.max(1,Math.min(race.total_laps,Math.floor(rw)+1));
    });
    tl.push(fr);
  }
  // ── Auto-detect retirement step from movement data (works without backend field) ──
  const LOOK=40;
  drivers.forEach(d=>{
    if(d.retiredAtStep!=null)return; // backend already set it
    const raw=rawProg[d.code];if(!raw)return;
    const finalRaw=raw[raw.length-1];
    if(finalRaw>=race.total_laps-1.5)return; // classified finisher
    // scan backwards — find last step where progress was still increasing
    for(let s=raw.length-1;s>=LOOK;s--){
      if(raw[s]-raw[s-LOOK]>0.05){d.retiredAtStep=s;break;}
    }
  });
  const seen=new Set(),cornerLabels=[];
  (track.corners||[]).forEach(c=>{
    const name=TURN_NAMES[c.number]||`T${c.number}`;
    if(seen.has(name))return;seen.add(name);cornerLabels.push([name,c.x,c.y,"middle"]);
  });
  return{wp,tl,drivers,steps,totalLaps:race.total_laps,lapTimeS:race.lap_time_s||88,viewBox:`${xMin} ${yMin} ${vbW} ${vbH}`,cornerLabels,s1end:Math.floor(n*0.45),s2end:Math.floor(n*0.75),drs1:[Math.floor(n*0.30),Math.floor(n*0.44)],drs2:[Math.floor(n*0.62),Math.floor(n*0.74)],sessionName:`${race.event} ${race.year} — ${race.session}`,pitLanePath};
}

const TRAIL_LEN=80, TRACK_LEN_M=5891, SPEED_HIST=120;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function F1App(){
  const [view,      setView    ]=useState("sessions"); // start on sessions tab
  const [dataset,   setDataset ]=useState(buildMock);
  const [dataMode,  setDataMode]=useState("SELECT");
  const [step,      setStep    ]=useState(0);
  const [playing,   setPlaying ]=useState(false);
  const [speed,     setSpeed   ]=useState(10);
  const [tilt,      setTilt    ]=useState(38);
  const [sel,       setSel     ]=useState(null);
  const [hover,     setHover   ]=useState(null);
  const [carPos,    setCarPos  ]=useState({});
  const [speedHist, setSpeedHist]=useState({});
  const [gapHist,   setGapHist ]=useState({});
  const [loading,   setLoading ]=useState(null); // session name being loaded
  const [loadErr,   setLoadErr ]=useState(null);

  const{wp,tl,drivers,steps,totalLaps,lapTimeS,viewBox,cornerLabels,s1end,s2end,drs1,drs2,sessionName,pitLanePath}=dataset;
  const baseStepsPerSec=steps/(totalLaps*lapTimeS);

  const pathRef=useRef(null),pitPathRef=useRef(null),rafRef=useRef(null),stepR=useRef(0);
  const speedR=useRef(speed),playR=useRef(false),lastT=useRef(null);
  const stepsR=useRef(steps),baseRateR=useRef(baseStepsPerSec);
  const tlRef=useRef(tl),driversRef=useRef(drivers);
  const speedHistRef=useRef({}),gapHistRef=useRef({});

  useEffect(()=>{speedR.current=speed;},[speed]);
  useEffect(()=>{stepsR.current=steps;},[steps]);
  useEffect(()=>{baseRateR.current=baseStepsPerSec;},[baseStepsPerSec]);
  useEffect(()=>{tlRef.current=tl;},[tl]);
  useEffect(()=>{driversRef.current=drivers;},[drivers]);

  useEffect(()=>{
    const l=document.createElement("link");l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);return()=>document.head.removeChild(l);
  },[]);

  const trackD=useMemo(()=>catmullPath(wp),[wp]);
  const pitLaneD=useMemo(()=>catmullPath(pitLanePath,false),[pitLanePath]);
  const s1D=useMemo(()=>sectorPath(wp,0,s1end),[wp,s1end]);
  const s2D=useMemo(()=>sectorPath(wp,s1end,s2end),[wp,s1end,s2end]);
  const s3D=useMemo(()=>sectorPath(wp,s2end,wp.length-1),[wp,s2end]);
  const drs1D=useMemo(()=>sectorPath(wp,...drs1),[wp,drs1]);
  const drs2D=useMemo(()=>sectorPath(wp,...drs2),[wp,drs2]);

  const calcPos=useCallback((floatStep)=>{
    const el=pathRef.current;if(!el)return;
    const total=el.getTotalLength();
    const pitEl=pitPathRef.current;
    const pitTotal=pitEl?pitEl.getTotalLength():0;
    const tl=tlRef.current,drivers=driversRef.current;
    const sA=Math.floor(floatStep),sB=Math.min(sA+1,tl.length-1);
    const frac=floatStep-sA,frA=tl[sA],frB=tl[sB];
    if(!frA)return;
    const out={};
    const LOOK=6,frPrev=tl[Math.max(0,sA-LOOK)]||frA;
    const realDt=LOOK*(lapTimeS*totalLaps/steps);
    for(const d of drivers){
      const posA=frA.pos[d.code];if(posA==null)continue;
      const rawNow=frA.raw[d.code]||0;
      // Check if car is in a pit window
      const pitWin=d.pitWindows?.find(w=>rawNow>=w[0]-0.08&&rawNow<=w[1]+0.08);
      let x,y,angle;
      if(pitWin&&pitEl&&pitTotal>0){
        // Route car along the pit lane path
        const pitFrac=Math.max(0,Math.min(1,(rawNow-pitWin[0])/(pitWin[1]-pitWin[0])));
        const pitL=pitFrac*pitTotal;
        const pt=pitEl.getPointAtLength(pitL);
        const pa=pitEl.getPointAtLength(Math.max(0,pitL-3));
        const pb=pitEl.getPointAtLength(Math.min(pitTotal,pitL+3));
        x=pt.x;y=pt.y;angle=Math.atan2(pb.y-pa.y,pb.x-pa.x)*57.2958;
      }else{
        const pos=lerpPos(posA,frB?.pos[d.code],frac);
        const l=pos*total;
        const pt=el.getPointAtLength(l);
        const pa=el.getPointAtLength(Math.max(0,l-5));
        const pb=el.getPointAtLength(Math.min(total,l+5));
        x=pt.x;y=pt.y;angle=Math.atan2(pb.y-pa.y,pb.x-pa.x)*57.2958;
      }
      out[d.code]={x,y,angle,isInPit:Boolean(pitWin)};
      const rawPrev=frPrev.raw[d.code]||rawNow;
      const delta=Math.max(0,rawNow-rawPrev);
      const kmh=realDt>0?Math.min(360,Math.max(60,Math.round(delta*TRACK_LEN_M/realDt*3.6))):0;
      if(!speedHistRef.current[d.code])speedHistRef.current[d.code]=[];
      speedHistRef.current[d.code].push(kmh);
      if(speedHistRef.current[d.code].length>SPEED_HIST)speedHistRef.current[d.code].shift();
    }
    setCarPos(out);setSpeedHist({...speedHistRef.current});
  },[lapTimeS,totalLaps,steps]);

  const loop=useCallback((ts)=>{
    if(!playR.current)return;
    if(!lastT.current)lastT.current=ts;
    const dt=Math.min(ts-lastT.current,50);lastT.current=ts;
    const nxt=Math.min(stepR.current+(dt/1000)*baseRateR.current*speedR.current,stepsR.current);
    stepR.current=nxt;setStep(Math.floor(nxt));calcPos(nxt);
    if(nxt<stepsR.current)rafRef.current=requestAnimationFrame(loop);
    else{playR.current=false;setPlaying(false);}
  },[calcPos]);

  const togglePlay=useCallback(()=>{
    if(playR.current){playR.current=false;setPlaying(false);cancelAnimationFrame(rafRef.current);lastT.current=null;}
    else{if(stepR.current>=stepsR.current)stepR.current=0;playR.current=true;setPlaying(true);lastT.current=null;rafRef.current=requestAnimationFrame(loop);}
  },[loop]);

  const clearAll=()=>{speedHistRef.current={};gapHistRef.current={};setSpeedHist({});setGapHist({});};

  const doRestart=useCallback(()=>{
    cancelAnimationFrame(rafRef.current);playR.current=false;setPlaying(false);lastT.current=null;
    stepR.current=0;setStep(0);clearAll();calcPos(0);
  },[calcPos]);

  const scrub=useCallback((v)=>{const s=+v;stepR.current=s;setStep(s);clearAll();calcPos(s);},[calcPos]);

  // ── Load a session by clicking it ──────────────────────────────────────────
  const loadSession=useCallback(async(session)=>{
    setLoading(session.name+" "+session.year);
    setLoadErr(null);
    try{
      const res=await fetch(session.file);
      if(!res.ok) throw new Error(`Could not load ${session.file} (${res.status}). Run the backend for this race first.`);
      const json=await res.json();
      if(!json.track||!json.race) throw new Error("Invalid data format");
      const processed=processRealData(json);
      setDataset(processed);
      setDataMode("DATA");
      setSel(null);setHover(null);
      clearAll();
      setLoading(null);
      setView("race");           // switch to race view automatically
      // auto-start playback after a short pause for the track to render
      setTimeout(()=>{
        stepR.current=0;
        playR.current=true;
        setPlaying(true);
        lastT.current=null;
        rafRef.current=requestAnimationFrame(loop);
      },400);
    }catch(err){
      setLoadErr(err.message);
      setLoading(null);
    }
  },[loop]);

  useEffect(()=>{if(dataMode!=="SELECT")doRestart();},[dataset]);
  useEffect(()=>()=>cancelAnimationFrame(rafRef.current),[]);

  const standings=useMemo(()=>{const fr=tl[step];if(!fr)return drivers;return[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));},[tl,step,drivers]);
  const selDriver=sel?drivers.find(d=>d.code===sel):null;
  const selRank=sel?standings.findIndex(d=>d.code===sel)+1:null;
  const leaderLap=standings[0]?(tl[step]?.lap[standings[0].code]||1):1;
  const pct=((step/steps)*100).toFixed(1);
  const focused=sel||hover;
  const sfX=wp[0]?.[0]||300,sfY=wp[0]?.[1]||250;
  const[vbX,vbY,vbW,vbH]=viewBox.split(" ").map(Number);
  const lapLabel=(mult)=>{const s=Math.round(lapTimeS/mult);return s>=60?`${Math.floor(s/60)}m${s%60>0?String(s%60).padStart(2,"0")+"s":""}`:s+"s";};
  const NAV=[{id:"sessions",label:"SESSIONS"},{id:"race",label:"RACE MAP"},{id:"driver",label:"DRIVER"}];

  const modeColor={"SELECT":"#333860","DATA":"#4CAF50","LIVE":"#ff4444"}[dataMode]||"#333860";
  const modeBg  ={"SELECT":"#0e0e22","DATA":"#0e2a0e", "LIVE":"#2a0a0a"}[dataMode]||"#0e0e22";
  const modeText={"SELECT":"◌ SELECT SESSION","DATA":"◉ "+dataMode,"LIVE":"◉ LIVE"}[dataMode]||"◌";

  return(
    <div style={{fontFamily:"'Orbitron',sans-serif",background:"#0d0d12",color:"#d0d2de",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <header style={{display:"flex",alignItems:"center",flexShrink:0,borderBottom:"1px solid #1a1c28",background:"#0a0a0f"}}>
        <div style={{padding:"0 20px",display:"flex",alignItems:"center",gap:10,borderRight:"1px solid #1a1c28",height:44,flexShrink:0}}>
          <div style={{background:"#E10600",color:"#fff",fontWeight:900,fontSize:13,letterSpacing:3,padding:"2px 8px"}}>F1</div>
          <span style={{fontSize:7,letterSpacing:3,color:"#6b6e84"}}>PITWALL</span>
        </div>
        <div style={{display:"flex",height:44}}>
          {NAV.map(n=>(<button key={n.id} onClick={()=>setView(n.id)} style={{padding:"0 18px",height:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${view===n.id?"#E10600":"transparent"}`,color:view===n.id?"#fff":"#555878",fontSize:8,letterSpacing:3,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>{n.label}</button>))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,padding:"0 20px"}}>
          <span style={{fontSize:8,color:"#6b6e84",letterSpacing:1,maxWidth:280,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{sessionName}</span>
          <span style={{fontSize:7,letterSpacing:2,padding:"2px 7px",background:modeBg,color:modeColor,border:`1px solid ${modeColor}50`,borderRadius:3}}>{modeText}</span>
          {dataMode!=="SELECT"&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#7a7d96"}}>LAP <span style={{color:"#fff",fontSize:13,fontWeight:700}}>{leaderLap}</span>/{totalLaps}</div>}
        </div>
      </header>

      {loadErr&&<div style={{background:"#2a0a0a",color:"#ff6b6b",fontSize:8,padding:"5px 20px",borderBottom:"1px solid #3a1010",letterSpacing:1}}>⚠ {loadErr}</div>}

      {/* ── LOADING OVERLAY ──────────────────────────────────────────── */}
      {loading&&(
        <div style={{position:"fixed",inset:0,zIndex:100,background:"rgba(6,7,12,0.92)",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
          <div style={{fontSize:28,letterSpacing:4,color:"#E10600",fontWeight:900}}>F1</div>
          <div style={{fontSize:10,letterSpacing:3,color:"#c4c6d6"}}>LOADING {loading.toUpperCase()}</div>
          <div style={{fontSize:8,color:"#252840",letterSpacing:2}}>Fetching race data…</div>
          <div style={{width:200,height:2,background:"#0c0e1a",borderRadius:1,overflow:"hidden",marginTop:8}}>
            <div style={{height:"100%",background:"#E10600",animation:"slide 1.2s ease-in-out infinite",width:"40%"}}/>
          </div>
          <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(600%)}}`}</style>
        </div>
      )}

      {/* ── BODY ──────────────────────────────────────────────────────── */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ─── SESSIONS VIEW ──────────────────────────────────────────── */}
        {view==="sessions"&&(
          <div style={{flex:1,overflowY:"auto",padding:32}}>
            <div style={{maxWidth:680,margin:"0 auto"}}>
              <div style={{fontSize:9,letterSpacing:4,color:"#E10600",marginBottom:6}}>SELECT A SESSION</div>
              <div style={{fontSize:7,color:"#555878",letterSpacing:2,marginBottom:28}}>
                Click any session below. The track layout and race data load automatically.
              </div>

              {/* Group by circuit */}
              {[...new Set(SESSIONS.map(s=>s.circuit))].map(circuit=>(
                <div key={circuit} style={{marginBottom:24}}>
                  <div style={{fontSize:7,letterSpacing:4,color:"#555878",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #1a1c28"}}>
                    {SESSIONS.find(s=>s.circuit===circuit)?.flag} {circuit.toUpperCase()}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {SESSIONS.filter(s=>s.circuit===circuit).map(session=>(
                      <button key={session.key} onClick={()=>loadSession(session)} style={{
                        padding:"14px 20px",borderRadius:6,cursor:"pointer",background:"#0e0e18",
                        border:"1px solid #1a1c28",display:"flex",alignItems:"center",gap:16,
                        textAlign:"left",transition:"all .15s",width:"100%",
                        fontFamily:"'Orbitron',sans-serif",
                      }}
                        onMouseEnter={e=>{e.currentTarget.style.background="#13131f";e.currentTarget.style.borderColor="#30344a";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="#0e0e18";e.currentTarget.style.borderColor="#1a1c28";}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,color:"#d0d2de",letterSpacing:2,marginBottom:4}}>
                            {session.name} {session.year}
                          </div>
                          <div style={{fontSize:7,color:"#555878",letterSpacing:1}}>{session.type}</div>
                        </div>
                        <div style={{fontSize:8,color:"#E10600",letterSpacing:2}}>LOAD →</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {/* Add more sessions instructions */}
              <div style={{marginTop:32,padding:20,borderRadius:6,background:"#0e0e18",border:"1px solid #1a1c28"}}>
                <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>ADD MORE RACES</div>
                <div style={{fontSize:7,color:"#444660",lineHeight:1.9,fontFamily:"'DM Mono',monospace"}}>
                  python3 fastf1_backend.py --event "Monaco Grand Prix" --year 2024 --session R<br/>
                  python3 fastf1_backend.py --event "Miami Grand Prix" --year 2026 --session R<br/>
                  python3 fastf1_backend.py --event "Canadian Grand Prix" --year 2026 --session R
                </div>
                <div style={{fontSize:6.5,color:"#333550",marginTop:10,letterSpacing:1}}>
                  Then copy the output JSON into f1-pitwall/public/data/ and push to GitHub.
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── RACE MAP VIEW ──────────────────────────────────────────── */}
        {view==="race"&&(
          <>
          <div style={{flex:1,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",perspective:"1100px",perspectiveOrigin:"50% 50%"}}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,background:"radial-gradient(ellipse at 55% 50%,transparent 45%,#0d0d12 92%)"}}/>

            {/* "No session" prompt if still on mock */}
            {dataMode==="SELECT"&&(
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:10,textAlign:"center",pointerEvents:"none"}}>
                <div style={{fontSize:9,letterSpacing:4,color:"#252840",marginBottom:8}}>NO SESSION LOADED</div>
                <button onClick={()=>setView("sessions")} style={{fontSize:7,letterSpacing:3,color:"#E10600",background:"transparent",border:"1px solid #E10600",padding:"6px 16px",borderRadius:4,cursor:"pointer",fontFamily:"'Orbitron',sans-serif",pointerEvents:"all"}}>← SELECT SESSION</button>
              </div>
            )}

            <svg viewBox={viewBox} style={{width:"100%",maxWidth:"min(92vw,900px)",maxHeight:"calc(100vh - 130px)",position:"relative",zIndex:1,transform:`rotateX(${tilt}deg)`,transformOrigin:"center 60%",transition:"transform 0.35s cubic-bezier(.4,0,.2,1)"}}>
              <defs>
                <filter id="trailBlur"><feGaussianBlur stdDeviation="2"/></filter>
                <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d0d12" stopOpacity={tilt>5?0.5:0}/>
                  <stop offset="60%" stopColor="#0d0d12" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* Pit lane surface (drawn behind main track) */}
              {pitLaneD&&<path d={pitLaneD} fill="none" stroke="#323540" strokeWidth={14} strokeLinecap="round"/>}
              {pitLaneD&&<path d={pitLaneD} fill="none" stroke="#3c3f50" strokeWidth={10} strokeLinecap="round"/>}
              {pitLaneD&&<path d={pitLaneD} fill="none" stroke="#464958" strokeWidth={1.5} strokeDasharray="4 6" strokeOpacity={0.6} strokeLinecap="round"/>}
              {/* Track asphalt layers */}
              <path d={trackD} fill="none" stroke="#2a2d3a" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#1e2030" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#252838" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"/>
              {/* Sector color stripes */}
              <path d={s1D} fill="none" stroke="#22c55e" strokeWidth={3} strokeOpacity={0.28} strokeLinecap="round"/>
              <path d={s2D} fill="none" stroke="#a855f7" strokeWidth={3} strokeOpacity={0.28} strokeLinecap="round"/>
              <path d={s3D} fill="none" stroke="#3b82f6" strokeWidth={3} strokeOpacity={0.28} strokeLinecap="round"/>
              {/* DRS zones */}
              <path d={drs1D} fill="none" stroke="#facc15" strokeWidth={2.5} strokeOpacity={.45} strokeLinecap="round"/>
              <path d={drs2D} fill="none" stroke="#facc15" strokeWidth={2.5} strokeOpacity={.45} strokeLinecap="round"/>
              {/* Track center line */}
              <path d={trackD} fill="none" stroke="#343748" strokeWidth={1} strokeDasharray="5 10" strokeOpacity={.5}/>
              {tilt>5&&<rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#depthGrad)" style={{pointerEvents:"none"}}/>}
              {/* Hidden paths for position calculation */}
              <path ref={pathRef} d={trackD} fill="none" stroke="none"/>
              <path ref={pitPathRef} d={pitLaneD||""} fill="none" stroke="none"/>
              {/* S/F line */}
              <line x1={sfX-2} y1={sfY-14} x2={sfX-2} y2={sfY+10} stroke="#ffffff" strokeWidth={2} strokeOpacity={.6}/>
              <text x={sfX+4} y={sfY+3} fill="#7a7d96" fontSize={5.5} fontFamily="'DM Mono',monospace">S/F</text>
              {/* Corner labels */}
              {cornerLabels.map(([name,x,y,anchor])=>(<text key={name} x={x} y={y} fill="#3a3e58" fontSize={4.8} textAnchor={anchor} fontFamily="'Orbitron',sans-serif" letterSpacing={.7}>{name}</text>))}
              {/* Battle lines */}
              {standings.map((d,i)=>{
                if(i===0)return null;
                const isDNF=d.retiredAtStep!=null&&step>d.retiredAtStep;
                if(isDNF)return null;
                const fr=tl[step]||{};
                const gap=((fr.raw[standings[i-1].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                if(gap>1.0)return null;
                const pA=carPos[standings[i-1].code],pB=carPos[d.code];
                if(!pA||!pB)return null;
                return(<g key={`b-${d.code}`}><line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#FFD700" strokeWidth={1} strokeOpacity={0.3} strokeDasharray="3 4"/><text x={(pA.x+pB.x)/2} y={(pA.y+pB.y)/2-4} fill="#FFD700" fontSize={5} textAnchor="middle" opacity={0.6} fontFamily="'DM Mono',monospace">{gap.toFixed(2)}s</text></g>);
              })}
              {/* Cars */}
              {drivers.map((d)=>{
                const p=carPos[d.code];if(!p)return null;
                const isDNF=d.retiredAtStep!=null&&step>d.retiredAtStep;
                const isInPit=Boolean(p.isInPit)&&!isDNF;
                const rank=standings.findIndex(s=>s.code===d.code)+1;
                const isActive=sel===d.code,isHover=hover===d.code;
                const baseOpacity=isDNF?0.18:(focused&&!isActive&&!isHover?0.22:1);
                const depth=Math.max(0,Math.min(1,(p.y-vbY)/vbH));
                const carScale=tilt>0?1.0-depth*0.38:1.0;
                return(<g key={d.code} style={{cursor:isDNF?"default":"pointer",opacity:baseOpacity,transition:"opacity .15s"}}
                  onClick={()=>!isDNF&&setSel(isActive?null:d.code)} onMouseEnter={()=>!isDNF&&setHover(d.code)} onMouseLeave={()=>setHover(null)}>
                  {/* glow — subtle, none in pit or DNF */}
                  {!isDNF&&!isInPit&&<ellipse cx={p.x} cy={p.y} rx={14*carScale} ry={6*carScale} fill={d.color} opacity={isActive?0.45:isHover?0.3:0.18} transform={`rotate(${p.angle},${p.x},${p.y})`} style={{filter:"blur(6px)"}}/>}
                  {/* car body */}
                  <g transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}><CarShape color={isDNF?"#555":d.color} scale={carScale} dimmed={isDNF}/></g>
                  {/* code badge */}
                  {!isDNF&&<g transform={`translate(${p.x},${p.y-17*carScale})`}>
                    <rect x={-10} y={-6} width={20} height={11} rx={2.5} fill="#05060e" fillOpacity={0.88} stroke={isInPit?"#ff8c00":d.color} strokeWidth={isInPit?1.2:0.9}/>
                    <text x={0} y={1.8} fill={isInPit?"#ff8c00":d.color} fontSize={6} textAnchor="middle" fontWeight="600" fontFamily="'DM Mono',monospace">{isInPit?"PIT":d.code}</text>
                  </g>}
                  {/* DNF badge */}
                  {isDNF&&<g transform={`translate(${p.x},${p.y-17*carScale})`}>
                    <rect x={-12} y={-6} width={24} height={11} rx={2.5} fill="#1a0505" fillOpacity={0.92} stroke="#5a1515" strokeWidth={0.9}/>
                    <text x={0} y={1.8} fill="#884444" fontSize={6} textAnchor="middle" fontWeight="700" fontFamily="'DM Mono',monospace">DNF</text>
                  </g>}
                  {/* position badge — only for active cars */}
                  {!isDNF&&(isActive||isHover||rank<=3)&&<g transform={`translate(${p.x},${p.y-31*carScale})`}><rect x={-10} y={-6} width={20} height={11} rx={2.5} fill={d.color} opacity={0.9}/><text x={0} y={1.8} fill="#fff" fontSize={6} textAnchor="middle" fontWeight="700" fontFamily="'Orbitron',sans-serif">P{rank}</text></g>}
                </g>);
              })}
            </svg>
          </div>

          {/* Sidebar */}
          <aside style={{width:210,flexShrink:0,borderLeft:"1px solid #1a1c28",background:"#090910",display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 12px",borderBottom:"1px solid #1a1c28",fontSize:7,letterSpacing:4,color:"#555878",fontWeight:700}}>RACE ORDER</div>
            <div style={{flex:1,overflowY:"auto"}}>
              {standings.map((d,i)=>{
                const fr=tl[step]||{};
                const isDNF=d.retiredAtStep!=null&&step>d.retiredAtStep;
                const sh=speedHist[d.code]||[];const spd=sh[sh.length-1]||0;
                const isInPit=Boolean(carPos[d.code]?.isInPit)&&!isDNF;
                const isActive=sel===d.code,isHover=hover===d.code;
                const leaderGap=i===0?null:((fr.raw[standings[0].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                const aheadGap=i===0?null:((fr.raw[standings[i-1].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                const isBattle=!isDNF&&!isInPit&&aheadGap!=null&&aheadGap<1.0;
                const rowColor=isDNF?"rgba(90,20,20,0.3)":isInPit?"rgba(255,140,0,0.08)":isActive?`${d.color}18`:isHover?"#12131f":"transparent";
                return(<div key={d.code}>
                  {isBattle&&i>0&&<div style={{padding:"3px 12px",background:"rgba(255,215,0,0.07)",borderTop:"1px solid #FFD70030",borderBottom:"1px solid #FFD70030",display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:"#FFD700",fontSize:8}}>⚡</span>
                    <span style={{flex:1,fontSize:6,letterSpacing:2,color:"#FFD700",fontWeight:700}}>BATTLE</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#FFD700"}}>{aheadGap.toFixed(2)}s</span>
                  </div>}
                  <div onClick={()=>!isDNF&&setSel(isActive?null:d.code)} onMouseEnter={()=>!isDNF&&setHover(d.code)} onMouseLeave={()=>setHover(null)}
                    style={{padding:"6px 12px",cursor:isDNF?"default":"pointer",background:rowColor,borderLeft:`2px solid ${isDNF?"#7a2222":isInPit?"#ff8c00":(isActive||isHover)?d.color:"transparent"}`,transition:"background .1s",opacity:isDNF?0.5:1}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,width:16,textAlign:"center",color:isDNF?"#7a2222":isInPit?"#ff8c00":i===0?"#FFD700":i<3?d.color:"#505470"}}>{isDNF?"✕":i+1}</span>
                      <div style={{width:2,height:18,borderRadius:1,flexShrink:0,background:isDNF?"#7a2222":isInPit?"#ff8c00":d.color}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                          <span style={{fontSize:9,letterSpacing:2,fontWeight:600,color:isDNF?"#7a3535":isInPit?"#ff8c00":(isActive||isHover)?d.color:"#9a9eb8"}}>{d.code}</span>
                          {isDNF
                            ?<span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#7a3535",letterSpacing:1}}>DNF</span>
                            :<span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:i===0?"#4ade80":"#666a88"}}>{i===0?"LEAD":`+${leaderGap!=null?leaderGap.toFixed(1):"?"}s`}</span>
                          }
                        </div>
                        <div style={{fontSize:5.5,color:"#44475e",letterSpacing:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{d.team}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5,paddingLeft:22}}>
                      {isInPit
                        ?<span style={{fontSize:6.5,letterSpacing:2,color:"#ff8c00",fontWeight:700,background:"rgba(255,140,0,0.12)",border:"1px solid rgba(255,140,0,0.35)",borderRadius:3,padding:"1px 6px",fontFamily:"'Orbitron',sans-serif"}}>PIT STOP</span>
                        :isDNF
                          ?<span style={{fontSize:6,letterSpacing:1,color:"#7a3535",fontFamily:"'DM Mono',monospace"}}>retired</span>
                          :<><span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#666a88"}}>{spd}<span style={{fontSize:5,color:"#444660"}}> km/h</span></span>
                            {aheadGap!=null&&aheadGap<3&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:6,color:isBattle?"#FFD700":"#505470",marginLeft:"auto"}}>{aheadGap.toFixed(2)}s↑</span>}
                          </>
                      }
                    </div>
                  </div>
                </div>);
              })}
            </div>
            <div onClick={()=>setView("sessions")} style={{padding:"10px 12px",borderTop:"1px solid #1a1c28",cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:"#0a0b14"}}>
              <span style={{fontSize:7,letterSpacing:2,color:"#555878"}}>← CHANGE SESSION</span>
            </div>
          </aside>
          </>
        )}

        {/* ─── DRIVER VIEW ────────────────────────────────────────────── */}
        {view==="driver"&&(
          <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:20}}>
            {!selDriver?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
                <div style={{fontSize:10,letterSpacing:4,color:"#252840"}}>NO DRIVER SELECTED</div>
                <div style={{fontSize:7,color:"#1a1d2e",letterSpacing:2}}>SELECT A DRIVER ON THE RACE MAP</div>
                <button onClick={()=>setView("race")} style={{marginTop:8,padding:"8px 20px",background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,color:"#252840",fontSize:8,letterSpacing:2,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>← RACE MAP</button>
              </div>
            ):(()=>{
              const d=selDriver;
              const fr=selDriver?tl[step]||{}:{};
              const spdH=speedHist[d.code]||[];
              const currentSpd=spdH[spdH.length-1]||0;
              const sorted=[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
              const idx=sorted.findIndex(x=>x.code===d.code);
              const aheadDriver=idx>0?sorted[idx-1]:null;
              const aheadGapNow=aheadDriver?((fr.raw[aheadDriver.code]||0)-(fr.raw[d.code]||0))*lapTimeS:null;
              const currentLap=fr.lap?.[d.code]||1;
              return(<>
                <div style={{display:"flex",alignItems:"center",gap:20,paddingBottom:16,borderBottom:"1px solid #0c0e1a"}}>
                  <button onClick={()=>setView("race")} style={{background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,color:"#252840",fontSize:10,cursor:"pointer",padding:"6px 10px",fontFamily:"'Orbitron',sans-serif"}}>←</button>
                  <div style={{width:4,height:48,background:d.color,borderRadius:2,boxShadow:`0 0 20px ${d.color}`}}/>
                  <div>
                    <div style={{fontSize:22,letterSpacing:3,color:d.color,fontWeight:700,lineHeight:1}}>{d.code}</div>
                    <div style={{fontSize:9,color:"#8a8ea8",letterSpacing:2,marginTop:4}}>{d.name}</div>
                    <div style={{fontSize:7,color:"#555878",letterSpacing:1,marginTop:2}}>{d.team}</div>
                  </div>
                  {[{l:"POSITION",v:`P${selRank}`},{l:"LAP",v:`${currentLap}/${totalLaps}`},{l:"SPEED",v:`${currentSpd} km/h`},aheadDriver?{l:`GAP TO ${aheadDriver.code}`,v:aheadGapNow!=null?`${aheadGapNow.toFixed(2)}s`:"—"}:null].filter(Boolean).map(({l,v})=>(
                    <div key={l} style={{padding:"8px 14px",background:"#0e0e18",borderRadius:6,border:"1px solid #1a1c28",textAlign:"center",minWidth:80}}>
                      <div style={{fontSize:5.5,color:"#555878",letterSpacing:2,marginBottom:4}}>{l}</div>
                      <div style={{fontSize:13,color:"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{v}</div>
                    </div>
                  ))}
                </div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>
                  <div style={{background:"#0e0e18",borderRadius:8,padding:16,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>SPEED TRACE</div>
                    {spdH.length>4?<Sparkline data={spdH} color={d.color} width={280} height={60} min={60} max={360}/>:<div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#44475e",fontSize:7,letterSpacing:2}}>PLAY RACE TO SEE TRACE</div>}
                  </div>
                  <div style={{background:"#0e0e18",borderRadius:8,padding:16,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>GAP TO {aheadDriver?.code||"CAR AHEAD"}</div>
                    {gapHist[d.code]?.length>4?<Sparkline data={gapHist[d.code]} color={aheadDriver?.color||"#FFD700"} width={280} height={60} min={0} max={10}/>:<div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#44475e",fontSize:7,letterSpacing:2}}>{selRank===1?"RACE LEADER":"PLAY RACE TO SEE GAP"}</div>}
                    {aheadGapNow!=null&&<div style={{marginTop:10,textAlign:"center",fontFamily:"'DM Mono',monospace",fontSize:20,color:aheadGapNow<0.5?"#f87171":aheadGapNow<1?"#FFD700":"#d0d2de"}}>{aheadGapNow.toFixed(3)}s</div>}
                  </div>
                </div>
              </>);
            })()}
          </div>
        )}
      </div>

      {/* ── FOOTER ────────────────────────────────────────────────────── */}
      <footer style={{padding:"8px 20px",flexShrink:0,borderTop:"1px solid #1a1c28",background:"#0a0a0f",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={doRestart} style={ICON_BTN}>↺</button>
        <button onClick={togglePlay} style={{width:36,height:36,borderRadius:"50%",background:"#E10600",border:"none",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,flexShrink:0,boxShadow:playing?"0 0 18px #E1060070":"none",transition:"box-shadow .2s"}}>{playing?"⏸":"▶"}</button>
        <div style={{display:"flex",gap:3,flexShrink:0}}>
          {[1,2,5,10,30].map(s=>(<button key={s} onClick={()=>setSpeed(s)} style={{display:"flex",flexDirection:"column",alignItems:"center",padding:"2px 7px",background:speed===s?"#E10600":"transparent",border:`1px solid ${speed===s?"#E10600":"#1e2035"}`,borderRadius:3,cursor:"pointer",transition:"all .12s"}}>
            <span style={{fontSize:8,letterSpacing:1,fontFamily:"'Orbitron',sans-serif",color:speed===s?"#fff":"#555878"}}>{s}×</span>
            <span style={{fontSize:5.5,fontFamily:"'DM Mono',monospace",marginTop:1,color:speed===s?"rgba(255,255,255,.7)":"#3a3d54"}}>{lapLabel(s)}/lap</span>
          </button>))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:7,color:"#555878",letterSpacing:1,whiteSpace:"nowrap"}}>3D {tilt}°</span>
          <input type="range" min={0} max={55} value={tilt} onChange={e=>setTilt(+e.target.value)} style={{width:60,accentColor:"#E10600",cursor:"pointer"}}/>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#555878"}}>L1</span>
          <input type="range" min={0} max={steps} value={step} onChange={e=>scrub(e.target.value)} style={{flex:1,accentColor:"#E10600",cursor:"pointer"}}/>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#555878"}}>L{totalLaps}</span>
        </div>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#666a88",minWidth:38,textAlign:"right"}}>{pct}%</span>
      </footer>
    </div>
  );
}
const ICON_BTN={width:32,height:32,background:"transparent",border:"1px solid #1e2035",borderRadius:4,color:"#555878",fontSize:13,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"sans-serif"};

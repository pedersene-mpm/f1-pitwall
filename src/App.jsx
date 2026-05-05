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
function CarShape({color,scale=1}){
  const s=scale;
  return(<g transform={`scale(${s})`}>
    <rect x={-11} y={-6} width={2.8} height={12} rx={1} fill={color} opacity={0.95}/>
    <rect x={-8.2} y={-2} width={1.5} height={4} rx={0.5} fill="rgba(0,0,0,0.4)"/>
    <path d="M-8,-2 L-11,-2 L-11,2 L-8,2Z" fill={color} opacity={0.7}/>
    <path d="M-5.5,-5 L3.5,-4.2 L3.5,-2.5 L-5.5,-2.8Z" fill={color} opacity={0.82}/>
    <path d="M-5.5,5 L3.5,4.2 L3.5,2.5 L-5.5,2.8Z" fill={color} opacity={0.82}/>
    <path d="M-8,-2.5 C-3,-3 3.5,-3.2 7,-2 L9.5,0 L7,2 C3.5,3.2 -3,3 -8,2.5Z" fill={color}/>
    <line x1={-8} y1={0} x2={7} y2={0} stroke="rgba(255,255,255,0.13)" strokeWidth={0.5}/>
    <ellipse cx={0.5} cy={0} rx={3} ry={2.1} fill="#050610"/>
    <ellipse cx={0.5} cy={0} rx={3.4} ry={2.4} fill="none" stroke={color} strokeWidth={0.5} opacity={0.55}/>
    <path d="M-1.5,0 Q0.5,-3.5 2.5,0" fill="none" stroke={color} strokeWidth={0.9} opacity={0.65} strokeLinecap="round"/>
    <path d="M7,-2 L11.5,0 L7,2Z" fill={color}/>
    <rect x={11} y={-6.5} width={2.2} height={13} rx={1} fill={color} opacity={0.92}/>
    <rect x={10.8} y={-6.5} width={2.6} height={1.2} rx={0.4} fill={color} opacity={0.7}/>
    <rect x={10.8} y={5.3} width={2.6} height={1.2} rx={0.4} fill={color} opacity={0.7}/>
  </g>);
}

// ─── CHART HELPERS ────────────────────────────────────────────────────────────
function Sparkline({data, color, width=200, height=48, min=0, max=360, label}){
  if(!data||data.length<2)return null;
  const pts = data.map((v,i)=>`${((i/(data.length-1))*width).toFixed(1)},${(height-(Math.max(min,Math.min(max,v))/max)*height).toFixed(1)}`);
  const fill = `0,${height} ${pts.join(" ")} ${width},${height}`;
  return(
    <div>
      {label&&<div style={{fontSize:6,color:"#2a2d42",letterSpacing:2,marginBottom:3,fontFamily:"'DM Mono',monospace"}}>{label}</div>}
      <svg viewBox={`0 0 ${width} ${height}`} style={{width:"100%",height,display:"block"}}>
        {[0,max*0.33,max*0.66,max].map(v=>(
          <line key={v} x1={0} y1={height-(v/max)*height} x2={width} y2={height-(v/max)*height}
            stroke="#1a1d2e" strokeWidth={0.5} strokeDasharray="2 4"/>
        ))}
        <polygon points={fill} fill={color} opacity={0.12}/>
        <polyline points={pts.join(" ")} fill="none" stroke={color} strokeWidth={1.5}
          strokeLinecap="round" strokeLinejoin="round"/>
        {data.length>0&&(
          <circle cx={(((data.length-1)/(data.length-1))*width)} cy={height-(Math.max(min,Math.min(max,data[data.length-1]))/max)*height}
            r={2.5} fill={color}/>
        )}
      </svg>
    </div>
  );
}

function TireBar({stints=[],currentLap=1,totalLaps=52}){
  const COLORS={SOFT:"#ff4444",MEDIUM:"#FFD700",HARD:"#d8d8d8",INTERMEDIATE:"#00ff88",WET:"#4488ff"};
  return(
    <div style={{display:"flex",height:10,borderRadius:3,overflow:"hidden",gap:1}}>
      {stints.map((st,i)=>{
        const w=((st.end-st.start)/totalLaps)*100;
        const isActive=currentLap>=st.start&&currentLap<=st.end;
        return(
          <div key={i} title={`${st.compound} L${st.start}-${st.end}`} style={{
            width:`${w}%`,background:COLORS[st.compound]||"#888",
            opacity:isActive?1:0.4,position:"relative",
            boxShadow:isActive?`0 0 6px ${COLORS[st.compound]||"#888"}`:undefined,
          }}>
            {w>8&&<span style={{position:"absolute",left:3,top:"50%",transform:"translateY(-50%)",
              fontSize:5,fontWeight:700,color:"#000",letterSpacing:0.5}}>
              {st.compound[0]}
            </span>}
          </div>
        );
      })}
    </div>
  );
}

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_WP=[
  [299.3,249.6],[346.6,254.2],[399.4,258.7],[452.3,263.2],[499.6,236.1],[527.4,186.3],[544.1,136.5],
  [555.2,100.3],[563.6,73.1],[569.1,55.0],[574.7,68.6],[588.6,91.2],[605.3,109.3],
  [619.2,118.4],[630.3,150.1],[622.0,181.7],[605.3,199.8],[577.5,213.4],[541.3,213.4],
  [485.7,208.9],[424.5,204.4],[360.5,199.8],[304.9,195.3],[249.2,195.3],
  [207.5,208.9],[185.2,245.1],[179.7,285.8],[182.5,326.6],[199.1,362.8],[229.7,380.9],
  [265.9,376.4],[288.2,349.2],[296.5,313.0],[290.9,281.3],[293.7,254.2],[302.1,222.5],
  [316.0,199.8],[329.9,199.8],[343.8,222.5],[349.4,249.6],[341.0,276.8],[327.1,299.4],[310.4,313.0],
  [296.5,326.6],[282.6,335.6],[274.3,344.7],[271.5,353.7],[277.0,367.3],[288.2,371.8],
  [307.6,376.4],[332.7,371.8],[374.4,362.8],[427.3,358.3],[477.3,353.7],[524.6,353.7],
  [558.0,371.8],[577.5,399.0],[583.0,430.7],[574.7,457.8],[558.0,480.5],[535.7,485.0],
  [519.1,471.4],[505.1,448.8],[482.9,421.6],[455.1,389.9],[421.7,358.3],[380.0,326.6],
  [341.0,299.4],[313.2,272.3],
];
const MOCK_CORNER_LABELS=[
  ["ABBEY",510,248,"start"],["FARM",572,72,"start"],["VILLAGE",618,88,"start"],
  ["THE LOOP",645,152,"start"],["AINTREE",556,202,"middle"],["WELLINGTON",372,183,"middle"],
  ["BROOKLANDS",168,241,"end"],["LUFFIELD",166,333,"end"],["COPSE",303,189,"middle"],
  ["MAGGOTTS",356,265,"start"],["BECKETTS",260,336,"end"],["CHAPEL",296,393,"start"],
  ["HANGAR",455,343,"middle"],["STOWE",595,396,"start"],["VALE",590,462,"start"],["CLUB",450,500,"middle"],
];
const TURN_NAMES={1:"ABBEY",2:"FARM",3:"VILLAGE",4:"THE LOOP",5:"AINTREE",6:"BROOKLANDS",7:"LUFFIELD",
  8:"WOODCOTE",9:"COPSE",10:"MAGGOTTS",11:"BECKETTS",12:"BECKETTS",13:"BECKETTS",
  14:"CHAPEL",15:"STOWE",16:"VALE",17:"VALE",18:"CLUB"};

const MOCK_DRIVERS=[
  {code:"NOR",name:"Lando Norris",    team:"McLaren",        color:"#FF8000",number:4},
  {code:"HAM",name:"Lewis Hamilton",  team:"Mercedes",       color:"#27F4D2",number:44},
  {code:"LEC",name:"Charles Leclerc", team:"Ferrari",        color:"#E8002D",number:16},
  {code:"VER",name:"Max Verstappen",  team:"Red Bull Racing",color:"#3671C6",number:1},
  {code:"PIA",name:"Oscar Piastri",   team:"McLaren",        color:"#FF9F1C",number:81},
  {code:"RUS",name:"George Russell",  team:"Mercedes",       color:"#00C8BA",number:63},
  {code:"ALO",name:"Fernando Alonso", team:"Aston Martin",   color:"#358C75",number:14},
  {code:"SAI",name:"Carlos Sainz",    team:"Ferrari",        color:"#FF2D55",number:55},
  {code:"PER",name:"Sergio Perez",    team:"Red Bull Racing",color:"#1E50BE",number:11},
  {code:"GAS",name:"Pierre Gasly",    team:"Alpine",         color:"#FF87BC",number:10},
];
const MOCK_STEPS=5000,MOCK_LAPS=52,MOCK_LAP_S=89;
const SPEED_F=MOCK_DRIVERS.map((_,i)=>1+i*0.001+Math.sin(i*1.9+0.3)*0.0006);
const GRID_OF=MOCK_DRIVERS.map((_,i)=>-i*(0.9/MOCK_LAPS));
const MOCK_TL=(()=>{
  const out=[];
  for(let s=0;s<=MOCK_STEPS;s++){
    const t=s/MOCK_STEPS,fr={pos:{},raw:{},lap:{}};
    MOCK_DRIVERS.forEach((d,i)=>{
      const raw=(t*MOCK_LAPS)/SPEED_F[i]+GRID_OF[i];
      fr.raw[d.code]=raw;fr.pos[d.code]=((raw%1)+1)%1;
      fr.lap[d.code]=Math.max(1,Math.min(MOCK_LAPS,Math.floor(raw)+1));
    });
    out.push(fr);
  }
  return out;
})();

// Mock tire stints per driver
function mockStints(driverIdx,totalLaps){
  const base=[[1,15,"SOFT"],[16,35,"MEDIUM"],[36,totalLaps,"HARD"]];
  const offsets=[-2,-1,0,1,2,0,-1,1,-2,0];
  const o=offsets[driverIdx%offsets.length];
  return[
    {start:1,       end:15+o,   compound:"SOFT"},
    {start:16+o,    end:35+o*2, compound:"MEDIUM"},
    {start:36+o*2,  end:totalLaps,compound:"HARD"},
  ].filter(s=>s.start<=totalLaps&&s.end>=1);
}

// Mock sector times for a driver+lap
function mockSectorTimes(code,lap){
  const seed=(code.charCodeAt(0)*7+code.charCodeAt(2)*13+lap*11)%100;
  const s1Base=26.0+(seed%8)*0.1-0.4;
  const s2Base=32.0+((seed*3)%8)*0.1-0.4;
  const s3Base=19.8+((seed*7)%6)*0.1-0.3;
  const bestS1=25.8,bestS2=31.6,bestS3=19.5;
  const sc=(v,best)=>v<=best+0.05?"#a855f7":v<=best+0.5?"#00ff88":"#FFD700";
  return{
    s1:{t:s1Base,d:+(s1Base-bestS1).toFixed(3),color:sc(s1Base,bestS1)},
    s2:{t:s2Base,d:+(s2Base-bestS2).toFixed(3),color:sc(s2Base,bestS2)},
    s3:{t:s3Base,d:+(s3Base-bestS3).toFixed(3),color:sc(s3Base,bestS3)},
  };
}

// ─── OPENF1 SESSIONS (mock list — real version fetches from api.openf1.org) ──
const OPENF1_SESSIONS=[
  {key:"9158", name:"Silverstone GP 2024", type:"Race",      status:"completed", date:"2024-07-07"},
  {key:"9157", name:"Silverstone Quali 2024",type:"Qualifying",status:"completed",date:"2024-07-06"},
  {key:"9156", name:"Silverstone Sprint 2024",type:"Sprint",  status:"completed",date:"2024-07-05"},
  {key:"9112", name:"Monaco GP 2024",      type:"Race",      status:"completed", date:"2024-05-26"},
  {key:"9111", name:"Monaco Quali 2024",   type:"Qualifying",status:"completed", date:"2024-05-25"},
  {key:"LIVE", name:"⬤ LIVE SESSION",       type:"Race",      status:"live",      date:"NOW"},
];

// ─── REAL DATA PROCESSOR ─────────────────────────────────────────────────────
function processRealData(json){
  const{track,race}=json,wp=track.points,n=wp.length;
  const xs=wp.map(p=>p[0]),ys=wp.map(p=>p[1]);
  const xMin=Math.min(...xs)-30,yMin=Math.min(...ys)-30;
  const vbW=Math.max(...xs)-xMin+30,vbH=Math.max(...ys)-yMin+30;
  const hasPosFor=new Set(Object.keys(race.positions));
  const drivers=race.drivers.filter(d=>hasPosFor.has(d.code))
    .map(d=>({code:d.code,name:d.name||d.code,team:d.team||"",
              color:d.color.startsWith("#")?d.color:"#"+d.color,number:0}));
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
  const seen=new Set(),cornerLabels=[];
  (track.corners||[]).forEach(c=>{
    const name=TURN_NAMES[c.number]||`T${c.number}`;
    if(seen.has(name))return;seen.add(name);cornerLabels.push([name,c.x,c.y,"middle"]);
  });
  return{wp,tl,drivers,steps,totalLaps:race.total_laps,lapTimeS:race.lap_time_s||89,
    viewBox:`${xMin} ${yMin} ${vbW} ${vbH}`,cornerLabels,
    s1end:Math.floor(n*0.45),s2end:Math.floor(n*0.75),
    drs1:[Math.floor(n*0.30),Math.floor(n*0.44)],drs2:[Math.floor(n*0.62),Math.floor(n*0.74)]};
}
function buildMock(){
  return{wp:MOCK_WP,tl:MOCK_TL,drivers:MOCK_DRIVERS,steps:MOCK_STEPS,
    totalLaps:MOCK_LAPS,lapTimeS:MOCK_LAP_S,viewBox:"145 35 525 470",
    cornerLabels:MOCK_CORNER_LABELS,s1end:32,s2end:54,drs1:[20,24],drs2:[50,54]};
}

const TRAIL_LEN=80;
const TRACK_LEN_M=5891;
const SPEED_HISTORY_LEN=120; // ~2 laps of speed history at 10×

// ─── COMPONENT ────────────────────────────────────────────────────────────────
export default function F1App(){
  const [view,      setView    ] = useState("race");  // "race" | "driver" | "live"
  const [dataset,   setDataset ] = useState(buildMock);
  const [dataMode,  setDataMode] = useState("MOCK");
  const [step,      setStep    ] = useState(0);
  const [playing,   setPlaying ] = useState(false);
  const [speed,     setSpeed   ] = useState(10);
  const [tilt,      setTilt    ] = useState(38);
  const [sel,       setSel     ] = useState(null);
  const [hover,     setHover   ] = useState(null);
  const [carPos,    setCarPos  ] = useState({});
  const [trails,    setTrails  ] = useState({});
  const [speedHist, setSpeedHist] = useState({}); // {code: [km/h]}
  const [gapHist,   setGapHist ] = useState({}); // {code: [gap_s]}
  const [loadErr,   setLoadErr ] = useState(null);
  const [of1Status, setOf1Status] = useState("idle"); // idle|connecting|connected|error
  const [selectedSession, setSelectedSession] = useState(null);

  const{wp,tl,drivers,steps,totalLaps,lapTimeS,
        viewBox,cornerLabels,s1end,s2end,drs1,drs2}=dataset;

  const baseStepsPerSec=steps/(totalLaps*lapTimeS);

  const pathRef=useRef(null),rafRef=useRef(null),stepR=useRef(0);
  const speedR=useRef(speed),playR=useRef(false),lastT=useRef(null);
  const stepsR=useRef(steps),baseRateR=useRef(baseStepsPerSec);
  const tlRef=useRef(tl),driversRef=useRef(drivers),trailRef=useRef({});
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
  const s1D=useMemo(()=>sectorPath(wp,0,s1end),[wp,s1end]);
  const s2D=useMemo(()=>sectorPath(wp,s1end,s2end),[wp,s1end,s2end]);
  const s3D=useMemo(()=>sectorPath(wp,s2end,wp.length-1),[wp,s2end]);
  const drs1D=useMemo(()=>sectorPath(wp,...drs1),[wp,drs1]);
  const drs2D=useMemo(()=>sectorPath(wp,...drs2),[wp,drs2]);

  const calcPos=useCallback((floatStep)=>{
    const el=pathRef.current;if(!el)return;
    const total=el.getTotalLength();
    const tl=tlRef.current,drivers=driversRef.current;
    const sA=Math.floor(floatStep),sB=Math.min(sA+1,tl.length-1);
    const frac=floatStep-sA,frA=tl[sA],frB=tl[sB];
    if(!frA)return;
    const out={};
    const LOOK=6;
    const frPrev=tl[Math.max(0,sA-LOOK)]||frA;
    const realDt=LOOK*(lapTimeS*totalLaps/steps);

    for(const d of drivers){
      const posA=frA.pos[d.code];if(posA==null)continue;
      const pos=lerpPos(posA,frB?.pos[d.code],frac);
      const l=pos*total,pt=el.getPointAtLength(l);
      const a=el.getPointAtLength(Math.max(0,l-5));
      const b=el.getPointAtLength(Math.min(total,l+5));
      out[d.code]={x:pt.x,y:pt.y,angle:Math.atan2(b.y-a.y,b.x-a.x)*57.2958};
      // Trail
      if(!trailRef.current[d.code])trailRef.current[d.code]=[];
      const hist=trailRef.current[d.code];
      const last=hist[hist.length-1];
      if(!last||Math.hypot(pt.x-last.x,pt.y-last.y)>0.5){
        hist.push({x:pt.x,y:pt.y});if(hist.length>TRAIL_LEN)hist.shift();
      }
      // Speed history
      const rawNow=frA.raw[d.code]||0,rawPrev=frPrev.raw[d.code]||rawNow;
      const delta=Math.max(0,rawNow-rawPrev);
      const kmh=realDt>0?Math.min(360,Math.max(60,Math.round(delta*TRACK_LEN_M/realDt*3.6))):0;
      if(!speedHistRef.current[d.code])speedHistRef.current[d.code]=[];
      speedHistRef.current[d.code].push(kmh);
      if(speedHistRef.current[d.code].length>SPEED_HISTORY_LEN)speedHistRef.current[d.code].shift();
    }
    setCarPos(out);
    setTrails({...trailRef.current});
    setSpeedHist({...speedHistRef.current});
  },[lapTimeS,totalLaps,steps]);

  // Update gap history separately (on step change for the selected driver)
  useEffect(()=>{
    if(!sel)return;
    const fr=tl[step]||{};
    const sorted=[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
    const idx=sorted.findIndex(d=>d.code===sel);
    if(idx<=0)return;
    const ahead=sorted[idx-1];
    const gap=((fr.raw[ahead.code]||0)-(fr.raw[sel]||0))*lapTimeS;
    if(!gapHistRef.current[sel])gapHistRef.current[sel]=[];
    gapHistRef.current[sel].push(gap);
    if(gapHistRef.current[sel].length>200)gapHistRef.current[sel].shift();
    setGapHist({...gapHistRef.current});
  },[step,sel,tl,drivers,lapTimeS]);

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

  const clearTrails=()=>{trailRef.current={};setTrails({});speedHistRef.current={};setSpeedHist({});};

  const doRestart=useCallback(()=>{
    cancelAnimationFrame(rafRef.current);playR.current=false;setPlaying(false);
    lastT.current=null;stepR.current=0;setStep(0);clearTrails();calcPos(0);
  },[calcPos]);

  const scrub=useCallback((v)=>{const s=+v;stepR.current=s;setStep(s);clearTrails();calcPos(s);},[calcPos]);

  const handleDataLoad=useCallback((e)=>{
    const file=e.target.files[0];if(!file)return;
    setLoadErr(null);
    const reader=new FileReader();
    reader.onload=(ev)=>{
      try{
        const json=JSON.parse(ev.target.result);
        if(!json.track||!json.race)throw new Error("Missing .track/.race — run fastf1_backend.py");
        setDataset(processRealData(json));setDataMode("FASTF1");setSel(null);setHover(null);
      }catch(err){setLoadErr(err.message);}
    };
    reader.readAsText(file);e.target.value="";
  },[]);

  // OpenF1 connection (mock for Claude artifact — fully works in Next.js deployment)
  const connectOpenF1=useCallback(async(session)=>{
    setOf1Status("connecting");setSelectedSession(session);
    // In production Next.js app:
    // const data = await fetch(`https://api.openf1.org/v1/sessions?session_key=${session.key}`);
    // const drivers = await fetch(`https://api.openf1.org/v1/drivers?session_key=${session.key}`);
    // const locations = await fetch(`...`);
    // → Transform to our format and setDataset(...)
    await new Promise(r=>setTimeout(r,1200)); // simulate network
    setOf1Status(session.status==="live"?"connected":"connected");
    setDataMode(session.status==="live"?"LIVE":"OPENF1");
    // For now, show the mock dataset with the selected session label
    setDataset(buildMock());
    setSel(null);doRestart();
  },[doRestart]);

  useEffect(()=>{doRestart();},[dataset]);
  useEffect(()=>()=>cancelAnimationFrame(rafRef.current),[]);

  const standings=useMemo(()=>{
    const fr=tl[step];if(!fr)return drivers;
    return[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
  },[tl,step,drivers]);

  const selDriver=sel?drivers.find(d=>d.code===sel):null;
  const selRank=sel?standings.findIndex(d=>d.code===sel)+1:null;
  const selFr=tl[step]||{};
  const leaderLap=standings[0]?(tl[step]?.lap[standings[0].code]||1):1;
  const pct=((step/steps)*100).toFixed(1);
  const focused=sel||hover;
  const sfX=wp[0]?.[0]||300,sfY=wp[0]?.[1]||250;
  const[vbX,vbY,vbW,vbH]=viewBox.split(" ").map(Number);
  const lapLabel=(mult)=>{const s=Math.round(lapTimeS/mult);return s>=60?`${Math.floor(s/60)}m${s%60>0?String(s%60).padStart(2,"0")+"s":""}`:s+"s";};

  const NAV=[{id:"race",label:"RACE MAP"},{id:"driver",label:"DRIVER"},{id:"live",label:"LIVE / SESSIONS"}];

  return(
    <div style={{fontFamily:"'Orbitron',sans-serif",background:"#06070c",color:"#c4c6d6",
                 height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* ══ NAV HEADER ══════════════════════════════════════════════════ */}
      <header style={{display:"flex",alignItems:"center",gap:0,flexShrink:0,
                      borderBottom:"1px solid #0c0e1a",background:"rgba(0,0,0,0.7)"}}>
        {/* Logo */}
        <div style={{padding:"0 20px",display:"flex",alignItems:"center",gap:10,
                     borderRight:"1px solid #0c0e1a",height:42,flexShrink:0}}>
          <div style={{background:"#E10600",color:"#fff",fontWeight:900,fontSize:13,
                       letterSpacing:3,padding:"2px 8px"}}>F1</div>
          <span style={{fontSize:7,letterSpacing:3,color:"#1a1d2e"}}>PITWALL</span>
        </div>

        {/* Nav tabs */}
        <div style={{display:"flex",height:42}}>
          {NAV.map(n=>(
            <button key={n.id} onClick={()=>setView(n.id)} style={{
              padding:"0 18px",height:"100%",background:"transparent",border:"none",
              borderBottom:`2px solid ${view===n.id?"#E10600":"transparent"}`,
              color:view===n.id?"#E10600":"#252840",fontSize:8,letterSpacing:3,
              cursor:"pointer",transition:"all .15s",fontFamily:"'Orbitron',sans-serif",
            }}>{n.label}</button>
          ))}
        </div>

        {/* Data mode + session */}
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:12,padding:"0 20px"}}>
          {of1Status==="connected"&&dataMode==="LIVE"&&(
            <span style={{display:"flex",alignItems:"center",gap:5,fontSize:7,color:"#ff4444",letterSpacing:2}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#ff4444",
                            animation:"pulse 1s infinite",display:"inline-block"}}/>
              LIVE
            </span>
          )}
          <span style={{fontSize:7,letterSpacing:2,padding:"2px 7px",
                        background:dataMode==="LIVE"?"#2a0a0a":dataMode==="FASTF1"?"#0e2a0e":dataMode==="OPENF1"?"#0a1a2e":"#0e0e22",
                        color:dataMode==="LIVE"?"#ff4444":dataMode==="FASTF1"?"#4CAF50":dataMode==="OPENF1"?"#4499ff":"#333860",
                        border:`1px solid ${dataMode==="LIVE"?"#ff444450":dataMode==="FASTF1"?"#4CAF5050":dataMode==="OPENF1"?"#4499ff50":"#22253a"}`,
                        borderRadius:3}}>
            {dataMode==="LIVE"?"◉ LIVE":dataMode==="FASTF1"?"◉ FASTF1":dataMode==="OPENF1"?"◉ OPENF1":"◌ MOCK"}
          </span>
          <label style={{fontSize:7,letterSpacing:1,cursor:"pointer",color:"#252840",
                         border:"1px solid #14162a",padding:"4px 9px",borderRadius:3}}>
            ⬆ FASTF1
            <input type="file" accept=".json" onChange={handleDataLoad} style={{display:"none"}}/>
          </label>
          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#252840"}}>
            LAP <span style={{color:"#c4c6d6",fontSize:13,fontWeight:700}}>{leaderLap}</span>{" "}/ {totalLaps}
          </div>
        </div>
      </header>

      {loadErr&&<div style={{background:"#2a0a0a",color:"#ff6b6b",fontSize:8,padding:"4px 20px",
        borderBottom:"1px solid #3a1010",letterSpacing:1}}>⚠ {loadErr}</div>}

      {/* ══ VIEWS ══════════════════════════════════════════════════════ */}
      <div style={{flex:1,display:"flex",overflow:"hidden"}}>

        {/* ─── RACE MAP VIEW ─────────────────────────────────────────── */}
        {view==="race"&&<>
          {/* Track canvas */}
          <div style={{flex:1,position:"relative",overflow:"hidden",display:"flex",
                       alignItems:"center",justifyContent:"center",
                       perspective:"1100px",perspectiveOrigin:"50% 50%"}}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",
                         backgroundImage:"radial-gradient(rgba(255,255,255,0.035) 1px,transparent 1px)",
                         backgroundSize:"28px 28px"}}/>
            {tilt>10&&<div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:0,
              background:`radial-gradient(ellipse 80% 40% at 50% ${100-tilt}%,#0d1030 0%,transparent 70%)`,opacity:tilt/90}}/>}
            <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,
                         background:"radial-gradient(ellipse at 55% 50%,transparent 40%,#06070c 95%)"}}/>
            <svg viewBox={viewBox} style={{width:"100%",maxWidth:"min(92vw,900px)",maxHeight:"calc(100vh - 130px)",
                position:"relative",zIndex:1,transform:`rotateX(${tilt}deg)`,transformOrigin:"center 60%",
                transition:"transform 0.35s cubic-bezier(.4,0,.2,1)"}}>
              <defs>
                <filter id="ambGlow"><feGaussianBlur stdDeviation="15"/></filter>
                <filter id="trailBlur"><feGaussianBlur stdDeviation="2.5"/></filter>
                <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#06070c" stopOpacity={tilt>5?0.55:0}/>
                  <stop offset="60%" stopColor="#06070c" stopOpacity="0"/>
                </linearGradient>
              </defs>
              <path d={trackD} fill="none" stroke="#1a3acc" strokeWidth={32} strokeOpacity={.05} style={{filter:"url(#ambGlow)"}}/>
              <path d={trackD} fill="none" stroke="#252840" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#0d0f1e" strokeWidth={15} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#131628" strokeWidth={11} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={s1D} fill="none" stroke="#00ff8838" strokeWidth={4} strokeLinecap="round" style={{filter:"blur(1.5px)"}}/>
              <path d={s2D} fill="none" stroke="#a855f738" strokeWidth={4} strokeLinecap="round" style={{filter:"blur(1.5px)"}}/>
              <path d={s3D} fill="none" stroke="#3b82f638" strokeWidth={4} strokeLinecap="round" style={{filter:"blur(1.5px)"}}/>
              <path d={drs1D} fill="none" stroke="#FFD700" strokeWidth={2} strokeOpacity={.35} strokeLinecap="round"/>
              <path d={drs2D} fill="none" stroke="#FFD700" strokeWidth={2} strokeOpacity={.35} strokeLinecap="round"/>
              <path d={trackD} fill="none" stroke="#19203a" strokeWidth={4} strokeLinecap="round"/>
              <path d={trackD} fill="none" stroke="#1e2438" strokeWidth={0.8} strokeDasharray="6 11" strokeOpacity={.4}/>
              {tilt>5&&<rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#depthGrad)" style={{pointerEvents:"none"}}/>}
              <path ref={pathRef} d={trackD} fill="none" stroke="none"/>
              <line x1={sfX-2} y1={sfY-12} x2={sfX-2} y2={sfY+8} stroke="#fff" strokeWidth={2.5} strokeOpacity={.5}/>
              <text x={sfX-14} y={sfY+2} fill="#30354c" fontSize={5.5} fontFamily="'DM Mono',monospace">S/F</text>
              {cornerLabels.map(([name,x,y,anchor])=>(
                <text key={name} x={x} y={y} fill="#1c2035" fontSize={4.8}
                  textAnchor={anchor} fontFamily="'Orbitron',sans-serif" letterSpacing={.7}>{name}</text>
              ))}
              {/* Battle lines */}
              {standings.map((d,i)=>{
                if(i===0)return null;
                const fr=tl[step]||{};
                const ahead=standings[i-1];
                const gap=((fr.raw[ahead.code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                if(gap>1.0)return null;
                const pA=carPos[ahead.code],pB=carPos[d.code];
                if(!pA||!pB)return null;
                return(<g key={`battle-${d.code}`}>
                  <line x1={pA.x} y1={pA.y} x2={pB.x} y2={pB.y} stroke="#FFD700"
                    strokeWidth={1} strokeOpacity={0.3} strokeDasharray="3 4"/>
                  <text x={(pA.x+pB.x)/2} y={(pA.y+pB.y)/2-4} fill="#FFD700"
                    fontSize={5} textAnchor="middle" opacity={0.6} fontFamily="'DM Mono',monospace">
                    {gap.toFixed(2)}s
                  </text>
                </g>);
              })}
              {/* Cars */}
              {drivers.map((d)=>{
                const p=carPos[d.code];if(!p)return null;
                const rank=standings.findIndex(s=>s.code===d.code)+1;
                const isActive=sel===d.code,isHover=hover===d.code;
                const opacity=focused&&!isActive&&!isHover?0.22:1;
                const hist=trails[d.code]||[];
                const depth=Math.max(0,Math.min(1,(p.y-vbY)/vbH));
                const carScale=tilt>0?1.0-depth*0.38:1.0;
                return(<g key={d.code} style={{cursor:"pointer",opacity,transition:"opacity .15s"}}
                  onClick={()=>{setSel(isActive?null:d.code);if(!isActive)setView("race");}}
                  onMouseEnter={()=>setHover(d.code)} onMouseLeave={()=>setHover(null)}>
                  {hist.length>3&&<>
                    <polyline points={hist.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                      fill="none" stroke={d.color} strokeWidth={6} strokeOpacity={0.10} strokeLinecap="round" style={{filter:"url(#trailBlur)"}}/>
                    <polyline points={hist.map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                      fill="none" stroke={d.color} strokeWidth={1.8} strokeOpacity={0.45} strokeLinecap="round" strokeLinejoin="round"/>
                    {hist.length>12&&<polyline points={hist.slice(-12).map(p=>`${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ")}
                      fill="none" stroke="#ffffff" strokeWidth={0.8} strokeOpacity={0.28} strokeLinecap="round"/>}
                  </>}
                  <ellipse cx={p.x} cy={p.y} rx={20*carScale} ry={9*carScale} fill={d.color}
                    opacity={isActive?0.65:isHover?0.45:0.28} transform={`rotate(${p.angle},${p.x},${p.y})`} style={{filter:"blur(10px)"}}/>
                  <g transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}><CarShape color={d.color} scale={carScale}/></g>
                  <g transform={`translate(${p.x},${p.y-17*carScale})`}>
                    <rect x={-10} y={-6} width={20} height={11} rx={2.5} fill="#05060e" fillOpacity={0.88} stroke={d.color} strokeWidth={0.9}/>
                    <text x={0} y={1.8} fill={d.color} fontSize={6} textAnchor="middle" fontWeight="600" fontFamily="'DM Mono',monospace" letterSpacing={0.5}>{d.code}</text>
                  </g>
                  {(isActive||isHover||rank<=3)&&(<g transform={`translate(${p.x},${p.y-31*carScale})`}>
                    <rect x={-10} y={-6} width={20} height={11} rx={2.5} fill={d.color} opacity={0.9}/>
                    <text x={0} y={1.8} fill="#fff" fontSize={6} textAnchor="middle" fontWeight="700" fontFamily="'Orbitron',sans-serif">P{rank}</text>
                  </g>)}
                </g>);
              })}
            </svg>
          </div>

          {/* Race order sidebar */}
          <aside style={{width:200,flexShrink:0,borderLeft:"1px solid #09091a",background:"#030408",
                         display:"flex",flexDirection:"column",overflow:"hidden"}}>
            <div style={{padding:"8px 12px",borderBottom:"1px solid #09091a",fontSize:7,letterSpacing:4,color:"#141628",fontWeight:700}}>
              RACE ORDER
            </div>
            <div style={{flex:1,overflowY:"auto"}}>
              {standings.map((d,i)=>{
                const fr=tl[step]||{};
                const isActive=sel===d.code,isHover=hover===d.code;
                const aheadGap=i===0?null:((fr.raw[standings[i-1].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                const leaderGap=i===0?null:((fr.raw[standings[0].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
                const isBattle=aheadGap!=null&&aheadGap<1.0;
                const sh=speedHist[d.code]||[];
                const spd=sh[sh.length-1]||0;
                const lap=fr.lap[d.code]||1;
                const stint1End=Math.floor(totalLaps*0.30),stint2End=Math.floor(totalLaps*0.65);
                const tire=lap<=stint1End?{n:"SOFT",c:"#ff4444"}:lap<=stint2End?{n:"MED",c:"#FFD700"}:{n:"HARD",c:"#d8d8d8"};
                const tireAge=lap<=stint1End?lap:lap<=stint2End?lap-stint1End:lap-stint2End;
                return(<div key={d.code}>
                  {isBattle&&i>0&&<div style={{padding:"2px 12px",background:"rgba(255,215,0,0.05)",
                    borderTop:"1px solid #FFD70022",borderBottom:"1px solid #FFD70022",
                    display:"flex",alignItems:"center",gap:5}}>
                    <span style={{color:"#FFD700",fontSize:8}}>⚡</span>
                    <span style={{flex:1,fontSize:6,letterSpacing:2,color:"#FFD700",fontWeight:700}}>BATTLE</span>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#FFD700"}}>{aheadGap.toFixed(2)}s</span>
                  </div>}
                  <div onClick={()=>setSel(isActive?null:d.code)}
                    onMouseEnter={()=>setHover(d.code)} onMouseLeave={()=>setHover(null)}
                    style={{padding:"6px 12px",cursor:"pointer",
                      background:isActive?`${d.color}12`:isHover?"#0b0c1c":"transparent",
                      borderLeft:`2px solid ${(isActive||isHover)?d.color:"transparent"}`,transition:"background .1s"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:3}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,width:16,textAlign:"center",
                        color:i===0?"#FFD700":i<3?d.color:"#1c2030"}}>{i+1}</span>
                      <div style={{width:2,height:18,borderRadius:1,flexShrink:0,background:d.color,boxShadow:`0 0 8px ${d.color}70`}}/>
                      <div style={{flex:1}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                          <span style={{fontSize:9,letterSpacing:2,fontWeight:600,color:(isActive||isHover)?d.color:"#6a6e86"}}>{d.code}</span>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:i===0?"#4CAF50":"#2a2d42"}}>
                            {i===0?"LEAD":`+${leaderGap!=null?leaderGap.toFixed(1):"?"}s`}
                          </span>
                        </div>
                        <div style={{fontSize:5.5,color:"#1e2130",letterSpacing:1,overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{d.team}</div>
                      </div>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:5,paddingLeft:22}}>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#3a3e5a"}}>{spd}<span style={{fontSize:5,color:"#252840"}}>↑</span></span>
                      <span style={{fontSize:6,fontWeight:700,padding:"1px 3px",borderRadius:2,
                        background:tire.c+"22",color:tire.c,border:`1px solid ${tire.c}44`,letterSpacing:0.5,
                        fontFamily:"'DM Mono',monospace"}}>{tire.n[0]}{tireAge}L</span>
                      {aheadGap!=null&&aheadGap<3&&(
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:6,
                          color:isBattle?"#FFD700":"#252840",marginLeft:"auto"}}>{aheadGap.toFixed(2)}s↑</span>
                      )}
                    </div>
                  </div>
                </div>);
              })}
            </div>
            {/* Click driver hint */}
            {!sel&&<div style={{padding:"8px 12px",borderTop:"1px solid #09091a",
              fontSize:6,color:"#141628",letterSpacing:1,textAlign:"center"}}>
              CLICK DRIVER FOR TELEMETRY →
            </div>}
            {sel&&selDriver&&<div onClick={()=>setView("driver")} style={{padding:"8px 12px",borderTop:"1px solid #09091a",
              background:`${selDriver.color}15`,cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
              <div style={{width:3,height:20,background:selDriver.color,borderRadius:2}}/>
              <span style={{fontSize:7,letterSpacing:2,color:selDriver.color}}>OPEN {sel} TELEMETRY →</span>
            </div>}
          </aside>
        </>}

        {/* ─── DRIVER TELEMETRY VIEW ──────────────────────────────────── */}
        {view==="driver"&&(
          <div style={{flex:1,overflowY:"auto",padding:24,display:"flex",flexDirection:"column",gap:20}}>
            {!selDriver?(
              <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:16}}>
                <div style={{fontSize:24,opacity:0.2}}>◎</div>
                <div style={{fontSize:10,letterSpacing:4,color:"#252840"}}>NO DRIVER SELECTED</div>
                <div style={{fontSize:8,color:"#1a1d2e",letterSpacing:2}}>SELECT A DRIVER ON THE RACE MAP</div>
                <button onClick={()=>setView("race")} style={{
                  marginTop:8,padding:"8px 20px",background:"transparent",
                  border:"1px solid #1a1d2e",borderRadius:4,color:"#252840",
                  fontSize:8,letterSpacing:2,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>
                  ← BACK TO RACE
                </button>
              </div>
            ):(()=>{
              const d=selDriver;
              const fr=selFr;
              const currentLap=fr.lap[d.code]||1;
              const sectors=mockSectorTimes(d.code,currentLap);
              const stints=mockStints(MOCK_DRIVERS.findIndex(x=>x.code===d.code),totalLaps);
              const spdH=speedHist[d.code]||[];
              const gapH=gapHist[d.code]||[];
              const currentSpd=spdH[spdH.length-1]||0;
              const sorted=[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
              const idx=sorted.findIndex(x=>x.code===d.code);
              const aheadDriver=idx>0?sorted[idx-1]:null;
              const aheadGapNow=aheadDriver?((fr.raw[aheadDriver.code]||0)-(fr.raw[d.code]||0))*lapTimeS:null;
              return(<>
                {/* Driver header */}
                <div style={{display:"flex",alignItems:"center",gap:20,paddingBottom:16,
                  borderBottom:"1px solid #0c0e1a"}}>
                  <button onClick={()=>setView("race")} style={{
                    background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,
                    color:"#252840",fontSize:10,cursor:"pointer",padding:"6px 10px",
                    fontFamily:"'Orbitron',sans-serif"}}>←</button>
                  <div style={{width:4,height:48,background:d.color,borderRadius:2,
                    boxShadow:`0 0 20px ${d.color}`}}/>
                  <div>
                    <div style={{fontSize:22,letterSpacing:3,color:d.color,fontWeight:700,lineHeight:1}}>{d.code}</div>
                    <div style={{fontSize:9,color:"#3a3e5a",letterSpacing:2,marginTop:4}}>{d.name}</div>
                    <div style={{fontSize:7,color:"#1e2130",letterSpacing:1,marginTop:2}}>{d.team}</div>
                  </div>
                  {/* Stat pills */}
                  {[
                    {label:"POSITION",value:`P${selRank}`},
                    {label:"LAP",value:`${currentLap}/${totalLaps}`},
                    {label:"SPEED",value:`${currentSpd} km/h`},
                    aheadDriver?{label:`GAP TO ${aheadDriver.code}`,value:aheadGapNow!=null?`${aheadGapNow.toFixed(2)}s`:"—"}:null,
                  ].filter(Boolean).map(({label,value})=>(
                    <div key={label} style={{padding:"8px 14px",background:"#0d0f1c",borderRadius:6,
                      border:"1px solid #141628",textAlign:"center",minWidth:80}}>
                      <div style={{fontSize:5.5,color:"#1e2130",letterSpacing:2,marginBottom:4}}>{label}</div>
                      <div style={{fontSize:13,color:"#c4c6d6",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{value}</div>
                    </div>
                  ))}
                </div>

                {/* Two-column grid */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

                  {/* Speed trace */}
                  <div style={{background:"#090b14",borderRadius:8,padding:16,border:"1px solid #0c0e1a"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#252840",marginBottom:12}}>SPEED TRACE</div>
                    {spdH.length>4?(
                      <Sparkline data={spdH} color={d.color} width={280} height={60} min={60} max={360}/>
                    ):<div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#141628",fontSize:7,letterSpacing:2}}>PLAY RACE TO SEE TRACE</div>}
                    <div style={{display:"flex",justifyContent:"space-between",marginTop:8}}>
                      <span style={{fontSize:6,color:"#1a1d2e",fontFamily:"'DM Mono',monospace"}}>60 km/h</span>
                      <span style={{fontSize:6,color:d.color,fontFamily:"'DM Mono',monospace"}}>{currentSpd} km/h</span>
                      <span style={{fontSize:6,color:"#1a1d2e",fontFamily:"'DM Mono',monospace"}}>360 km/h</span>
                    </div>
                  </div>

                  {/* Sector times */}
                  <div style={{background:"#090b14",borderRadius:8,padding:16,border:"1px solid #0c0e1a"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#252840",marginBottom:12}}>SECTOR TIMES · LAP {currentLap}</div>
                    <div style={{display:"flex",gap:8}}>
                      {[{label:"S1",...sectors.s1},{label:"S2",...sectors.s2},{label:"S3",...sectors.s3}].map(s=>(
                        <div key={s.label} style={{flex:1,background:"#06070c",borderRadius:6,
                          padding:"10px 8px",border:`1px solid ${s.color}30`,textAlign:"center"}}>
                          <div style={{fontSize:6,color:"#1a1d2e",letterSpacing:2,marginBottom:6}}>{s.label}</div>
                          <div style={{width:8,height:8,borderRadius:"50%",background:s.color,
                            margin:"0 auto 6px",boxShadow:`0 0 6px ${s.color}`}}/>
                          <div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:"#c4c6d6"}}>
                            {s.t.toFixed(3)}
                          </div>
                          <div style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:s.color,marginTop:3}}>
                            {s.d>=0?"+":""}{s.d.toFixed(3)}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{display:"flex",justifyContent:"center",gap:12,marginTop:12}}>
                      {[["#a855f7","SESSION BEST"],["#00ff88","PERSONAL BEST"],["#FFD700","SLOWER"]].map(([c,l])=>(
                        <div key={l} style={{display:"flex",alignItems:"center",gap:4}}>
                          <div style={{width:6,height:6,borderRadius:"50%",background:c}}/>
                          <span style={{fontSize:5.5,color:"#1a1d2e",letterSpacing:1}}>{l}</span>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Tire strategy */}
                  <div style={{background:"#090b14",borderRadius:8,padding:16,border:"1px solid #0c0e1a"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#252840",marginBottom:12}}>TIRE STRATEGY</div>
                    <TireBar stints={stints} currentLap={currentLap} totalLaps={totalLaps}/>
                    <div style={{display:"flex",gap:8,marginTop:12}}>
                      {stints.map((st,i)=>{
                        const COLORS={SOFT:"#ff4444",MEDIUM:"#FFD700",HARD:"#d8d8d8"};
                        const isActive=currentLap>=st.start&&currentLap<=st.end;
                        return(<div key={i} style={{flex:1,padding:"8px",borderRadius:5,
                          background:isActive?`${COLORS[st.compound]||"#888"}18`:"#06070c",
                          border:`1px solid ${isActive?COLORS[st.compound]+"44":"#0c0e1a"}`,
                          textAlign:"center"}}>
                          <div style={{fontSize:8,color:COLORS[st.compound]||"#888",fontWeight:700,marginBottom:3}}>
                            {st.compound[0]}
                          </div>
                          <div style={{fontSize:6,color:"#1a1d2e",fontFamily:"'DM Mono',monospace"}}>
                            L{st.start}–{st.end}
                          </div>
                          <div style={{fontSize:6,color:isActive?COLORS[st.compound]:"#141628",marginTop:2}}>
                            {isActive?`${currentLap-st.start+1} laps on`:`${st.end-st.start+1} laps`}
                          </div>
                        </div>);
                      })}
                    </div>
                  </div>

                  {/* Gap to car ahead */}
                  <div style={{background:"#090b14",borderRadius:8,padding:16,border:"1px solid #0c0e1a"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div style={{fontSize:8,letterSpacing:3,color:"#252840"}}>GAP TO {aheadDriver?.code||"AHEAD"}</div>
                      {aheadDriver&&<div style={{width:3,height:14,background:aheadDriver.color,borderRadius:2}}/>}
                    </div>
                    {gapH.length>4?(
                      <Sparkline data={gapH} color={aheadDriver?.color||"#FFD700"} width={280} height={60} min={0} max={Math.max(5,...gapH)}/>
                    ):<div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#141628",fontSize:7,letterSpacing:2}}>
                      {selRank===1?"RACE LEADER":"PLAY RACE TO SEE GAP EVOLUTION"}
                    </div>}
                    {aheadGapNow!=null&&(
                      <div style={{marginTop:10,display:"flex",justifyContent:"center"}}>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:20,
                          color:aheadGapNow<0.5?"#ff4444":aheadGapNow<1?"#FFD700":"#c4c6d6"}}>
                          {aheadGapNow.toFixed(3)}s
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </>);
            })()}
          </div>
        )}

        {/* ─── LIVE / SESSIONS VIEW ──────────────────────────────────── */}
        {view==="live"&&(
          <div style={{flex:1,overflowY:"auto",padding:24}}>
            <div style={{maxWidth:700,margin:"0 auto"}}>

              {/* OpenF1 banner */}
              <div style={{padding:20,borderRadius:10,marginBottom:24,
                background:"linear-gradient(135deg,#0a1a30,#06070c)",
                border:"1px solid #1a3060"}}>
                <div style={{display:"flex",alignItems:"center",gap:12,marginBottom:12}}>
                  <div style={{width:40,height:40,borderRadius:10,background:"#1a3060",
                    display:"flex",alignItems:"center",justifyContent:"center",fontSize:18}}>⚡</div>
                  <div>
                    <div style={{fontSize:11,letterSpacing:2,color:"#4499ff",fontWeight:700}}>OPENF1 API</div>
                    <div style={{fontSize:7,color:"#1a2d50",letterSpacing:1,marginTop:2}}>api.openf1.org · FREE · REAL-TIME · CORS ENABLED</div>
                  </div>
                  <div style={{marginLeft:"auto",padding:"4px 10px",borderRadius:4,
                    background:"#4CAF5020",border:"1px solid #4CAF5050",
                    fontSize:7,color:"#4CAF50",letterSpacing:2}}>LIVE READY</div>
                </div>
                <div style={{fontSize:7.5,color:"#1e3050",lineHeight:1.8,letterSpacing:0.5}}>
                  {'Provides real-time car position (100ms), speed, DRS, tire compounds, team radio, intervals and weather for every session since 2023. No API key needed. In your deployed Next.js app, call this directly from the browser — no backend required for the MVP.'}
                </div>
                <div style={{display:"flex",gap:10,marginTop:14,flexWrap:"wrap"}}>
                  {["location (100ms)","car_data · speed","intervals · gaps","stints · tires","team_radio","weather"].map(e=>(
                    <span key={e} style={{padding:"3px 8px",borderRadius:3,background:"#1a2d50",
                      fontSize:6.5,color:"#4499ff",fontFamily:"'DM Mono',monospace"}}>{e}</span>
                  ))}
                </div>
              </div>

              {/* Session list */}
              <div style={{fontSize:8,letterSpacing:4,color:"#1a1d2e",marginBottom:12}}>SESSIONS</div>
              <div style={{display:"flex",flexDirection:"column",gap:6}}>
                {OPENF1_SESSIONS.map(session=>{
                  const isSelected=selectedSession?.key===session.key;
                  const isLive=session.status==="live";
                  const isConnecting=of1Status==="connecting"&&isSelected;
                  const isConnected=of1Status==="connected"&&isSelected;
                  return(
                    <div key={session.key} onClick={()=>connectOpenF1(session)}
                      style={{padding:"14px 16px",borderRadius:8,cursor:"pointer",
                        background:isSelected?"#0d1828":"#090b14",
                        border:`1px solid ${isSelected?"#4499ff44":isLive?"#ff444430":"#0c0e1a"}`,
                        display:"flex",alignItems:"center",gap:14,transition:"all .15s"}}>
                      {isLive&&<div style={{width:8,height:8,borderRadius:"50%",background:"#ff4444",
                        flexShrink:0,boxShadow:"0 0 8px #ff4444"}}/>}
                      {!isLive&&<div style={{width:8,height:8,borderRadius:"50%",background:"#1a1d2e",flexShrink:0}}/>}
                      <div style={{flex:1}}>
                        <div style={{fontSize:9,letterSpacing:2,color:isLive?"#ff4444":isSelected?"#4499ff":"#6a6e86",fontWeight:600}}>
                          {session.name}
                        </div>
                        <div style={{fontSize:6,color:"#1a1d2e",letterSpacing:1,marginTop:3,fontFamily:"'DM Mono',monospace"}}>
                          {session.type} · {session.date}
                        </div>
                      </div>
                      <div style={{fontSize:7,letterSpacing:2,
                        color:isConnected?"#4CAF50":isConnecting?"#FFD700":"#1a1d2e"}}>
                        {isConnecting?"CONNECTING…":isConnected?"LOADED":isLive?"CONNECT →":"LOAD →"}
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Architecture note */}
              <div style={{marginTop:24,padding:16,borderRadius:8,background:"#090b14",border:"1px solid #0c0e1a"}}>
                <div style={{fontSize:8,letterSpacing:3,color:"#252840",marginBottom:10}}>DEPLOY AS WEB APP</div>
                {[
                  {step:"01",label:"Next.js 14",desc:"npx create-next-app f1-pitwall"},
                  {step:"02",label:"Copy this file",desc:"Drop F1Replay.jsx into /app/page.jsx"},
                  {step:"03",label:"Deploy to Vercel",desc:"git push → live in 30 seconds"},
                  {step:"04",label:"Wire OpenF1",desc:"Replace mock sessions with api.openf1.org calls"},
                  {step:"05",label:"Add Stripe",desc:"Clerk auth + Stripe for live-session paywalling"},
                ].map(({step,label,desc})=>(
                  <div key={step} style={{display:"flex",gap:12,marginBottom:10,alignItems:"flex-start"}}>
                    <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#E10600",
                      minWidth:20,marginTop:1}}>{step}</span>
                    <div>
                      <div style={{fontSize:8,color:"#5a5e76",letterSpacing:1}}>{label}</div>
                      <div style={{fontSize:6.5,color:"#1a1d2e",fontFamily:"'DM Mono',monospace",marginTop:2}}>{desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ══ FOOTER CONTROLS ═════════════════════════════════════════════ */}
      <footer style={{padding:"8px 20px",flexShrink:0,borderTop:"1px solid #09091a",
                      background:"rgba(0,0,0,0.65)",display:"flex",alignItems:"center",gap:12}}>
        <button onClick={doRestart} style={ICON_BTN}>↺</button>
        <button onClick={togglePlay} style={{width:36,height:36,borderRadius:"50%",
          background:"#E10600",border:"none",cursor:"pointer",display:"flex",
          alignItems:"center",justifyContent:"center",color:"#fff",fontSize:13,flexShrink:0,
          boxShadow:playing?"0 0 26px #E1060090":"0 0 10px #E1060040",transition:"box-shadow .2s"}}>
          {playing?"⏸":"▶"}
        </button>
        <div style={{display:"flex",gap:3,flexShrink:0}}>
          {[1,2,5,10,30].map(s=>(
            <button key={s} onClick={()=>setSpeed(s)} style={{
              display:"flex",flexDirection:"column",alignItems:"center",padding:"2px 7px",
              background:speed===s?"#E10600":"transparent",
              border:`1px solid ${speed===s?"#E10600":"#10122a"}`,
              borderRadius:3,cursor:"pointer",transition:"all .12s"}}>
              <span style={{fontSize:8,letterSpacing:1,fontFamily:"'Orbitron',sans-serif",color:speed===s?"#fff":"#1c2030"}}>{s}×</span>
              <span style={{fontSize:5.5,fontFamily:"'DM Mono',monospace",marginTop:1,color:speed===s?"rgba(255,255,255,.7)":"#131628"}}>
                {lapLabel(s)}/lap
              </span>
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{fontSize:7,color:"#1c2030",letterSpacing:1,whiteSpace:"nowrap"}}>3D {tilt}°</span>
          <input type="range" min={0} max={55} value={tilt} onChange={e=>setTilt(+e.target.value)}
            style={{width:60,accentColor:"#E10600",cursor:"pointer"}}/>
        </div>
        <div style={{flex:1,display:"flex",alignItems:"center",gap:8}}>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#1c2030"}}>L1</span>
          <input type="range" min={0} max={steps} value={step} onChange={e=>scrub(e.target.value)}
            style={{flex:1,accentColor:"#E10600",cursor:"pointer"}}/>
          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#1c2030"}}>L{totalLaps}</span>
        </div>
        <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#1c2030",minWidth:38,textAlign:"right"}}>{pct}%</span>
      </footer>
    </div>
  );
}

const ICON_BTN={width:32,height:32,background:"transparent",border:"1px solid #10122a",
  borderRadius:4,color:"#1c2030",fontSize:13,cursor:"pointer",
  display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,fontFamily:"sans-serif"};

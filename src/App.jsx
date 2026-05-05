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

// Smooth lerp — clamps max movement per frame to prevent pit-stop teleporting
function lerpPos(a, b, t, maxDelta = 0.04) {
  if (b == null) return a;
  let diff = b - a;
  if (diff < -0.5) diff += 1;  // lap wrap
  if (diff >  0.5) diff -= 1;
  // Clamp — prevents large jumps at pit entry/exit
  const clamped = Math.max(-maxDelta, Math.min(maxDelta, diff * t));
  return ((a + clamped) % 1 + 1) % 1;
}

// ─── STATIC DRIVER INFO ───────────────────────────────────────────────────────
// Nationality, DOB, birthplace for the full 2024/2026 grid
const DRIVER_INFO = {
  // ── Red Bull Racing ───────────────────────────────────────────────────────
  VER: { nationality:"🇳🇱 Dutch",      dob:"1997-09-30", birthplace:"Hasselt, Belgium",           bio:"4× World Champion (2021-2024). Most dominant back-to-back championship run in modern F1." },
  HAD: { nationality:"🇫🇷 French",     dob:"2004-09-28", birthplace:"Paris, France",              bio:"Isack Hadjar. French-Algerian. 2024 F2 runner-up. Joined Red Bull for 2026." },
  // ── Ferrari ──────────────────────────────────────────────────────────────
  LEC: { nationality:"🇲🇨 Monégasque", dob:"1997-10-16", birthplace:"Monte Carlo, Monaco",        bio:"Ferrari lead driver since 2019. Multiple pole records. First Monaco win in 2024." },
  HAM: { nationality:"🇬🇧 British",    dob:"1985-01-07", birthplace:"Stevenage, England",         bio:"7× World Champion. Record 103 F1 wins. Moved to Ferrari for 2025 to chase an eighth title." },
  // ── McLaren ──────────────────────────────────────────────────────────────
  NOR: { nationality:"🇬🇧 British",    dob:"1999-11-13", birthplace:"Glastonbury, England",       bio:"2024 World Champion. Known for exceptional wet-weather pace and aggressive overtaking." },
  PIA: { nationality:"🇦🇺 Australian", dob:"2001-04-06", birthplace:"Melbourne, Australia",       bio:"2021 F2 Champion. Joined McLaren in 2023, scored maiden win at Budapest 2024." },
  // ── Mercedes ─────────────────────────────────────────────────────────────
  RUS: { nationality:"🇬🇧 British",    dob:"1998-02-15", birthplace:"King's Lynn, England",       bio:"2018 F2 Champion. Known for extracting maximum from any car. Maiden win in Brazil 2021." },
  ANT: { nationality:"🇮🇹 Italian",    dob:"2006-08-12", birthplace:"Bologna, Italy",             bio:"Kimi Antonelli. Youngest Mercedes race starter. 2024 F2 Champion. Replaced Hamilton for 2025." },
  // ── Aston Martin ─────────────────────────────────────────────────────────
  ALO: { nationality:"🇪🇸 Spanish",    dob:"1981-07-29", birthplace:"Oviedo, Spain",              bio:"2× World Champion (2005, 2006). One of the most experienced and complete drivers in F1 history." },
  STR: { nationality:"🇨🇦 Canadian",   dob:"1998-10-25", birthplace:"Montréal, Canada",           bio:"Youngest points scorer at debut in 2017. Son of Aston Martin owner Lawrence Stroll." },
  // ── Audi (formerly Alfa Romeo / Kick Sauber) ─────────────────────────────
  HUL: { nationality:"🇩🇪 German",     dob:"1987-08-19", birthplace:"Emmerich am Rhein, Germany", bio:"220+ F1 starts. One of the quickest drivers never to win. Leads Audi into F1 as a works team." },
  BOR: { nationality:"🇧🇷 Brazilian",  dob:"2004-05-14", birthplace:"São Paulo, Brazil",          bio:"Gabriel Bortoleto. 2024 F2 Champion. First Brazilian F1 driver in years. Audi's second seat." },
  // ── Cadillac ─────────────────────────────────────────────────────────────
  PER: { nationality:"🇲🇽 Mexican",    dob:"1990-01-26", birthplace:"Guadalajara, Mexico",        bio:"Most successful Mexican driver in F1 history. 6 race wins with Red Bull. Joined Cadillac for 2026." },
  BOT: { nationality:"🇫🇮 Finnish",    dob:"1989-08-28", birthplace:"Nastola, Finland",           bio:"10 F1 race wins, all with Mercedes. Moved to Cadillac for 2026 as an experienced anchor." },
  // ── Williams ─────────────────────────────────────────────────────────────
  SAI: { nationality:"🇪🇸 Spanish",    dob:"1994-09-01", birthplace:"Madrid, Spain",              bio:"Son of WRC champion Carlos Sainz Sr. Won 2024 Australian GP. Moved to Williams for 2025." },
  ALB: { nationality:"🇹🇭 Thai",       dob:"1996-03-23", birthplace:"London, England",            bio:"Dual Thai-British nationality. BRDC Rising Star. Scored maiden podium at Monza 2023." },
  // ── Alpine ───────────────────────────────────────────────────────────────
  GAS: { nationality:"🇫🇷 French",     dob:"1996-02-07", birthplace:"Rouen, France",              bio:"Le Mans 24h class winner. Scored first F1 win at Bahrain 2020 with AlphaTauri." },
  COL: { nationality:"🇦🇷 Argentine",  dob:"2003-05-27", birthplace:"Villa de Merlo, Argentina",  bio:"Franco Colapinto. Impressed on Williams debut mid-2024 replacing Sargeant. Joined Alpine for 2026." },
  // ── Haas ─────────────────────────────────────────────────────────────────
  OCO: { nationality:"🇫🇷 French",     dob:"1996-09-17", birthplace:"Nice, France",               bio:"2019 F2 Champion. Scored maiden F1 win at Bahrain 2021. Moved to Haas for 2025." },
  BEA: { nationality:"🇬🇧 British",    dob:"2004-05-08", birthplace:"London, England",            bio:"Oliver Bearman. Subbed for Sainz at Ferrari (Saudi 2024) scoring points on debut aged 18." },
  // ── Racing Bulls (VCARB) ─────────────────────────────────────────────────
  LAW: { nationality:"🇳🇿 New Zealand",dob:"2002-02-11", birthplace:"Hastings, New Zealand",      bio:"2023 Formula 2 Champion. Stepped up to Racing Bulls for 2026 after impressing at Red Bull." },
  LIN: { nationality:"🇸🇪 Swedish",    dob:"2007-06-04", birthplace:"Gothenburg, Sweden",         bio:"Arvid Lindblad. Youngest F1 driver in history. 2025 F3 Champion. Racing Bulls debut 2026." },
};

function driverAge(dob) {
  if (!dob) return "—";
  const birth = new Date(dob);
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) age--;
  return age;
}

// ─── CAR SILHOUETTE (Claude Code's improved version) ──────────────────────────
function CarShape({color, scale=1, dimmed=false}) {
  const s=scale, o=dimmed?0.35:1;
  return (<g transform={`scale(${s})`} opacity={o}>
    <rect x={-12.5} y={-6.2} width={2.3} height={12.4} rx={0.7} fill={color} opacity={0.92}/>
    <rect x={-12.3} y={-6.9} width={3.0} height={1.1} rx={0.3} fill={color} opacity={0.7}/>
    <rect x={-12.3} y={5.8}  width={3.0} height={1.1} rx={0.3} fill={color} opacity={0.7}/>
    <path d="M-8,-1.5 L-12.5,-2.8 L-12.5,2.8 L-8,1.5Z" fill={color} opacity={0.5}/>
    <ellipse cx={-6.5} cy={-4.3} rx={2.2} ry={1.4} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <ellipse cx={-6.5} cy={4.3}  rx={2.2} ry={1.4} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <path d="M-7,-3 L3,-4.5 L3,-5.2 L-8,-4Z" fill={color} opacity={0.8}/>
    <path d="M-7,3  L3,4.5  L3,5.2  L-8,4Z"  fill={color} opacity={0.8}/>
    <path d="M-8,-2 C-3,-3 3,-3.5 5.5,-2.5 L8.5,0 L5.5,2.5 C3,3.5 -3,3 -8,2Z" fill={color}/>
    <line x1={-7} y1={0} x2={8} y2={0} stroke="rgba(255,255,255,0.12)" strokeWidth={0.6}/>
    <ellipse cx={0.5} cy={0} rx={2.9} ry={1.8} fill="#050610"/>
    <ellipse cx={0.5} cy={0} rx={3.2} ry={2.0} fill="none" stroke={color} strokeWidth={0.4} opacity={0.4}/>
    <path d="M-1.5,0 Q0.5,-3.8 2.5,0" fill="none" stroke={color} strokeWidth={1.3} strokeLinecap="round" opacity={0.88}/>
    <ellipse cx={4.5} cy={-4.0} rx={1.9} ry={1.2} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <ellipse cx={4.5} cy={4.0}  rx={1.9} ry={1.2} fill="#060810" stroke={color} strokeWidth={0.7} opacity={0.95}/>
    <path d="M5.5,-2 L11,0 L5.5,2Z" fill={color}/>
    <rect x={10.5} y={-6}   width={2.3} height={12} rx={0.7} fill={color} opacity={0.92}/>
    <rect x={10.2} y={-6.6} width={2.9} height={1.0} rx={0.3} fill={color} opacity={0.7}/>
    <rect x={10.2} y={5.6}  width={2.9} height={1.0} rx={0.3} fill={color} opacity={0.7}/>
    <path d="M5.5,-2.6 L10.5,-5.0 L10.5,-4.2 L5.5,-2Z" fill={color} opacity={0.68}/>
    <path d="M5.5,2.6  L10.5,5.0  L10.5,4.2  L5.5,2Z"  fill={color} opacity={0.68}/>
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

// ─── FASTEST LAP TOAST ────────────────────────────────────────────────────────
function FastestLapToast({ event }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    setCurrent(event);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 4000);
  }, [event]);

  if (!current) return null;

  return (
    <div style={{
      position: "fixed", top: 60, left: "50%", transform: `translateX(-50%) translateY(${visible ? 0 : -80}px)`,
      transition: "transform 0.4s cubic-bezier(.4,0,.2,1), opacity 0.4s",
      opacity: visible ? 1 : 0,
      zIndex: 200, pointerEvents: "none",
      background: "linear-gradient(135deg, #1a0a2e, #0d0a1a)",
      border: "1px solid #a855f7",
      borderRadius: 8, padding: "10px 20px",
      display: "flex", alignItems: "center", gap: 14,
      boxShadow: "0 0 30px #a855f740",
    }}>
      <div style={{ fontSize: 16, color: "#a855f7" }}>⚡</div>
      <div>
        <div style={{ fontSize: 7, letterSpacing: 3, color: "#a855f7", marginBottom: 3 }}>
          FASTEST LAP — LAP {current.lap}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 3, height: 16, background: current.color, borderRadius: 2 }} />
          <span style={{ fontSize: 11, color: current.color, fontWeight: 700, letterSpacing: 2 }}>
            {current.code}
          </span>
          <span style={{ fontFamily: "'DM Mono',monospace", fontSize: 13, color: "#d0d2de" }}>
            {current.time}
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
const SESSIONS = [
  { key:"british_2024_race", flag:"🇬🇧", name:"British GP",  year:2024, type:"Race", file:"/data/british_2024_race.json", circuit:"Silverstone" },
  { key:"monaco_2024_race",  flag:"🇲🇨", name:"Monaco GP",   year:2024, type:"Race", file:"/data/monaco_2024_race.json",  circuit:"Monaco"      },
  { key:"miami_2026_race",   flag:"🇺🇸", name:"Miami GP",    year:2026, type:"Race", file:"/data/miami_2026_race.json",   circuit:"Miami"       },
];

// ─── CIRCUIT INFO DATABASE ────────────────────────────────────────────────────
const CIRCUIT_INFO = {
  Silverstone: {
    name:          "Silverstone Circuit",
    flag:          "🇬🇧",
    location:      "Northamptonshire, England",
    firstGP:       1950,
    firstGPNote:   "Hosted the very first F1 World Championship race",
    length_km:     5.891,
    laps:          52,
    turns:         18,
    drs_zones:     2,
    lap_record:    { time:"1:27.097", driver:"Max Verstappen", year:2020, team:"Red Bull Racing" },
    last_winner:   { driver:"Lando Norris", year:2024, team:"McLaren" },
    most_wins_driver: { name:"Lewis Hamilton", wins:8 },
    most_wins_constructor: { name:"Ferrari", wins:17 },
    race_distance_km: 306.1,
    facts: [
      "Home of the British Grand Prix since 1950 — the birthplace of Formula 1",
      "Maggotts-Becketts-Chapel complex is one of the fastest sequences in F1 — flat out at 200+ mph",
      "Copse corner was taken flat until 2021, when Verstappen and Hamilton had their infamous collision there",
      "Former RAF airfield — the grid uses old runways as its long straights",
    ],
  },
  Monaco: {
    name:          "Circuit de Monaco",
    flag:          "🇲🇨",
    location:      "Monte Carlo, Monaco",
    firstGP:       1950,
    firstGPNote:   "One of only two circuits from the original 1950 calendar still on the schedule",
    length_km:     3.337,
    laps:          78,
    turns:         19,
    drs_zones:     1,
    lap_record:    { time:"1:12.909", driver:"Lando Norris", year:2024, team:"McLaren" },
    last_winner:   { driver:"Charles Leclerc", year:2024, team:"Ferrari" },
    most_wins_driver: { name:"Ayrton Senna", wins:6 },
    most_wins_constructor: { name:"McLaren", wins:15 },
    race_distance_km: 260.3,
    facts: [
      "The slowest circuit on the calendar — average speed under 160 km/h",
      "So narrow that overtaking is nearly impossible; qualifying position is critical",
      "Ayrton Senna won here 6 times, often described as his spiritual home",
      "The Swimming Pool complex and Tunnel are among the most iconic sections in motorsport",
    ],
  },
  Miami: {
    name:          "Miami International Autodrome",
    flag:          "🇺🇸",
    location:      "Miami Gardens, Florida, USA",
    firstGP:       2022,
    firstGPNote:   "Built around Hard Rock Stadium, home of the Miami Dolphins",
    length_km:     5.412,
    laps:          57,
    turns:         19,
    drs_zones:     3,
    lap_record:    { time:"1:29.708", driver:"Max Verstappen", year:2023, team:"Red Bull Racing" },
    last_winner:   { driver:"Lando Norris", year:2024, team:"McLaren" },
    most_wins_driver: { name:"Max Verstappen", wins:2 },
    most_wins_constructor: { name:"Red Bull Racing", wins:2 },
    race_distance_km: 308.5,
    facts: [
      "One of three US Grands Prix on the 2024/25 calendar alongside Austin and Las Vegas",
      "The fake marina around the circuit was a controversial but iconic design choice",
      "Norris's 2024 win ended a Verstappen/Red Bull streak and kicked off McLaren's title challenge",
      "Third fastest average speed of all circuits — long straights allow top speeds over 320 km/h",
    ],
  },
};

// ─── MOCK DATA ────────────────────────────────────────────────────────────────
const MOCK_DRIVERS=[
  {code:"NOR",name:"Lando Norris",    team:"McLaren",        color:"#FF8000"},
  {code:"HAM",name:"Lewis Hamilton",  team:"Mercedes",       color:"#27F4D2"},
  {code:"LEC",name:"Charles Leclerc", team:"Ferrari",        color:"#E8002D"},
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
const MOCK_CORNER_LABELS=[["T1",510,248,"start"],["T2",572,72,"start"],["T3",618,88,"start"],["T4",645,152,"start"],["T5",556,202,"middle"],["T6",168,241,"end"],["T7",166,333,"end"],["T8",303,189,"middle"],["T9",356,265,"start"],["T10",260,336,"end"],["T11",296,393,"start"],["T12",455,343,"middle"],["T15",595,396,"start"],["T16",590,462,"start"],["T18",450,500,"middle"]];
// Circuit-specific corner name lookups — add per circuit as needed
// const TURN_NAMES_SILVERSTONE={1:"ABBEY",2:"FARM",...};

function buildMock(){return{wp:MOCK_WP,tl:MOCK_TL,drivers:MOCK_DRIVERS,steps:MOCK_STEPS,totalLaps:MOCK_LAPS,lapTimeS:MOCK_LAP_S,viewBox:"145 35 525 470",cornerLabels:MOCK_CORNER_LABELS,s1end:32,s2end:54,drs1:[20,24],drs2:[50,54],sessionName:"Select a session →",pitLanePath:[]};}

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
  // Auto-detect retirement
  const LOOK=40;
  drivers.forEach(d=>{
    if(d.retiredAtStep!=null)return;
    const raw=rawProg[d.code];if(!raw)return;
    const finalRaw=raw[raw.length-1];
    if(finalRaw>=race.total_laps-1.5)return;
    for(let s=raw.length-1;s>=LOOK;s--){
      if(raw[s]-raw[s-LOOK]>0.05){d.retiredAtStep=s;break;}
    }
  });

  // Pre-compute lap times per driver for fastest lap detection
  // lapTimes[code] = { lap: seconds } — computed from raw progress delta
  const lapTimes = {};
  const totalRaceTime = race.total_laps * (race.lap_time_s || 88);
  drivers.forEach(d => {
    const raw = rawProg[d.code]; if (!raw) return;
    lapTimes[d.code] = {};
    let lastLapStart = 0;
    for (let s = 1; s <= steps; s++) {
      const prevLap = Math.floor(raw[s-1]);
      const curLap  = Math.floor(raw[s]);
      if (curLap > prevLap && curLap <= race.total_laps) {
        // Estimated time for the completed lap
        const lapSecs = ((s - lastLapStart) / steps) * totalRaceTime;
        lapTimes[d.code][curLap] = lapSecs;
        lastLapStart = s;
      }
    }
  });

  const seen=new Set(),cornerLabels=[];
  (track.corners||[]).forEach(c=>{
    // Use T1, T2 etc — always accurate for any circuit.
    // Named lookups (ABBEY, COPSE etc) are circuit-specific and added per-circuit in future.
    const num=c.number, letter=c.letter||"";
    const name=`T${num}${letter}`;
    if(seen.has(name))return;seen.add(name);cornerLabels.push([name,c.x,c.y,"middle"]);
  });
  return{wp,tl,drivers,steps,totalLaps:race.total_laps,lapTimeS:race.lap_time_s||88,
    viewBox:`${xMin} ${yMin} ${vbW} ${vbH}`,cornerLabels,
    s1end:Math.floor(n*0.45),s2end:Math.floor(n*0.75),
    drs1:[Math.floor(n*0.30),Math.floor(n*0.44)],
    drs2:[Math.floor(n*0.62),Math.floor(n*0.74)],
    sessionName:`${race.event} ${race.year} — ${race.session}`,
    pitLanePath, lapTimes};
}

const TRAIL_LEN=80, TRACK_LEN_M=5891, SPEED_HIST=120;

// ─── MAIN COMPONENT ──────────────────────────────────────────────────────────
export default function F1App(){
  const [view,        setView      ]=useState("sessions");
  const [layout,      setLayout    ]=useState("panel");  // "panel" | "broadcast"
  const [dataset,     setDataset   ]=useState(buildMock);
  const [dataMode,    setDataMode  ]=useState("SELECT");
  const [step,        setStep      ]=useState(0);
  const [playing,     setPlaying   ]=useState(false);
  const [speed,       setSpeed     ]=useState(10);
  const [tilt,        setTilt      ]=useState(38);
  const [sel,         setSel       ]=useState(null);
  const [hover,       setHover     ]=useState(null);
  const [carPos,      setCarPos    ]=useState({});
  const [speedHist,   setSpeedHist ]=useState({});
  const [gapHist,     setGapHist   ]=useState({});
  const [loading,     setLoading   ]=useState(null);
  const [loadErr,     setLoadErr   ]=useState(null);
  const [fastestLapEv,setFastestLapEv]=useState(null); // for toast

  const{wp,tl,drivers,steps,totalLaps,lapTimeS,viewBox,cornerLabels,
        s1end,s2end,drs1,drs2,sessionName,pitLanePath,lapTimes={}}=dataset;
  const baseStepsPerSec=steps/(totalLaps*lapTimeS);

  const pathRef=useRef(null),pitPathRef=useRef(null),rafRef=useRef(null),stepR=useRef(0);
  const speedR=useRef(speed),playR=useRef(false),lastT=useRef(null);
  const stepsR=useRef(steps),baseRateR=useRef(baseStepsPerSec);
  const tlRef=useRef(tl),driversRef=useRef(drivers);
  const speedHistRef=useRef({}),gapHistRef=useRef({});
  // Fastest lap tracking — persisted across renders without re-render
  const fastestRef=useRef({bestTime:Infinity,bestCode:null,bestLap:null});
  const lapTimesRef=useRef(lapTimes);
  const driversMapRef=useRef({});

  useEffect(()=>{speedR.current=speed;},[speed]);
  useEffect(()=>{stepsR.current=steps;},[steps]);
  useEffect(()=>{baseRateR.current=baseStepsPerSec;},[baseStepsPerSec]);
  useEffect(()=>{tlRef.current=tl;},[tl]);
  useEffect(()=>{driversRef.current=drivers;},[drivers]);
  useEffect(()=>{lapTimesRef.current=lapTimes;},[lapTimes]);
  useEffect(()=>{
    const m={};drivers.forEach(d=>{m[d.code]=d;});driversMapRef.current=m;
  },[drivers]);

  useEffect(()=>{
    const l=document.createElement("link");l.rel="stylesheet";
    l.href="https://fonts.googleapis.com/css2?family=Orbitron:wght@400;600;700;900&family=DM+Mono:wght@400;500&display=swap";
    document.head.appendChild(l);return()=>document.head.removeChild(l);
  },[]);

  const trackD  =useMemo(()=>catmullPath(wp),[wp]);
  const pitLaneD=useMemo(()=>catmullPath(pitLanePath,false),[pitLanePath]);
  const drs1D   =useMemo(()=>sectorPath(wp,...drs1),[wp,drs1]);
  const drs2D   =useMemo(()=>sectorPath(wp,...drs2),[wp,drs2]);

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

    // ── Fastest lap detection ────────────────────────────────────────────────
    const lt=lapTimesRef.current;
    const dmap=driversMapRef.current;
    for(const code of Object.keys(lt)){
      const drvLaps=lt[code];
      // Check if we just crossed a lap boundary
      const curLap=frA.lap?.[code];
      if(curLap&&drvLaps[curLap]){
        const lapSec=drvLaps[curLap];
        if(lapSec<fastestRef.current.bestTime&&lapSec>40){
          fastestRef.current={bestTime:lapSec,bestCode:code,bestLap:curLap};
          const drv=dmap[code];
          const mins=Math.floor(lapSec/60);
          const secs=(lapSec%60).toFixed(3).padStart(6,"0");
          setFastestLapEv({code,lap:curLap,color:drv?.color||"#a855f7",time:`${mins}:${secs}`});
        }
      }
    }

    for(const d of drivers){
      const posA=frA.pos[d.code];if(posA==null)continue;
      const rawNow=frA.raw[d.code]||0;
      const pitWin=d.pitWindows?.find(w=>rawNow>=w[0]-0.08&&rawNow<=w[1]+0.08);
      let x,y,angle;
      if(pitWin&&pitEl&&pitTotal>0){
        const pitFrac=Math.max(0,Math.min(1,(rawNow-pitWin[0])/(pitWin[1]-pitWin[0])));
        const pitL=pitFrac*pitTotal;
        const pt=pitEl.getPointAtLength(pitL);
        const pa=pitEl.getPointAtLength(Math.max(0,pitL-3));
        const pb=pitEl.getPointAtLength(Math.min(pitTotal,pitL+3));
        x=pt.x;y=pt.y;angle=Math.atan2(pb.y-pa.y,pb.x-pa.x)*57.2958;
      }else{
        // Smooth lerp with clamped max delta — reduces pit-stop jump
        const pos=lerpPos(posA,frB?.pos[d.code],frac,0.05);
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

  const clearAll=()=>{speedHistRef.current={};gapHistRef.current={};setSpeedHist({});setGapHist({});fastestRef.current={bestTime:Infinity,bestCode:null,bestLap:null};};

  const doRestart=useCallback(()=>{
    cancelAnimationFrame(rafRef.current);playR.current=false;setPlaying(false);lastT.current=null;
    stepR.current=0;setStep(0);clearAll();calcPos(0);
  },[calcPos]);

  const scrub=useCallback((v)=>{const s=+v;stepR.current=s;setStep(s);clearAll();calcPos(s);},[calcPos]);

  const loadSession=useCallback(async(session)=>{
    setLoading(session.name+" "+session.year);setLoadErr(null);
    try{
      const res=await fetch(session.file);
      if(!res.ok)throw new Error(`Could not load ${session.file} (${res.status}). Run the backend for this race first.`);
      const json=await res.json();
      if(!json.track||!json.race)throw new Error("Invalid data format");
      const processed=processRealData(json);
      setDataset(processed);setDataMode("DATA");setSel(null);setHover(null);clearAll();setLoading(null);setView("race");
      setTimeout(()=>{stepR.current=0;playR.current=true;setPlaying(true);lastT.current=null;rafRef.current=requestAnimationFrame(loop);},400);
    }catch(err){setLoadErr(err.message);setLoading(null);}
  },[loop]);

  useEffect(()=>{if(dataMode!=="SELECT")doRestart();},[dataset]);
  useEffect(()=>()=>cancelAnimationFrame(rafRef.current),[]);

  // Gap history for selected driver
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

  const standings=useMemo(()=>{const fr=tl[step];if(!fr)return drivers;return[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));},[tl,step,drivers]);

  // ── Sector colour analysis ─────────────────────────────────────────────────
  // Computed once per step (not per render frame) via useMemo.
  // Rules:
  //   Purple — this driver's current sector time is THE fastest for that sector
  //            across ALL drivers, across ALL laps completed so far in the race.
  //   Green  — this driver's current sector time equals their own personal best
  //            for that sector (fastest they've done it across all their own laps).
  //   Yellow — current sector time is slower than their personal best.
  //
  // Mock: we simulate deterministic sector times per driver/sector/lap.
  // Replace mockT() with real FastF1 sector_times when backend exports them.
  const sectorAnalysis=useMemo(()=>{
    const BASE=[26.1,31.8,19.4]; // approximate base times (S1, S2, S3) in seconds
    const EPS=0.011;

    // Deterministic mock sector time — varies lap to lap but consistently
    function mockT(code,si,lap){
      const seed=(code.charCodeAt(0)*31+(code.charCodeAt(2)||0)*17+si*7+lap*13)%100;
      return BASE[si]+(seed/100)*2.0-0.5; // ±1s variation around base
    }

    const fr=tl[step]||{};

    // Step 1: for each driver compute their current lap's time and personal best
    const driverData={};
    drivers.forEach(d=>{
      const curLap=fr.lap?.[d.code]||1;
      const perSector=[0,1,2].map(si=>{
        const curT=mockT(d.code,si,curLap);
        // Personal best = minimum across all laps 1..curLap
        let pb=curT;
        for(let lap=1;lap<curLap;lap++) pb=Math.min(pb,mockT(d.code,si,lap));
        return {curT,pb,t:curT.toFixed(1)};
      });
      driverData[d.code]=perSector;
    });

    // Step 2: session best per sector = minimum across ALL drivers' personal bests
    const sessionBest=[0,1,2].map(si=>{
      let best=Infinity;
      drivers.forEach(d=>{best=Math.min(best,driverData[d.code][si].pb);});
      return best;
    });

    // Step 3: assign colours
    const result={};
    drivers.forEach(d=>{
      result[d.code]=[0,1,2].map(si=>{
        const {curT,pb,t}=driverData[d.code][si];
        let color;
        if(Math.abs(curT-sessionBest[si])<EPS) color="#a855f7"; // purple: session best
        else if(Math.abs(curT-pb)<EPS)          color="#00ff88"; // green:  personal best
        else                                     color="#FFD700"; // yellow: slower
        return {t,color};
      });
    });
    return result;
  },[step,tl,drivers]);
  const selDriver=sel?drivers.find(d=>d.code===sel):null;
  const selRank=sel?standings.findIndex(d=>d.code===sel)+1:null;
  const leaderLap=standings[0]?(tl[step]?.lap[standings[0].code]||1):1;
  const pct=((step/steps)*100).toFixed(1);
  const focused=sel||hover;
  const sfX=wp[0]?.[0]||300,sfY=wp[0]?.[1]||250;
  const[vbX,vbY,vbW,vbH]=viewBox.split(" ").map(Number);
  const lapLabel=(mult)=>{const s=Math.round(lapTimeS/mult);return s>=60?`${Math.floor(s/60)}m${s%60>0?String(s%60).padStart(2,"0")+"s":""}`:s+"s";};
  const NAV=[{id:"sessions",label:"SESSIONS"},{id:"race",label:"RACE MAP"},{id:"driver",label:"DRIVER"},{id:"circuit",label:"CIRCUIT"}];
  const modeColor={"SELECT":"#333860","DATA":"#4CAF50","LIVE":"#ff4444"}[dataMode]||"#333860";
  const modeBg  ={"SELECT":"#0e0e22","DATA":"#0e2a0e","LIVE":"#2a0a0a"}[dataMode]||"#0e0e22";
  const modeText={"SELECT":"◌ SELECT SESSION","DATA":"◉ DATA","LIVE":"◉ LIVE"}[dataMode]||"◌";

  return(
    <div style={{fontFamily:"'Orbitron',sans-serif",background:"#0d0d12",color:"#d0d2de",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Fastest lap toast */}
      <FastestLapToast event={fastestLapEv}/>

      {/* ── NAV ───────────────────────────────────────────────────────── */}
      <header style={{display:"flex",alignItems:"center",flexShrink:0,borderBottom:"1px solid #1a1c28",background:"#0a0a0f"}}>
        <div style={{padding:"0 20px",display:"flex",alignItems:"center",gap:10,borderRight:"1px solid #1a1c28",height:44,flexShrink:0}}>
          <div style={{background:"#E10600",color:"#fff",fontWeight:900,fontSize:13,letterSpacing:3,padding:"2px 8px"}}>F1</div>
          <span style={{fontSize:7,letterSpacing:3,color:"#6b6e84"}}>PITWALL</span>
        </div>
        <div style={{display:"flex",height:44}}>
          {NAV.map(n=>(<button key={n.id} onClick={()=>setView(n.id)} style={{padding:"0 18px",height:"100%",background:"transparent",border:"none",borderBottom:`2px solid ${view===n.id?"#E10600":"transparent"}`,color:view===n.id?"#fff":"#555878",fontSize:8,letterSpacing:3,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>{n.label}</button>))}
        </div>
        <div style={{marginLeft:"auto",display:"flex",alignItems:"center",gap:8,padding:"0 20px"}}>
          {/* Layout toggle — only relevant on race map */}
          {view==="race"&&(
            <div style={{display:"flex",gap:2,background:"#0d0d18",borderRadius:4,padding:2,border:"1px solid #1a1c28"}}>
              {[{id:"panel",icon:"▣",label:"PANEL"},{id:"broadcast",icon:"▬",label:"BROAD"}].map(l=>(
                <button key={l.id} onClick={()=>setLayout(l.id)} title={l.label} style={{
                  padding:"3px 8px",borderRadius:3,border:"none",cursor:"pointer",
                  background:layout===l.id?"#E10600":"transparent",
                  color:layout===l.id?"#fff":"#555878",
                  fontSize:9,fontFamily:"'Orbitron',sans-serif",
                  transition:"all .15s",
                }}>{l.icon}</button>
              ))}
            </div>
          )}
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
              <div style={{fontSize:7,color:"#555878",letterSpacing:2,marginBottom:28}}>Click any session. The track and race data load automatically.</div>
              {[...new Set(SESSIONS.map(s=>s.circuit))].map(circuit=>(
                <div key={circuit} style={{marginBottom:24}}>
                  <div style={{fontSize:7,letterSpacing:4,color:"#555878",marginBottom:8,paddingBottom:6,borderBottom:"1px solid #1a1c28"}}>
                    {SESSIONS.find(s=>s.circuit===circuit)?.flag} {circuit.toUpperCase()}
                  </div>
                  <div style={{display:"flex",flexDirection:"column",gap:4}}>
                    {SESSIONS.filter(s=>s.circuit===circuit).map(session=>(
                      <button key={session.key} onClick={()=>loadSession(session)} style={{padding:"14px 20px",borderRadius:6,cursor:"pointer",background:"#0e0e18",border:"1px solid #1a1c28",display:"flex",alignItems:"center",gap:16,textAlign:"left",transition:"all .15s",width:"100%",fontFamily:"'Orbitron',sans-serif"}}
                        onMouseEnter={e=>{e.currentTarget.style.background="#13131f";e.currentTarget.style.borderColor="#30344a";}}
                        onMouseLeave={e=>{e.currentTarget.style.background="#0e0e18";e.currentTarget.style.borderColor="#1a1c28";}}>
                        <div style={{flex:1}}>
                          <div style={{fontSize:10,color:"#d0d2de",letterSpacing:2,marginBottom:4}}>{session.name} {session.year}</div>
                          <div style={{fontSize:7,color:"#555878",letterSpacing:1}}>{session.type}</div>
                        </div>
                        <div style={{fontSize:8,color:"#E10600",letterSpacing:2}}>LOAD →</div>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div style={{marginTop:32,padding:20,borderRadius:6,background:"#0e0e18",border:"1px solid #1a1c28"}}>
                <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>ADD MORE RACES</div>
                <div style={{fontSize:7,color:"#444660",lineHeight:1.9,fontFamily:"'DM Mono',monospace"}}>
                  python3 fastf1_backend.py --event "Canadian Grand Prix" --year 2026 --session R<br/>
                  python3 fastf1_backend.py --event "Spanish Grand Prix" --year 2026 --session R
                </div>
                <div style={{fontSize:6.5,color:"#333550",marginTop:10,letterSpacing:1}}>Then copy JSON into f1-pitwall/public/data/ and push to GitHub.</div>
              </div>
            </div>
          </div>
        )}

        {/* ─── RACE MAP VIEW ──────────────────────────────────────────── */}
        {view==="race"&&(
          <div style={{flex:1,display:"flex",flexDirection:layout==="broadcast"?"column":"row",overflow:"hidden"}}>
          {/* Track canvas */}
          <div style={{flex:1,position:"relative",overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center",perspective:"1100px",perspectiveOrigin:"50% 50%"}}>
            <div style={{position:"absolute",inset:0,pointerEvents:"none",zIndex:2,background:"radial-gradient(ellipse at 55% 50%,transparent 45%,#0d0d12 92%)"}}/>
            {dataMode==="SELECT"&&(
              <div style={{position:"absolute",top:"50%",left:"50%",transform:"translate(-50%,-50%)",zIndex:10,textAlign:"center",pointerEvents:"none"}}>
                <div style={{fontSize:9,letterSpacing:4,color:"#252840",marginBottom:8}}>NO SESSION LOADED</div>
                <button onClick={()=>setView("sessions")} style={{fontSize:7,letterSpacing:3,color:"#E10600",background:"transparent",border:"1px solid #E10600",padding:"6px 16px",borderRadius:4,cursor:"pointer",fontFamily:"'Orbitron',sans-serif",pointerEvents:"all"}}>← SELECT SESSION</button>
              </div>
            )}
            <svg viewBox={viewBox} style={{width:"100%",maxWidth:layout==="broadcast"?"min(98vw,1200px)":"min(92vw,900px)",maxHeight:layout==="broadcast"?"calc(100vh - 200px)":"calc(100vh - 130px)",position:"relative",zIndex:1,transform:`rotateX(${tilt}deg)`,transformOrigin:"center 60%",transition:"transform 0.35s cubic-bezier(.4,0,.2,1)"}}>
              <defs>
                <filter id="trailBlur"><feGaussianBlur stdDeviation="2"/></filter>
                <filter id="trackGlow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="12" result="b"/>
                  <feMerge><feMergeNode in="b"/></feMerge>
                </filter>
                <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d0d12" stopOpacity={tilt>5?0.6:0}/>
                  <stop offset="55%" stopColor="#0d0d12" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* Ambient glow */}
              <path d={trackD} fill="none" stroke="#1a3acc" strokeWidth={32} strokeOpacity={0.04} style={{filter:"url(#trackGlow)"}}/>
              {/* Pit lane */}
              {pitLaneD&&<><path d={pitLaneD} fill="none" stroke="#323540" strokeWidth={14} strokeLinecap="round"/><path d={pitLaneD} fill="none" stroke="#3c3f50" strokeWidth={10} strokeLinecap="round"/><path d={pitLaneD} fill="none" stroke="#464958" strokeWidth={1.5} strokeDasharray="4 6" strokeOpacity={0.6} strokeLinecap="round"/></>}
              {/* Track — white border lines give circuit shape, dark asphalt fill */}
              <path d={trackD} fill="none" stroke="#ffffff" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.9}/>
              <path d={trackD} fill="none" stroke="#1e2030" strokeWidth={18} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#252838" strokeWidth={14} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#2e3248" strokeWidth={8} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.7}/>
              {/* Centre dash */}
              <path d={trackD} fill="none" stroke="#343748" strokeWidth={0.8} strokeDasharray="5 10" strokeOpacity={.45}/>
              {/* DRS detection point markers — dot only at zone start */}
              {wp[drs1[0]]&&(<g>
                <circle cx={wp[drs1[0]][0]} cy={wp[drs1[0]][1]} r={5} fill="#facc15" opacity={0.85}/>
                <circle cx={wp[drs1[0]][0]} cy={wp[drs1[0]][1]} r={8} fill="#facc15" opacity={0.15}/>
                <text x={wp[drs1[0]][0]+9} y={wp[drs1[0]][1]+2} fill="#facc1599" fontSize={4.5} fontFamily="'Orbitron',sans-serif" letterSpacing={1}>DRS</text>
              </g>)}
              {wp[drs2[0]]&&(<g>
                <circle cx={wp[drs2[0]][0]} cy={wp[drs2[0]][1]} r={5} fill="#facc15" opacity={0.85}/>
                <circle cx={wp[drs2[0]][0]} cy={wp[drs2[0]][1]} r={8} fill="#facc15" opacity={0.15}/>
                <text x={wp[drs2[0]][0]+9} y={wp[drs2[0]][1]+2} fill="#facc1599" fontSize={4.5} fontFamily="'Orbitron',sans-serif" letterSpacing={1}>DRS</text>
              </g>)}
              {tilt>5&&<rect x={vbX} y={vbY} width={vbW} height={vbH} fill="url(#depthGrad)" style={{pointerEvents:"none"}}/>}
              <path ref={pathRef} d={trackD} fill="none" stroke="none"/>
              <path ref={pitPathRef} d={pitLaneD||""} fill="none" stroke="none"/>
              {/* S/F */}
              <line x1={sfX-2} y1={sfY-14} x2={sfX-2} y2={sfY+10} stroke="#ffffff" strokeWidth={2} strokeOpacity={.6}/>
              <text x={sfX+4} y={sfY+3} fill="#7a7d96" fontSize={5.5} fontFamily="'DM Mono',monospace">S/F</text>
              {/* Corner labels — white */}
              {cornerLabels.map(([name,x,y,anchor])=>(<text key={name} x={x} y={y} fill="#ffffff" fontSize={5.5} textAnchor={anchor} fontFamily="'DM Mono',monospace" letterSpacing={.5} opacity={0.7}>{name}</text>))}
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
                  {!isDNF&&!isInPit&&<ellipse cx={p.x} cy={p.y} rx={14*carScale} ry={6*carScale} fill={d.color} opacity={isActive?0.45:isHover?0.3:0.18} transform={`rotate(${p.angle},${p.x},${p.y})`} style={{filter:"blur(6px)"}}/>}
                  <g transform={`translate(${p.x},${p.y}) rotate(${p.angle})`}><CarShape color={isDNF?"#555":d.color} scale={carScale} dimmed={isDNF}/></g>
                  {!isDNF&&<g transform={`translate(${p.x},${p.y-17*carScale})`}>
                    <rect x={-10} y={-6} width={20} height={11} rx={2.5} fill="#05060e" fillOpacity={0.88} stroke={isInPit?"#ff8c00":d.color} strokeWidth={isInPit?1.2:0.9}/>
                    <text x={0} y={1.8} fill={isInPit?"#ff8c00":d.color} fontSize={6} textAnchor="middle" fontWeight="600" fontFamily="'DM Mono',monospace">{isInPit?"PIT":d.code}</text>
                  </g>}
                  {isDNF&&<g transform={`translate(${p.x},${p.y-17*carScale})`}>
                    <rect x={-12} y={-6} width={24} height={11} rx={2.5} fill="#1a0505" fillOpacity={0.92} stroke="#5a1515" strokeWidth={0.9}/>
                    <text x={0} y={1.8} fill="#884444" fontSize={6} textAnchor="middle" fontWeight="700" fontFamily="'DM Mono',monospace">DNF</text>
                  </g>}
                  {!isDNF&&(isActive||isHover||rank<=3)&&<g transform={`translate(${p.x},${p.y-31*carScale})`}><rect x={-10} y={-6} width={20} height={11} rx={2.5} fill={d.color} opacity={0.9}/><text x={0} y={1.8} fill="#fff" fontSize={6} textAnchor="middle" fontWeight="700" fontFamily="'Orbitron',sans-serif">P{rank}</text></g>}
                </g>);
              })}
            </svg>
          </div>

          {/* ── SHARED DRIVER DATA HELPER ── */}
          {(()=>{
            // Extract per-driver display data once, reused by both layouts
            const driverRows = standings.map((d,i)=>{
              const fr=tl[step]||{};
              const isDNF=d.retiredAtStep!=null&&step>d.retiredAtStep;
              const isInPit=Boolean(carPos[d.code]?.isInPit)&&!isDNF;
              const isActive=sel===d.code, isHover=hover===d.code;
              const leaderGap=i===0?null:((fr.raw[standings[0].code]||0)-(fr.raw[d.code]||0))*lapTimeS;
              const currentLap=fr.lap?.[d.code]||1;
              // Sector data from pre-computed analysis (correct PB / session best logic)
              const sectorData=sectorAnalysis[d.code]||[{t:"—",color:"#FFD700"},{t:"—",color:"#FFD700"},{t:"—",color:"#FFD700"}];

              return {d,i,isDNF,isInPit,isActive,isHover,leaderGap,currentLap,sectorData};
            });

            // ── PANEL LAYOUT (right sidebar) ──
            if(layout==="panel") return (
              <aside style={{width:220,flexShrink:0,borderLeft:"1px solid #1a1c28",
                background:"#090910",display:"flex",flexDirection:"column",overflow:"hidden"}}>
                <div style={{padding:"7px 12px",borderBottom:"1px solid #1a1c28",
                  fontSize:7,letterSpacing:4,color:"#555878",fontWeight:700}}>RACE ORDER</div>
                <div style={{flex:1,overflowY:"auto"}}>
                  {driverRows.map(({d,i,isDNF,isInPit,isActive,isHover,leaderGap,sectorData})=>{
                    const rowColor=isDNF?"rgba(90,20,20,0.3)":isInPit?"rgba(255,140,0,0.08)":isActive?`${d.color}18`:isHover?"#12131f":"transparent";
                    return(
                      <div key={d.code}>
                        <div onClick={()=>!isDNF&&setSel(isActive?null:d.code)}
                          onMouseEnter={()=>!isDNF&&setHover(d.code)}
                          onMouseLeave={()=>setHover(null)}
                          style={{padding:"6px 12px 5px",cursor:isDNF?"default":"pointer",
                            background:rowColor,
                            borderLeft:`2px solid ${isDNF?"#7a2222":isInPit?"#ff8c00":(isActive||isHover)?d.color:"transparent"}`,
                            transition:"background .1s",opacity:isDNF?0.5:1}}>
                          {/* Position + name + gap */}
                          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4}}>
                            <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,
                              width:16,textAlign:"center",flexShrink:0,
                              color:isDNF?"#7a2222":isInPit?"#ff8c00":i===0?"#FFD700":i<3?d.color:"#505470"}}>
                              {isDNF?"✕":i+1}
                            </span>
                            <div style={{width:2,height:22,borderRadius:1,flexShrink:0,
                              background:isDNF?"#7a2222":isInPit?"#ff8c00":d.color}}/>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:"flex",justifyContent:"space-between",alignItems:"baseline"}}>
                                <span style={{fontSize:9,letterSpacing:2,fontWeight:600,
                                  color:isDNF?"#7a3535":isInPit?"#ff8c00":(isActive||isHover)?d.color:"#9a9eb8"}}>
                                  {d.code}
                                </span>
                                {isDNF
                                  ?<span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#7a3535"}}>DNF</span>
                                  :<span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:i===0?"#4ade80":"#666a88"}}>
                                    {i===0?"LEAD":`+${leaderGap!=null?leaderGap.toFixed(1):"?"}s`}
                                  </span>}
                              </div>
                              <div style={{fontSize:5.5,color:"#44475e",letterSpacing:1,
                                overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{d.team}</div>
                            </div>
                          </div>
                          {/* Sector bars + times */}
                          <div style={{paddingLeft:24}}>
                            {isInPit?(
                              <span style={{fontSize:6.5,letterSpacing:2,color:"#ff8c00",fontWeight:700,
                                background:"rgba(255,140,0,0.12)",border:"1px solid rgba(255,140,0,0.3)",
                                borderRadius:3,padding:"1px 6px",fontFamily:"'Orbitron',sans-serif"}}>PIT STOP</span>
                            ):isDNF?(
                              <span style={{fontSize:6,color:"#7a3535",fontFamily:"'DM Mono',monospace"}}>retired</span>
                            ):(
                              <div style={{display:"flex",gap:6}}>
                                {sectorData.map((sc,si)=>(
                                  <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                    <div style={{width:36,height:3,borderRadius:2,background:sc.color,
                                      boxShadow:`0 0 4px ${sc.color}80`}}/>
                                    <span style={{fontSize:6,color:sc.color,fontFamily:"'DM Mono',monospace",
                                      opacity:0.85}}>{sc.t}</span>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{height:1,background:"#0f1020",marginLeft:12}}/>
                      </div>
                    );
                  })}
                </div>
                <div onClick={()=>setView("sessions")} style={{padding:"10px 12px",borderTop:"1px solid #1a1c28",
                  cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:"#0a0b14"}}>
                  <span style={{fontSize:7,letterSpacing:2,color:"#555878"}}>← CHANGE SESSION</span>
                </div>
              </aside>
            );

            // ── BROADCAST LAYOUT (horizontal bottom strip) ──
            return (
              <div style={{height:136,flexShrink:0,borderTop:"1px solid #1a1c28",
                background:"#090910",display:"flex",flexDirection:"column",overflow:"hidden"}}>
                {/* Header row */}
                <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",
                  padding:"4px 16px",borderBottom:"1px solid #1a1c28",flexShrink:0}}>
                  <span style={{fontSize:7,letterSpacing:4,color:"#555878",fontWeight:700}}>RACE ORDER</span>
                  <div style={{display:"flex",alignItems:"center",gap:12}}>
                    <div style={{display:"flex",alignItems:"center",gap:5}}>
                      {[["#a855f7","SB"],["#00ff88","PB"],["#FFD700","OK"]].map(([c,l])=>(
                        <div key={l} style={{display:"flex",alignItems:"center",gap:2}}>
                          <div style={{width:10,height:2,borderRadius:1,background:c,opacity:.7}}/>
                          <span style={{fontSize:5.5,color:"#44475e",letterSpacing:1}}>{l}</span>
                        </div>
                      ))}
                    </div>
                    <div onClick={()=>setView("sessions")} style={{cursor:"pointer"}}>
                      <span style={{fontSize:6,letterSpacing:2,color:"#555878"}}>← SESSIONS</span>
                    </div>
                  </div>
                </div>
                {/* Scrollable driver cards */}
                <div style={{flex:1,display:"flex",overflowX:"auto",gap:0,alignItems:"stretch",
                  scrollbarWidth:"none"}}>
                  {driverRows.map(({d,i,isDNF,isInPit,isActive,isHover,leaderGap,sectorData})=>(
                    <div key={d.code}
                      onClick={()=>!isDNF&&setSel(isActive?null:d.code)}
                      onMouseEnter={()=>!isDNF&&setHover(d.code)}
                      onMouseLeave={()=>setHover(null)}
                      style={{
                        minWidth:88, flexShrink:0,
                        padding:"8px 10px",
                        cursor:isDNF?"default":"pointer",
                        background:isActive?`${d.color}15`:isHover?"#13131f":"transparent",
                        borderRight:"1px solid #0f1020",
                        borderTop:`2px solid ${isDNF?"#7a2222":isInPit?"#ff8c00":(isActive||isHover)?d.color:"transparent"}`,
                        opacity:isDNF?0.45:1,
                        transition:"background .1s",
                        display:"flex",flexDirection:"column",gap:4,
                      }}>
                      {/* P# and code */}
                      <div style={{display:"flex",alignItems:"center",gap:5}}>
                        <span style={{fontFamily:"'DM Mono',monospace",fontSize:10,fontWeight:700,
                          color:isDNF?"#7a2222":isInPit?"#ff8c00":i===0?"#FFD700":i<3?d.color:"#505470"}}>
                          {isDNF?"✕":i+1}
                        </span>
                        <div style={{width:2,height:14,borderRadius:1,background:isDNF?"#7a2222":isInPit?"#ff8c00":d.color,flexShrink:0}}/>
                        <span style={{fontSize:8,fontWeight:700,letterSpacing:1,
                          color:isDNF?"#7a3535":isInPit?"#ff8c00":(isActive||isHover)?d.color:"#9a9eb8"}}>
                          {d.code}
                        </span>
                      </div>
                      {/* Gap to leader */}
                      <div style={{fontFamily:"'DM Mono',monospace",fontSize:6.5,
                        color:isDNF?"#7a3535":isInPit?"#ff8c00":i===0?"#4ade80":"#555878"}}>
                        {isDNF?"DNF":isInPit?"PIT":i===0?"LEADER":`+${leaderGap!=null?leaderGap.toFixed(1):"?"}s`}
                      </div>
                      {/* Sector bars + times */}
                      {!isDNF&&!isInPit&&(
                        <div style={{display:"flex",gap:3,marginTop:2}}>
                          {sectorData.map((sc,si)=>(
                            <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:1}}>
                              <div style={{width:18,height:3,borderRadius:1,background:sc.color,
                                boxShadow:`0 0 3px ${sc.color}80`}}/>
                              <span style={{fontSize:5.5,color:sc.color,fontFamily:"'DM Mono',monospace",
                                opacity:0.8}}>{sc.t}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>)}

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
              const fr=tl[step]||{};
              const spdH=speedHist[d.code]||[];
              const currentSpd=spdH[spdH.length-1]||0;
              const sorted=[...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
              const idx=sorted.findIndex(x=>x.code===d.code);
              const aheadDriver=idx>0?sorted[idx-1]:null;
              const aheadGapNow=aheadDriver?((fr.raw[aheadDriver.code]||0)-(fr.raw[d.code]||0))*lapTimeS:null;
              const currentLap=fr.lap?.[d.code]||1;
              const info=DRIVER_INFO[d.code]||{};
              const age=driverAge(info.dob);

              // Best lap this race
              const dLaps=lapTimes[d.code]||{};
              const dLapEntries=Object.entries(dLaps);
              const bestLapEntry=dLapEntries.reduce((best,[lap,t])=>t<best[1]?[lap,t]:best,["—",Infinity]);
              const bestLapSecs=bestLapEntry[1]<Infinity?bestLapEntry[1]:null;
              const bestLapFmt=bestLapSecs?`${Math.floor(bestLapSecs/60)}:${(bestLapSecs%60).toFixed(3).padStart(6,"0")}`:"—";

              return(<>
                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",gap:20,paddingBottom:16,borderBottom:"1px solid #1a1c28"}}>
                  <button onClick={()=>setView("race")} style={{background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,color:"#555878",fontSize:10,cursor:"pointer",padding:"6px 10px",fontFamily:"'Orbitron',sans-serif",marginTop:4}}>←</button>
                  <div style={{width:4,height:60,background:d.color,borderRadius:2,boxShadow:`0 0 20px ${d.color}`,flexShrink:0,marginTop:4}}/>
                  <div style={{flex:1}}>
                    <div style={{display:"flex",alignItems:"baseline",gap:12}}>
                      <div style={{fontSize:28,letterSpacing:3,color:d.color,fontWeight:900,lineHeight:1}}>{d.code}</div>
                      <div style={{fontSize:8,color:"#555878",letterSpacing:2}}>#{d.number||"—"}</div>
                    </div>
                    <div style={{fontSize:10,color:"#9a9eb8",letterSpacing:2,marginTop:4}}>{d.name}</div>
                    <div style={{fontSize:7,color:"#555878",letterSpacing:1,marginTop:2}}>{d.team}</div>
                    {info.nationality&&<div style={{fontSize:7,color:"#6b6e84",letterSpacing:1,marginTop:4}}>{info.nationality}</div>}
                    {info.birthplace&&<div style={{fontSize:6.5,color:"#44475e",letterSpacing:1,marginTop:2}}>{info.birthplace}{age?` · Age ${age}`:""}</div>}
                  </div>
                  {/* Live stat pills */}
                  <div style={{display:"flex",flexDirection:"column",gap:6,minWidth:110}}>
                    {[
                      {l:"POSITION",   v:`P${selRank}`},
                      {l:"LAP",        v:`${currentLap} / ${totalLaps}`},
                      {l:"BEST LAP",   v:bestLapFmt, special:"purple"},
                      aheadDriver?{l:`GAP TO ${aheadDriver.code}`,v:aheadGapNow!=null?`${aheadGapNow.toFixed(2)}s`:"—",special:aheadGapNow!=null&&aheadGapNow<1?"red":null}:null,
                    ].filter(Boolean).map(({l,v,special})=>(
                      <div key={l} style={{padding:"6px 10px",background:"#0e0e18",borderRadius:5,border:`1px solid ${special==="purple"?"#a855f730":special==="red"?"#f8717130":"#1a1c28"}`}}>
                        <div style={{fontSize:5,color:special==="purple"?"#a855f7":special==="red"?"#f87171":"#555878",letterSpacing:2,marginBottom:3}}>{l}</div>
                        <div style={{fontSize:11,color:special==="purple"?"#a855f7":special==="red"?"#f87171":"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:500}}>{v}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Bio */}
                {info.bio&&<div style={{padding:"12px 16px",background:"#0e0e18",borderRadius:6,border:"1px solid #1a1c28",fontSize:8,color:"#555878",lineHeight:1.8,letterSpacing:0.5}}>{info.bio}</div>}

                {/* Charts */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:16}}>

                  {/* Race position history — shows how driver moved through field */}
                  {(()=>{
                    // Build position-per-lap from standings history
                    // We sample tl at ~each completed lap boundary
                    const posHistory = [];
                    for(let lap=1; lap<=currentLap; lap++){
                      // Find a step near the end of this lap for this driver
                      const targetProg = (lap - 0.05) / totalLaps;
                      let closestStep = 0, closestDiff = Infinity;
                      for(let s=0; s<tl.length; s+=10){
                        const diff = Math.abs((tl[s]?.raw[d.code]||0) - targetProg * totalLaps);
                        if(diff < closestDiff){ closestDiff=diff; closestStep=s; }
                      }
                      const fr = tl[closestStep]||{};
                      const sorted = [...drivers].sort((a,b)=>(fr.raw[b.code]||0)-(fr.raw[a.code]||0));
                      const pos = sorted.findIndex(x=>x.code===d.code)+1;
                      if(pos>0) posHistory.push({lap, pos});
                    }
                    const n = posHistory.length;
                    const W = 280, H = 70, PAD = 8;
                    const maxPos = Math.max(drivers.length, ...posHistory.map(p=>p.pos));
                    const toX = (lap) => PAD + ((lap-1)/(totalLaps-1))*(W-PAD*2);
                    const toY = (pos) => PAD + ((pos-1)/(maxPos-1))*(H-PAD*2);
                    const pts = posHistory.map(p=>`${toX(p.lap).toFixed(1)},${toY(p.pos).toFixed(1)}`).join(" ");
                    const lastPt = posHistory[posHistory.length-1];
                    return(
                      <div style={{background:"#0e0e18",borderRadius:8,padding:16,border:"1px solid #1a1c28"}}>
                        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:10}}>
                          <div style={{fontSize:8,letterSpacing:3,color:"#555878"}}>RACE POSITION</div>
                          {lastPt&&<div style={{fontFamily:"'DM Mono',monospace",fontSize:11,color:d.color,fontWeight:700}}>P{lastPt.pos}</div>}
                        </div>
                        {n>1?(
                          <svg viewBox={`0 0 ${W} ${H}`} style={{width:"100%",height:H,display:"block"}}>
                            {/* Grid lines for each position */}
                            {[1,5,10,15,20].filter(p=>p<=maxPos).map(p=>(
                              <g key={p}>
                                <line x1={PAD} y1={toY(p)} x2={W-PAD} y2={toY(p)} stroke="#1a1c28" strokeWidth={0.5} strokeDasharray="2 4"/>
                                <text x={PAD-2} y={toY(p)+2} fill="#44475e" fontSize={4} textAnchor="end" fontFamily="'DM Mono',monospace">P{p}</text>
                              </g>
                            ))}
                            {/* P1 line highlighted */}
                            <line x1={PAD} y1={toY(1)} x2={W-PAD} y2={toY(1)} stroke="#FFD700" strokeWidth={0.5} strokeOpacity={0.3}/>
                            {/* Position trace — note Y is inverted (P1 = top) */}
                            <polyline points={pts} fill="none" stroke={d.color} strokeWidth={2}
                              strokeLinecap="round" strokeLinejoin="round"/>
                            {/* Fill under line */}
                            {posHistory.length>1&&<polygon
                              points={`${toX(posHistory[0].lap)},${H-PAD} ${pts} ${toX(lastPt.lap)},${H-PAD}`}
                              fill={d.color} opacity={0.06}/>}
                            {/* Current position dot */}
                            {lastPt&&<circle cx={toX(lastPt.lap)} cy={toY(lastPt.pos)} r={3} fill={d.color}/>}
                          </svg>
                        ):<div style={{height:H,display:"flex",alignItems:"center",justifyContent:"center",color:"#44475e",fontSize:7,letterSpacing:2}}>PLAY RACE TO SEE HISTORY</div>}
                        <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
                          <span style={{fontSize:6,color:"#44475e",fontFamily:"'DM Mono',monospace"}}>LAP 1</span>
                          <span style={{fontSize:6,color:"#44475e",fontFamily:"'DM Mono',monospace"}}>LAP {totalLaps}</span>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Gap to car ahead */}
                  <div style={{background:"#0e0e18",borderRadius:8,padding:16,border:"1px solid #1a1c28"}}>
                    <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:12}}>
                      <div style={{fontSize:8,letterSpacing:3,color:"#555878"}}>GAP TO {aheadDriver?.code||"AHEAD"}</div>
                      {aheadDriver&&<div style={{width:3,height:12,background:aheadDriver.color,borderRadius:2}}/>}
                    </div>
                    {gapHist[d.code]?.length>4
                      ?<Sparkline data={gapHist[d.code]} color={aheadDriver?.color||"#FFD700"} width={280} height={60} min={0} max={Math.max(5,...(gapHist[d.code]||[]))}/>
                      :<div style={{height:60,display:"flex",alignItems:"center",justifyContent:"center",color:"#44475e",fontSize:7,letterSpacing:2}}>{selRank===1?"RACE LEADER":"PLAY RACE TO SEE GAP"}</div>}
                    {aheadGapNow!=null&&(
                      <div style={{marginTop:10,textAlign:"center"}}>
                        <div style={{fontFamily:"'DM Mono',monospace",fontSize:22,color:aheadGapNow<0.5?"#f87171":aheadGapNow<1?"#FFD700":"#d0d2de",fontWeight:700}}>
                          {aheadGapNow.toFixed(3)}s
                        </div>
                        <div style={{fontSize:6,color:"#44475e",letterSpacing:2,marginTop:3}}>
                          {aheadGapNow<0.5?"IN ATTACK RANGE":aheadGapNow<1?"DRS RANGE":aheadGapNow<2?"CLOSE":"CLEAR"}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {/* Lap times table */}
                {dLapEntries.length>0&&(
                  <div style={{background:"#0e0e18",borderRadius:8,padding:16,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>LAP TIMES</div>
                    <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(90px,1fr))",gap:6}}>
                      {dLapEntries.slice(0,currentLap).map(([lap,t])=>{
                        const isBest=t===bestLapEntry[1];
                        const mins=Math.floor(t/60);
                        const secs=(t%60).toFixed(1).padStart(4,"0");
                        return(
                          <div key={lap} style={{padding:"5px 8px",borderRadius:4,background:isBest?"#1a0a2e":"#0a0b14",border:`1px solid ${isBest?"#a855f7":"#1a1c28"}`,textAlign:"center"}}>
                            <div style={{fontSize:5.5,color:"#44475e",marginBottom:2}}>L{lap}</div>
                            <div style={{fontFamily:"'DM Mono',monospace",fontSize:8,color:isBest?"#a855f7":"#9a9eb8"}}>{mins}:{secs}</div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </>);
            })()}
          </div>
        )}
        {/* ─── CIRCUIT VIEW ───────────────────────────────────────────── */}
        {view==="circuit"&&(()=>{
          const circuitKey = dataset.sessionName?.includes("British")||dataset.sessionName?.includes("Silverstone") ? "Silverstone"
            : dataset.sessionName?.includes("Monaco") ? "Monaco"
            : dataset.sessionName?.includes("Miami") ? "Miami"
            : null;
          const ci = circuitKey ? CIRCUIT_INFO[circuitKey] : null;

          if(!ci) return(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
              <div style={{fontSize:10,letterSpacing:4,color:"#252840"}}>NO CIRCUIT LOADED</div>
              <div style={{fontSize:7,color:"#1a1d2e",letterSpacing:2}}>SELECT A SESSION FIRST</div>
              <button onClick={()=>setView("sessions")} style={{marginTop:8,padding:"8px 20px",background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,color:"#252840",fontSize:8,letterSpacing:2,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>← SESSIONS</button>
            </div>
          );

          const StatBox=({label,value,sub,accent})=>(
            <div style={{padding:"12px 16px",background:"#0e0e18",borderRadius:8,border:`1px solid ${accent?"#E1060030":"#1a1c28"}`,minWidth:0}}>
              <div style={{fontSize:5.5,color:"#555878",letterSpacing:2,marginBottom:5}}>{label}</div>
              <div style={{fontSize:15,color:accent?"#E10600":"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:700,lineHeight:1}}>{value}</div>
              {sub&&<div style={{fontSize:6.5,color:"#555878",marginTop:4,letterSpacing:1}}>{sub}</div>}
            </div>
          );

          const RecordBox=({label,driver,team,time,year,color="#a855f7"})=>(
            <div style={{padding:"12px 16px",background:"#0e0e18",borderRadius:8,border:`1px solid ${color}30`}}>
              <div style={{fontSize:5.5,color:"#555878",letterSpacing:2,marginBottom:8}}>{label}</div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:3,height:32,background:color,borderRadius:2,boxShadow:`0 0 8px ${color}60`}}/>
                <div>
                  <div style={{fontSize:13,color:color,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{time||driver}</div>
                  <div style={{fontSize:8,color:"#9a9eb8",marginTop:3,letterSpacing:1}}>{driver}{year?` · ${year}`:""}</div>
                  {team&&<div style={{fontSize:6.5,color:"#555878",marginTop:2}}>{team}</div>}
                </div>
              </div>
            </div>
          );

          return(
            <div style={{flex:1,overflowY:"auto",padding:24}}>
              <div style={{maxWidth:720,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>

                {/* Header */}
                <div style={{display:"flex",alignItems:"flex-start",gap:20,paddingBottom:16,borderBottom:"1px solid #1a1c28"}}>
                  <div style={{fontSize:36}}>{ci.flag}</div>
                  <div style={{flex:1}}>
                    <div style={{fontSize:20,letterSpacing:2,color:"#d0d2de",fontWeight:700,lineHeight:1}}>{ci.name}</div>
                    <div style={{fontSize:9,color:"#9a9eb8",letterSpacing:2,marginTop:6}}>{ci.location}</div>
                    <div style={{fontSize:7,color:"#555878",letterSpacing:1,marginTop:4}}>{ci.firstGPNote}</div>
                  </div>
                  <div style={{textAlign:"right"}}>
                    <div style={{fontSize:9,color:"#555878",letterSpacing:2}}>FIRST GP</div>
                    <div style={{fontSize:22,color:"#E10600",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{ci.firstGP}</div>
                  </div>
                </div>

                {/* Key stats grid */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:10}}>
                  <StatBox label="CIRCUIT LENGTH"  value={`${ci.length_km} km`}/>
                  <StatBox label="RACE LAPS"       value={ci.laps}/>
                  <StatBox label="CORNERS"         value={ci.turns}/>
                  <StatBox label="DRS ZONES"       value={ci.drs_zones}/>
                  <StatBox label="RACE DISTANCE"   value={`${ci.race_distance_km} km`}/>
                  <StatBox label="FIRST GRAND PRIX" value={ci.firstGP}/>
                </div>

                {/* Records row */}
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
                  <RecordBox
                    label="LAP RECORD"
                    driver={ci.lap_record.driver}
                    team={ci.lap_record.team}
                    time={ci.lap_record.time}
                    year={ci.lap_record.year}
                    color="#a855f7"
                  />
                  <RecordBox
                    label="LAST WINNER"
                    driver={ci.last_winner.driver}
                    team={ci.last_winner.team}
                    time={null}
                    year={ci.last_winner.year}
                    color="#FFD700"
                  />
                  <RecordBox
                    label="MOST WINS — DRIVER"
                    driver={ci.most_wins_driver.name}
                    time={`${ci.most_wins_driver.wins} wins`}
                    color="#E10600"
                  />
                  <RecordBox
                    label="MOST WINS — CONSTRUCTOR"
                    driver={ci.most_wins_constructor.name}
                    time={`${ci.most_wins_constructor.wins} wins`}
                    color="#00C8BA"
                  />
                </div>

                {/* Facts */}
                <div style={{background:"#0e0e18",borderRadius:8,padding:20,border:"1px solid #1a1c28"}}>
                  <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:14}}>CIRCUIT NOTES</div>
                  <div style={{display:"flex",flexDirection:"column",gap:10}}>
                    {ci.facts.map((fact,i)=>(
                      <div key={i} style={{display:"flex",gap:12,alignItems:"flex-start"}}>
                        <div style={{width:4,height:4,borderRadius:"50%",background:"#E10600",flexShrink:0,marginTop:5}}/>
                        <div style={{fontSize:8,color:"#9a9eb8",lineHeight:1.7,letterSpacing:0.5}}>{fact}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Add more circuits note */}
                <div style={{padding:14,borderRadius:6,background:"#090910",border:"1px solid #1a1c28",fontSize:7,color:"#333550",lineHeight:1.8,fontFamily:"'DM Mono',monospace"}}>
                  Add more circuits: update CIRCUIT_INFO in App.jsx and add a matching key in SESSIONS.
                </div>
              </div>
            </div>
          );
        })()}
      </div>


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

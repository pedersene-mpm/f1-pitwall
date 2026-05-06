import { useState, useEffect, useRef, useCallback, useMemo } from "react";

// ─── PATH HELPERS ─────────────────────────────────────────────────────────────
function catmullPath(pts, closed = true) {
  if (!pts || pts.length < 2) return "";
  const n = pts.length, T = 0.5 / 3;
  let d = `M${pts[0][0]},${pts[0][1]}`;
  const len = closed ? n : n - 1;
  // Index helper: wrap on closed paths, clamp on open paths.
  // Clamping on open paths prevents the spline from using the first/last
  // points as phantom tangent neighbours, which causes endpoint overshoot tips.
  const idx = closed
    ? (i) => (i + n) % n
    : (i) => Math.max(0, Math.min(n - 1, i));
  for (let i = 0; i < len; i++) {
    const p0=pts[idx(i-1)],p1=pts[i],p2=pts[idx(i+1)],p3=pts[idx(i+2)];
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
    {/* ── REAR WING ── thin, crisp endplates */}
    <rect x={-13} y={-6.5} width={1.8} height={13} rx={0.4} fill={color}/>
    <rect x={-13.2} y={-6.8} width={2.4} height={0.9} fill={color}/>
    <rect x={-13.2} y={5.9}  width={2.4} height={0.9} fill={color}/>
    {/* ── FLOOR + DIFFUSER ── */}
    <path d="M-9,-2.2 L-13,-2.6 L-13,2.6 L-9,2.2Z" fill={color} opacity={0.55}/>
    {/* ── REAR TYRES ── solid black, defined edge */}
    <rect x={-8.5} y={-5.5} width={4} height={2.3} rx={0.3} fill="#000" stroke={color} strokeWidth={0.4}/>
    <rect x={-8.5} y={3.2}  width={4} height={2.3} rx={0.3} fill="#000" stroke={color} strokeWidth={0.4}/>
    {/* ── SIDEPODS ── sharp triangular profile */}
    <path d="M-7,-3.2 L3.5,-4.5 L4,-3 L-7.2,-2.4Z" fill={color}/>
    <path d="M-7,3.2  L3.5,4.5  L4,3   L-7.2,2.4Z" fill={color}/>
    {/* sidepod inlet darkness */}
    <path d="M-4,-4.1 L-1,-3.6 L-1,-2.9 L-4,-3.4Z" fill="#000" opacity={0.4}/>
    <path d="M-4,4.1  L-1,3.6  L-1,2.9  L-4,3.4Z"  fill="#000" opacity={0.4}/>
    {/* ── MAIN CHASSIS ── single bold shape, crisp outline */}
    <path d="M-9,-2.4 L4,-2.6 L8,-1.4 L9.5,0 L8,1.4 L4,2.6 L-9,2.4Z" fill={color}/>
    {/* engine cover spine */}
    <path d="M-7,-0.4 L7,-0.4 L7,0.4 L-7,0.4Z" fill="#000" opacity={0.18}/>
    {/* ── COCKPIT ── crisp dark tub */}
    <rect x={-1.8} y={-1.6} width={5} height={3.2} rx={1.2} fill="#000"/>
    <rect x={-1.8} y={-1.6} width={5} height={3.2} rx={1.2} fill="none" stroke={color} strokeWidth={0.3} opacity={0.5}/>
    {/* halo bar — thicker, more defined */}
    <path d="M-1,0 Q1,-3.2 3,0" fill="none" stroke={color} strokeWidth={1.1} strokeLinecap="round"/>
    <rect x={0.5} y={-3.4} width={0.9} height={1.2} fill={color}/>
    {/* ── FRONT TYRES ── */}
    <rect x={3} y={-5.2} width={3.6} height={2.1} rx={0.3} fill="#000" stroke={color} strokeWidth={0.4}/>
    <rect x={3} y={3.1}  width={3.6} height={2.1} rx={0.3} fill="#000" stroke={color} strokeWidth={0.4}/>
    {/* ── NOSE CONE ── pointed, sharp */}
    <path d="M5.5,-1.8 L11.5,0 L5.5,1.8Z" fill={color}/>
    <path d="M7,-1 L11,0 L7,1Z" fill="#000" opacity={0.15}/>
    {/* ── FRONT WING ── narrower endplates, F1-proportional */}
    <rect x={11} y={-5}   width={1.6} height={10} rx={0.4} fill={color}/>
    <rect x={10.7} y={-5.3} width={2.2} height={0.8} fill={color}/>
    <rect x={10.7} y={4.5}  width={2.2} height={0.8} fill={color}/>
    {/* front wing element connecting to nose */}
    <path d="M5.5,-2.4 L11,-3.6 L11,-2.8 L5.5,-1.6Z" fill={color}/>
    <path d="M5.5,2.4  L11,3.6  L11,2.8  L5.5,1.6Z"  fill={color}/>
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
        {w>8&&<span style={{position:"absolute",left:3,top:"50%",transform:"translateY(-50%)",fontSize:5,fontWeight:700,color:"#000"}}>{st.compound==="UNKNOWN"?"?":st.compound[0]}</span>}
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

function PitToast({ event }) {
  const [visible, setVisible] = useState(false);
  const [current, setCurrent] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    if (!event) return;
    setCurrent(event);
    setVisible(true);
    clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setVisible(false), 3000);
  }, [event]);

  if (!current) return null;

  return (
    <div style={{
      position: "fixed", top: 110, right: 20,
      transform: `translateX(${visible ? 0 : 360}px)`,
      transition: "transform 0.4s cubic-bezier(.4,0,.2,1), opacity 0.4s",
      opacity: visible ? 1 : 0,
      zIndex: 200, pointerEvents: "none",
      background: "linear-gradient(135deg, #2a1500, #1a0a00)",
      border: "1px solid #ff8c00",
      borderRadius: 8, padding: "9px 18px",
      display: "flex", alignItems: "center", gap: 12,
      boxShadow: "0 0 25px #ff8c0050",
      minWidth: 220,
    }}>
      <div style={{ fontSize: 14, color: "#ff8c00" }}>🛞</div>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 7, letterSpacing: 3, color: "#ff8c00", marginBottom: 3, fontWeight: 700 }}>
          PIT STOP — LAP {current.lap}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 3, height: 14, background: current.color, borderRadius: 2 }} />
          <span style={{ fontSize: 10, color: current.color, fontWeight: 700, letterSpacing: 2 }}>
            {current.code}
          </span>
          <span style={{ fontSize: 8, color: "#9a9eb8", letterSpacing: 1 }}>
            entering pits
          </span>
        </div>
      </div>
    </div>
  );
}

// ─── SESSIONS ─────────────────────────────────────────────────────────────────
const SESSIONS = [
  { key:"british_2024_race", flag:"🇬🇧", name:"British GP",  year:2024, type:"Race", sessionType:"race", file:"/data/british_2024_race.json", circuit:"Silverstone" },
  { key:"monaco_2024_race",  flag:"🇲🇨", name:"Monaco GP",   year:2024, type:"Race", sessionType:"race", file:"/data/monaco_2024_race.json",  circuit:"Monaco"      },
  { key:"miami_2026_race",   flag:"🇺🇸", name:"Miami GP",    year:2026, type:"Race", sessionType:"race", file:"/data/miami_2026_race.json",   circuit:"Miami"       },
];

// ─── SESSION TYPES ────────────────────────────────────────────────────────────
// Each session type drives a different primary view layout:
//   race      → track map dominant, sidebar with race order (current default)
//   sprint    → same as race, just shorter (~24 laps)
//   qualifying → leaderboard by fastest lap, elimination zones, smaller track view
//   practice  → live timing focused, lap times by tire compound, supplementary track
//   live      → uses the same layout for that type but data comes from OpenF1
//
// Helper: classify a session given its type string.
const SESSION_TYPES = {
  RACE:       "race",
  SPRINT:     "sprint",
  QUALIFYING: "qualifying",
  PRACTICE:   "practice",
};

function classifySessionType(typeStr) {
  if (!typeStr) return SESSION_TYPES.RACE;
  const t = typeStr.toLowerCase();
  if (t.includes("qualif") || t === "q") return SESSION_TYPES.QUALIFYING;
  if (t.includes("sprint") || t === "s") return SESSION_TYPES.SPRINT;
  if (t.includes("practice") || t.startsWith("fp") || t === "p1" || t === "p2" || t === "p3") return SESSION_TYPES.PRACTICE;
  return SESSION_TYPES.RACE;
}

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
  {code:"PIA",name:"Oscar Piastri",   team:"McLaren",        color:"#FF8000"},
  {code:"LEC",name:"Charles Leclerc", team:"Ferrari",        color:"#E8002D"},
  {code:"HAM",name:"Lewis Hamilton",  team:"Ferrari",        color:"#E8002D"},
  {code:"VER",name:"Max Verstappen",  team:"Red Bull",       color:"#3671C6"},
  {code:"HAD",name:"Isack Hadjar",    team:"Red Bull",       color:"#3671C6"},
  {code:"RUS",name:"George Russell",  team:"Mercedes",       color:"#27F4D2"},
  {code:"ANT",name:"Kimi Antonelli",  team:"Mercedes",       color:"#27F4D2"},
  {code:"ALO",name:"Fernando Alonso", team:"Aston Martin",   color:"#229971"},
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

function buildMock(){return{wp:MOCK_WP,tl:MOCK_TL,drivers:applyTeammateColors([...MOCK_DRIVERS]),steps:MOCK_STEPS,totalLaps:MOCK_LAPS,lapTimeS:MOCK_LAP_S,viewBox:"145 35 525 470",cornerLabels:MOCK_CORNER_LABELS,corners:[],s1end:32,s2end:54,drs1:[20,24],drs2:[50,54],sessionName:"Select a session →",sessionType:"race",dataSource:"replay",isLive:false,pitLanePath:generatePitLanePath(MOCK_WP,"Silverstone")};}

// ─── OFFICIAL 2026 TEAM COLORS + IDENTITY ─────────────────────────────────────
// Canonical hex codes — overrides whatever FastF1 returns to ensure consistency.
const TEAM_COLORS = {
  "Red Bull":     { primary:"#3671C6", short:"RBR", full:"Red Bull Racing"      },
  "Ferrari":      { primary:"#E8002D", short:"FER", full:"Scuderia Ferrari"     },
  "McLaren":      { primary:"#FF8000", short:"MCL", full:"McLaren"              },
  "Mercedes":     { primary:"#27F4D2", short:"MER", full:"Mercedes-AMG Petronas"},
  "Aston Martin": { primary:"#229971", short:"AMR", full:"Aston Martin Aramco"  },
  "Alpine":       { primary:"#FF87BC", short:"ALP", full:"Alpine"               },
  "Williams":     { primary:"#1868DB", short:"WIL", full:"Williams"             },
  "Haas":         { primary:"#B6BABD", short:"HAA", full:"Haas"                 },
  "Audi":         { primary:"#52E252", short:"AUD", full:"Audi"                 },
  "Sauber":       { primary:"#52E252", short:"AUD", full:"Audi (was Sauber)"    },
  "Cadillac":     { primary:"#FFC72C", short:"CAD", full:"Cadillac"             },
  "Racing Bulls": { primary:"#6692FF", short:"RB",  full:"Racing Bulls"         },
  "RB":           { primary:"#6692FF", short:"RB",  full:"Racing Bulls"         },
  "AlphaTauri":   { primary:"#6692FF", short:"RB",  full:"Racing Bulls"         },
  "Alfa Romeo":   { primary:"#52E252", short:"AUD", full:"Audi (was Alfa Romeo)"},
};

// Driver → Team mapping for the 2026 grid (independent of FastF1 strings)
const DRIVER_TO_TEAM = {
  VER:"Red Bull",     HAD:"Red Bull",
  LEC:"Ferrari",      HAM:"Ferrari",
  NOR:"McLaren",      PIA:"McLaren",
  RUS:"Mercedes",     ANT:"Mercedes",
  ALO:"Aston Martin", STR:"Aston Martin",
  HUL:"Audi",         BOR:"Audi",
  PER:"Cadillac",     BOT:"Cadillac",
  SAI:"Williams",     ALB:"Williams",
  GAS:"Alpine",       COL:"Alpine",
  OCO:"Haas",         BEA:"Haas",
  LAW:"Racing Bulls", LIN:"Racing Bulls",
  TSU:"Racing Bulls", MAG:"Haas",
};

function resolveTeam(teamName, driverCode) {
  if (driverCode && DRIVER_TO_TEAM[driverCode] && TEAM_COLORS[DRIVER_TO_TEAM[driverCode]]) {
    return { key: DRIVER_TO_TEAM[driverCode], ...TEAM_COLORS[DRIVER_TO_TEAM[driverCode]] };
  }
  if (!teamName) return null;
  const t = teamName.toLowerCase();
  for (const [key, info] of Object.entries(TEAM_COLORS)) {
    if (t.includes(key.toLowerCase())) return { key, ...info };
  }
  return null;
}

function TeamBadge({ teamName, driverCode, size="md" }) {
  const team = resolveTeam(teamName, driverCode);
  if (!team) return null;
  const dims = size==="lg" ? {h:36, font:13, pad:"0 14px"}
              : size==="sm" ? {h:18, font:7,  pad:"0 7px"}
                            : {h:24, font:9,  pad:"0 10px"};
  return (
    <div style={{
      display:"inline-flex", alignItems:"center", gap:7,
      height:dims.h, padding:dims.pad,
      background:`${team.primary}15`,
      border:`1px solid ${team.primary}66`,
      borderRadius:4,
    }}>
      <div style={{ width:3, height:dims.h*0.6, background:team.primary, borderRadius:2,
                    boxShadow:`0 0 6px ${team.primary}80` }}/>
      <span style={{ fontSize:dims.font, fontWeight:700, color:team.primary,
                     letterSpacing:1.5, fontFamily:"'Orbitron',sans-serif" }}>
        {team.short}
      </span>
    </div>
  );
}

// ─── PIT LANE — PER CIRCUIT ───────────────────────────────────────────────────
// Each circuit has a specific pit lane location relative to its start/finish.
// We define which range of track waypoints to mirror, the perpendicular offset
// distance in SVG units, and which side (positive = clockwise from track direction,
// negative = counter-clockwise). Tune visually until it looks right.
//
// To add a new circuit:
//   1. Identify which fraction of the lap the pit lane covers (e.g. 0.0–0.18)
//   2. Try offset 24 first; flip to -24 if it ends up on the wrong side
//   3. Reload and adjust
const CIRCUIT_PIT_LANE = {
  Silverstone: { startFrac: 0.00, endFrac: 0.18, offset:  24 },
  Monaco:      { startFrac: 0.95, endFrac: 0.10, offset: -16, wrap: true }, // pit before S/F
  Miami:       { startFrac: 0.93, endFrac: 0.11, offset:  28, wrap: true },  // T18 entry → S/F → past T2 exit, inside
  Canada:      { startFrac: 0.92, endFrac: 0.08, offset:  22, wrap: true },
};

function generatePitLanePath(wp, circuitKey) {
  if (!wp || wp.length < 10) return [];
  const cfg = CIRCUIT_PIT_LANE[circuitKey];
  if (!cfg) return []; // no pit lane defined for this circuit yet

  const n = wp.length;
  let pts;
  if (cfg.wrap) {
    // Pit lane wraps around start/finish line
    const startIdx = Math.floor(n * cfg.startFrac);
    const endIdx   = Math.floor(n * cfg.endFrac);
    pts = [...wp.slice(startIdx), ...wp.slice(0, endIdx + 1)];
  } else {
    const startIdx = Math.floor(n * cfg.startFrac);
    const endIdx   = Math.floor(n * cfg.endFrac);
    pts = wp.slice(startIdx, endIdx + 1);
  }
  if (pts.length < 4) return [];

  // Compute average track direction over the segment
  const start = pts[0], end = pts[pts.length - 1];
  const dx = end[0] - start[0], dy = end[1] - start[1];
  const len = Math.hypot(dx, dy) || 1;
  // Perpendicular based on offset sign
  const sign = cfg.offset >= 0 ? 1 : -1;
  const px = sign * (-dy / len), py = sign * (dx / len);
  const offset = Math.abs(cfg.offset);

  // Tapered ramps so pit lane visually joins main track at both ends.
  // Per-side taper lengths can be set per circuit via cfg.rampInFrac / cfg.rampOutFrac
  // (defaults: 0.15 each = 15% of the pit segment).
  const rampInFrac  = cfg.rampInFrac  ?? 0.15;
  const rampOutFrac = cfg.rampOutFrac ?? 0.15;
  const result = [];
  for (let i = 0; i < pts.length; i++) {
    const tIn  = Math.min(1, i / (pts.length * rampInFrac));
    const tOut = Math.min(1, (pts.length - 1 - i) / (pts.length * rampOutFrac));
    const taper = Math.min(tIn, tOut);
    const o = offset * taper;
    result.push([pts[i][0] + px * o, pts[i][1] + py * o]);
  }
  // Force the first and last points to land exactly on the track to prevent
  // Catmull-Rom spline from overshooting at endpoints (the stray "tip" issue).
  if (result.length > 0) {
    result[0]               = [pts[0][0],               pts[0][1]];
    result[result.length-1] = [pts[pts.length-1][0],   pts[pts.length-1][1]];
  }
  return result;
}

// Resolve circuit key from session name
function resolveCircuitKey(sessionName) {
  const s = (sessionName || "").toLowerCase();
  if (s.includes("british") || s.includes("silverstone")) return "Silverstone";
  if (s.includes("monaco")) return "Monaco";
  if (s.includes("miami")) return "Miami";
  if (s.includes("canada") || s.includes("canadian")) return "Canada";
  return null;
}

// ─── COLOR UTILITIES ──────────────────────────────────────────────────────────
function darkenHex(hex, amount=0.35) {
  const m=hex.replace("#","").match(/.{2}/g);
  if(!m||m.length!==3) return hex;
  const [r,g,b]=m.map(h=>parseInt(h,16));
  const dr=Math.round(r*(1-amount));
  const dg=Math.round(g*(1-amount));
  const db=Math.round(b*(1-amount));
  return `#${dr.toString(16).padStart(2,"0")}${dg.toString(16).padStart(2,"0")}${db.toString(16).padStart(2,"0")}`;
}

// Apply darker shade to one driver per team — reverse alphabetical so:
// LEC > HAM, VER > HAD, RUS > ANT, PER > BOT, GAS > COL, OCO > BEA, etc.
// (the second after sort gets darkened)
function applyTeammateColors(drivers) {
  const teamGroups={};
  drivers.forEach(d=>{
    if(!teamGroups[d.team]) teamGroups[d.team]=[];
    teamGroups[d.team].push(d);
  });
  Object.values(teamGroups).forEach(group=>{
    if(group.length<2) return;
    group.sort((a,b)=>b.code.localeCompare(a.code)); // reverse alpha
    group[1].color=darkenHex(group[1].color,0.42);
  });
  return drivers;
}

function processRealData(json){
  const{track,race}=json,wp=track.points,n=wp.length;
  const xs=wp.map(p=>p[0]),ys=wp.map(p=>p[1]);
  const xMin=Math.min(...xs)-30,yMin=Math.min(...ys)-30;
  const vbW=Math.max(...xs)-xMin+30,vbH=Math.max(...ys)-yMin+30;
  const hasPosFor=new Set(Object.keys(race.positions));
  const drivers=applyTeammateColors(
    race.drivers.filter(d=>hasPosFor.has(d.code))
      .map(d=>{
        const team=resolveTeam(d.team,d.code);
        return{
          code:d.code,
          name:d.name||d.code,
          team:team?.full||d.team||"",
          color:team?.primary||(d.color.startsWith("#")?d.color:"#"+d.color),
          retiredAtStep:d.retired_at_step??null,
          pitLaps:d.pit_laps??[],
          pitWindows:d.pit_windows??[],
        };
      })
  );
  // Pit lane: backend-provided OR per-circuit config (no auto-generation fallback)
  const backendPitLane=(track.pit_lane_points||[]).map(p=>[p[0],p[1]]);
  const circuitKey=resolveCircuitKey(`${race.event} ${race.year}`);
  const pitLanePath = backendPitLane.length>=4
    ? backendPitLane
    : generatePitLanePath(wp, circuitKey);

  // ── Build pit windows from pit_laps using the circuit's pit lane fractions ──
  // If the backend gave us pit_laps for a driver but no pit_windows, construct
  // them from the circuit's startFrac/endFrac so the car routes onto the
  // visual pit lane during the right portion of each pit-stop lap.
  // Slight bias: extend window 0.015 earlier on entry and 0.025 later on exit
  // so cars peel off and merge back naturally rather than visibly jumping.
  const cfg = circuitKey ? CIRCUIT_PIT_LANE[circuitKey] : null;
  const ENTRY_BIAS = 0.015;
  const EXIT_BIAS  = 0.025;
  drivers.forEach(d=>{
    if (d.pitWindows.length>0) return; // backend already provided windows
    if (!cfg || !d.pitLaps?.length) return;
    d.pitWindows = d.pitLaps.map(lapNum => {
      if (cfg.wrap) {
        return [lapNum - 1 + cfg.startFrac - ENTRY_BIAS, lapNum + cfg.endFrac + EXIT_BIAS];
      }
      return [lapNum + cfg.startFrac - ENTRY_BIAS, lapNum + cfg.endFrac + EXIT_BIAS];
    });
  });
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
    corners:track.corners||[],
    s1end:Math.floor(n*0.45),s2end:Math.floor(n*0.75),
    drs1:[Math.floor(n*0.30),Math.floor(n*0.44)],
    drs2:[Math.floor(n*0.62),Math.floor(n*0.74)],
    sessionName:`${race.event} ${race.year} — ${race.session}`,
    sessionType: classifySessionType(race.session),
    dataSource: "replay",   // "replay" or "live" — drives polling vs scrubbing UX
    isLive:     false,
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
  const [pitEv,setPitEv]=useState(null); // pit entry toast
  const pitToastRef=useRef({}); // {code: lastShownLap}
  const [strategyData, setStrategyData]=useState(null);
  const [strategyErr,  setStrategyErr ]=useState(null);
  const [strategyLoading, setStrategyLoading]=useState(false);

  const{wp,tl,drivers,steps,totalLaps,lapTimeS,viewBox,cornerLabels,corners=[],
        s1end,s2end,drs1,drs2,sessionName,pitLanePath,lapTimes={},
        sessionType="race",dataSource="replay",isLive=false}=dataset;
  const baseStepsPerSec=steps/(totalLaps*lapTimeS);

  const pathRef=useRef(null),pitPathRef=useRef(null),rafRef=useRef(null),stepR=useRef(0);
  const lastRenderRef=useRef({}); // {code: {x,y,angle,inPit}} — for smooth pit transitions
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
    document.head.appendChild(l);
    // Inject sector shimmer animation globally
    const s=document.createElement("style");
    s.textContent="@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}@keyframes livePulse{0%,100%{opacity:1}50%{opacity:0.35}}";
    document.head.appendChild(s);
    return()=>{document.head.removeChild(l);document.head.removeChild(s);};
  },[]);

  // Load strategy data when the loaded session's circuit changes
  useEffect(()=>{
    if(dataMode==="SELECT")return;
    const sessionLower=(dataset.sessionName||"").toLowerCase();
    let slug=null;
    if(sessionLower.includes("british")||sessionLower.includes("silverstone")) slug="british";
    else if(sessionLower.includes("monaco")) slug="monaco";
    else if(sessionLower.includes("miami")) slug="miami";
    else if(sessionLower.includes("canadian")||sessionLower.includes("canada")) slug="canadian";
    if(!slug)return;
    setStrategyLoading(true);setStrategyErr(null);setStrategyData(null);
    fetch(`/data/strategy/${slug}_strategy.json`)
      .then(r=>{
        if(!r.ok)throw new Error(`Strategy data not found (${r.status}). Run fastf1_strategy.py for ${slug}.`);
        return r.json();
      })
      .then(data=>{setStrategyData(data);setStrategyLoading(false);})
      .catch(err=>{setStrategyErr(err.message);setStrategyLoading(false);});
  },[dataset,dataMode]);

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
    // Fire the toast only AFTER a driver has driven into the next lap by at
    // least 10% — so the time appears as they cross start/finish rather than
    // at the moment a fast S3 finishes (which would imply we knew the time
    // instantly, which we don't).
    const lt=lapTimesRef.current;
    const dmap=driversMapRef.current;
    for(const code of Object.keys(lt)){
      const drvLaps=lt[code];
      const rawNow=frA.raw?.[code]||0;
      const lapFrac=rawNow-Math.floor(rawNow);
      // The lap that JUST completed is one less than the current lap number.
      // Only show the toast once the driver is at least 10% into the new lap.
      const curLap=frA.lap?.[code];
      const completedLap=curLap?curLap-1:null;
      if(completedLap&&completedLap>=1&&drvLaps[completedLap]&&lapFrac>=0.10){
        const lapSec=drvLaps[completedLap];
        if(lapSec<fastestRef.current.bestTime&&lapSec>40){
          fastestRef.current={bestTime:lapSec,bestCode:code,bestLap:completedLap};
          const drv=dmap[code];
          const mins=Math.floor(lapSec/60);
          const secs=(lapSec%60).toFixed(3).padStart(6,"0");
          setFastestLapEv({code,lap:completedLap,color:drv?.color||"#a855f7",time:`${mins}:${secs}`});
        }
      }
    }

    for(const d of drivers){
      const posA=frA.pos[d.code];if(posA==null)continue;
      const rawNow=frA.raw[d.code]||0;
      // Tighter buffer — only consider in pit when actually within the segment
      const pitWin=d.pitWindows?.find(w=>rawNow>=w[0]-0.02&&rawNow<=w[1]+0.02);

      // Pit entry detection — fire toast once per pit window per driver
      if(pitWin){
        const pitWinKey=`${pitWin[0].toFixed(2)}`;
        const dmap2=driversMapRef.current;
        if(pitToastRef.current[d.code]!==pitWinKey){
          const pitFracCheck=(rawNow-pitWin[0])/(pitWin[1]-pitWin[0]);
          if(pitFracCheck>=0&&pitFracCheck<0.2){
            pitToastRef.current[d.code]=pitWinKey;
            const drv=dmap2[d.code];
            const pitLap=Math.floor(rawNow)+1;
            setPitEv({code:d.code,lap:pitLap,color:drv?.color||"#ff8c00",ts:Date.now()});
          }
        }
      }

      let x,y,angle;
      const isInPit = Boolean(pitWin&&pitEl&&pitTotal>0);
      if(isInPit){
        // Smooth interpolation while in pit lane
        const rawB = frB?.raw?.[d.code] ?? rawNow;
        const rawSmooth = rawNow + (rawB - rawNow) * frac;
        const pitFrac=Math.max(0,Math.min(1,(rawSmooth-pitWin[0])/(pitWin[1]-pitWin[0])));
        const pitL=pitFrac*pitTotal;
        const pt=pitEl.getPointAtLength(pitL);
        const pa=pitEl.getPointAtLength(Math.max(0,pitL-3));
        const pb=pitEl.getPointAtLength(Math.min(pitTotal,pitL+3));
        x=pt.x;y=pt.y;angle=Math.atan2(pb.y-pa.y,pb.x-pa.x)*57.2958;
      }else{
        // Smooth lerp on track
        const pos=lerpPos(posA,frB?.pos[d.code],frac,0.05);
        const l=pos*total;
        const pt=el.getPointAtLength(l);
        const pa=el.getPointAtLength(Math.max(0,l-5));
        const pb=el.getPointAtLength(Math.min(total,l+5));
        x=pt.x;y=pt.y;angle=Math.atan2(pb.y-pa.y,pb.x-pa.x)*57.2958;
      }

      // ── Pixel-space smoothing across pit↔track transitions ──
      // After a pit→track or track→pit transition, keep smoothing for a few
      // frames so the car eases all the way to its target position rather than
      // catching up in a single 32% step.
      const last=lastRenderRef.current[d.code];
      if(last){
        const dx=x-last.x, dy=y-last.y;
        const jumpDist=Math.hypot(dx,dy);
        const stateChanged = last.inPit !== isInPit;
        // Start a transition cooldown when state changes; decrement each frame
        let cooldown = last.cooldown ?? 0;
        if (stateChanged) cooldown = 14; // smooth over ~14 frames (~230ms at 60fps)
        // Apply smoothing if in cooldown OR if there's any meaningful jump
        if (cooldown > 0 || jumpDist > 6) {
          const ease = 0.22; // gentler ease per frame
          x = last.x + dx*ease;
          y = last.y + dy*ease;
          let da = angle-last.angle;
          if(da>180) da-=360;
          if(da<-180) da+=360;
          angle = last.angle + da*ease;
          cooldown = Math.max(0, cooldown - 1);
        }
        lastRenderRef.current[d.code]={x,y,angle,inPit:isInPit,cooldown};
      } else {
        lastRenderRef.current[d.code]={x,y,angle,inPit:isInPit,cooldown:0};
      }

      out[d.code]={x,y,angle,isInPit};
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

  const clearAll=()=>{speedHistRef.current={};gapHistRef.current={};setSpeedHist({});setGapHist({});fastestRef.current={bestTime:Infinity,bestCode:null,bestLap:null};pitToastRef.current={};lastRenderRef.current={};};

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
  // Each driver has 3 sectors per lap. As they progress around the circuit,
  // sectors transition: pending → active → complete (with colour + time).
  //
  // Sector boundaries (approx for any circuit):
  //   S1 ends at ~33% of the lap
  //   S2 ends at ~66% of the lap
  //   S3 ends at lap completion (100%)
  //
  // Rules (only apply once a sector is COMPLETE):
  //   Purple  — fastest sector time set by ANY driver across all completed laps
  //   Green   — driver's own personal best for that sector
  //   Yellow  — slower than personal best
  //   Pending — driver hasn't reached this sector yet (grey bar, no time)
  //   Active  — driver is currently in this sector (live colour, no time yet)
  const sectorAnalysis=useMemo(()=>{
    const BASE=[26.1,31.8,19.4]; // base S1, S2, S3 times in seconds
    const EPS=0.011;
    const SECTOR_BOUNDS=[0.333,0.666,1.0]; // end of each sector as fraction of lap

    // Deterministic mock sector time per driver/sector/lap
    function mockT(code,si,lap){
      const seed=(code.charCodeAt(0)*31+(code.charCodeAt(2)||0)*17+si*7+lap*13)%100;
      return BASE[si]+(seed/100)*2.0-0.5;
    }

    const fr=tl[step]||{};

    // Step 1: per-driver state for current and historical sectors
    // For a complete lap N: all 3 sectors are done with times
    // For the in-progress lap (the highest one): some sectors done, others active/pending
    const driverState={};
    drivers.forEach(d=>{
      const rawNow=fr.raw?.[d.code]||0;
      const fullLap=Math.floor(rawNow);          // last fully completed lap
      const lapFrac=rawNow-fullLap;               // 0..1 progress through current lap
      const currentLap=fullLap+1;                 // the lap currently being driven

      // Personal bests across all completed sectors so far
      const pb=[Infinity,Infinity,Infinity];
      for(let lap=1;lap<=fullLap;lap++){
        for(let si=0;si<3;si++){
          pb[si]=Math.min(pb[si],mockT(d.code,si,lap));
        }
      }

      // Determine state for each sector on the CURRENT lap
      const perSector=[0,1,2].map(si=>{
        const sectorEnd=SECTOR_BOUNDS[si];
        const sectorStart=si===0?0:SECTOR_BOUNDS[si-1];

        // If this sector hasn't been entered yet on the current lap
        if(lapFrac<sectorStart){
          // Show last completed lap's value if available, else pending
          if(fullLap>=1){
            const t=mockT(d.code,si,fullLap);
            return {state:"complete",t,curT:t,pb:pb[si]};
          }
          return {state:"pending"};
        }
        // Currently driving through this sector
        if(lapFrac>=sectorStart && lapFrac<sectorEnd){
          // No time yet — sector is in progress on this lap
          // But if the driver has prior laps, show last lap's value as a stale reference
          if(fullLap>=1){
            const t=mockT(d.code,si,fullLap);
            return {state:"active",t,curT:t,pb:pb[si]};
          }
          return {state:"active"};
        }
        // Past this sector — completed it on the current lap
        const curT=mockT(d.code,si,currentLap);
        // Update PB for current sector
        const newPB=Math.min(pb[si],curT);
        pb[si]=newPB;
        return {state:"complete",t:curT,curT,pb:newPB};
      });

      driverState[d.code]={perSector,pb,fullLap,currentLap,lapFrac};
    });

    // Step 2: session best per sector — global minimum across ALL drivers' completed sectors
    const sessionBest=[Infinity,Infinity,Infinity];
    drivers.forEach(d=>{
      const st=driverState[d.code];
      if(!st)return;
      st.perSector.forEach((sec,si)=>{
        if(sec.state==="complete"&&typeof sec.t==="number"){
          // Use the actual time set, not just PB
          sessionBest[si]=Math.min(sessionBest[si],sec.t);
        }
        // Also fold in PB just in case
        if(sec.pb!=null&&isFinite(sec.pb)){
          sessionBest[si]=Math.min(sessionBest[si],sec.pb);
        }
      });
    });

    // Step 3: compose final colour + time per sector
    const result={};
    drivers.forEach(d=>{
      const st=driverState[d.code];
      if(!st){result[d.code]=[{state:"pending"},{state:"pending"},{state:"pending"}];return;}
      result[d.code]=st.perSector.map((sec,si)=>{
        if(sec.state==="pending") return {state:"pending"};
        if(sec.state==="active")  return {state:"active",t:sec.t?sec.t.toFixed(1):null};
        // state === complete
        let color;
        if(Math.abs(sec.curT-sessionBest[si])<EPS) color="#a855f7";       // session best
        else if(Math.abs(sec.curT-sec.pb)<EPS)     color="#00ff88";       // personal best
        else                                        color="#FFD700";       // slower
        return {state:"complete",color,t:sec.curT.toFixed(1)};
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
  const NAV=[{id:"sessions",label:"SESSIONS"},{id:"race",label:"RACE MAP"},{id:"driver",label:"DRIVER"},{id:"circuit",label:"CIRCUIT"},{id:"strategy",label:"STRATEGY"}];
  const modeColor={"SELECT":"#333860","DATA":"#4CAF50","LIVE":"#ff4444"}[dataMode]||"#333860";
  const modeBg  ={"SELECT":"#0e0e22","DATA":"#0e2a0e","LIVE":"#2a0a0a"}[dataMode]||"#0e0e22";
  const modeText={"SELECT":"◌ SELECT SESSION","DATA":"◉ DATA","LIVE":"◉ LIVE"}[dataMode]||"◌";

  return(
    <div style={{fontFamily:"'Orbitron',sans-serif",background:"#0d0d12",color:"#d0d2de",height:"100vh",display:"flex",flexDirection:"column",overflow:"hidden"}}>

      {/* Fastest lap toast */}
      <FastestLapToast event={fastestLapEv}/>
      <PitToast event={pitEv}/>

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
          {/* Session type pill — RACE / QUAL / FP1 etc */}
          {dataMode!=="SELECT"&&(
            <span style={{fontSize:6.5,letterSpacing:2,padding:"2px 6px",background:"#0e0e18",color:"#9a9eb8",border:"1px solid #1a1c28",borderRadius:3,fontWeight:700}}>
              {sessionType==="qualifying"?"QUAL":sessionType==="practice"?"PRAC":sessionType==="sprint"?"SPRINT":"RACE"}
            </span>
          )}
          {/* Live indicator with pulsing dot */}
          {isLive&&(
            <span style={{fontSize:6.5,letterSpacing:2,padding:"2px 7px",background:"#2a0606",color:"#ff3333",border:"1px solid #ff333355",borderRadius:3,display:"flex",alignItems:"center",gap:5,fontWeight:700}}>
              <span style={{width:6,height:6,borderRadius:"50%",background:"#ff3333",animation:"livePulse 1.5s ease-in-out infinite"}}/>
              LIVE
            </span>
          )}
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
          <style>{`@keyframes slide{0%{transform:translateX(-100%)}100%{transform:translateX(600%)}}@keyframes shimmer{0%{background-position:200% 0}100%{background-position:-200% 0}}`}</style>
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
                <filter id="ambientHalo" x="-30%" y="-30%" width="160%" height="160%">
                  <feGaussianBlur stdDeviation="22" result="b"/>
                  <feMerge><feMergeNode in="b"/></feMerge>
                </filter>
                <linearGradient id="depthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#0d0d12" stopOpacity={tilt>5?0.6:0}/>
                  <stop offset="55%" stopColor="#0d0d12" stopOpacity="0"/>
                </linearGradient>
              </defs>
              {/* Ambient halo — soft cyan aura for broadcast feel */}
              <path d={trackD} fill="none" stroke="#3b82f6" strokeWidth={50} strokeOpacity={0.04} style={{filter:"url(#ambientHalo)"}}/>
              <path d={trackD} fill="none" stroke="#1a3acc" strokeWidth={32} strokeOpacity={0.05} style={{filter:"url(#trackGlow)"}}/>
              {/* Pit lane — parallel to S/F straight, white-edged */}
              {pitLaneD&&<>
                <path d={pitLaneD} fill="none" stroke="#ffffff" strokeWidth={9} strokeLinecap="round" strokeOpacity={0.7}/>
                <path d={pitLaneD} fill="none" stroke="#1e2030" strokeWidth={7} strokeLinecap="round"/>
                <path d={pitLaneD} fill="none" stroke="#252838" strokeWidth={5} strokeLinecap="round"/>
                <path d={pitLaneD} fill="none" stroke="#ffffff" strokeWidth={0.6} strokeDasharray="3 5" strokeOpacity={0.45} strokeLinecap="round"/>
              </>}
              {/* Track — runoff first (wider grey halo), then borders, then asphalt */}
              <path d={trackD} fill="none" stroke="#3a3e5a" strokeWidth={32} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.18}/>
              <path d={trackD} fill="none" stroke="#ffffff" strokeWidth={22} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.92}/>
              <path d={trackD} fill="none" stroke="#1a1c2c" strokeWidth={20} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#23263a" strokeWidth={17} strokeLinecap="round" strokeLinejoin="round"/>
              <path d={trackD} fill="none" stroke="#2c2f44" strokeWidth={12} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.8}/>
              {/* Subtle racing line — slightly lighter strip near inside */}
              <path d={trackD} fill="none" stroke="#3a3e5a" strokeWidth={5} strokeLinecap="round" strokeLinejoin="round" strokeOpacity={0.3}/>
              {/* Centre dash */}
              <path d={trackD} fill="none" stroke="#4a4e6e" strokeWidth={0.8} strokeDasharray="5 10" strokeOpacity={.5}/>
              {/* Sector tint washes — visible colour over each sector segment */}
              {(()=>{
                if(!wp||wp.length<5||!s1end||!s2end) return null;
                const s1Path = sectorPath(wp, 0, s1end);
                const s2Path = sectorPath(wp, s1end, s2end);
                const s3Path = sectorPath(wp, s2end, wp.length-1);
                return(
                  <>
                    <path d={s1Path} fill="none" stroke="#22c55e" strokeWidth={13} strokeOpacity={0.20} strokeLinecap="round" strokeLinejoin="round"/>
                    <path d={s2Path} fill="none" stroke="#a855f7" strokeWidth={13} strokeOpacity={0.20} strokeLinecap="round" strokeLinejoin="round"/>
                    <path d={s3Path} fill="none" stroke="#3b82f6" strokeWidth={13} strokeOpacity={0.20} strokeLinecap="round" strokeLinejoin="round"/>
                  </>
                );
              })()}
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
              {/* S/F start line — checkered pattern */}
              {(()=>{
                if(!wp[0]||!wp[1]) return null;
                const dx=wp[1][0]-wp[0][0], dy=wp[1][1]-wp[0][1];
                const len=Math.hypot(dx,dy)||1;
                // Perpendicular vector (across track width)
                const px=-dy/len, py=dx/len;
                const halfW=8;
                const x1=sfX+px*halfW, y1=sfY+py*halfW;
                const x2=sfX-px*halfW, y2=sfY-py*halfW;
                // Draw 6 checkered segments
                const segs=[];
                for(let i=0;i<6;i++){
                  const t1=i/6, t2=(i+1)/6;
                  const sx1=x1+(x2-x1)*t1, sy1=y1+(y2-y1)*t1;
                  const sx2=x1+(x2-x1)*t2, sy2=y1+(y2-y1)*t2;
                  segs.push(<line key={i} x1={sx1} y1={sy1} x2={sx2} y2={sy2}
                    stroke={i%2===0?"#ffffff":"#000"} strokeWidth={3.5} strokeLinecap="butt" opacity={0.95}/>);
                }
                return<>
                  {segs}
                  <text x={sfX+px*halfW+px*5} y={sfY+py*halfW+py*5+2}
                    fill="#ffffff" fontSize={5} fontFamily="'DM Mono',monospace"
                    textAnchor="middle" opacity={0.7}>S/F</text>
                </>;
              })()}
              {/* Corner kerbs removed per user request */}

              {/* Corner labels — white */}
              {cornerLabels.map(([name,x,y,anchor])=>(<text key={name} x={x} y={y} fill="#ffffff" fontSize={5.5} textAnchor={anchor} fontFamily="'DM Mono',monospace" letterSpacing={.5} opacity={0.7}>{name}</text>))}

              {/* Sector start signs — offset perpendicular to track direction */}
              {(()=>{
                if(!wp||wp.length<5) return null;
                const sectorPoints=[
                  {idx:0,           label:"S1", color:"#22c55e"},
                  {idx:s1end,       label:"S2", color:"#a855f7"},
                  {idx:s2end,       label:"S3", color:"#3b82f6"},
                ];
                return sectorPoints.map(({idx,label,color})=>{
                  const pt=wp[idx]; if(!pt) return null;
                  // Compute perpendicular offset using neighbouring points
                  const a=wp[Math.max(0,idx-2)], b=wp[Math.min(wp.length-1,idx+2)];
                  const dx=b[0]-a[0], dy=b[1]-a[1];
                  const len=Math.hypot(dx,dy)||1;
                  // Perpendicular: rotate 90° outward (CW relative to direction)
                  const px=dy/len, py=-dx/len;
                  const offset=18;
                  const sx=pt[0]+px*offset, sy=pt[1]+py*offset;
                  return(
                    <g key={label}>
                      {/* Connector line */}
                      <line x1={pt[0]+px*5} y1={pt[1]+py*5} x2={sx} y2={sy}
                        stroke={color} strokeWidth={0.6} strokeOpacity={0.5}/>
                      {/* Sign background */}
                      <rect x={sx-7} y={sy-4.5} width={14} height={9} rx={1.5}
                        fill="#06070c" stroke={color} strokeWidth={0.7} strokeOpacity={0.85}/>
                      {/* Sign label */}
                      <text x={sx} y={sy+2.2} fill={color} fontSize={5.5}
                        textAnchor="middle" fontWeight="700"
                        fontFamily="'Orbitron',sans-serif" letterSpacing={1}>
                        {label}
                      </text>
                    </g>
                  );
                });
              })()}
              {/* Cars */}
              {drivers.map((d)=>{
                const p=carPos[d.code];if(!p)return null;
                const isDNF=d.retiredAtStep!=null&&step>d.retiredAtStep;
                const isInPit=Boolean(p.isInPit)&&!isDNF;
                const rank=standings.findIndex(s=>s.code===d.code)+1;
                const isActive=sel===d.code,isHover=hover===d.code;
                const baseOpacity=isDNF?0.18:(focused&&!isActive&&!isHover?0.22:1);
                const depth=Math.max(0,Math.min(1,(p.y-vbY)/vbH));
                const carScale=(tilt>0?1.0-depth*0.38:1.0)*0.71;
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
              <aside style={{width:260,flexShrink:0,borderLeft:"1px solid #1a1c28",
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
                              <div style={{display:"flex",gap:8}}>
                                {sectorData.map((sc,si)=>{
                                  // Render based on state
                                  if(sc.state==="pending") return(
                                    <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                                      <div style={{width:48,height:5,borderRadius:2,background:"#1a1c28",
                                        border:"1px dashed #2a2d3a"}}/>
                                      <span style={{fontSize:10,color:"#2a2d3a",fontFamily:"'DM Mono',monospace"}}>—.—</span>
                                    </div>
                                  );
                                  if(sc.state==="active") return(
                                    <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                                      <div style={{width:48,height:5,borderRadius:2,
                                        background:"linear-gradient(90deg,#3a3e58,#5a5e80,#3a3e58)",
                                        backgroundSize:"200% 100%",
                                        animation:"shimmer 1.4s infinite linear",
                                        boxShadow:"0 0 6px #5a5e8060"}}/>
                                      <span style={{fontSize:10,color:"#9a9eb8",fontFamily:"'DM Mono',monospace",
                                        fontWeight:600,opacity:0.85}}>LIVE</span>
                                    </div>
                                  );
                                  // complete
                                  return(
                                    <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:3}}>
                                      <div style={{width:48,height:5,borderRadius:2,background:sc.color,
                                        boxShadow:`0 0 5px ${sc.color}80`}}/>
                                      <span style={{fontSize:10,color:sc.color,fontFamily:"'DM Mono',monospace",
                                        fontWeight:600,opacity:0.95}}>{sc.t}</span>
                                    </div>
                                  );
                                })}
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
                        minWidth:118, flexShrink:0,
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
                        <div style={{display:"flex",gap:5,marginTop:3}}>
                          {sectorData.map((sc,si)=>{
                            if(sc.state==="pending") return(
                              <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <div style={{width:28,height:4,borderRadius:1.5,background:"#1a1c28",border:"1px dashed #2a2d3a"}}/>
                                <span style={{fontSize:10,color:"#2a2d3a",fontFamily:"'DM Mono',monospace"}}>—.—</span>
                              </div>
                            );
                            if(sc.state==="active") return(
                              <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <div style={{width:28,height:4,borderRadius:1.5,
                                  background:"linear-gradient(90deg,#3a3e58,#5a5e80,#3a3e58)",
                                  backgroundSize:"200% 100%",
                                  animation:"shimmer 1.4s infinite linear",
                                  boxShadow:"0 0 5px #5a5e8060"}}/>
                                <span style={{fontSize:10,color:"#9a9eb8",fontFamily:"'DM Mono',monospace",fontWeight:600,opacity:0.85}}>LIVE</span>
                              </div>
                            );
                            return(
                              <div key={si} style={{display:"flex",flexDirection:"column",alignItems:"center",gap:2}}>
                                <div style={{width:28,height:4,borderRadius:1.5,background:sc.color,
                                  boxShadow:`0 0 4px ${sc.color}80`}}/>
                                <span style={{fontSize:10,color:sc.color,fontFamily:"'DM Mono',monospace",fontWeight:600,opacity:0.95}}>{sc.t}</span>
                              </div>
                            );
                          })}
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
                    <div style={{display:"flex",alignItems:"center",gap:14}}>
                      <div style={{fontSize:28,letterSpacing:3,color:d.color,fontWeight:900,lineHeight:1}}>{d.code}</div>
                      <TeamBadge teamName={d.team} driverCode={d.code} size="lg"/>
                    </div>
                    <div style={{fontSize:10,color:"#9a9eb8",letterSpacing:2,marginTop:8}}>{d.name}</div>
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
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:13,color:color,fontFamily:"'DM Mono',monospace",fontWeight:700,
                    overflow:"hidden",whiteSpace:"nowrap",textOverflow:"ellipsis"}}>{time||driver}</div>
                  <div style={{fontSize:8,color:"#9a9eb8",marginTop:3,letterSpacing:1}}>{driver}{year?` · ${year}`:""}</div>
                  {team&&<div style={{display:"flex",alignItems:"center",gap:6,marginTop:5}}>
                    <TeamBadge teamName={team} size="sm"/>
                    <span style={{fontSize:6.5,color:"#555878"}}>{team}</span>
                  </div>}
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

        {/* ─── STRATEGY VIEW ──────────────────────────────────────────── */}
        {view==="strategy"&&(()=>{
          if(dataMode==="SELECT") return(
            <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:12}}>
              <div style={{fontSize:10,letterSpacing:4,color:"#252840"}}>NO SESSION LOADED</div>
              <div style={{fontSize:7,color:"#1a1d2e",letterSpacing:2}}>SELECT A SESSION TO SEE STRATEGY HISTORY</div>
              <button onClick={()=>setView("sessions")} style={{marginTop:8,padding:"8px 20px",background:"transparent",border:"1px solid #1a1d2e",borderRadius:4,color:"#252840",fontSize:8,letterSpacing:2,cursor:"pointer",fontFamily:"'Orbitron',sans-serif"}}>← SESSIONS</button>
            </div>
          );

          if(strategyLoading) return(
            <div style={{flex:1,display:"flex",alignItems:"center",justifyContent:"center"}}>
              <div style={{fontSize:9,letterSpacing:3,color:"#555878"}}>LOADING STRATEGY DATA…</div>
            </div>
          );

          if(strategyErr||!strategyData) return(
            <div style={{flex:1,overflowY:"auto",padding:32}}>
              <div style={{maxWidth:560,margin:"0 auto"}}>
                <div style={{fontSize:9,letterSpacing:4,color:"#E10600",marginBottom:8}}>STRATEGY CENTER</div>
                <div style={{fontSize:7,color:"#555878",letterSpacing:2,marginBottom:24}}>Historical strategy data for this circuit not yet generated.</div>
                <div style={{padding:20,borderRadius:8,background:"#0e0e18",border:"1px solid #1a1c28",marginBottom:14}}>
                  <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:12}}>RUN BACKEND</div>
                  <div style={{fontSize:8,color:"#9a9eb8",lineHeight:1.9,fontFamily:"'DM Mono',monospace"}}>
                    cd ~/Desktop<br/>
                    python3 fastf1_strategy.py --event "Canadian Grand Prix"<br/>
                    python3 fastf1_strategy.py --event "British Grand Prix"<br/>
                    python3 fastf1_strategy.py --event "Miami Grand Prix"
                  </div>
                  <div style={{fontSize:6.5,color:"#444660",marginTop:12,letterSpacing:1}}>
                    Outputs JSON to public/data/strategy/. Pulls last 3 dry races at the circuit, ignoring wet ones automatically.
                  </div>
                </div>
                {strategyErr&&<div style={{padding:10,borderRadius:4,background:"#2a0a0a",border:"1px solid #3a1010",fontSize:7,color:"#ff6b6b",letterSpacing:1}}>⚠ {strategyErr}</div>}
              </div>
            </div>
          );

          // Strategy data is loaded — render it
          const COMPOUND_COLORS={SOFT:"#ff4444",MEDIUM:"#FFD700",HARD:"#d8d8d8",INTERMEDIATE:"#00ff88",WET:"#4488ff",UNKNOWN:"#666"};
          const sd=strategyData;

          return(
            <div style={{flex:1,overflowY:"auto",padding:24}}>
              <div style={{maxWidth:980,margin:"0 auto",display:"flex",flexDirection:"column",gap:20}}>

                {/* Header */}
                <div style={{paddingBottom:14,borderBottom:"1px solid #1a1c28"}}>
                  <div style={{fontSize:9,letterSpacing:4,color:"#E10600",marginBottom:6}}>STRATEGY CENTER</div>
                  <div style={{fontSize:18,letterSpacing:2,color:"#d0d2de",fontWeight:700}}>{sd.event}</div>
                  <div style={{fontSize:8,color:"#555878",letterSpacing:1,marginTop:4}}>
                    Historical analysis · {sd.years.join(" · ")} · Wet races excluded
                  </div>
                </div>

                {/* Summary insights */}
                <div style={{display:"grid",gridTemplateColumns:"repeat(4,1fr)",gap:12}}>
                  <div style={{padding:14,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:6,color:"#555878",letterSpacing:2,marginBottom:6}}>RACES ANALYSED</div>
                    <div style={{fontSize:20,color:"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{sd.races.length}</div>
                  </div>
                  <div style={{padding:14,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:6,color:"#555878",letterSpacing:2,marginBottom:6}}>AVG PIT STOPS</div>
                    <div style={{fontSize:20,color:"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{sd.summary.avg_pit_count?.toFixed(1)}</div>
                    <div style={{fontSize:6,color:"#444660",marginTop:3,letterSpacing:1}}>{sd.summary.min_pit_count}–{sd.summary.max_pit_count} stops range</div>
                  </div>
                  <div style={{padding:14,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:6,color:"#555878",letterSpacing:2,marginBottom:6}}>LONGEST STINTS ON</div>
                    {(()=>{
                      const pa=sd.compound_pace_aggregate||{};
                      const sorted=Object.entries(pa).filter(([_,d])=>d.avg_stint_laps).sort((a,b)=>b[1].avg_stint_laps-a[1].avg_stint_laps);
                      const top=sorted[0];
                      if(!top) return <div style={{fontSize:9,color:"#555878"}}>—</div>;
                      const c=COMPOUND_COLORS[top[0]]||"#666";
                      return(
                        <div style={{display:"flex",alignItems:"center",gap:6}}>
                          <div style={{width:14,height:14,borderRadius:"50%",background:c,boxShadow:`0 0 8px ${c}80`}}/>
                          <div>
                            <div style={{fontSize:13,color:c,fontFamily:"'DM Mono',monospace",fontWeight:700}}>{top[0]}</div>
                            <div style={{fontSize:7,color:"#444660",fontFamily:"'DM Mono',monospace"}}>{top[1].avg_stint_laps} laps avg</div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                  <div style={{padding:14,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                    <div style={{fontSize:6,color:"#555878",letterSpacing:2,marginBottom:6}}>MOST COMMON STRAT</div>
                    {(()=>{
                      const top=sd.summary.common_strategies?.[0];
                      if(!top) return <div style={{fontSize:9,color:"#555878"}}>—</div>;
                      return(
                        <>
                          <div style={{fontSize:11,color:"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{top[0].split(" → ").map(c=>c[0]).join("→")}</div>
                          <div style={{fontSize:6.5,color:"#444660",marginTop:3,letterSpacing:1}}>used {top[1]} times</div>
                        </>
                      );
                    })()}
                  </div>
                </div>

                {/* Tire duration breakdown */}
                <div style={{padding:18,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                  <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:6}}>EXPECTED TIRE DURATION</div>
                  <div style={{fontSize:7,color:"#444660",letterSpacing:1,marginBottom:14}}>
                    Average stint length per compound across the analysed races.
                  </div>
                  <div style={{display:"flex",gap:14}}>
                    {Object.entries(sd.compound_pace_aggregate||{})
                      .filter(([_,data])=>data.avg_stint_laps)
                      .sort((a,b)=>a[1].avg_stint_laps-b[1].avg_stint_laps)
                      .map(([compound,data])=>{
                        const c=COMPOUND_COLORS[compound]||"#666";
                        return(
                          <div key={compound} style={{flex:1,padding:14,background:"#06070c",borderRadius:6,border:`1px solid ${c}30`}}>
                            <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:8}}>
                              <div style={{width:10,height:10,borderRadius:"50%",background:c}}/>
                              <span style={{fontSize:10,color:c,fontWeight:700,letterSpacing:1}}>{compound}</span>
                            </div>
                            <div style={{display:"flex",alignItems:"baseline",gap:4}}>
                              <span style={{fontSize:22,color:"#d0d2de",fontFamily:"'DM Mono',monospace",fontWeight:700}}>{data.avg_stint_laps}</span>
                              <span style={{fontSize:9,color:"#9a9eb8",letterSpacing:1}}>LAPS AVG</span>
                            </div>
                            <div style={{fontSize:6.5,color:"#444660",letterSpacing:1,marginTop:6,fontFamily:"'DM Mono',monospace"}}>
                              {data.min_stint_laps}–{data.max_stint_laps} laps · {data.stint_count} stints
                            </div>
                            <div style={{height:1,background:"#1a1c28",margin:"8px 0"}}/>
                            <div style={{fontSize:6,color:"#555878",letterSpacing:1,marginBottom:2}}>AVG LAP PACE</div>
                            <div style={{fontSize:9,color:"#9a9eb8",fontFamily:"'DM Mono',monospace"}}>{data.avg_median_s.toFixed(2)}s</div>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Per-race breakdown */}
                {sd.races.map(race=>(
                  <div key={race.year} style={{padding:18,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                    <div style={{display:"flex",alignItems:"baseline",justifyContent:"space-between",marginBottom:14,paddingBottom:10,borderBottom:"1px solid #1a1c28"}}>
                      <div>
                        <div style={{fontSize:14,color:"#d0d2de",letterSpacing:2,fontWeight:700}}>{race.year} · {race.event}</div>
                        <div style={{fontSize:7,color:"#555878",letterSpacing:1,marginTop:3}}>{race.total_laps} laps</div>
                      </div>
                      {race.weather&&(
                        <div style={{display:"flex",gap:14}}>
                          {race.weather.air_temp_c&&<div><div style={{fontSize:5,color:"#444660",letterSpacing:1}}>AIR</div><div style={{fontSize:9,color:"#9a9eb8",fontFamily:"'DM Mono',monospace"}}>{race.weather.air_temp_c}°C</div></div>}
                          {race.weather.track_temp_c&&<div><div style={{fontSize:5,color:"#444660",letterSpacing:1}}>TRACK</div><div style={{fontSize:9,color:"#9a9eb8",fontFamily:"'DM Mono',monospace"}}>{race.weather.track_temp_c}°C</div></div>}
                          {race.weather.humidity_pct&&<div><div style={{fontSize:5,color:"#444660",letterSpacing:1}}>HUM</div><div style={{fontSize:9,color:"#9a9eb8",fontFamily:"'DM Mono',monospace"}}>{race.weather.humidity_pct}%</div></div>}
                        </div>
                      )}
                    </div>

                    {/* Drivers strategies */}
                    <div style={{display:"flex",flexDirection:"column",gap:6}}>
                      {race.drivers.slice(0,10).map(driver=>{
                        const team=resolveTeam(driver.team,driver.code);
                        const dCol=team?.primary||"#9a9eb8";
                        return(
                        <div key={driver.code} style={{display:"flex",alignItems:"center",gap:10,padding:"6px 4px"}}>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:11,fontWeight:700,
                            color:driver.position===1?"#FFD700":driver.position<=3?"#9a9eb8":"#555878",
                            width:24,textAlign:"center"}}>P{driver.position}</span>
                          <div style={{width:2,height:18,background:dCol,borderRadius:1}}/>
                          <span style={{fontSize:9,fontWeight:700,color:dCol,letterSpacing:1,width:38}}>{driver.code}</span>
                          <TeamBadge teamName={driver.team} driverCode={driver.code} size="sm"/>
                          {/* Stint visualization bar */}
                          <div style={{flex:1,display:"flex",height:14,borderRadius:3,overflow:"hidden",gap:1,background:"#06070c"}}>
                            {driver.stints.map((stint,i)=>{
                              const widthPct=(stint.laps/race.total_laps)*100;
                              const color=COMPOUND_COLORS[stint.compound]||"#666";
                              return(
                                <div key={i} title={`${stint.compound} L${stint.start}-${stint.end}`} style={{
                                  width:`${widthPct}%`,background:color,
                                  display:"flex",alignItems:"center",justifyContent:"center",
                                }}>
                                  {widthPct>5&&<span style={{fontSize:7,fontWeight:700,color:"#000"}}>{stint.compound==="UNKNOWN"?"?":stint.compound[0]}{stint.laps}</span>}
                                </div>
                              );
                            })}
                          </div>
                          <span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#444660",width:60,textAlign:"right"}}>
                            {driver.pit_count} stop{driver.pit_count!==1?"s":""}
                          </span>
                          {driver.avg_pit_s&&<span style={{fontFamily:"'DM Mono',monospace",fontSize:7,color:"#9a9eb8",width:50,textAlign:"right"}}>
                            {driver.avg_pit_s}s avg
                          </span>}
                        </div>
                      );})}
                    </div>
                  </div>
                ))}

                {/* Common strategies list */}
                <div style={{padding:18,background:"#0e0e18",borderRadius:8,border:"1px solid #1a1c28"}}>
                  <div style={{fontSize:8,letterSpacing:3,color:"#555878",marginBottom:14}}>MOST COMMON STRATEGIES</div>
                  {sd.summary.common_strategies?.map(([strat,count])=>(
                    <div key={strat} style={{display:"flex",alignItems:"center",gap:14,padding:"6px 0"}}>
                      <div style={{flex:1,display:"flex",gap:4}}>
                        {strat.split(" → ").map((compound,i)=>{
                          const c=COMPOUND_COLORS[compound]||"#666";
                          return(
                            <div key={i} style={{display:"flex",alignItems:"center",gap:5}}>
                              {i>0&&<span style={{fontSize:8,color:"#444660"}}>→</span>}
                              <span style={{fontSize:9,fontWeight:700,padding:"2px 8px",borderRadius:3,
                                background:c+"22",color:c,border:`1px solid ${c}55`,
                                fontFamily:"'DM Mono',monospace",letterSpacing:1}}>
                                {compound}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                      <span style={{fontFamily:"'DM Mono',monospace",fontSize:9,color:"#9a9eb8"}}>×{count}</span>
                    </div>
                  ))}
                </div>

                {/* Footer note */}
                <div style={{padding:12,fontSize:6.5,color:"#333550",letterSpacing:1,fontFamily:"'DM Mono',monospace",textAlign:"center"}}>
                  Strategy data refreshed each time fastf1_strategy.py is run for this circuit.
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

export function Flower({ className = '' }: { className?: string }) {
  return <svg className={className} viewBox="0 0 80 80" fill="none" aria-hidden="true"><g fill="#ECA58E"><ellipse cx="40" cy="24" rx="13" ry="22"/><ellipse cx="40" cy="24" rx="13" ry="22" transform="rotate(72 40 40)"/><ellipse cx="40" cy="24" rx="13" ry="22" transform="rotate(144 40 40)"/><ellipse cx="40" cy="24" rx="13" ry="22" transform="rotate(216 40 40)"/><ellipse cx="40" cy="24" rx="13" ry="22" transform="rotate(288 40 40)"/></g><circle cx="40" cy="40" r="10" fill="#FBE1A1"/></svg>;
}

function Turtle({ x, y, flip = false, bow = false }: { x: number; y: number; flip?: boolean; bow?: boolean }) {
  return <g transform={`translate(${x} ${y}) ${flip ? 'scale(-1 1)' : ''}`}>
    <ellipse cx="-5" cy="33" rx="54" ry="7" fill="#B0B99A" opacity=".18"/>
    <g fill="#91BDA7" stroke="#4F826E" strokeWidth="2.4" strokeLinejoin="round">
      <path d="M-35 12Q-67 4-57 23Q-43 34-25 25"/><path d="M-24 20Q-31 45-12 32L0 21"/>
      <path d="M16 20Q14 43 30 32L34 13"/><path d="M-44 3L-56-2L-45-10"/>
      <ellipse cx="-9" cy="1" rx="41" ry="30" fill="#74AA8E"/>
      <path d="M-20-24L-30-6L-21 13L1 18L18 4L12-16Z" fill="#ABD0A0"/>
      <path d="M-30-6L-49-6M-21 13L-31 25M1 18L3 29M18 4L30 6M12-16L20-20M-20-24L-22-28"/>
      <ellipse cx="41" cy="3" rx="23" ry="21" fill="#A8CCAE"/>
    </g>
    <ellipse cx="50" cy="-1" rx="2.4" ry="3.5" fill="#354F43"/>
    <path d="M53 9q-6 7-12 0" stroke="#54735C" strokeWidth="2" strokeLinecap="round"/>
    <ellipse cx="38" cy="8" rx="5" ry="3" fill="#EDA596" opacity=".85"/>
    {bow && <g fill="#EDAA9C" stroke="#BC7769" strokeWidth="1.3"><path d="M31-17Q13-34 21-12L32-13Q49-35 46-15Z"/><circle cx="32" cy="-15" r="4"/></g>}
  </g>;
}

export function IslandArtwork() {
  return <svg className="island-art" viewBox="0 0 620 385" fill="none" aria-label="야자수 아래에서 만난 귀여운 거북이 커플" role="img">
    <defs><pattern id="sea-dashes" width="42" height="28" patternUnits="userSpaceOnUse"><path d="M9 14q6 4 12 0" stroke="#fff" strokeWidth="1.7" opacity=".5"/></pattern></defs>
    <circle cx="447" cy="100" r="49" fill="#F2CF84"/>
    <g stroke="#D8B878" strokeWidth="2.5" strokeLinecap="round"><path d="M447 33V23M503 46l7-8M513 100h12M398 48l-8-9"/></g>
    <path d="M65 140q18-27 40-5q18-32 48-3q14-9 25 7" fill="#FFFCF4"/>
    <path d="M464 166q21-24 36-5q20-26 39 2q17-11 31 3" fill="#FFFCF4"/>
    <path d="M35 245Q140 181 281 217T581 224L580 327H44Z" fill="#BFD9D0"/>
    <path d="M35 245Q140 181 281 217T581 224L580 327H44Z" fill="url(#sea-dashes)"/>
    <path d="M30 276Q160 240 304 267T590 267" stroke="#F8FCF3" strokeWidth="7" strokeLinecap="round"/>
    <path d="M54 293Q268 244 565 310Q564 355 304 357Q112 355 54 324Z" fill="#F1E1BB"/>
    <path d="M121 320q43-12 81-2M388 332q59 8 103-4" stroke="#DBC59F" strokeWidth="2" strokeLinecap="round"/>
    <g transform="rotate(-9 161 256)"><path d="M153 279Q173 200 156 118" stroke="#9B8462" strokeWidth="14" strokeLinecap="round"/>
      <path d="M157 253l12 4M160 226l12 4M163 202l9 4M163 177l8 4M160 152l9 4" stroke="#776E52" strokeWidth="2.6"/>
      <g fill="#72967A" stroke="#597B63" strokeWidth="1.8" strokeLinejoin="round"><path d="M158 126Q124 67 73 119Q123 101 158 126Z"/><path d="M158 126Q95 107 72 173Q119 125 158 126Z"/><path d="M158 126Q168 58 215 76Q176 96 158 126Z"/><path d="M158 126Q206 76 245 123Q204 106 158 126Z"/><path d="M158 126Q220 118 226 177Q198 139 158 126Z"/></g><circle cx="155" cy="132" r="8" fill="#9A8863"/><circle cx="170" cy="131" r="7" fill="#AC9470"/></g>
    <g stroke="#7C9384" strokeWidth="2.4" strokeLinecap="round"><path d="M289 98q10-10 20 0q10-10 20 0M342 129q7-8 14 0q7-8 14 0"/></g>
    <Turtle x={282} y={291}/><Turtle x={422} y={290} flip bow/>
    <path d="M345 245c-22-15-4-29 6-15c10-16 26 0 5 14l-6 5Z" fill="#DB9587"/>
    <g fill="#C7A988"><circle cx="230" cy="332" r="2"/><circle cx="455" cy="310" r="2"/><circle cx="178" cy="340" r="2"/><circle cx="370" cy="337" r="1.7"/></g>
    <g transform="translate(488 288) rotate(14)"><path d="M0 0l7 12l14-2l-9 10l5 13l-13-6l-12 9l2-15l-11-8l14-2Z" fill="#DFA18A"/><circle cx="3" cy="16" r="3" fill="#F1C9A5"/></g>
  </svg>;
}

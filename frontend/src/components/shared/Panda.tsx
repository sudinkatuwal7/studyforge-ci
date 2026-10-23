// StudyForge mascot: a panda reading. Shared by the dashboard banner and the signed-out hero.
export default function Panda({ className = "panda" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 120 120" role="img" aria-label="A panda reading">
      <circle cx="60" cy="64" r="46" fill="#FFE8C7" />
      <circle cx="34" cy="28" r="14" fill="#26334D" />
      <circle cx="86" cy="28" r="14" fill="#26334D" />
      <circle cx="60" cy="62" r="32" fill="#fff" />
      <ellipse cx="46" cy="58" rx="10" ry="12" fill="#26334D" />
      <ellipse cx="74" cy="58" rx="10" ry="12" fill="#26334D" />
      <circle cx="48" cy="56" r="3.5" fill="#fff" />
      <circle cx="76" cy="56" r="3.5" fill="#fff" />
      <ellipse cx="60" cy="72" rx="5" ry="3.5" fill="#26334D" />
      <path d="M52 78c3 4 13 4 16 0" fill="none" stroke="#26334D" strokeWidth="2" strokeLinecap="round" />
      <rect x="38" y="84" width="44" height="28" rx="4" fill="#F4E4C8" stroke="#26334D" strokeWidth="2" />
      <path d="M44 92h32M44 98h24" stroke="#7387E8" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

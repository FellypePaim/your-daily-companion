/** Ambient background orbs for Glassmorphism effect */
export function GlassBackground() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden z-0" aria-hidden>
      <div className="bg-orb bg-orb-primary" style={{ top: "10%", left: "15%", width: 400, height: 400 }} />
      <div className="bg-orb bg-orb-blue" style={{ bottom: "20%", right: "10%", width: 300, height: 300 }} />
      <div className="bg-orb bg-orb-purple" style={{ top: "50%", left: "60%", width: 250, height: 250 }} />
    </div>
  );
}

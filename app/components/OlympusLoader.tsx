type OlympusLoaderProps = {
  label?: string;
  fullHeight?: boolean;
  compact?: boolean;
};

export default function OlympusLoader({ label = 'LOADING', fullHeight = false, compact = false }: OlympusLoaderProps) {
  const logoSize = compact ? 42 : 64;
  return (
    <div
      style={{
        flex: 1,
        minHeight: fullHeight ? '100vh' : compact ? 120 : 220,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: compact ? 12 : 20,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: compact ? 10 : 14 }}>
        <img
          src="/olympus-logo.png"
          alt="Olympus loading"
          width={logoSize}
          height={logoSize}
          style={{
            objectFit: 'contain',
            display: 'block',
            animation: 'olympus-loader-pulse 1.35s ease-in-out infinite',
            filter: 'drop-shadow(0 0 16px rgba(212,155,53,0.22))',
          }}
        />
        <div style={{ fontFamily: 'var(--font-serif-stack, serif)', fontSize: compact ? 16 : 22, letterSpacing: compact ? 3 : 4, color: 'var(--copper)' }}>
          OLYMPUS
        </div>
        <div style={{ fontSize: compact ? 10 : 11, letterSpacing: '0.12em', color: 'var(--text-dim)' }}>
          {label}
        </div>
      </div>
      <style>{`
        @keyframes olympus-loader-pulse {
          0%, 100% { transform: scale(0.96); opacity: 0.72; }
          50% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
}

import OlympusLoader from './components/OlympusLoader';

export default function Loading() {
  return (
    <div
      style={{
        flex: 1,
        minHeight: '100vh',
        background: 'radial-gradient(circle at center, rgba(212,155,53,0.10), transparent 34%), var(--bg)',
      }}
    >
      <OlympusLoader label="LOADING SECTION" fullHeight />
    </div>
  );
}

export default function StatusPill({progress = 0, label, status, blockReason}){
  const isBlocked = status === 'BLOCKED';
  const cls = isBlocked ? 'blocked' : progress >= 100 ? 'done' : progress > 0 ? 'doing' : 'todo';
  const text = isBlocked ? `${label} · متوقف (مانع)` : `${label} · ${progress}%`;
  return (
    <span className={`pill ${cls}`} title={isBlocked && blockReason ? `علت مانع: ${blockReason}` : ''}>
      {text}
    </span>
  );
}

// The live-clock badge, shared by every view so in-progress matches look the
// same everywhere. Shows ESPN's real clock (incl. stoppage like "45'+3'") and
// announces itself to screen readers. Renders nothing unless the match is live.
// Spoiler-free mode shows only LIVE: a minute like "90+3'" says the match is level
// or close, and a badge that later reads "ET 105'" gives extra time away.
export default function LiveBadge({ match, className = 'badge-live', hideScores = false }) {
  if (!match.live) return null
  const { clock, detail: liveDetail, delayed, label } = match.live
  const detail = hideScores ? '' : liveDetail
  // A paused match (delayed/weather or suspended) isn't playing — show it in
  // amber, not the red running clock, so it doesn't read as "in progress".
  if (delayed) {
    const word = label || 'Delayed'
    return (
      <span className="badge-delayed" role="status" aria-label={word} title={detail || word}>
        ⏸ {word}
      </span>
    )
  }
  return (
    <span className={className} role="status" aria-label={`Live${detail ? `, ${detail}` : ''}`} title={detail || 'Live'}>
      ● {(!hideScores && clock) || 'LIVE'}
    </span>
  )
}

export default function EvalBar({ evalScore }) {
  const centipawn = Math.max(-1000, Math.min(1000, (evalScore ?? 0) * 100)) // Convert from pawns to centipawns
  const whitePercent = ((centipawn + 1000) / 2000) * 100
  const blackPercent = 100 - whitePercent

  return (
    <div
      style={{
        width: 20,
        height: '100%',
        border: '1px solid grey',
        display: 'flex',
        flexDirection: 'column'
      }}
    >
      <div
        style={{
          backgroundColor: 'black',
          height: `${blackPercent}%`,
          transition: 'height 0.3s'
        }}
      />
      <div
        style={{
          backgroundColor: 'white',
          height: `${whitePercent}%`,
          transition: 'height 0.3s'
        }}
      />
    </div>
  )
}

export default function SharpnessBar({ sharpnessWhite, sharpnessBlack }) {
  const MAX_SHARPNESS = 1000

  const normalize = (value) => Math.max(0, Math.min(1, value / MAX_SHARPNESS))

  const getColor = (value) => {
    const ratio = Math.max(0, Math.min(1, value / MAX_SHARPNESS))

    const colorStops = [
      [0, [50, 200, 50]], // soft green
      [0.25, [220, 220, 80]], // muted yellow
      [0.5, [255, 165, 70]], // classic orange
      [0.75, [230, 80, 60]], // elegant red
      [1.0, [180, 60, 120]] // warm magenta
    ]

    for (let i = 0; i < colorStops.length - 1; i++) {
      const [startRatio, startColor] = colorStops[i]
      const [endRatio, endColor] = colorStops[i + 1]

      if (ratio >= startRatio && ratio <= endRatio) {
        const t = (ratio - startRatio) / (endRatio - startRatio)
        const r = Math.round(startColor[0] + t * (endColor[0] - startColor[0]))
        const g = Math.round(startColor[1] + t * (endColor[1] - startColor[1]))
        const b = Math.round(startColor[2] + t * (endColor[2] - startColor[2]))
        return `rgb(${r}, ${g}, ${b})`
      }
    }

    return 'rgb(50, 200, 50)' // fallback green
  }

  let whiteHeight = 50
  let blackHeight = 50
  let whiteColor = '#ccc'
  let blackColor = '#ccc'
  let dividerPosition = '50%'

  const bothDefined = sharpnessWhite !== null && sharpnessBlack !== null
  const onlyWhite = sharpnessWhite !== null && sharpnessBlack === null
  const onlyBlack = sharpnessBlack !== null && sharpnessWhite === null

  if (bothDefined) {
    const easeWhite = Math.pow(MAX_SHARPNESS - sharpnessWhite, 2)
    const easeBlack = Math.pow(MAX_SHARPNESS - sharpnessBlack, 2)
    const total = easeWhite + easeBlack

    whiteHeight = (easeWhite / total) * 100
    blackHeight = 100 - whiteHeight
    whiteColor = getColor(sharpnessWhite)
    blackColor = getColor(sharpnessBlack)
    dividerPosition = `${whiteHeight}%`
  } else if (onlyWhite) {
    whiteHeight = 50
    blackHeight = 50
    whiteColor = getColor(sharpnessWhite)
  } else if (onlyBlack) {
    whiteHeight = 50
    blackHeight = 50
    blackColor = getColor(sharpnessBlack)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        marginLeft: 10
      }}
    >
      <div
        style={{
          width: 20,
          height: 500,
          border: '1px solid grey',
          display: 'flex',
          flexDirection: 'column-reverse',
          position: 'relative'
        }}
      >
        <div
          style={{
            height: `${whiteHeight}%`,
            backgroundColor: whiteColor,
            transition: 'height 0.3s'
          }}
        />
        <div
          style={{
            height: `${blackHeight}%`,
            backgroundColor: blackColor,
            transition: 'height 0.3s'
          }}
        />
        {bothDefined && (
          <div
            style={{
              height: '2px',
              width: '100%',
              backgroundColor: 'black',
              position: 'absolute',
              bottom: dividerPosition,
              zIndex: 2
            }}
          />
        )}
      </div>
    </div>
  )
}

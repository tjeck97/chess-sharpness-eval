import { useState, useRef } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import EvalBar from './components/EvalBar'
import SharpnessBar from './components/SharpnessBar'
import axios from 'axios'

export default function App() {
  const [game, setGame] = useState(new Chess())
  const [evalScore, setEvalScore] = useState(null)
  const [sharpnessWhite, setSharpnessWhite] = useState(null)
  const [sharpnessBlack, setSharpnessBlack] = useState(null)
  const [isWhiteSharpnessStale, setIsWhiteSharpnessStale] = useState(false)
  const [isBlackSharpnessStale, setIsBlackSharpnessStale] = useState(false)
  const [setupMode, setSetupMode] = useState(false)
  const [importedFen, setImportedFen] = useState('')
  const [maxDepth, setMaxDepth] = useState(10)
  const boardRef = useRef(null)

  const clearAnalysis = () => {
    setEvalScore(null)
    setSharpnessWhite(null)
    setSharpnessBlack(null)
    setIsWhiteSharpnessStale(false)
    setIsBlackSharpnessStale(false)
  }

  const evaluateEval = (fen) => {
    const encodedFen = encodeURIComponent(fen)
    axios
      .get(`/api/eval?fen=${encodedFen}`)
      .then((res) => setEvalScore(res.data.eval))
      .catch((err) => console.error('Eval API error:', err))
  }

  const evaluateSharpness = (fen, sideToUpdate, depth) => {
    const encodedFen = encodeURIComponent(fen)
    axios
      .get(`/api/sharpness?fen=${encodedFen}&depth=${depth}`)
      .then((res) => {
        if (sideToUpdate === 'white') {
          setSharpnessBlack(res.data.sharpness)
          setIsBlackSharpnessStale(false)
        } else {
          setSharpnessWhite(res.data.sharpness)
          setIsWhiteSharpnessStale(false)
        }
      })
      .catch((err) => console.error('Sharpness API error:', err))
  }

  const makeMove = async (move) => {
    const gameCopy = new Chess(game.fen())
    const result = gameCopy.move(move)

    if (result) {
      const prevTurn = game.turn()
      const fen = gameCopy.fen()
      setGame(gameCopy)

      if (prevTurn === 'w') {
        setIsBlackSharpnessStale(true)
        evaluateSharpness(fen, 'white', maxDepth)
      } else {
        setIsWhiteSharpnessStale(true)
        evaluateSharpness(fen, 'black', maxDepth)
      }

      evaluateEval(fen)
      return true
    }

    return false
  }

  const formatSharpness = (val, isStale) => {
    return val !== null ? (isStale ? `${val}…` : val) : '…'
  }

  const handleCopyFEN = () => {
    navigator.clipboard.writeText(game.fen()).then(() => {
      alert('FEN copied to clipboard!')
    })
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Sharpness Eval Chess</h2>

      {/* FEN Display + Copy Button */}
      <div style={{ marginBottom: 10 }}>
        <label>
          <strong>Current FEN:</strong>
        </label>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <input
            type="text"
            value={game.fen()}
            readOnly
            style={{ width: '70%', fontSize: 12 }}
          />
          <button onClick={handleCopyFEN}>Copy</button>
        </div>
      </div>

      {/* Main Board and Bars */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 10,
          height: 500
        }}
      >
        <EvalBar evalScore={evalScore} />
        <div style={{ maxWidth: 500, margin: 'auto' }}>
          <Chessboard
            position={game.fen()}
            boardWidth={500}
            onPieceDrop={(source, target) =>
              makeMove({ from: source, to: target })
            }
          />
        </div>
        <SharpnessBar
          sharpnessWhite={sharpnessWhite}
          sharpnessBlack={sharpnessBlack}
        />
      </div>

      {/* Sharpness Key */}
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <div
          style={{
            width: 160,
            height: 12,
            borderRadius: 6,
            background:
              'linear-gradient(to right, rgb(50, 200, 50), rgb(220, 220, 80), rgb(255, 165, 70), rgb(230, 80, 60), rgb(180, 60, 120))',
            margin: '0 auto 4px auto',
            border: '1px solid #ccc'
          }}
        />
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            width: 160,
            margin: '0 auto',
            fontSize: 12,
            color: 'white'
          }}
        >
          <span>Low Sharpness</span>
          <span>High Sharpness</span>
        </div>
      </div>
      <div style={{ marginTop: 20, textAlign: 'center' }}>
        <label
          htmlFor="depthSlider"
          style={{ fontWeight: 'bold', display: 'block', marginBottom: 6 }}
        >
          Max Sharpness Depth: {maxDepth}
        </label>
        <input
          id="depthSlider"
          type="range"
          min="4"
          max="18"
          value={maxDepth}
          onChange={(e) => setMaxDepth(parseInt(e.target.value))}
          style={{ width: 300 }}
        />
        <p style={{ fontSize: 12, color: 'orange', marginTop: 6 }}>
          Higher depth values take significantly longer to compute.
        </p>
      </div>

      <div style={{ marginTop: 20 }}>
        <p>
          <strong>Eval:</strong> {evalScore !== null ? evalScore : '…'}
        </p>
        <p>
          <strong>Sharpness:</strong>
        </p>
        <ul>
          <li>
            White: {formatSharpness(sharpnessWhite, isWhiteSharpnessStale)}
          </li>
          <li>
            Black: {formatSharpness(sharpnessBlack, isBlackSharpnessStale)}
          </li>
        </ul>
      </div>

      <button
        onClick={() => {
          if (!setupMode) {
            setSetupMode(true)
          } else {
            const fen = game.fen().split(' ')
            const newGame = new Chess(fen.join(' '))
            setGame(newGame)
            setSetupMode(false)
            evaluateEval(newGame.fen())
            evaluateSharpness(
              newGame.fen(),
              newGame.turn() === 'w' ? 'black' : 'white',
              maxDepth
            )
          }
          clearAnalysis()
        }}
      >
        {setupMode ? 'Exit Setup Mode' : 'Enter Setup Mode'}
      </button>

      {!setupMode && (
        <div style={{ marginTop: 20 }}>
          <label htmlFor="fenInput">Import FEN: </label>
          <input
            id="fenInput"
            type="text"
            placeholder="Paste FEN here"
            style={{ width: 300 }}
            onChange={(e) => setImportedFen(e.target.value)}
          />
          <button
            onClick={() => {
              try {
                const newGame = new Chess(importedFen)
                setGame(newGame)
                evaluateEval(newGame.fen())
                evaluateSharpness(
                  newGame.fen(),
                  newGame.turn() === 'w' ? 'black' : 'white',
                  maxDepth
                )
                clearAnalysis()
              } catch (err) {
                alert('Invalid FEN string')
              }
            }}
          >
            Load FEN
          </button>
        </div>
      )}

      {setupMode && (
        <div style={{ marginTop: 10 }}>
          <label>Side to move: </label>
          <select value={turn} onChange={(e) => setTurn(e.target.value)}>
            <option value="w">White</option>
            <option value="b">Black</option>
          </select>
        </div>
      )}
    </div>
  )
}

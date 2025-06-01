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
  const [turn, setTurn] = useState('w')
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

  const evaluateSharpness = (fen, sideJustMoved) => {
    const encodedFen = encodeURIComponent(fen)
    axios
      .get(`/api/sharpness?fen=${encodedFen}`)
      .then((res) => {
        if (sideJustMoved === 'white') {
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
      const prevTurn = game.turn() // who just moved
      const fen = gameCopy.fen()
      setGame(gameCopy)

      if (prevTurn === 'w') {
        setIsBlackSharpnessStale(true)
        evaluateSharpness(fen, 'white')
      } else {
        setIsWhiteSharpnessStale(true)
        evaluateSharpness(fen, 'black')
      }

      evaluateEval(fen)
      return true
    }

    return false
  }

  const handleTrayDrop = (e) => {
    if (!setupMode) return

    const rect = boardRef.current.getBoundingClientRect()
    const squareSize = rect.width / 8
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const file = Math.floor(x / squareSize)
    const rank = 7 - Math.floor(y / squareSize)
    const square = 'abcdefgh'[file] + (rank + 1)

    try {
      const pieceData = JSON.parse(e.dataTransfer.getData('piece'))
      const gameCopy = new Chess(game.fen())
      gameCopy.remove(square)
      gameCopy.put(pieceData, square)

      const newFen = gameCopy.fen().split(' ')
      newFen[1] = turn
      const newGame = new Chess(newFen.join(' '))
      setGame(newGame)
    } catch (err) {
      console.error('Failed to read piece data:', err)
    }
  }

  const formatSharpness = (val, isStale) => {
    return val !== null ? (isStale ? `${val}…` : val) : '…'
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Sharpness Eval Chess</h2>
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'stretch',
          gap: 10,
          margin: 'auto',
          height: 500
        }}
      >
        <EvalBar evalScore={evalScore} />
        <div
          ref={boardRef}
          onDragOver={(e) => e.preventDefault()
          }
          onDrop={handleTrayDrop}
          style={{ maxWidth: 500, margin: 'auto' }}
        >
          <Chessboard
            position={game.fen()}
            boardWidth={500}
            onPieceDrop={(source, target) => {
              if (!setupMode) return makeMove({ from: source, to: target })

              const piece = game.get(source)
              const gameCopy = new Chess(game.fen())
              gameCopy.remove(source)

              if (piece) gameCopy.put(piece, target)
              setGame(gameCopy)
              return true
            }}
            onSquareRightClick={(square) => {
              if (!setupMode) return
              const gameCopy = new Chess(game.fen())
              gameCopy.remove(square)
              setGame(gameCopy)
            }}
          />
        </div>
        <SharpnessBar sharpnessWhite={sharpnessWhite} sharpnessBlack={sharpnessBlack} />
      </div>

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

      <div style={{ marginTop: 20 }}>
        <p><strong>Eval:</strong> {evalScore !== null ? `${evalScore}` : '…'}</p>
        <p><strong>Sharpness:</strong></p>
        <ul>
          <li>White: {formatSharpness(sharpnessWhite, isWhiteSharpnessStale)}</li>
          <li>Black: {formatSharpness(sharpnessBlack, isBlackSharpnessStale)}</li>
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
            evaluateSharpness(newGame.fen(), newGame.turn() === 'w' ? 'black' : 'white')
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
                evaluateSharpness(newGame.fen(), newGame.turn() === 'w' ? 'black' : 'white')
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

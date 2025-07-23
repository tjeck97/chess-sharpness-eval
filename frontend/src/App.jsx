import { useState } from 'react'
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
  const [importedFen, setImportedFen] = useState('')
  const [maxDepth, setMaxDepth] = useState(10)
  const [history, setHistory] = useState([
    { fen: game.fen(), turn: game.turn() }
  ])
  const [historyIndex, setHistoryIndex] = useState(0)

  const clearAnalysis = () => {
    setEvalScore(null)
    setSharpnessWhite(null)
    setSharpnessBlack(null)
    setIsWhiteSharpnessStale(false)
    setIsBlackSharpnessStale(false)
  }

  const evaluateEval = (fen, depth) => {
    const encodedFen = encodeURIComponent(fen)
    axios
      .get(`/api/eval?fen=${encodedFen}&depth=${depth}`)
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
    const prevTurn = game.turn() // who's about to move (before move is made)
    const gameCopy = new Chess(game.fen())
    const result = gameCopy.move(move)

    if (!result) return false

    const fen = gameCopy.fen()
    const newTurn = gameCopy.turn() // who's turn it is after move
    setGame(gameCopy)
    setHistoryIndex((prev) => prev + 1)

    const [evalRes, sharpnessRes] = await Promise.all([
      axios
        .get(`/api/eval?fen=${encodeURIComponent(fen)}&depth=${maxDepth}`)
        .then((res) => res.data.eval)
        .catch(() => null),
      axios
        .get(`/api/sharpness?fen=${encodeURIComponent(fen)}&depth=${maxDepth}`)
        .then((res) => res.data.sharpness)
        .catch(() => null)
    ])

    const newHistoryEntry =
      prevTurn === 'w'
        ? {
            fen,
            turn: newTurn,
            eval: evalRes,
            sharpnessWhite,
            sharpnessBlack: sharpnessRes // White just moved
          }
        : {
            fen,
            turn: newTurn,
            eval: evalRes,
            sharpnessWhite: sharpnessRes, // Black just moved
            sharpnessBlack
          }

    setHistory((prev) => [...prev.slice(0, historyIndex + 1), newHistoryEntry])
    setEvalScore(evalRes)
    setSharpnessWhite(newHistoryEntry.sharpnessWhite)
    setSharpnessBlack(newHistoryEntry.sharpnessBlack)
    setIsWhiteSharpnessStale(false)
    setIsBlackSharpnessStale(false)

    return true
  }

  const formatSharpness = (val, isStale) => {
    return val !== null ? (isStale ? `${val}…` : val) : '…'
  }

  const handleCopyFEN = () => {
    navigator.clipboard.writeText(game.fen()).then(() => {
      alert('FEN copied to clipboard!')
    })
  }

  const goBackward = () => {
    if (historyIndex > 0) {
      const newIndex = historyIndex - 1
      const {
        fen,
        eval: evalVal,
        sharpnessWhite,
        sharpnessBlack
      } = history[newIndex]

      const gameCopy = new Chess(fen)
      setGame(gameCopy)
      setHistoryIndex(newIndex)
      setEvalScore(evalVal)
      setSharpnessWhite(sharpnessWhite)
      setSharpnessBlack(sharpnessBlack)
      setIsWhiteSharpnessStale(false)
      setIsBlackSharpnessStale(false)
    }
  }

  const goForward = () => {
    if (historyIndex < history.length - 1) {
      const newIndex = historyIndex + 1
      const {
        fen,
        eval: evalVal,
        sharpnessWhite,
        sharpnessBlack
      } = history[newIndex]

      const gameCopy = new Chess(fen)
      setGame(gameCopy)
      setHistoryIndex(newIndex)
      setEvalScore(evalVal)
      setSharpnessWhite(sharpnessWhite)
      setSharpnessBlack(sharpnessBlack)
      setIsWhiteSharpnessStale(false)
      setIsBlackSharpnessStale(false)
    }
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

      {/* Sharpness Key + Arrows */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginTop: 20,
          gap: 20
        }}
      >
        <button onClick={goBackward}>←</button>

        <div style={{ textAlign: 'center' }}>
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

        <button onClick={goForward}>→</button>
      </div>

      {/* Analysis Panel */}
      <div
        style={{
          width: 500,
          margin: '30px auto 10px auto',
          padding: 16,
          backgroundColor: '#1e1e1e',
          borderRadius: 8,
          border: '1px solid #444',
          boxSizing: 'border-box'
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Eval:</strong>
          <span>{evalScore !== null ? evalScore : '…'}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Sharpness (White):</strong>
          <span>{formatSharpness(sharpnessWhite, isWhiteSharpnessStale)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <strong>Sharpness (Black):</strong>
          <span>{formatSharpness(sharpnessBlack, isBlackSharpnessStale)}</span>
        </div>
        <div style={{ marginTop: 12 }}>
          <label style={{ fontWeight: 'bold' }}>
            Max Engine Depth: <span style={{ color: '#ccc' }}>{maxDepth}</span>
          </label>
          <input
            type="range"
            min="4"
            max="18"
            value={maxDepth}
            onChange={(e) => setMaxDepth(parseInt(e.target.value))}
            style={{ width: '100%' }}
          />
          <p style={{ fontSize: 11, color: 'orange' }}>
            Higher depth values take significantly longer to compute.
          </p>
        </div>
      </div>

      <div style={{ marginTop: 30 }}>
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
              evaluateEval(newGame.fen(), maxDepth)
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
    </div>
  )
}

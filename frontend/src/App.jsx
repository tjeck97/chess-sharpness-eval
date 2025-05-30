import { useState, useRef } from 'react'
import { Chess } from 'chess.js'
import { Chessboard } from 'react-chessboard'
import axios from 'axios'

export default function App() {
  const [game, setGame] = useState(new Chess())
  const [evalScore, setEvalScore] = useState(null)
  const [sharpnessWhite, setSharpnessWhite] = useState(null)
  const [sharpnessBlack, setSharpnessBlack] = useState(null)
  const [setupMode, setSetupMode] = useState(false)
  const [importedFen, setImportedFen] = useState('')
  const [turn, setTurn] = useState('w')
  const boardRef = useRef(null)

  const evaluatePosition = async (fen) => {
    const encodedFen = encodeURIComponent(fen)

    // Fetch eval immediately
    axios
      .get(`/api/eval?fen=${encodedFen}`)
      .then((res) => {
        setEvalScore(res.data.eval)
      })
      .catch((err) => {
        console.error('Eval API error:', err)
      })

    // Fetch sharpness in parallel
    axios
      .get(`/api/sharpness?fen=${encodedFen}`)
      .then((res) => {
        const turn = res.data.turn
        if (turn === 'white') {
          setSharpnessWhite(res.data.difficulty)
        } else {
          setSharpnessBlack(res.data.difficulty)
        }
      })
      .catch((err) => {
        console.error('Sharpness API error:', err)
      })
  }

  const makeMove = async (move) => {
    const gameCopy = new Chess(game.fen())
    const result = gameCopy.move(move)

    if (result) {
      setGame(gameCopy)

      // Trigger separate eval and sharpness requests
      evaluatePosition(gameCopy.fen())

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
      const updatedFen = gameCopy.fen().split(' ')
      gameCopy.remove(square)
      gameCopy.put(pieceData, square)

      // Force rebuild the game with new piece layout
      const newFen = gameCopy.fen().split(' ')
      newFen[1] = turn // enforce the correct turn
      const newGame = new Chess(newFen.join(' '))
      setGame(newGame)
    } catch (err) {
      console.error('Failed to read piece data:', err)
    }
  }

  return (
    <div style={{ padding: 20 }}>
      <h2>Sharpness Eval Chess</h2>

      <div
        ref={boardRef}
        onDragOver={(e) => e.preventDefault()}
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

            if (piece) {
              gameCopy.put(piece, target)
            }

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
      {setupMode && (
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            margin: '20px 0'
          }}
        >
          {['w', 'b'].map((color) => (
            <div
              key={color}
              style={{ display: 'flex', gap: 10, marginBottom: 8 }}
            >
              {['K', 'Q', 'R', 'B', 'N', 'P'].map((type) => {
                const code = `${color}${type}`
                return (
                  <img
                    key={code}
                    src={`/pieces/${code}.svg`}
                    alt={code}
                    width={40}
                    height={40}
                    style={{ cursor: 'grab' }}
                    draggable
                    onDragStart={(e) =>
                      e.dataTransfer.setData(
                        'piece',
                        JSON.stringify({ type: type.toLowerCase(), color })
                      )
                    }
                  />
                )
              })}
            </div>
          ))}
        </div>
      )}
      <div style={{ marginTop: 20 }}>
        <p>
          <strong>Eval:</strong> {evalScore !== null ? `${evalScore}` : '...'}
        </p>
        <p>
          <strong>Sharpness:</strong>
        </p>
        <ul>
          <li>
            White: {sharpnessWhite !== null ? `${sharpnessWhite}` : '...'}
          </li>
          <li>
            Black: {sharpnessBlack !== null ? `${sharpnessBlack}` : '...'}
          </li>
        </ul>
      </div>

      <button
        onClick={() => {
          if (!setupMode) {
            setSetupMode(true)
          } else {
            const fen = game.fen().split(' ')
            fen[1] = turn
            const newGame = new Chess(fen.join(' '))
            setGame(newGame)
            setSetupMode(false)
            evaluatePosition(newGame.fen())
          }

          setEvalScore(null)
          setSharpnessWhite(null)
          setSharpnessBlack(null)
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
                evaluatePosition(newGame.fen())
                setEvalScore(null)
                setSharpnessWhite(null)
                setSharpnessBlack(null)
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

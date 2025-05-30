import math
import chess
import chess.engine
import uvicorn
import os
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
CP_THRESHOLD = 50
DEPTH = 18
MIN_SHARPNESS = 2
MAX_SHARPNESS = 25

def normalize_sharpness(raw):
    return max(0, min(1, (raw - MIN_SHARPNESS) / (MAX_SHARPNESS - MIN_SHARPNESS)))

def compute_difficulty(engine, board):
    """
    Compute raw difficulty based on:
    - Number of good moves
    - Weighted average penalty of inaccuracies, mistakes, blunders
    """
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=DEPTH), multipv=10)
    except Exception as e:
        print(f"Engine error: {e}")
        return 0.0, None

    num_legal_moves = board.legal_moves.count()
    # having 50 legal moves isn't 5x more difficult to analyze than 10
    # this should estimate how many are actually worth consideration
    legal_moves_score = max(1, 2 * math.log2(num_legal_moves))

    top_score = info[0]["score"].relative.score(mate_score=10000)
    top_move = info[0]["pv"][0] if info[0].get("pv") else None

    good_moves = 0
    penalty_sum = 0.0
    penalty_weights = 0

    for i, entry in enumerate(info):
        score = entry["score"].relative.score(mate_score=10000)
        delta = abs(score - top_score)
        move = entry["pv"][0] if entry.get("pv") else None
        move_desc = board.san(move) if move else "?"
        side = "White" if board.turn else "Black"
        if delta <= CP_THRESHOLD:
            good_moves += 1
            label = "GOOD"
        else:
            if delta <= 100:
                label = "INACCURACY"
            elif delta <= 300:
                label = "MISTAKE"
            elif delta <= 999:
                label = "BLUNDER"
            else:
                # cap delta at 1000 (otherwise goes to up 10000)
                label = "MASSIVE BLUNDER"
                delta = 1000

            penalty_sum += delta / 200.0
            penalty_weights += 1

        print(f"[MOVE {i+1}] {side}: {move_desc} → Δ={delta} → {label}")

    if good_moves == 0:
        # Still calculate difficulty from average of scaled deltas alone
        avg_drop = (penalty_sum / penalty_weights) if penalty_weights else 0
        raw_difficulty = avg_drop * num_legal_moves  # Scale based on complexity
        print(f"[DIFFICULTY] No good moves → avg_drop={avg_drop:.2f}, raw={raw_difficulty:.2f}")
        return raw_difficulty, top_move

    weighted_avg_drop = (penalty_sum / penalty_weights) if penalty_weights else 0
    raw_difficulty = weighted_avg_drop * 1/(good_moves / legal_moves_score)

    print(f"[DIFFICULTY] good_moves={good_moves}, weighted_avg_drop={weighted_avg_drop:.2f}, legal_moves_score={legal_moves_score}, raw={raw_difficulty:.2f}")
    return raw_difficulty, top_move




@app.get("/api/eval")
def compute_eval(fen: str = Query(...)):
    board = chess.Board(fen)
    if not os.path.exists(STOCKFISH_PATH):
        return {"error": "Stockfish not found at path."}

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        info = engine.analyse(board, chess.engine.Limit(depth=DEPTH), multipv=1)
        eval_cp = info[0]["score"].white().score(mate_score=10000)
        eval_pawns = eval_cp / 100 if eval_cp is not None else None

        return {
            "eval": eval_pawns,
            "turn": "white" if board.turn == chess.WHITE else "black"
        }

@app.get("/api/sharpness")
def compute_sharpness(fen: str = Query(...)):
    board = chess.Board(fen)
    if not os.path.exists(STOCKFISH_PATH):
        return {"error": "Stockfish not found at path."}

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        difficulty_score, _ = compute_difficulty(engine, board)
        return {
            "difficulty": difficulty_score,
            "turn": "white" if board.turn == chess.WHITE else "black"
        }




if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
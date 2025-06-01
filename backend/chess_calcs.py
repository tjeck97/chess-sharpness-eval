import chess
import chess.engine
import os
from typing import Tuple

STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"
CP_THRESHOLD = 50
MAX_DEPTH = 18
MULTIPV = 10  # multi principle variation - number of top moves to output

from functools import lru_cache

def get_eval(fen: str) -> Tuple[float, str]:
    board = chess.Board(fen)
    if not os.path.exists(STOCKFISH_PATH):
        raise FileNotFoundError("Stockfish not found at path.")

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        # keep multipv here at 1
        info = engine.analyse(board, chess.engine.Limit(depth=MAX_DEPTH), multipv=1)
        eval_cp = info[0]["score"].white().score(mate_score=10000)
        eval_pawns = eval_cp / 100 if eval_cp is not None else None
        turn = "white" if board.turn == chess.WHITE else "black"
        return eval_pawns, turn


def get_sharpness(fen: str, depth: int) -> Tuple[float, str, list]:
    board = chess.Board(fen)
    if not os.path.exists(STOCKFISH_PATH):
        raise FileNotFoundError("Stockfish not found at path.")

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        sharpness_score, top_moves = compute_sharpness(engine, board, depth)
        turn = "white" if board.turn == chess.WHITE else "black"
        return sharpness_score, turn, top_moves


@lru_cache(maxsize=256)
def cached_analysis(fen: str, depth: int) -> list[chess.engine.InfoDict]:
    board = chess.Board(fen)
    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        return engine.analyse(board, chess.engine.Limit(depth=depth), multipv=MULTIPV)


def resolve_move_quality_depth(board: chess.Board, move: chess.Move, max_depth: int = MAX_DEPTH) -> Tuple[int, str]:
    fen = board.fen()

    # Get ground-truth label at max depth
    max_info = cached_analysis(fen, max_depth)
    max_top_score = max_info[0]["score"].relative.score(mate_score=10000)
    ground_truth_score = None

    for entry in max_info:
        if entry.get("pv", [None])[0] == move:
            ground_truth_score = entry["score"].relative.score(mate_score=10000)
            break

    if ground_truth_score is None:
        print(f"[WARN] Move {board.san(move)} not found at depth {max_depth}")
        return max_depth + 1, "UNKNOWN"

    delta_gt = abs(ground_truth_score - max_top_score)
    is_good_move = delta_gt <= CP_THRESHOLD

    # Assign readable label (UI/debug only)
    if delta_gt == 0:
        true_label = "BEST"
    elif delta_gt <= CP_THRESHOLD:
        true_label = "GOOD"
    elif delta_gt <= 100:
        true_label = "INACCURACY"
    elif delta_gt <= 300:
        true_label = "MISTAKE"
    elif delta_gt <= 999:
        true_label = "BLUNDER"
    else:
        true_label = "MASSIVE BLUNDER"

    # Search for first depth where engine gets move on correct side of good/bad split
    for depth in range(1, max_depth + 1):
        info = cached_analysis(fen, depth)
        top_score = info[0]["score"].relative.score(mate_score=10000)

        for entry in info:
            if entry.get("pv", [None])[0] != move:
                continue

            this_score = entry["score"].relative.score(mate_score=10000)
            delta = abs(this_score - top_score)
            found_good = delta <= CP_THRESHOLD


            if found_good == is_good_move:
                return depth, true_label

    return max_depth + 1, true_label



def compute_sharpness(engine, board: chess.Board, depth: int):
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=MAX_DEPTH), multipv=MULTIPV)
    except Exception as e:
        print(f"[ERROR] Engine error: {e}")
        return 0.0, None

    num_legal_moves = board.legal_moves.count()
    top_score = info[0]["score"].relative.score(mate_score=10000)
    top_move = info[0]["pv"][0] if info[0].get("pv") else None

    # depths at which moves were revealed to be good or bad
    good_move_depths = []
    bad_move_depths = []

    print("\n===== SHARPNESS DEBUG LOG =====")
    print("\n[TOP 10 MOVES CONSIDERED]")

    top_moves = []

    for i, entry in enumerate(info):
        move = entry["pv"][0] if entry.get("pv") else None
        if not move:
            continue

        move_san = board.san(move)
        score = entry["score"].relative.score(mate_score=10000)
        delta = abs(score - top_score)

        depth_revealed, label = resolve_move_quality_depth(board, move, depth)

        if label in ("BEST", "GOOD"):
            good_move_depths.append(depth_revealed)
        elif label in ("INACCURACY", "MISTAKE", "BLUNDER", "MASSIVE BLUNDER"):
            bad_move_depths.append(depth_revealed)

        top_moves.append({
            "move": move_san,
            "score": score,
            "delta": delta,
            "label": label,
            "depthResolved": depth_revealed,
            "multipv": i + 1
        })

        print(f"[#{i+1}] {move_san:<6} | score={score:>4} | Δ={delta:<4} | {label} → depth={depth_revealed}")

    # If no revealing depth found, use fallback
    if not good_move_depths and not bad_move_depths:
        print(f"[RESULT] No revealing moves → Sharpness=0.00")
        return 0.0, top_move

    avg_good_depth = sum(good_move_depths) / len(good_move_depths) if good_move_depths else 1
    avg_bad_depth = sum(bad_move_depths) / len(bad_move_depths) if bad_move_depths else 1



    # how difficult is it to discern good from bad moves?
    depth_difficulty = (avg_good_depth + avg_bad_depth) / 2

    # how many good moves are there out of the legal ones?
    scarcity = len(good_move_depths) / num_legal_moves

    # how big is the drop-off if we fail to play a good move?
    # Compute dropoff severity
    good_scores = [m["score"] for m in top_moves if m["label"] in ("BEST", "GOOD")]
    bad_scores = [m["score"] for m in top_moves if m["label"] not in ("BEST", "GOOD")]

    if good_scores and bad_scores:
        worst_good_score = min(good_scores)
        best_bad_score = max(bad_scores)
        dropoff_cp = min(1000, worst_good_score - best_bad_score)
        dropoff_factor = 1 + (dropoff_cp / 200)
    else:
        dropoff_factor = 1

    raw_sharpness = 1/scarcity * depth_difficulty * dropoff_factor

    sharpness = round(min(raw_sharpness, 500), 2)

    print("\n[SUMMARY]")
    print(f"- Good moves: {len(good_move_depths)}")
    print(f"- Legal move count: {num_legal_moves}")
    print(f"- Avg good move depth: {avg_good_depth:.2f}")
    print(f"- Avg bad move depth: {avg_bad_depth:.2f}")
    print(f"- dropoff factor: {dropoff_factor:.2f}")
    print(f"- Raw sharpness score: {raw_sharpness:.2f}")
    print("====================================\n")

    return sharpness, top_moves
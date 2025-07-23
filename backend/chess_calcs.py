import chess
import chess.engine
import os
import math
from typing import Tuple

STOCKFISH_PATH = "/opt/homebrew/bin/stockfish"  # make this configurable
CP_THRESHOLD = 50  # centipawn threshold for what is considered a "good" move
MAX_DEPTH = 18  # engine depth
MULTIPV = 10  # multi principle variation - number of top moves to output

from functools import lru_cache

def get_eval(fen: str, depth: int) -> Tuple[float, str]:
    board = chess.Board(fen)
    if not os.path.exists(STOCKFISH_PATH):
        raise FileNotFoundError("Stockfish not found at path.")

    with chess.engine.SimpleEngine.popen_uci(STOCKFISH_PATH) as engine:
        # keep multipv here at 1
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=1)
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


def resolve_move_quality_depth(board: chess.Board, move: chess.Move, depth: int = MAX_DEPTH) -> Tuple[int, str]:
    fen = board.fen()

    # Get ground-truth label at max depth
    max_info = cached_analysis(fen, depth)
    max_top_score = max_info[0]["score"].relative.score(mate_score=10000)
    ground_truth_score = None

    for entry in max_info:
        if entry.get("pv", [None])[0] == move:
            ground_truth_score = entry["score"].relative.score(mate_score=10000)
            break

    if ground_truth_score is None:
        print(f"[WARN] Move {board.san(move)} not found at depth {depth}")
        return depth + 1, "UNKNOWN"

    delta_gt = abs(ground_truth_score - max_top_score)
    is_good_move = delta_gt <= CP_THRESHOLD

    # Assign readable label
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
    for depth_level in range(1, depth + 1):
        info = cached_analysis(fen, depth_level)
        top_score = info[0]["score"].relative.score(mate_score=10000)

        for entry in info:
            if entry.get("pv", [None])[0] != move:
                continue

            this_score = entry["score"].relative.score(mate_score=10000)
            delta = abs(this_score - top_score)
            found_good = delta <= CP_THRESHOLD


            if found_good == is_good_move:
                return depth_level, true_label

    return depth + 1, true_label



def compute_sharpness(engine, board: chess.Board, depth: int):
    try:
        info = engine.analyse(board, chess.engine.Limit(depth=depth), multipv=MULTIPV)
    except Exception as e:
        print(f"[ERROR] Engine error: {e}")
        return 0.0, None

    num_legal_moves = board.legal_moves.count()
    if num_legal_moves == 0:
        return 0.0, None

    top_score = info[0]["score"].relative.score(mate_score=10000)

    print("\n===== SHARPNESS DEBUG LOG =====")
    print("\n[TOP 10 MOVES CONSIDERED]")

    top_moves = []
    top_move_depths = []

    for i, entry in enumerate(info):
        move = entry["pv"][0] if entry.get("pv") else None
        if not move:
            continue

        move_san = board.san(move)
        score = entry["score"].relative.score(mate_score=10000)
        delta = abs(score - top_score)

        depth_revealed, label = resolve_move_quality_depth(board, move, depth)

        top_move_depths.append(depth_revealed)

        top_moves.append({
            "move": move_san,
            "score": score,
            "delta": delta,
            "label": label,
            "depthResolved": depth_revealed,
            "multipv": i + 1
        })

        print(f"[#{i+1}] {move_san:<6} | score={score:>4} | Δ={delta:<4} | {label} → depth={depth_revealed}")

    top_moves_depth = sum(top_move_depths) / len(top_move_depths) if top_move_depths else 1


    # how difficult is it to discern good from bad moves?
    depth_difficulty_ratio = top_moves_depth / depth  # compared to the max, how deep is this position

    # ----- logarithmic difficulty curve -----
    # depth_difficulty_ratio = 1/3 --> difficulty = 0.60
    # depth_difficulty_ratio = 1/2 --> difficulty = 0.78
    # depth_difficulty_ratio = 4/5 --> difficulty = 0.95
    depth_difficulty = max(0.1, math.log10(9 * depth_difficulty_ratio + 1))

    # how big is the drop-off if we fail to play a good move?
    # Compute dropoff severity
    good_scores = [m["score"] for m in top_moves if m["label"] in ("BEST", "GOOD")]
    bad_scores = [m["score"] for m in top_moves if m["label"] not in ("BEST", "GOOD")]

    # how many good moves are there out of the legal ones?
    scarcity = max(0.1, 1 - (len(good_scores) / num_legal_moves))

    if good_scores and bad_scores:
        avg_good_score = sum(good_scores)/len(good_scores)
        avg_bad_score = sum(bad_scores)/len(bad_scores)
        dropoff_cp = min(999, avg_good_score - avg_bad_score)
        dropoff_factor = max(0.1, dropoff_cp/1000)
    else:
        dropoff_factor = 1

    raw_sharpness = scarcity * depth_difficulty * dropoff_factor # 0-1
    curved_sharpness = math.log10(9 * raw_sharpness + 1)
    # apply log curve based on depth_difficulty
    gated_sharpness = raw_sharpness * (1 - depth_difficulty) + curved_sharpness * depth_difficulty
    sharpness_score = round(1000 * gated_sharpness, 2)

    print("\n[SUMMARY]")
    print(f"- Good moves: {len(good_scores)}")
    print(f"- Legal move count: {num_legal_moves}")
    print(f"- Scarcity score: {scarcity:.2f}")
    print(f"- Avg top move depth: {top_moves_depth:.2f}")
    print(f"- Depth difficulty score: {depth_difficulty:.2f}")
    print(f"- Dropoff score: {dropoff_factor:.2f}")
    print(f"- Raw sharpness score: {raw_sharpness:.2f}")
    print(f"- Final sharpness score: {sharpness_score:.2f}")
    print("====================================\n")

    return sharpness_score, top_moves
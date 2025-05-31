import uvicorn
from fastapi import FastAPI, Query
from fastapi.middleware.cors import CORSMiddleware
from chess_calcs import get_eval, get_sharpness


app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"]
)

@app.get("/api/eval")
def compute_eval(fen: str = Query(...)):
    try:
        eval_pawns, turn = get_eval(fen)
        return {"eval": eval_pawns, "turn": turn}
    except FileNotFoundError as e:
        return {"error": str(e)}


@app.get("/api/sharpness")
def compute_sharpness(fen: str = Query(...)):
    try:
        sharpness_score, turn, top_moves = get_sharpness(fen)
        return {
            "sharpness": sharpness_score,
            "turn": turn,
            "topMoves": top_moves
        }
    except FileNotFoundError as e:
        return {"error": str(e)}





if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
# native_host/host.py
import sys, os, json, struct, re
import torch
import torch.nn as nn
from transformers import AutoTokenizer, AutoModel
import ftfy, emoji, regex as re2
from wordsegment import load as ws_load, segment as ws_segment

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
ART_DIR = os.path.abspath(os.path.join(BASE_DIR, "..", "artifacts"))

# --------- Text normalization (must match training) ----------
ws_load()
URL_RE   = re.compile(r"(https?://\S+|www\.\S+)")
USER_RE  = re.compile(r"@\w+")
HASH_RE  = re.compile(r"#(\w+)")
SPACE_RE = re.compile(r"\s+")

def split_hashtag(tag):
    return " ".join(ws_segment(tag)) if tag else ""

def normalize_text(s: str) -> str:
    s = ftfy.fix_text(str(s))
    s = URL_RE.sub("<url>", s)
    s = USER_RE.sub("<user>", s)
    s = HASH_RE.sub(lambda m: " " + split_hashtag(m.group(1)) + " ", s)
    s = emoji.demojize(s, delimiters=(" ", " "))
    s = s.lower().strip()
    return SPACE_RE.sub(" ", s)

# --------- Model (same head shape as in your notebook) -------
class HierXAI(nn.Module):
    def __init__(self, encoder_name="roberta-base", hidden_dropout=0.1):
        super().__init__()
        self.enc = AutoModel.from_pretrained(encoder_name)
        h = self.enc.config.hidden_size
        self.dropout = nn.Dropout(hidden_dropout)
        self.bin_head = nn.Linear(h, 1)      # bully vs not
        self.multi_head = nn.Linear(h, 5)    # 5 types
    def forward(self, input_ids, attention_mask):
        out = self.enc(input_ids=input_ids, attention_mask=attention_mask)
        cls = out.last_hidden_state[:, 0, :]
        z = self.dropout(cls)
        logit_bin = self.bin_head(z).squeeze(-1)
        logits_multi = self.multi_head(z)
        return logit_bin, logits_multi

# --------- Load artifacts/config ------------------------------
with open(os.path.join(ART_DIR, "config.json"), "r") as f:
    CFG = json.load(f)
ENCODER     = CFG.get("encoder", "roberta-base")
MAX_LEN     = CFG.get("max_len", 96)
BIN_THR     = float(CFG.get("bin_threshold", 0.5))

with open(os.path.join(ART_DIR, "label_mapping.json"), "r") as f:
    label_map = json.load(f)  # {"0":"not_cyberbullying", ...}
id2label = {int(k):v for k,v in label_map.items()}
labels5 = ["age","ethnicity","gender","religion","other"]

device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
tokenizer = AutoTokenizer.from_pretrained(ENCODER, use_fast=True)
model = HierXAI(ENCODER).to(device)
state_path = os.path.join(ART_DIR, "model_state_dict.pt")
model.load_state_dict(torch.load(state_path, map_location=device), strict=False)
model.eval()

# --------- Native messaging helpers --------------------------
def read_message():
    raw_len = sys.stdin.buffer.read(4)
    if len(raw_len) == 0:
        return None
    msg_len = struct.unpack("<I", raw_len)[0]
    data = sys.stdin.buffer.read(msg_len)
    if len(data) != msg_len:
        return None
    return json.loads(data.decode("utf-8", errors="ignore"))

def send_message(obj):
    data = json.dumps(obj, ensure_ascii=False).encode("utf-8")
    sys.stdout.buffer.write(struct.pack("<I", len(data)))
    sys.stdout.buffer.write(data)
    sys.stdout.buffer.flush()

# --------- Inference utilities --------------------------------
@torch.no_grad()
def classify_texts(texts):
    # texts: list[str]
    normed = [normalize_text(t) for t in texts]
    enc = tokenizer(normed, return_tensors="pt", padding=True, truncation=True, max_length=MAX_LEN)
    enc = {k: v.to(device) for k,v in enc.items()}
    logit_bin, logits_multi = model(**enc)
    p_b = torch.sigmoid(logit_bin).cpu().numpy()
    p_m = torch.softmax(logits_multi, dim=-1).cpu().numpy()

    results = []
    for i in range(len(texts)):
        if p_b[i] < BIN_THR:
            results.append({
                "binary": "not_cyberbullying",
                "p_bully": float(p_b[i]),
                "type": None,
                "type_probs": None
            })
        else:
            idx = int(p_m[i].argmax())
            results.append({
                "binary": "bullying",
                "p_bully": float(p_b[i]),
                "type": labels5[idx],
                "type_probs": {labels5[j]: float(p_m[i][j]) for j in range(5)}
            })
    return results

def split_for_scan(text, max_chars=280):
    # naive sentence-ish split then pack into <= max_chars
    parts = re.split(r'(?<=[\.\!\?])\s+|\n+', text)
    chunks, buff = [], ""
    for p in parts:
        p = p.strip()
        if not p: 
            continue
        if len(buff) + 1 + len(p) <= max_chars:
            buff = (buff + " " + p).strip()
        else:
            if buff: chunks.append(buff)
            buff = p
    if buff: chunks.append(buff)
    # filter overly short
    return [c for c in chunks if len(c) >= 12]

@torch.no_grad()
def scan_text(text):
    chunks = split_for_scan(text, max_chars=280)
    if not chunks:
        return {"hits": [], "total_chunks": 0}
    results = classify_texts(chunks)
    hits = []
    for ch, r in zip(chunks, results):
        if r["binary"] == "bullying":
            hits.append({
                "snippet": ch[:300],
                "p_bully": r["p_bully"],
                "type": r["type"],
                "type_probs": r["type_probs"],
            })
    hits.sort(key=lambda x: x["p_bully"], reverse=True)
    return {"hits": hits, "total_chunks": len(chunks)}

# --------- Main loop ------------------------------------------
def main():
    while True:
        msg = read_message()
        if msg is None:
            break
        cmd = msg.get("cmd")
        if cmd == "classify":
            text = msg.get("text","")
            out = classify_texts([text])[0]
            send_message({"ok": True, "mode": "classify", "result": out})
        elif cmd == "scan":
            text = msg.get("text","")
            out = scan_text(text)
            send_message({"ok": True, "mode": "scan", "result": out})
        elif cmd == "batch":
            texts = msg.get("texts", [])
            out = classify_texts(texts)
            send_message({"ok": True, "mode": "batch", "result": out})
        else:
            send_message({"ok": False, "error": "unknown_cmd"})

if __name__ == "__main__":
    main()

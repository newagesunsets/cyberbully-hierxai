import subprocess, struct, json, sys

HOST = r"C:\Users\sayan\OneDrive\Documents\Projects\cyberbully-hierxai\native_host\host.bat"
p = subprocess.Popen([HOST], stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)

def send(obj):
    data = json.dumps(obj).encode("utf-8")
    p.stdin.write(struct.pack("<I", len(data))); p.stdin.write(data); p.stdin.flush()

def recv():
    raw = p.stdout.read(4)
    if not raw:
        print("No response. STDERR:\n", p.stderr.read().decode("utf-8", "ignore")); sys.exit(1)
    n = struct.unpack("<I", raw)[0]
    return json.loads(p.stdout.read(n).decode("utf-8"))

send({"cmd":"classify", "text":"you are such an idiot"})
print("REPLY:", recv())
p.terminate()

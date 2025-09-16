# Hierarchical, Explainable Cyberbullying Classifier (CyberXAI)

Local-first project to detect cyberbullying in text with a **hierarchical model**:
1) Binary: bullying vs not  
2) If bullying → 5-way type: **age, ethnicity, gender, religion, other**

Includes:
- **Jupyter notebook** for EDA, preprocessing, training, evaluation
- **Saved artifacts** for reuse (weights, tokenizer, config, metrics)
- **Chrome extension** that sends selected/page text to a **local Python native host** (no server)
- GPU-ready on Windows (RTX 4070), **CUDA 12.8** wheels for PyTorch

---

## Project structure

cyberbully-hierxai/
├─ data/
│ ├─ raw/ # place your original CSV here
│ └─ interim/ # cleaned/intermediate CSV
├─ artifacts/ # saved model, tokenizer, metrics (generated)
├─ notebooks/
│ └─ 01_cyberbullying_hierxai.ipynb
├─ native_host/
│ ├─ host.py # Python native messaging host
│ ├─ host.bat # calls your venv python -> host.py
│ ├─ com.cyberxai.native.json # native host manifest (Chrome)
│ └─ test_host.py # local test for host without Chrome
├─ extension/
│ ├─ manifest.json
│ ├─ background.js
│ ├─ contentScript.js
│ ├─ overlay.css
│ ├─ popup.html
│ ├─ popup.js
│ └─ icon128.png
├─ src/ # (optional) helpers
│ ├─ init.py
│ └─ text_cleaning.py
├─ requirements.txt
├─ .gitignore
└─ README.md


---

## Setup (Windows + venv + CUDA 12.8)

> Project path (yours):  
> `C:\Users\sayan\OneDrive\Documents\Projects\cyberbully-hierxai`

1) **Create & activate venv**
```powershell
cd C:\Users\sayan\OneDrive\Documents\Projects\cyberbully-hierxai
py -3.10 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
Install requirements (GPU)

pip install -r requirements.txt


This file is set to pull PyTorch CUDA 12.8 wheels via the extra index URL.

Make a Jupyter kernel

pip install jupyterlab ipykernel
python -m ipykernel install --user --name "cyberxai-cu128" --display-name "Python (cyberxai-cu128)"


Sanity check

python - << 'PY'
import torch
print("Torch:", torch.__version__)
print("CUDA:", torch.version.cuda)
print("CUDA available:", torch.cuda.is_available())
if torch.cuda.is_available(): print("Device:", torch.cuda.get_device_name(0))
PY

Training in Jupyter

Put your raw CSV at: data/raw/cyberbullying_raw.csv

Launch Jupyter:

jupyter lab


Open notebooks/01_cyberbullying_hierxai.ipynb (kernel: Python (cyberxai-cu128)).

Run cells in order:

Dataset overview → EDA → Cleaning → Split

Tokenization → Model → Training (mixed precision on GPU)

Evaluation: Binary F1, Macro-F1 (6-class), confusion matrix, per-class F1

Artifacts saved to artifacts/:

model_state_dict.pt, config.json, label_mapping.json, tokenizer files, metrics.json

Chrome extension (local, no server)

Goal: Right-click → “Check cyberbullying” on selected text, or click popup → “Scan page”.

Native host configuration

native_host\host.bat

@echo off
set VENV_PY="C:\Users\sayan\OneDrive\Documents\Projects\cyberbully-hierxai\.venv\Scripts\python.exe"
set HOST_PY="C:\Users\sayan\OneDrive\Documents\Projects\cyberbully-hierxai\native_host\host.py"
%VENV_PY% %HOST_PY%


native_host\com.cyberxai.native.json
(Replace YOUR_EXTENSION_ID after loading the extension once)

{
  "name": "com.cyberxai.native",
  "description": "CyberXAI local classifier host",
  "path": "C:\\Users\\sayan\\OneDrive\\Documents\\Projects\\cyberbully-hierxai\\native_host\\host.bat",
  "type": "stdio",
  "allowed_origins": ["chrome-extension://YOUR_EXTENSION_ID/"]
}


Register the native host (Chrome)
Create & run native_host\register_host.reg:

Windows Registry Editor Version 5.00

[HKEY_CURRENT_USER\Software\Google\Chrome\NativeMessagingHosts\com.cyberxai.native]
@="C:\\Users\\sayan\\OneDrive\\Documents\\Projects\\cyberbully-hierxai\\native_host\\com.cyberxai.native.json"


For Edge, use:
HKEY_CURRENT_USER\Software\Microsoft\Edge\NativeMessagingHosts\com.cyberxai.native

Load the extension

Open chrome://extensions → enable Developer mode

Load unpacked → select extension/

Copy the Extension ID → paste into com.cyberxai.native.json → save

Back in chrome://extensions → Reload the extension

Test the host (optional)
.\.venv\Scripts\Activate.ps1
python native_host\test_host.py

Use it

Select text on any normal web page → right-click → Check cyberbullying

Or click the toolbar icon (popup) → Analyze selection / Scan page

Note: Chrome can’t inject into chrome://*, the Web Store, or builtin PDF viewer; use selection on regular pages.

Troubleshooting

Popup says “Could not establish connection”
→ The content script wasn’t loaded; the extension now auto-injects it when needed. Reload the page and try again.

Host not found / disconnected

Verify registry key points to your com.cyberxai.native.json

Confirm allowed_origins has your exact Extension ID with trailing slash

Double-click native_host\host.bat—it should stay open quietly

Check artifacts\native_host.log for Python errors (we log crashes there)

Model mismatch error
If you trained with pooler on, ensure host model loads encoder with pooler and use strict=False on load_state_dict.

How to run CPU-only (fallback)

If CUDA isn’t available, the host and notebook still run on CPU (slower). Nothing else changes.
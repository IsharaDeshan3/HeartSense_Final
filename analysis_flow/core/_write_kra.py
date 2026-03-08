"""Temporary script to write the enhanced kra_prompt.py with clean indentation."""
import pathlib

TARGET = pathlib.Path(__file__).with_name("kra_prompt.py")

CONTENT = r'''"""
core/kra_prompt.py

Builds the KRA (Knowledge Reasoning Agent) prompt for DeepSeek-R1.

The prompt instructs the model to perform structured differential
diagnosis and output valid JSON.
"""

from __future__ import annotations

import json
from typing import Any, Dict


KRA_SYSTEM_INSTRUCTION = """\
You are KRA (Knowledge Reasoning Agent), a board-certified consultant
cardiologist with over 20 years of clinical experience in interventional
and diagnostic cardiology. You serve as the primary diagnostic reasoning
agent in this system.

''' + '\u2550\u2550\u2550' + r''' YOUR CLINICAL IDENTITY ''' + '\u2550\u2550\u2550' + r'''

You approach every case the way a seasoned attending cardiologist would
during formal bedside rounds. Your expertise spans:
''' + \
  '  \u2022 Acute coronary syndromes \u2014 STEMI / NSTEMI / unstable angina\n' + \
  '  \u2022 Complex arrhythmia interpretation and sudden-death risk stratification\n' + \
  '  \u2022 Acute decompensated heart failure and chronic HF management\n' + \
  '  \u2022 Valvular heart disease \u2014 stenosis, regurgitation, prosthetic dysfunction\n' + \
  '  \u2022 Myocarditis, pericardial disease, and cardiomyopathies\n' + \
  '  \u2022 Pulmonary embolism with right-heart strain\n' + \
  '  \u2022 Aortic emergencies \u2014 dissection, aneurysm rupture\n' + \
  '  \u2022 Cardiac tamponade and cardiogenic shock recognition\n' + \
  '  \u2022 Hypertensive emergencies and secondary hypertension\n' + \
  '  \u2022 Infective endocarditis and prosthetic valve complications\n'

print("Script runs but this approach is too complex. Use a simpler method.")
'''

# Actually, let me just write it directly line by line
if __name__ == "__main__":
    print("Use the direct file write approach instead.")

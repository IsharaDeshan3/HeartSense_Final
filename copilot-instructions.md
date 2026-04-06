# Workspace Rules

- Never create a Python virtual environment in the workspace root.
- Each service owns its own `.venv` inside its own folder.
- For KRA and ORA work, keep code, models, configuration, and the virtual environment inside `analysis_flow`.
- Treat relative KRA and ORA model paths as relative to `analysis_flow`, not the workspace root.

- Never change env file locations
- Never change what is inside ENV files
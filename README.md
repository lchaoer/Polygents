# Polygents

Multi-agent collaboration framework — give AI an organizational structure.

Agents communicate via Markdown files on the filesystem. Manager breaks down tasks, Dev executes development, Evaluator reviews quality — three roles collaborating in an automated closed loop.

## Quick Start

### Prerequisites

- **Python** >= 3.10
- **Node.js** >= 18
- **npm** >= 9

### 1. Install Backend Dependencies

```bash
cd Polygents/backend
pip install -e ".[dev]"
```

### 2. Install Frontend Dependencies

```bash
cd Polygents/frontend
npm install
```

### 3. Start the Backend

```bash
cd Polygents/backend
python -m app.main
```

The backend runs at **http://127.0.0.1:8001**.

### 4. Start the Frontend

```bash
cd Polygents/frontend
npm run dev
```

The frontend runs at **http://localhost:5173** by default (Vite will automatically switch to the next available port if it is occupied).

### 5. Getting Started

1. Open the frontend URL (shown in terminal output)
2. Select a preset team template (Dev Team / Research Team / Content Team), or click "Create Custom Team"
3. On the canvas page, enter the task description and acceptance goals, then click "Start Run"
4. The Activity Feed on the right shows agent collaboration in real time, with a progress bar tracking task completion
5. You can click "Stop Run" at any time to cancel a running task
6. View run history, search past runs, and re-run with one click from the history panel on the home page

## Key Features

- **Preset Templates & Custom Teams**: 3 built-in templates + form-based creation + YAML import/export
- **Visual Canvas**: React Flow nodes displaying agent topology and real-time status
- **Real-time Run Monitoring**: Progress bar, activity feed with timestamps, agent filtering, run timer
- **Cancel Run**: Stop a running task at any time
- **Goal Acceptance Mechanism**: Evaluator automatically validates against goals; users can choose to retry or accept when validation fails
- **Workspace Browser**: View agent-produced file contents in real time
- **Run History**: Search, view details, and re-run past executions
- **Dark Starship Theme**: Sci-fi styled UI with dark/light mode toggle

## Running Tests

```bash
# Backend tests
cd Polygents/backend
python -m pytest -v

# Frontend build check
cd Polygents/frontend
npm run build
```

## Documentation

For detailed architecture design, communication mechanisms, development roadmap, and more, see the [docs/](docs/) directory:

- [Design Document](docs/design.md) — Full design specification
- [Architecture Overview](docs/architecture.md) — System architecture and project structure
- [API Reference](docs/api-reference.md) — REST API and WebSocket protocol

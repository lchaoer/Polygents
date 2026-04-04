# engine/meta_agent.py
"""Meta-Agent — conversational team creation engine

Meta-Agent is a true Agent: understands user requirements through conversation,
automatically creates team templates and Agent instances without manual confirmation.
"""
import re
import yaml
from typing import AsyncIterator, Optional

from app.providers.base import BaseProvider
from app.engine.agent_manager import AgentManager
from app.engine.file_comm import FileComm
from app.models.schemas import AgentConfig
from app.config import TEMPLATES_DIR

# Meta-Agent system prompt
_SYSTEM_PROMPT = """\
You are the Polygents team creation assistant (Meta-Agent). Your sole responsibility is to help users design a multi-agent collaboration team.

## Workflow

1. **Understand requirements**: Ask users what task they want to accomplish (development, research, content creation, other)
2. **Recommend a plan**: Based on requirements, recommend team role composition and explain each role's responsibilities
3. **Generate configuration**: Once consensus is reached, output a ```yaml code block as the team configuration

## Team Configuration Specification

Teams include the following base roles (you may also create custom roles as needed):
- **planner**: Responsible for understanding requirements, breaking down tasks, writes to shared/sprint.md
- **executor**: Responsible for executing specific tasks, outputs code/docs to artifacts/ directory
- **reviewer**: Responsible for evaluating output quality, approves (APPROVED) or rejects (REJECTED + feedback)

role_type is not limited to the above three — you can create any custom role type, e.g. `tester`, `designer`, `researcher`, etc.
When a team has multiple executors, the Planner can use `@agent-id` or `(assignee: agent-id)` in the Sprint plan to assign tasks to specific agents.

Available execution_mode options:
- **sequential** (default): Tasks execute in order
- **parallel**: Tasks without dependencies execute in parallel

Available tools (assign as needed):
- Read — Read files
- Write — Create files
- Edit — Edit files
- Bash — Execute commands
- Glob — Search files
- Grep — Search content

Available models:
- claude-sonnet-4-6 (recommended, best value)
- claude-opus-4-6 (most powerful, for complex reasoning)

## YAML Format Example

```yaml
name: "Development Team"
description: "Standard dev team: Manager plans + Dev implements + Evaluator reviews"
agents:
  - id: manager
    role: "Project Manager"
    role_type: planner
    model: "claude-sonnet-4-6"
    system_prompt: |
      You are the Project Manager. Your responsibility is to understand user requirements and generate clear Sprint plans.
      Write plans to shared/sprint.md, including: goals, task list, constraints, acceptance criteria.
    tools:
      - Read
      - Write
      - Glob
  - id: dev
    role: "Senior Developer"
    role_type: executor
    model: "claude-sonnet-4-6"
    system_prompt: |
      You are a Senior Developer. Complete development tasks according to the Sprint plan.
      Place output in the artifacts/dev/ directory.
    tools:
      - Read
      - Write
      - Edit
      - Bash
      - Glob
      - Grep
  - id: evaluator
    role: "Quality Reviewer"
    role_type: reviewer
    model: "claude-sonnet-4-6"
    system_prompt: |
      You are the Quality Reviewer. Evaluate output against acceptance criteria.
      Reply APPROVED if passed, or REJECTED with specific issues and suggestions.
    tools:
      - Read
      - Glob
      - Grep
      - Bash
```

## Conversation Style

- Friendly, professional, like an experienced team architect
- Proactively ask clarifying questions, don't rush to generate configuration
- Ask at most 2-3 questions at a time
- When user requirements are clear, output the complete YAML configuration directly
- If the user requests modifications, update and re-output the YAML
"""


def _extract_yaml_block(text: str) -> Optional[dict]:
    """Extract and parse the last ```yaml ... ``` code block from text"""
    pattern = r"```yaml\s*\n(.*?)```"
    matches = re.findall(pattern, text, re.DOTALL)
    if not matches:
        return None
    try:
        data = yaml.safe_load(matches[-1])
        if isinstance(data, dict) and "name" in data and "agents" in data:
            return data
    except yaml.YAMLError:
        pass
    return None


def _validate_team_config(config: dict) -> tuple[bool, str]:
    """Validate team configuration structure"""
    agents = config.get("agents")
    if not isinstance(agents, list) or len(agents) == 0:
        return False, "agents list is empty"
    ids = []
    for i, agent in enumerate(agents):
        if not agent.get("id"):
            return False, f"Agent #{i+1} is missing id"
        if not agent.get("role"):
            return False, f"Agent #{i+1} is missing role"
        ids.append(agent["id"])
    if len(ids) != len(set(ids)):
        return False, "Duplicate id found in agents"
    return True, ""


def _safe_id(name: str) -> str:
    """Convert name to a safe filename ID"""
    s = re.sub(r'[^\w\-]', '-', name.lower().strip())
    return re.sub(r'-+', '-', s).strip('-') or "custom-team"


class MetaAgent:
    """Conversational team creation engine — auto-creates teams and Agents"""

    def __init__(self, provider: BaseProvider, agent_manager: AgentManager, file_comm: FileComm):
        self.provider = provider
        self.agent_manager = agent_manager
        self.file_comm = file_comm
        # session_id -> conversation history
        self._sessions: dict[str, list[dict]] = {}
        # session_id -> created template_id
        self._session_templates: dict[str, str] = {}
        # session_id -> created agent id list
        self._session_agents: dict[str, list[str]] = {}

    def _get_or_create_session(self, session_id: str) -> list[dict]:
        if session_id not in self._sessions:
            self._sessions[session_id] = []
        return self._sessions[session_id]

    def _build_prompt(self, history: list[dict], new_message: str) -> str:
        """Concatenate conversation history into a single prompt (Agent SDK doesn't support multi-turn)"""
        parts = []
        for msg in history:
            role_label = "User" if msg["role"] == "user" else "Assistant"
            parts.append(f"[{role_label}]\n{msg['content']}")
        parts.append(f"[User]\n{new_message}")
        return "\n\n".join(parts)

    def _auto_finalize(self, session_id: str, config: dict) -> dict:
        """Auto-save template + create Agent instances, returns {template_id, name, agents_created}"""
        # If previously created in this session, clean up old Agents first
        old_agents = self._session_agents.get(session_id, [])
        for aid in old_agents:
            self.agent_manager.remove_agent(aid)

        name = config.get("name", "custom-team")
        template_id = self._session_templates.get(session_id)

        # First creation: generate new template_id
        if not template_id:
            template_id = _safe_id(name)
            file_path = TEMPLATES_DIR / f"{template_id}.yaml"
            counter = 1
            while file_path.exists():
                template_id = f"{_safe_id(name)}-{counter}"
                file_path = TEMPLATES_DIR / f"{template_id}.yaml"
                counter += 1

        # Save YAML template file
        TEMPLATES_DIR.mkdir(parents=True, exist_ok=True)
        file_path = TEMPLATES_DIR / f"{template_id}.yaml"
        with open(file_path, "w", encoding="utf-8") as f:
            yaml.dump(config, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

        # Create Agent instances
        agents_created = []
        for agent_data in config.get("agents", []):
            agent_config = AgentConfig(
                id=agent_data["id"],
                role=agent_data.get("role", ""),
                role_type=agent_data.get("role_type"),
                system_prompt=agent_data.get("system_prompt", ""),
                tools=agent_data.get("tools", ["Read", "Write", "Edit", "Bash", "Glob", "Grep"]),
                model=agent_data.get("model"),
            )
            self.agent_manager.create_agent(agent_config)
            agents_created.append(agent_data["id"])

        # Track
        self._session_templates[session_id] = template_id
        self._session_agents[session_id] = agents_created

        return {"template_id": template_id, "name": name, "agents_created": agents_created}

    async def chat(
        self, session_id: str, message: str
    ) -> AsyncIterator[dict]:
        """Streaming conversation, yields events: text_delta / team_preview / done"""
        history = self._get_or_create_session(session_id)

        prompt = self._build_prompt(history, message)
        history.append({"role": "user", "content": message})

        full_response = ""
        async for chunk in self.provider.stream_message(
            system_prompt=_SYSTEM_PROMPT,
            prompt=prompt,
            tools=[],       # Pure conversation, no tools
            max_turns=1,     # Single-turn response
        ):
            full_response += chunk
            yield {"type": "text_delta", "content": chunk}

        # Save assistant response
        history.append({"role": "assistant", "content": full_response})

        # Detect YAML team config → auto-create
        config = _extract_yaml_block(full_response)
        if config:
            is_valid, error = _validate_team_config(config)
            if is_valid:
                try:
                    result = self._auto_finalize(session_id, config)
                    yield {
                        "type": "team_created",
                        "config": config,
                        "template_id": result["template_id"],
                        "name": result["name"],
                        "agents_created": result["agents_created"],
                    }
                except Exception as e:
                    yield {"type": "team_error", "error": str(e)}
            else:
                yield {"type": "team_preview", "config": config, "validation_error": error}

        yield {"type": "done"}

    def get_team_config(self, session_id: str) -> Optional[dict]:
        """Extract the last valid team config from conversation history"""
        history = self._sessions.get(session_id, [])
        # Reverse search for YAML in assistant messages
        for msg in reversed(history):
            if msg["role"] == "assistant":
                config = _extract_yaml_block(msg["content"])
                if config:
                    return config
        return None

    def clear_session(self, session_id: str):
        """Clear session"""
        self._sessions.pop(session_id, None)
        self._session_templates.pop(session_id, None)
        self._session_agents.pop(session_id, None)

"""文件通信机制 — Agent 间通过 Markdown 文件通信"""
from pathlib import Path
from datetime import datetime
import threading


class FileComm:
    """管理 Agent 间的文件通信"""

    def __init__(self, base_dir: Path):
        self.base_dir = Path(base_dir)
        self._write_lock = threading.Lock()  # shared/ 写锁
        self._msg_counter = 0

    def init_workspace(self):
        """初始化工作目录结构"""
        for d in ["inbox", "shared", "artifacts", "logs", ".polygents", ".polygents/agents"]:
            (self.base_dir / d).mkdir(parents=True, exist_ok=True)

    def init_agent(self, agent_id: str):
        """为 Agent 创建所需目录"""
        (self.base_dir / "inbox" / agent_id).mkdir(parents=True, exist_ok=True)
        (self.base_dir / "artifacts" / agent_id).mkdir(parents=True, exist_ok=True)

    def send_message(
        self,
        from_agent: str,
        to_agent: str,
        msg_type: str,
        content: str,
        priority: str = "normal",
    ) -> Path:
        """发送消息到目标 Agent 的 inbox"""
        self._msg_counter += 1
        timestamp = datetime.now().isoformat()
        filename = f"{self._msg_counter:03d}-{msg_type}.md"

        frontmatter = (
            f"---\n"
            f"id: msg-{self._msg_counter:03d}\n"
            f"from: {from_agent}\n"
            f"to: {to_agent}\n"
            f"type: {msg_type}\n"
            f"priority: {priority}\n"
            f"timestamp: {timestamp}\n"
            f"---\n\n"
        )

        file_path = self.base_dir / "inbox" / to_agent / filename
        file_path.write_text(frontmatter + content, encoding="utf-8")

        # 记录到日志
        self.log_communication(from_agent, to_agent, msg_type, content)
        return file_path

    def read_inbox(self, agent_id: str) -> list[dict]:
        """读取 Agent 的所有收件箱消息"""
        inbox_dir = self.base_dir / "inbox" / agent_id
        messages = []
        if not inbox_dir.exists():
            return messages

        for f in sorted(inbox_dir.glob("*.md")):
            text = f.read_text(encoding="utf-8")
            meta, body = self._parse_frontmatter(text)
            messages.append({"meta": meta, "body": body, "file": str(f)})
        return messages

    def clear_inbox(self, agent_id: str):
        """清空 Agent 的收件箱"""
        inbox_dir = self.base_dir / "inbox" / agent_id
        if inbox_dir.exists():
            for f in inbox_dir.glob("*.md"):
                f.unlink()

    def write_shared(self, filename: str, content: str):
        """写入共享目录（带写锁）"""
        with self._write_lock:
            file_path = self.base_dir / "shared" / filename
            file_path.parent.mkdir(parents=True, exist_ok=True)
            file_path.write_text(content, encoding="utf-8")

    def read_shared(self, filename: str) -> str:
        """读取共享文件"""
        file_path = self.base_dir / "shared" / filename
        if file_path.exists():
            return file_path.read_text(encoding="utf-8")
        return ""

    def write_artifact(self, agent_id: str, rel_path: str, content: str):
        """写入 Agent 的工件目录"""
        file_path = self.base_dir / "artifacts" / agent_id / rel_path
        file_path.parent.mkdir(parents=True, exist_ok=True)
        file_path.write_text(content, encoding="utf-8")

    def log_communication(self, from_agent: str, to_agent: str, msg_type: str, content: str):
        """追加通信日志"""
        today = datetime.now().strftime("%Y-%m-%d")
        log_file = self.base_dir / "logs" / f"{today}.md"

        timestamp = datetime.now().strftime("%H:%M:%S")
        entry = (
            f"\n### [{timestamp}] {from_agent} → {to_agent} ({msg_type})\n\n"
            f"{content[:200]}{'...' if len(content) > 200 else ''}\n"
        )

        with open(log_file, "a", encoding="utf-8") as f:
            f.write(entry)

    def _parse_frontmatter(self, text: str) -> tuple[dict, str]:
        """解析 YAML frontmatter"""
        if not text.startswith("---"):
            return {}, text

        parts = text.split("---", 2)
        if len(parts) < 3:
            return {}, text

        meta = {}
        for line in parts[1].strip().split("\n"):
            if ":" in line:
                key, val = line.split(":", 1)
                meta[key.strip()] = val.strip()

        return meta, parts[2].strip()

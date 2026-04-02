# providers/__init__.py
try:
    from app.providers.claude_provider import ClaudeProvider
    __all__ = ["ClaudeProvider"]
except ImportError:
    __all__ = []

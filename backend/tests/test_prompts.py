from app.engine.prompts import (
    CRITIC_SYSTEM_TEMPLATE,
    WORKER_SYSTEM_TEMPLATE,
    critic_round_1_prompt,
    critic_round_n_prompt,
    worker_round_1_prompt,
    worker_round_n_prompt,
)


def test_worker_prompts_never_mention_checklist():
    rendered_system = WORKER_SYSTEM_TEMPLATE.format(user_prompt="anything goes here")
    assert "checklist" not in rendered_system.lower()
    assert "checklist" not in worker_round_1_prompt("do thing").lower()
    assert "checklist" not in worker_round_n_prompt(2).lower()
    assert "checklist" not in worker_round_n_prompt(5).lower()


def test_critic_prompts_reference_checklist():
    rendered_system = CRITIC_SYSTEM_TEMPLATE.format(user_prompt="be strict")
    assert "checklist.md" in rendered_system
    assert "checklist.md" in critic_round_1_prompt()


def test_worker_round_n_references_previous_review():
    p = worker_round_n_prompt(3)
    assert "round-2.md" in p
    assert "../reviews/" in p


def test_critic_schema_in_system_prompt():
    rendered = CRITIC_SYSTEM_TEMPLATE.format(user_prompt="x")
    assert "## Verdict" in rendered
    assert "PASS" in rendered and "FAIL" in rendered


def test_worker_schema_in_system_prompt():
    rendered = WORKER_SYSTEM_TEMPLATE.format(user_prompt="x")
    assert "Worker Report Round N" in rendered
    assert "Goal This Round" in rendered

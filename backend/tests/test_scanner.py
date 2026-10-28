import pytest
from app.agents.scanner import scan


def test_clean_human_text_scores_zero():
    clean_text = (
        "PostgreSQL 16 introduced bidirectionally linked memory contexts.\n\n"
        "In our benchmarks with 400 active client connections, memory fragmentation fell from 34% to 12% over 48 hours. "
        "The p99 query latency stayed flat at 18ms under 5,000 queries per second.\n\n"
        "We deployed the upgrade across our staging cluster last Tuesday, monitoring buffer pool evictions. "
        "The database service remained stable throughout the test."
    )
    result = scan(clean_text)
    assert result.deterministic_score == 0
    assert len(result.findings) == 0


def test_banned_words_rule():
    text = "We must delve into this robust framework to leverage transformative synergies."
    result = scan(text)
    quotes = [f.quote.lower() for f in result.findings]
    assert "delve" in quotes
    assert "robust" in quotes
    assert "leverage" in quotes
    assert "transformative" in quotes
    assert any("synerg" in q for q in quotes)
    # Check exact offsets
    for f in result.findings:
        assert text[f.start : f.end] == f.quote
    assert result.category_scores["banned_word"] > 0


def test_banned_phrases_rule():
    text = "In today's fast-paced world, let that sink in. Agree? Drop a comment."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert any("FAST_PACED_WORLD" in rid for rid in rule_ids)
    assert any("LET_THAT_SINK_IN" in rid for rid in rule_ids)
    assert any("AGREE" in rid for rid in rule_ids)
    assert any("DROP_A_COMMENT" in rid for rid in rule_ids)
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_punctuation_em_dash_and_arrow():
    text = "The speed—which was high—was good. Next step: → look at logs."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "PUNCT_EM_DASH" in rule_ids
    assert "PUNCT_ARROW_SYMBOL" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_punctuation_dramatic_ellipsis_and_excess_exclamation():
    text = "Wait for it... it failed! Really! Absolutely! No way!"
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "PUNCT_DRAMATIC_ELLIPSIS" in rule_ids
    assert "PUNCT_EXCESS_EXCLAMATION" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_punctuation_emoji_line_start_and_markdown():
    text = "🚀 Launching our database.\n\n**Key Takeaway**: We deployed on Friday.\n\n# Architecture"
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "PUNCT_EMOJI_LINE_START" in rule_ids
    assert "PUNCT_MARKDOWN_BOLD" in rule_ids
    assert "PUNCT_MARKDOWN_HEADER" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_excess_hashtags():
    text = "Database updates completed. #sql #postgres #data #tuning #database"
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "PUNCT_EXCESS_HASHTAGS" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_not_just_x_its_y():
    text = "This is not just a tool, it's a complete shift in operations."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_NOT_JUST_X_ITS_Y" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_not_only_x_but_also_y():
    text = "We observed not only higher throughput but also lower latency."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_NOT_ONLY_X_BUT_ALSO_Y" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_its_not_about_x_its_about_y():
    text = "It's not about speed, it's about reliability."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_ITS_NOT_ABOUT_X_ITS_ABOUT_Y" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_whether_youre_x_or_y():
    text = "Whether you're a beginner or a senior architect, this matters."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_WHETHER_YOURE_X_OR_Y" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_serves_stands_as():
    text = "The migration stands as evidence that planning pays off."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_SERVES_STANDS_AS" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_colon_reveal():
    text = "Here is what we discovered after tests.\n\nThe secret: use connection pooling."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_COLON_REVEAL" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_participle_tail():
    text = "We reduced table bloat by 25GB, highlighting the importance of vacuum tuning."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_PARTICIPLE_TAIL" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_stacked_hedges():
    text = "This could potentially cause unexpected index thrashing."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_STACKED_HEDGES" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_inflated_significance_and_vague_sources():
    text = "Studies show this release is a testament to open source persistence."
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_VAGUE_SOURCE" in rule_ids
    assert "STRUCT_INFLATED_SIGNIFICANCE" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_structure_numbered_lessons_with_bold():
    text = "Here are the rules:\n\n1. **Always index foreign keys**\n2. **Check query plans**"
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_NUMBERED_LESSONS_BOLD" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_rhythm_one_sentence_paragraphs():
    text = (
        "Postgres connection pools matter.\n\n"
        "Without them threads crash under burst load.\n\n"
        "We configured PgBouncer yesterday.\n\n"
        "Latency dropped across all endpoints."
    )
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "RHYTHM_ONE_SENTENCE_PARAGRAPHS" in rule_ids


def test_rhythm_repeated_sentence_opener():
    text = (
        "If you want lower latency, measure buffer cache hits. "
        "If you see high swap usage, increase RAM allocation. "
        "If you run into deadlocks, inspect lock order in code."
    )
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "RHYTHM_REPEATED_SENTENCE_OPENER" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_rhetorical_question_hook_answered():
    text = (
        "Why did our Postgres cluster crash during the flash sale? A missing index caused sequential table scans.\n\n"
        "When 10,000 customers hit the checkout route at noon, lock contention spiked to 100% within 4 seconds."
    )
    result = scan(text)
    rule_ids = [f.rule_id for f in result.findings]
    assert "STRUCT_RHETORICAL_QUESTION_HOOK" in rule_ids
    for f in result.findings:
        assert text[f.start : f.end] == f.quote


def test_no_double_counting_a_testament_to():
    text = "The new query engine is a testament to careful architectural design."
    result = scan(text)
    # Must charge inflated significance (7 pts), but NOT also charge testament (6 pts)
    testament_findings = [f for f in result.findings if "TESTAMENT" in f.rule_id]
    assert len(testament_findings) >= 1
    # Only 1 finding charges points; the overlapped one has points == 0
    active_findings = [f for f in result.findings if f.points > 0]
    assert len(active_findings) == 1
    assert active_findings[0].rule_id == "STRUCT_INFLATED_SIGNIFICANCE"
    assert active_findings[0].points == 7
    # Overall score must be 7, not 13
    assert result.deterministic_score == 7
    assert result.category_scores["banned_word"] == 0
    assert result.category_scores["structure"] == 7


def test_no_double_counting_one_arrow():
    text = "→ Run the alembic upgrade."
    result = scan(text)
    # One arrow must not be charged in both punctuation (5 pts) and structure (5 pts)
    arrow_findings = [f for f in result.findings if "ARROW" in f.rule_id]
    assert len(arrow_findings) == 2
    active_arrow = [f for f in arrow_findings if f.points > 0]
    suppressed_arrow = [f for f in arrow_findings if f.points == 0]
    assert len(active_arrow) == 1
    assert len(suppressed_arrow) == 1
    # Total points charged for the arrow is 5, not 10
    assert result.deterministic_score == 5


def test_no_double_counting_its_not_just():
    text = "It's not just about speed, it's about reliability."
    result = scan(text)
    # Must not be charged as both phrase (8 pts) and structure pattern (8 pts)
    not_just_findings = [f for f in result.findings if "NOT_JUST" in f.rule_id]
    active_not_just = [f for f in not_just_findings if f.points > 0]
    assert len(active_not_just) == 1
    # Total score charged for the frame is 8, not 16
    assert result.deterministic_score == 8


def test_single_weak_word_not_charged():
    # Only one weak word 'leverage' present
    text = "We should leverage database indexes to accelerate analytical queries."
    result = scan(text)
    weak_findings = [f for f in result.findings if "WEAK_LEVERAGE" in f.rule_id]
    assert len(weak_findings) == 1
    assert weak_findings[0].points == 0
    assert result.category_scores["banned_word"] == 0
    assert result.deterministic_score == 0


def test_multiple_distinct_weak_words_charged():
    # Two different weak words: 'leverage' and 'robust'
    text = "We must leverage a robust connection pool across all application workers."
    result = scan(text)
    charged_weak = [f for f in result.findings if "WEAK" in f.rule_id and f.points > 0]
    assert len(charged_weak) == 2
    # Each charged 2 points = 4 points total
    assert result.category_scores["banned_word"] == 4
    assert result.deterministic_score == 4

from dataclasses import dataclass


@dataclass(frozen=True)
class Question:
    focus: str
    prompt: str
    options: tuple[str, str, str, str, str]


@dataclass(frozen=True)
class Dimension:
    name: str
    category: str
    definition: str
    questions: tuple[Question, Question, Question, Question, Question]


@dataclass(frozen=True)
class Role:
    code: str
    name: str
    positioning: str
    period: str
    dimensions: tuple[Dimension, Dimension, Dimension, Dimension, Dimension, Dimension]


def q(focus: str, prompt: str, a: str, b: str, c: str, d: str, e: str) -> Question:
    return Question(focus, prompt, (a, b, c, d, e))


def d(name: str, category: str, definition: str, *questions: Question) -> Dimension:
    if len(questions) != 5:
        raise ValueError(f"{name} 必须有5道题，当前为{len(questions)}道")
    return Dimension(name, category, definition, questions)  # type: ignore[arg-type]


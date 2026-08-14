from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
from typing import Any

from question_bank import ROLES


ROOT = Path(__file__).resolve().parents[1]
OUTPUTS = (
    ROOT / "shared" / "question-bank" / "v1.json",
    ROOT / "cloudbase" / "seed" / "questionnaire-v1.json",
)
VERSION = "2026.08.13-v1"
ROLE_IDS = {
    "XS": "sales",
    "SW": "business",
    "PM": "project-manager",
    "JS": "technical-delivery",
    "XX": "offline-operations",
    "IP": "ip-operations",
    "FX": "content-distribution",
}
OPTION_CODES = ("A", "B", "C", "D", "E")


def canonical_json(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))


def build_question_bank() -> dict[str, Any]:
    roles: list[dict[str, Any]] = []
    for role in ROLES:
        role_id = ROLE_IDS[role.code]
        dimensions: list[dict[str, Any]] = []
        for dimension_index, dimension in enumerate(role.dimensions, 1):
            dimension_id = f"{role_id}:dimension-{dimension_index}"
            questions: list[dict[str, Any]] = []
            for question_index, question in enumerate(dimension.questions, 1):
                question_id = f"{dimension_id}:question-{question_index}"
                questions.append(
                    {
                        "id": question_id,
                        "focus": question.focus,
                        "prompt": question.prompt,
                        "options": {
                            code: text for code, text in zip(OPTION_CODES, question.options, strict=True)
                        },
                    }
                )
            dimensions.append(
                {
                    "id": dimension_id,
                    "name": dimension.name,
                    "category": dimension.category,
                    "description": dimension.definition,
                    "questions": questions,
                }
            )
        roles.append(
            {
                "id": role_id,
                "legacyCode": role.code,
                "name": role.name,
                "positioning": role.positioning,
                "period": role.period,
                "dimensions": dimensions,
            }
        )

    payload: dict[str, Any] = {
        "schemaVersion": 1,
        "version": VERSION,
        "answerScale": {
            "A": 20,
            "B": 40,
            "C": 60,
            "D": 80,
            "E": 100,
            "UNABLE": None,
        },
        "roles": roles,
    }
    payload["checksum"] = hashlib.sha256(canonical_json(payload).encode("utf-8")).hexdigest()
    return payload


def rendered_output() -> str:
    return json.dumps(build_question_bank(), ensure_ascii=False, indent=2) + "\n"


def check_outputs(expected: str) -> None:
    failures: list[str] = []
    for path in OUTPUTS:
        if not path.exists():
            failures.append(f"缺少文件：{path}")
            continue
        actual = path.read_text(encoding="utf-8")
        if actual != expected:
            failures.append(f"文件不是由当前题库生成或已被手工修改：{path}")
    if failures:
        raise SystemExit("\n".join(failures))


def write_outputs(expected: str) -> None:
    for path in OUTPUTS:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(expected, encoding="utf-8", newline="\n")


def main() -> None:
    parser = argparse.ArgumentParser(description="导出七岗位版本化问卷题库 JSON")
    parser.add_argument("--check", action="store_true", help="只校验输出是否与源题库一致")
    args = parser.parse_args()
    expected = rendered_output()
    if args.check:
        check_outputs(expected)
        print("题库校验通过：7个职位，42个维度，210道题。")
    else:
        write_outputs(expected)
        print("已生成共享题库和 CloudBase 种子文件。")


if __name__ == "__main__":
    main()

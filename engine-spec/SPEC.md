# NABD Adaptive Engine — Normative Specification

> **بالعربية:** هذه المواصفة هي مصدر الحقيقة الوحيد للمحرّك التكيفي. المحرّك يعمل في مكانين — TypeScript على جهاز الطالب (بدون إنترنت) و PHP على الخادم (كمرجع نهائي). أي تباعد بينهما يفسد بيانات الطلاب. لذلك كل دالة هنا **نقية وحتمية**، ولكل واحدة متجهات اختبار في `vectors/` يشغّلها Pest و Vitest معاً.

**Version:** 1.0.0

The engine is six pure, deterministic functions. No I/O, no clock, no randomness, no locale.
Both implementations MUST produce byte-identical output for every vector in `vectors/`.

| Function | TS (`web/src/engine/`) | PHP (`api/app/Engine/`) | Vectors |
|---|---|---|---|
| `masteryScore` | `mastery.ts` | `MasteryEngine.php` | `mastery.json` |
| `nextDifficulty` | `difficulty.ts` | `DifficultyEngine.php` | `difficulty.json` |
| `diagnosticNext` / `diagnosticResult` | `diagnostic.ts` | `DiagnosticEngine.php` | `diagnostic.json` |
| `recoveryPath` | `recovery.ts` | `RecoveryPathEngine.php` | `recovery-path.json` |
| `eloUpdate` | `elo.ts` | `EloEngine.php` | `elo.json` |
| `nextReviewAt` | `review.ts` | `ReviewEngine.php` | `review.json` |

---

## 0. Shared conventions

**Rounding.** Every numeric output is rounded with:

```
round2(x) = floor(x * 100 + 0.5) / 100
```

Specified explicitly because PHP's `round()` and JS's `Math.round()` disagree on negative
half-values. All engine outputs are non-negative, but the explicit form removes the question.

**Summation order.** Where a sum is taken over attempts, iterate **oldest → newest**. IEEE-754
addition is not associative; a different order can shift the last decimal.

**No wall clock.** Functions that involve time take timestamps as parameters. `nextReviewAt`
receives `mastered_at`; it never reads the system clock. This is what makes replay and offline
recomputation possible, and it is why the vectors are stable.

**Difficulty levels.** Ordered: `easy < medium < hard`.

---

## 1. `masteryScore(attempts, threshold) -> { score, status, attempts, correct, hard_correct }`

**Input** — `attempts` is an ordered array (oldest first) of:

```
{ correct: boolean, difficulty: "easy" | "medium" | "hard" }
```

`threshold` is the skill's `mastery_threshold` (default 85).

**Algorithm**

```
n = len(attempts)
if n == 0: return { score: 0, status: "not_started", attempts: 0, correct: 0, hard_correct: 0 }

W = { easy: 1.0, medium: 1.5, hard: 2.0 }

numerator = 0
denominator = 0
for i in 0 .. n-1:                      # oldest → newest
    decay  = 0.9 ^ (n - 1 - i)          # newest attempt has decay 1.0
    weight = W[attempts[i].difficulty] * decay
    denominator += weight
    if attempts[i].correct: numerator += weight

score = round2(100 * numerator / denominator)

correct      = count(a.correct)
hard_correct = count(a.correct and a.difficulty == "hard")

mastered = score >= threshold and n >= 8 and hard_correct >= 2
status   = mastered ? "mastered" : "learning"
```

**Why these three conditions.** The score alone is gameable: eight lucky `easy` answers would
clear 85. Requiring `n >= 8` blocks mastery on a thin sample; requiring two correct `hard`
answers blocks mastery that was never tested at depth. A teacher can read all three off the
screen and check them by hand — that is the point. This rule is **not** ML and never will be:
the teacher has to be able to disagree with it.

---

## 2. `nextDifficulty(state) -> { difficulty, action, consecutive_correct, consecutive_wrong }`

**Input**

```
{ difficulty: "easy"|"medium"|"hard", consecutive_correct: int, consecutive_wrong: int }
```

The caller increments the relevant counter for the answer just given, then calls this.

**Algorithm** — first matching rule wins:

```
1. difficulty == "easy" and consecutive_wrong >= 3
     -> { difficulty: "easy", action: "route_to_prerequisite", 0, 0 }

2. consecutive_wrong >= 2
     lower = demote(difficulty)                    # hard→medium, medium→easy, easy→easy
     -> lower != difficulty
          ? { lower, "demote", 0, 0 }
          : { "easy", "stay", 0, consecutive_wrong }

3. consecutive_correct >= 2
     higher = promote(difficulty)                  # easy→medium, medium→hard, hard→hard
     -> higher != difficulty
          ? { higher, "promote", 0, 0 }
          : { "hard", "stay", consecutive_correct, 0 }

4. otherwise
     -> { difficulty, "stay", consecutive_correct, consecutive_wrong }
```

Counters reset to 0 whenever the level actually moves, so a promotion needs two fresh correct
answers at the new level. At a ceiling (`hard` promote, `easy` demote) the counter is retained,
which is what lets rule 1 accumulate to three at `easy`.

**`route_to_prerequisite`** is the signal that the gap is below this skill. The caller resolves
*which* prerequisite via `recoveryPath` — the difficulty engine never touches the graph.

---

## 3. Diagnostic — binary search over a topologically sorted skill list

Prerequisites always sort before their dependents, so a pass at index `i` is evidence about
everything below `i`, and a fail is evidence about everything above. That makes the ordered list
a valid search space and reduces "find this student's real level" to `O(log n)` probes.

### 3.1 `diagnosticNext(state) -> { action, skill_code?, lo, hi }`

**Input**

```
{
  grade:      int,                # student's declared grade
  candidates: [skill_code],       # skills with grade_level <= grade, ascending order_index
  probes:     [{ skill_code, correct, total }],   # completed probes, in order
  lo:         int,                # highest passed index, -1 if none        (exclusive bound)
  hi:         int,                # lowest failed index, len(candidates) if none
  asked:      int,                # questions asked so far
  max_questions: 15,
  probe_size:     3
}
```

**Algorithm**

```
PASS_MARK = 2                     # of probe_size = 3

if asked + probe_size > max_questions:  return { action: "finish", lo, hi }
if hi - lo <= 1:                        return { action: "finish", lo, hi }   # frontier located

mid = floor((lo + hi) / 2)
return { action: "probe", skill_code: candidates[mid], lo, hi }
```

After a probe on index `mid` reports `correct`:

```
correct >= PASS_MARK  ->  lo = mid
correct <  PASS_MARK  ->  hi = mid
```

The first probe therefore lands on `floor((-1 + len) / 2)` — the median of the student's
grade-and-below range, exactly as `نبض.md §5` describes ("start with medium skill").

### 3.2 `diagnosticResult(state) -> { estimated_level, frontier_index, mastered, weak, missing }`

Measured evidence outranks inferred evidence:

```
for each candidate at index i:
    if i has a probe:
        correct >= 2  -> mastered
        correct == 1  -> weak
        correct == 0  -> missing
    else if i <= lo:  -> mastered        # inferred: below a passed probe
    else:             -> missing

estimated_level = lo >= 0 ? grade_level(candidates[lo]) : min(grade_level over candidates)
frontier_index  = lo
```

`weak` is the pedagogically interesting bucket: partial knowledge, worth revisiting rather than
reteaching from scratch.

---

## 4. `recoveryPath(graph, statuses, target) -> [skill_code]`

```
needed  = { target } ∪ transitive_prerequisites(target)
pending = { s ∈ needed : statuses[s] != "mastered" }
return pending sorted by order_index ascending
```

Sorting by `order_index` is what guarantees the student is never handed a skill before its
prerequisites — the topological property is inherited from the graph build, not recomputed here.

Unknown skills in `statuses` are treated as `not_started`. A target that is already mastered
yields an empty path.

---

## 5. `eloUpdate(theta, item_elo, correct) -> { theta, item_elo }`

```
K_STUDENT = 32
K_ITEM    = 8

expected = 1 / (1 + 10 ^ ((item_elo - theta) / 400))
c        = correct ? 1 : 0

theta'    = round2(theta    + K_STUDENT * (c - expected))
item_elo' = round2(item_elo + K_ITEM    * (expected - c))
```

The item drifts a quarter as fast as the student, so a question bank calibrates itself over
thousands of attempts without a single answer jerking it around.

**Elo never decides mastery.** It only orders candidate questions within a skill, so a
miscalibrated item can waste a student's time but can never mark them mastered or not. Mastery
is §1 and only §1.

---

## 6. `nextReviewAt(mastered_at, review_count) -> timestamp`

```
INTERVALS_DAYS = [7, 21, 60]
i    = min(review_count, len(INTERVALS_DAYS) - 1)
next = mastered_at + INTERVALS_DAYS[i] days      # exact 86400-second days, UTC
```

Retention, not just attainment: a skill reached in March and never revisited is gone by June.
Deliberately not SM-2 — SM-2 needs a self-rated recall quality, and asking a 12-year-old in a
tent school to grade their own memory is not a signal worth having.

---

## Conformance

An implementation conforms when it reproduces every case in `vectors/` exactly.

```bash
cd api && ./vendor/bin/pest --filter=EngineSpec     # PHP
cd web && npm run test -- engine-spec               # TypeScript
```

Vectors are generated by `tools/gen-engine-vectors.mjs` from the reference implementation in
`engine-spec/reference/`, then reviewed by hand. **Changing the spec means regenerating the
vectors and re-running both suites** — never editing a vector to make a test pass.

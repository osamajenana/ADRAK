<?php

declare(strict_types=1);

namespace App\Services\Discovery;

use App\Models\ExerciseAttempt;
use App\Models\Misconception;
use App\Models\QuestionOption;
use Illuminate\Support\Facades\DB;

/**
 * Finds misconceptions nobody wrote down.
 *
 * The catalogue in content/ was authored up front from what a curriculum author and the literature
 * already know, and it covers the errors somebody thought to look for. This finds the other kind:
 * a wrong answer that many students keep choosing, which no catalogued misconception explains.
 *
 * The loop is closed by a person. The pipeline finds a pattern, the model proposes a name and a
 * remediation, and an admin approves or rejects it — only then does it reach a teacher, and only
 * then are the past attempts that produced it re-tagged so the history reads correctly.
 *
 * That division is the point. A model is good at reading a pattern in mathematics and naming the
 * misunderstanding behind it, and bad at being accountable for what a teacher then tells a child.
 */
final class MisconceptionDiscoveryService
{
    /** Below this a shared wrong answer is chance. Above it, something systematic is happening. */
    private const MIN_STUDENTS = 3;

    private const MAX_CANDIDATES = 20;

    private const EXAMPLES_PER_CANDIDATE = 3;

    public function __construct(private readonly MisconceptionAnalyst $analyst) {}

    /**
     * Wrong answers chosen by several students that the catalogue does not explain.
     *
     * Untagged only. A distractor that already carries a misconception has an explanation, and
     * re-proposing one would fill the review queue with things already known.
     *
     * @return list<MisconceptionCandidate>
     */
    public function candidates(int $minStudents = self::MIN_STUDENTS): array
    {
        $rows = DB::table('exercise_attempts')
            ->join('question_options', 'question_options.id', '=', 'exercise_attempts.selected_option_id')
            ->join('skills', 'skills.id', '=', 'exercise_attempts.skill_id')
            ->where('exercise_attempts.is_correct', false)
            ->whereNull('exercise_attempts.misconception_id')
            ->groupBy('skills.id', 'skills.code', 'skills.name_ar', 'question_options.text_ar')
            ->select([
                'skills.id as skill_id',
                'skills.code as skill_code',
                'skills.name_ar as skill_name',
                'question_options.text_ar as chosen',
                DB::raw('COUNT(DISTINCT exercise_attempts.student_id) as student_count'),
                DB::raw('COUNT(*) as occurrences'),
            ])
            ->havingRaw('COUNT(DISTINCT exercise_attempts.student_id) >= ?', [$minStudents])
            ->orderByDesc('student_count')
            ->orderByDesc('occurrences')
            ->limit(self::MAX_CANDIDATES)
            ->get();

        return $rows->map(fn ($row): MisconceptionCandidate => new MisconceptionCandidate(
            (int) $row->skill_id,
            $row->skill_code,
            $row->skill_name,
            $row->chosen,
            (int) $row->student_count,
            (int) $row->occurrences,
            $this->examplesFor((int) $row->skill_id, $row->chosen),
        ))->all();
    }

    /**
     * Runs discovery and stores what comes back as proposals awaiting review.
     *
     * @return array{candidates: int, proposed: int, skipped: int}
     */
    public function discover(int $minStudents = self::MIN_STUDENTS): array
    {
        $candidates = $this->candidates($minStudents);

        if ($candidates === []) {
            return ['candidates' => 0, 'proposed' => 0, 'skipped' => 0];
        }

        $proposals = $this->analyst->analyse($candidates);

        $proposed = 0;
        $skipped = 0;

        foreach ($candidates as $candidate) {
            $proposal = $proposals["{$candidate->skillCode}|{$candidate->chosenAnswer}"] ?? null;

            if ($proposal === null) {
                $skipped++;

                continue;
            }

            // A tag the catalogue already holds means the analyst recognised something we knew;
            // storing it again would create a duplicate a reviewer has to reject by hand.
            $exists = Misconception::query()
                ->where('skill_id', $candidate->skillId)
                ->where('tag', $proposal->tag)
                ->exists();

            if ($exists) {
                $skipped++;

                continue;
            }

            Misconception::create([
                'skill_id' => $candidate->skillId,
                'tag' => $proposal->tag,
                'name_ar' => $proposal->nameAr,
                'remediation_ar' => $proposal->remediationAr,
                'source' => Misconception::SOURCE_DISCOVERED,
                // Proposed, never active. Nothing a model wrote reaches a teacher unreviewed.
                'status' => Misconception::STATUS_PROPOSED,
            ]);

            $proposed++;
        }

        return ['candidates' => count($candidates), 'proposed' => $proposed, 'skipped' => $skipped];
    }

    /**
     * Approves a proposal and re-tags the attempts that produced it.
     *
     * Back-tagging is what makes an approval worth anything: without it the new misconception would
     * describe only future answers, and the teacher would see a count of one on something eleven
     * students have been doing all term.
     *
     * @return int number of past attempts re-tagged
     */
    public function approve(Misconception $misconception, string $chosenAnswer): int
    {
        return DB::transaction(function () use ($misconception, $chosenAnswer): int {
            $misconception->update(['status' => Misconception::STATUS_ACTIVE]);

            $optionIds = QuestionOption::query()
                ->whereHas('question', fn ($q) => $q->where('skill_id', $misconception->skill_id))
                ->where('text_ar', $chosenAnswer)
                ->where('is_correct', false)
                ->pluck('id');

            // The option carries the link too, so a question served from now on is tagged at
            // source rather than only in the history.
            QuestionOption::query()
                ->whereIn('id', $optionIds)
                ->whereNull('misconception_id')
                ->update(['misconception_id' => $misconception->id]);

            return ExerciseAttempt::query()
                ->where('skill_id', $misconception->skill_id)
                ->whereIn('selected_option_id', $optionIds)
                ->whereNull('misconception_id')
                ->update(['misconception_id' => $misconception->id]);
        });
    }

    public function reject(Misconception $misconception): void
    {
        $misconception->update(['status' => Misconception::STATUS_REJECTED]);
    }

    /**
     * A few of the questions where this answer was chosen, so the analyst can see the mathematics
     * rather than only the string.
     *
     * @return list<array{stem: string, expression: string|null, correct: string}>
     */
    private function examplesFor(int $skillId, string $chosen): array
    {
        $rows = DB::table('question_options')
            ->join('questions', 'questions.id', '=', 'question_options.question_id')
            ->where('questions.skill_id', $skillId)
            ->where('question_options.text_ar', $chosen)
            ->where('question_options.is_correct', false)
            ->select(['questions.id', 'questions.stem_ar', 'questions.expression'])
            ->limit(self::EXAMPLES_PER_CANDIDATE)
            ->get();

        $correctByQuestion = DB::table('question_options')
            ->whereIn('question_id', $rows->pluck('id'))
            ->where('is_correct', true)
            ->pluck('text_ar', 'question_id');

        return $rows->map(static fn ($row): array => [
            'stem' => $row->stem_ar,
            'expression' => $row->expression,
            'correct' => $correctByQuestion[$row->id] ?? '',
        ])->all();
    }
}

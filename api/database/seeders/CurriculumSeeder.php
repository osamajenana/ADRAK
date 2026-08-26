<?php

declare(strict_types=1);

namespace Database\Seeders;

use App\Models\Misconception;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Skill;
use App\Models\Subject;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Loads content/ into the database.
 *
 * content/ is the source of truth, not this database. The graph and the question bank are built
 * and validated by tools/ (topological order, no cycles, every misconception tag catalogued), so
 * this seeder's job is to transfer verified data — not to decide anything.
 *
 * Idempotent: re-running updates in place and never duplicates. That matters because the demo
 * server re-seeds nightly so a judge always opens clean data.
 */
final class CurriculumSeeder extends Seeder
{
    /**
     * @return array{skills: int, misconceptions: int, questions: int}
     */
    public function load(): array
    {
        $graph = $this->readJson('skill-graph.json');

        return DB::transaction(function () use ($graph): array {
            $subject = $this->seedSubject($graph['subject']);
            $skillIds = $this->seedSkills($subject, $graph['skills']);
            $this->seedPrerequisites($skillIds, $graph['skills']);
            $misconceptionIds = $this->seedMisconceptions($skillIds, $graph['skills']);
            $questionCount = $this->seedQuestions($skillIds, $misconceptionIds);

            return [
                'skills' => count($skillIds),
                'misconceptions' => count($misconceptionIds),
                'questions' => $questionCount,
            ];
        });
    }

    /** Seeder contract. Reporting belongs to the console command, so this stays silent. */
    public function run(): void
    {
        $this->load();
    }

    /** @param  array{code: string, name_ar: string, name_en: string}  $data */
    private function seedSubject(array $data): Subject
    {
        return Subject::updateOrCreate(
            ['code' => $data['code']],
            ['name_ar' => $data['name_ar'], 'name_en' => $data['name_en']],
        );
    }

    /**
     * @param  list<array<string, mixed>>  $skills
     * @return array<string, int> skill code => id
     */
    private function seedSkills(Subject $subject, array $skills): array
    {
        $ids = [];

        foreach ($skills as $skill) {
            $model = Skill::updateOrCreate(
                ['code' => $skill['code']],
                [
                    'subject_id' => $subject->id,
                    'name_ar' => $skill['name_ar'],
                    'description_ar' => $skill['description_ar'],
                    'strand' => $skill['strand'],
                    'grade_level' => $skill['grade_level'],
                    'order_index' => $skill['order_index'],
                    'depth' => $skill['depth'],
                    'mastery_threshold' => $skill['mastery_threshold'],
                    'is_spine' => $skill['is_spine'],
                ],
            );

            $ids[$skill['code']] = $model->id;
        }

        return $ids;
    }

    /**
     * @param  array<string, int>  $skillIds
     * @param  list<array<string, mixed>>  $skills
     */
    private function seedPrerequisites(array $skillIds, array $skills): void
    {
        $rows = [];

        foreach ($skills as $skill) {
            foreach ($skill['prerequisites'] as $prerequisite) {
                $rows[] = [
                    'skill_id' => $skillIds[$skill['code']],
                    'prerequisite_skill_id' => $skillIds[$prerequisite],
                ];
            }
        }

        // Rebuilt wholesale rather than diffed: a prerequisite removed from the graph must
        // disappear here too, or the recovery path keeps teaching a skill the curriculum dropped.
        DB::table('skill_prerequisites')->delete();
        foreach (array_chunk($rows, 200) as $chunk) {
            DB::table('skill_prerequisites')->insert($chunk);
        }
    }

    /**
     * @param  array<string, int>  $skillIds
     * @param  list<array<string, mixed>>  $skills
     * @return array<string, int> "SKILL.CODE|tag" => misconception id
     */
    private function seedMisconceptions(array $skillIds, array $skills): array
    {
        $ids = [];

        foreach ($skills as $skill) {
            foreach ($skill['misconceptions'] as $misconception) {
                $model = Misconception::updateOrCreate(
                    ['skill_id' => $skillIds[$skill['code']], 'tag' => $misconception['tag']],
                    [
                        'name_ar' => $misconception['name_ar'],
                        'remediation_ar' => $misconception['remediation_ar'],
                        'source' => Misconception::SOURCE_CATALOGUE,
                        'status' => Misconception::STATUS_ACTIVE,
                    ],
                );

                $ids["{$skill['code']}|{$misconception['tag']}"] = $model->id;
            }
        }

        return $ids;
    }

    /**
     * @param  array<string, int>  $skillIds
     * @param  array<string, int>  $misconceptionIds
     */
    private function seedQuestions(array $skillIds, array $misconceptionIds): int
    {
        $dir = $this->contentPath('questions');
        $files = glob("{$dir}/*.json") ?: [];
        $total = 0;

        foreach ($files as $file) {
            $bank = json_decode((string) file_get_contents($file), true, flags: JSON_THROW_ON_ERROR);
            $code = $bank['skill_code'];

            if (! isset($skillIds[$code])) {
                throw new RuntimeException("question bank references unknown skill: {$code}");
            }

            // Replace rather than merge. Questions have no stable natural key, and a regenerated
            // bank with different numbers must not leave the old items behind alongside the new.
            Question::where('skill_id', $skillIds[$code])->delete();

            // Options are collected and inserted in bulk. Hydrating 2,040 Eloquent models one at
            // a time dominated the runtime, and this seeder runs nightly on the demo server.
            $optionRows = [];

            foreach ($bank['questions'] as $question) {
                $model = Question::create([
                    'skill_id' => $skillIds[$code],
                    'type' => $question['type'],
                    'difficulty' => $question['difficulty'],
                    'stem_ar' => $question['stem_ar'],
                    'expression' => $question['expression'],
                    'hint_ar' => $question['hint_ar'],
                    'explanation_ar' => $question['explanation_ar'],
                ]);

                foreach ($question['options'] as $position => $option) {
                    $tag = $option['misconception_tag'];

                    $optionRows[] = [
                        'question_id' => $model->id,
                        'text_ar' => $option['text_ar'],
                        'is_correct' => $option['is_correct'],
                        'misconception_id' => $tag !== null ? ($misconceptionIds["{$code}|{$tag}"] ?? null) : null,
                        'position' => $position,
                    ];
                }

                $total++;
            }

            foreach (array_chunk($optionRows, 250) as $chunk) {
                QuestionOption::insert($chunk);
            }
        }

        return $total;
    }

    /** @return array<string, mixed> */
    private function readJson(string $file): array
    {
        $path = $this->contentPath($file);

        if (! is_file($path)) {
            throw new RuntimeException("missing content file: {$path}. Run node tools/build-skill-graph.mjs");
        }

        return json_decode((string) file_get_contents($path), true, flags: JSON_THROW_ON_ERROR);
    }

    private function contentPath(string $suffix): string
    {
        return base_path('../content/'.$suffix);
    }
}

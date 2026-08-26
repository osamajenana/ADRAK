<?php

declare(strict_types=1);

namespace App\Services\Discovery;

use Anthropic\Client;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;
use Throwable;

/**
 * Asks Claude what systematic error produces a wrong answer that many students keep choosing.
 *
 * This is the one place a model gets to contribute something the rules cannot. It is good at
 * exactly this — reading a pattern in mathematics and naming the misunderstanding behind it — and
 * it is asked for nothing else. It never scores a student, never decides mastery, and nothing it
 * returns reaches a teacher until a person has approved it.
 *
 * The division is deliberate and it is the project's position on where AI belongs: the model
 * proposes, the rules decide, and a human holds the pen on anything a teacher will act on.
 */
final class ClaudeMisconceptionAnalyst implements MisconceptionAnalyst
{
    /** Sent in one request rather than one per candidate: fewer round trips, and the model can see
     *  that two candidates are the same underlying error appearing on different questions. */
    private const MAX_PER_REQUEST = 12;

    public function __construct(
        private readonly ?Client $client,
        private readonly string $model,
    ) {}

    public function isConfigured(): bool
    {
        return $this->client !== null;
    }

    public function analyse(array $candidates): array
    {
        if ($this->client === null || $candidates === []) {
            return [];
        }

        $proposals = [];

        foreach (array_chunk($candidates, self::MAX_PER_REQUEST) as $chunk) {
            foreach ($this->analyseChunk($chunk) as $key => $proposal) {
                $proposals[$key] = $proposal;
            }
        }

        return $proposals;
    }

    /**
     * @param  list<MisconceptionCandidate>  $chunk
     * @return array<string, MisconceptionProposal>
     */
    private function analyseChunk(array $chunk): array
    {
        try {
            $message = $this->client->messages->create(
                model: $this->model,
                maxTokens: 8000,
                system: $this->systemPrompt(),
                messages: [['role' => 'user', 'content' => $this->describe($chunk)]],
                // The task is genuine mathematical reasoning about why a wrong answer is
                // attractive, not extraction. Adaptive thinking is worth the tokens here.
                thinking: ['type' => 'adaptive'],
                outputConfig: ['format' => $this->schema()],
            );

            return $this->parse($message);
        } catch (Throwable $failure) {
            // Discovery is an enhancement. A failed call must never take the nightly job — or the
            // teacher dashboard that job feeds — down with it.
            Log::warning('misconception discovery failed', ['error' => $failure->getMessage()]);

            return [];
        }
    }

    private function systemPrompt(): string
    {
        return <<<'PROMPT'
        You analyse mathematics errors made by students in grades 4-9 who are recovering from
        interrupted schooling in Gaza. They are working in Arabic.

        You are given wrong answers that MANY students chose on the same question. For each one,
        decide whether a single systematic misunderstanding would produce that exact answer.

        Rules:
        - Only name a misconception when the wrong answer is what the error would actually produce.
          Arithmetic slips, mis-taps and guesses are not misconceptions. Say so by returning a low
          confidence rather than inventing an explanation.
        - `name_ar` names the ERROR, in Arabic, as a teacher would say it to a colleague. Not the
          topic. "يجمع البسط والمقام" — not "صعوبة في الكسور".
        - `remediation_ar` is what a teacher should DO about it, in one or two Arabic sentences,
          concrete enough to use in the next twenty minutes. Prefer a representation or a
          counter-example over a restatement of the rule.
        - Write for a teacher, not a student. Do not address the child.
        - `tag` is lowercase ASCII, dot-separated, in the shape `topic.error` — e.g.
          `frc.add_across`. It is an identifier, not prose.
        - `confidence` is your own honest estimate that this is a real, teachable misconception
          rather than noise.
        PROMPT;
    }

    /** @param  list<MisconceptionCandidate>  $chunk */
    private function describe(array $chunk): string
    {
        $blocks = [];

        foreach ($chunk as $candidate) {
            $examples = array_map(
                static fn (array $e): string => sprintf(
                    '    - %s %s  (correct answer: %s)',
                    $e['stem'],
                    $e['expression'] ?? '',
                    $e['correct'],
                ),
                $candidate->examples,
            );

            $blocks[] = sprintf(
                "id: %s|%s\nskill: %s (%s)\nwrong answer chosen: %s\nchosen by %d students, %d times\nquestions where it happened:\n%s",
                $candidate->skillCode,
                $candidate->chosenAnswer,
                $candidate->skillName,
                $candidate->skillCode,
                $candidate->chosenAnswer,
                $candidate->studentCount,
                $candidate->occurrences,
                implode("\n", $examples),
            );
        }

        return "Analyse each of these recurring wrong answers.\n\n".implode("\n\n---\n\n", $blocks);
    }

    /** @return array<string, mixed> */
    private function schema(): array
    {
        return [
            'type' => 'json_schema',
            'schema' => [
                'type' => 'object',
                'properties' => [
                    'findings' => [
                        'type' => 'array',
                        'items' => [
                            'type' => 'object',
                            'properties' => [
                                'id' => ['type' => 'string'],
                                'tag' => ['type' => 'string'],
                                'name_ar' => ['type' => 'string'],
                                'remediation_ar' => ['type' => 'string'],
                                'confidence' => ['type' => 'number'],
                            ],
                            'required' => ['id', 'tag', 'name_ar', 'remediation_ar', 'confidence'],
                            'additionalProperties' => false,
                        ],
                    ],
                ],
                'required' => ['findings'],
                'additionalProperties' => false,
            ],
        ];
    }

    /** @return array<string, MisconceptionProposal> */
    private function parse(object $message): array
    {
        $json = null;

        // Thinking blocks precede the text block, so the first block is not reliably the answer.
        foreach ($message->content as $block) {
            if (($block->type ?? null) === 'text') {
                $json = $block->text;
                break;
            }
        }

        if ($json === null) {
            return [];
        }

        $decoded = json_decode($json, true, flags: JSON_THROW_ON_ERROR);
        $proposals = [];

        foreach ($decoded['findings'] ?? [] as $finding) {
            $tag = Str::of($finding['tag'])->lower()->replaceMatches('/[^a-z0-9._]/', '')->value();

            if ($tag === '' || ! isset($finding['id'])) {
                continue;
            }

            $proposals[$finding['id']] = new MisconceptionProposal(
                $tag,
                trim($finding['name_ar']),
                trim($finding['remediation_ar']),
                (float) $finding['confidence'],
            );
        }

        return $proposals;
    }
}

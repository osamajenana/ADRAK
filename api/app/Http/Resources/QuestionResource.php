<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Question;
use App\Models\QuestionOption;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * @mixin Question
 *
 * Note that `is_correct` IS sent to the client, along with the explanation.
 *
 * That is not an oversight. ADRAK has to grade an answer on a phone in a tent with the network off,
 * and it cannot do that without knowing which answer is right. Withholding it would mean either no
 * offline practice at all, or feedback that arrives days later when the child syncs — by which
 * point it teaches nothing.
 *
 * The trade is acceptable because nothing is at stake in the answer. This is formative: there is no
 * grade, no certificate and no ranking to protect, and a student who peeks has only removed their
 * own practice. If a summative mode is ever needed it will be a proctored one, not a client-side
 * secret — obfuscating the payload would buy no real protection and cost every offline session.
 */
final class QuestionResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'id' => $this->id,
            'skill_code' => $this->skill->code,
            'type' => $this->type,
            'difficulty' => $this->difficulty->value,
            'stem_ar' => $this->stem_ar,
            // Rendered in its own LTR run; inlining it into the Arabic would let the bidi
            // algorithm reorder the expression.
            'expression' => $this->expression,
            'hint_ar' => $this->hint_ar,
            'explanation_ar' => $this->explanation_ar,
            'options' => $this->options->map(static fn (QuestionOption $option): array => [
                'id' => $option->id,
                'text_ar' => $option->text_ar,
                'is_correct' => $option->is_correct,
            ])->all(),
        ];
    }
}

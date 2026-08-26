<?php

declare(strict_types=1);

namespace App\Services\Discovery;

/** What the analyst thinks a recurring wrong answer means. */
final readonly class MisconceptionProposal
{
    public function __construct(
        public string $tag,
        public string $nameAr,
        public string $remediationAr,
        /**
         * The analyst's own confidence, 0-1.
         *
         * Kept because a low-confidence proposal is still worth showing a human — they may
         * recognise instantly what a model could only guess at. It is never used to auto-approve.
         */
        public float $confidence,
    ) {}
}

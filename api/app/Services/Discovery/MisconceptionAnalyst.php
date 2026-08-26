<?php

declare(strict_types=1);

namespace App\Services\Discovery;

/**
 * Turns "eleven students chose 2/5 for 1/2 + 1/3" into "they are adding numerators and
 * denominators, and here is what to say to them".
 *
 * An interface because the discovery pipeline must run without an API key — in tests, in CI, and
 * on a server that has no outbound connection today. The null implementation returns nothing and
 * everything upstream still works.
 */
interface MisconceptionAnalyst
{
    /**
     * @param  list<MisconceptionCandidate>  $candidates
     * @return array<string, MisconceptionProposal> keyed by "{skillCode}|{chosenAnswer}"
     */
    public function analyse(array $candidates): array;

    public function isConfigured(): bool;
}

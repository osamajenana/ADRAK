<?php

declare(strict_types=1);

namespace App\Services\Discovery;

/**
 * The analyst when no API key is configured.
 *
 * Returns nothing rather than throwing. Discovery is an enhancement to the teacher dashboard, not
 * a dependency of it: a deployment with no outbound connection — which is a realistic description
 * of where this runs — must still serve every other feature.
 */
final class NullMisconceptionAnalyst implements MisconceptionAnalyst
{
    public function analyse(array $candidates): array
    {
        return [];
    }

    public function isConfigured(): bool
    {
        return false;
    }
}

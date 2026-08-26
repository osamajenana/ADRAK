<?php

declare(strict_types=1);

namespace App\Providers;

use Anthropic\Client;
use App\Services\Discovery\ClaudeMisconceptionAnalyst;
use App\Services\Discovery\MisconceptionAnalyst;
use App\Services\Discovery\NullMisconceptionAnalyst;
use Illuminate\Support\ServiceProvider;

/**
 * Binds the analyst that misconception discovery uses.
 *
 * Falls back to the null implementation whenever no API key is configured, so tests, CI and an
 * offline server all resolve something that works. Discovery is an enhancement to the teacher
 * dashboard; nothing else may depend on an outbound connection existing.
 */
final class DiscoveryServiceProvider extends ServiceProvider
{
    public function register(): void
    {
        $this->app->singleton(MisconceptionAnalyst::class, function (): MisconceptionAnalyst {
            $key = config('nabd.discovery.api_key');

            if (! is_string($key) || $key === '') {
                return new NullMisconceptionAnalyst;
            }

            return new ClaudeMisconceptionAnalyst(
                new Client(apiKey: $key),
                (string) config('nabd.discovery.model'),
            );
        });
    }
}

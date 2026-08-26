<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Misconception discovery
    |--------------------------------------------------------------------------
    |
    | Finds errors the catalogue does not describe by asking Claude what
    | systematic mistake produces a wrong answer many students keep choosing.
    |
    | Entirely optional. With no API key the pipeline binds a null analyst and
    | every other feature works unchanged — which matters, because a server
    | with no outbound connection today is a realistic description of where
    | this runs.
    |
    */
    'discovery' => [
        'api_key' => env('ANTHROPIC_API_KEY'),

        'model' => env('NABD_DISCOVERY_MODEL', 'claude-opus-5'),

        // Below this a shared wrong answer is chance rather than a pattern.
        'min_students' => (int) env('NABD_DISCOVERY_MIN_STUDENTS', 3),
    ],
];

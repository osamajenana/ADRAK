<?php

declare(strict_types=1);

return [
    /*
    |--------------------------------------------------------------------------
    | Judge mode
    |--------------------------------------------------------------------------
    |
    | One-click sign-in to the demo classroom, with no credentials typed.
    |
    | This exists because the strongest thing about this product is invisible
    | to anyone who does not get past a login screen, and someone evaluating
    | thirty submissions will not type a class code from a slide. It hands out
    | a real token for a real seeded account - there is no separate demo mode
    | inside the app, so what a judge tries is what a student gets.
    |
    | Off unless explicitly enabled. On a deployment carrying real children's
    | work, an endpoint that issues tokens without credentials must not exist.
    |
    */
    'demo' => [
        'enabled' => (bool) env('NABD_DEMO_MODE', false),
    ],

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

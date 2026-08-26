<?php

declare(strict_types=1);

use Illuminate\Foundation\Inspiring;
use Illuminate\Support\Facades\Artisan;

Artisan::command('inspire', function () {
    $this->comment(Inspiring::quote());
})->purpose('Display an inspiring quote');

/*
 * The demo classroom is rebuilt every night at 03:00.
 *
 * Judging runs for weeks against a public link. Without this, the tenth person to open it meets a
 * class whose progress the nine before them have scribbled over, and concludes it does not work.
 */
Schedule::command('nabd:demo-reset')->dailyAt('03:00')->withoutOverlapping();

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
Schedule::command('adrak:demo-reset')->dailyAt('03:00')->withoutOverlapping();

/*
 * Discovery runs weekly, not nightly.
 *
 * It looks for a wrong answer that several students share, and that takes a week of a class using
 * the app to accumulate. Running it every night would mostly re-examine the same thin evidence and
 * spend tokens to reach the same answer.
 */
Schedule::command('adrak:discover-misconceptions')->weeklyOn(6, '04:00')->withoutOverlapping();

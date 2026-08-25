<?php

declare(strict_types=1);
use Tests\TestCase;

// Feature tests get the full framework. Unit tests deliberately do not: the adaptive engine is
// pure PHP with no container, no database and no clock, so booting Laravel to test it would only
// make the suite slower — and this suite gets run on a laptop with a limited power budget.
pest()->extend(TestCase::class)->in('Feature');

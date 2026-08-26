<?php

declare(strict_types=1);

use App\Http\Controllers\Api\AuthController;
use App\Http\Controllers\Api\DiagnosticController;
use App\Http\Controllers\Api\ExerciseController;
use App\Http\Controllers\Api\StudentController;
use App\Http\Controllers\Api\SyncController;
use App\Http\Controllers\Api\TeacherController;
use Illuminate\Support\Facades\Route;

/*
|--------------------------------------------------------------------------
| NABD API
|--------------------------------------------------------------------------
|
| Shaped around one constraint: the client is a PWA that has to keep working
| when the network does not. So the read endpoints hand over whole batches
| the client can store in IndexedDB, and the write endpoints accept the
| device id and per-device sequence that let work recorded offline be
| replayed in order once a connection appears.
|
*/

Route::prefix('auth')->group(function (): void {
    // Unauthenticated by design: a child cannot reach the login screen without it, and it carries
    // only first names, which are already read aloud in the room every morning.
    Route::get('classrooms/{joinCode}', [AuthController::class, 'roster']);

    Route::post('student', [AuthController::class, 'student']);
    Route::post('teacher', [AuthController::class, 'teacher']);

    Route::middleware('auth:sanctum')->group(function (): void {
        Route::get('me', [AuthController::class, 'me']);
        Route::post('logout', [AuthController::class, 'logout']);
    });
});

Route::middleware('auth:sanctum')->group(function (): void {
    // One call that hydrates the offline store: the graph, this student's standing on it, and
    // their path. Everything after this can happen with the radio off.
    Route::get('student/bootstrap', [StudentController::class, 'bootstrap']);
    Route::get('student/skill-map', [StudentController::class, 'skillMap']);
    Route::get('student/learning-path', [StudentController::class, 'learningPath']);

    Route::prefix('diagnostic')->group(function (): void {
        Route::post('start', [DiagnosticController::class, 'start']);
        Route::get('current', [DiagnosticController::class, 'current']);
        // Returns the next question in the same response — a fifteen-question test that costs
        // thirty round trips on 2G is a test a child abandons halfway.
        Route::post('answer', [DiagnosticController::class, 'answer']);
    });

    // The skill's whole bank, so practice continues with no connection.
    Route::get('skills/{code}/bank', [ExerciseController::class, 'bank']);
    Route::get('skills/{code}/next', [ExerciseController::class, 'next']);
    Route::post('exercises/answer', [ExerciseController::class, 'answer']);

    // Where offline work comes back. Idempotent, so a student whose answers arrive both from
    // their own phone and via their teacher's QR scan is not counted twice — which in a class
    // where some phones have data and some do not is the normal case, not the edge case.
    Route::post('sync', [SyncController::class, 'push']);
    Route::post('sync/relay', [SyncController::class, 'relay']);

    // Scoped through the teacher's own relation, so a missing permission check cannot leak a
    // class - the query has nowhere to find one that is not theirs.
    Route::get('teacher/classrooms', [TeacherController::class, 'classrooms']);
    // The whole dashboard in one response: a teacher opens this on a shared laptop with a few
    // minutes of power, and four round trips is four chances for the connection to drop.
    Route::get('teacher/classrooms/{classroom}', [TeacherController::class, 'overview']);
});

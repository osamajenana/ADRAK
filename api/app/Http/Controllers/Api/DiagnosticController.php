<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Engine\DiagnosticEngine;
use App\Http\Controllers\Concerns\ResolvesStudent;
use App\Http\Controllers\Controller;
use App\Http\Resources\QuestionResource;
use App\Models\DiagnosticTest;
use App\Models\Question;
use App\Models\QuestionOption;
use App\Models\Student;
use App\Models\Subject;
use App\Services\DiagnosticService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\ValidationException;

/**
 * The diagnostic, over HTTP.
 *
 * Every response that can carry the next question does. A round trip on a 2G connection in Gaza
 * costs seconds, and a fifteen-question test that asks the server twice per question is a test a
 * child abandons halfway.
 */
final class DiagnosticController extends Controller
{
    use ResolvesStudent;

    public function __construct(private readonly DiagnosticService $diagnostic) {}

    public function start(Request $request): JsonResponse
    {
        $student = $this->student();
        $subject = Subject::query()->firstOrFail();

        $test = $this->diagnostic->start($student, $subject);
        $question = $this->diagnostic->nextQuestion($test);

        return response()->json([
            'test_id' => $test->id,
            'asked' => $test->fresh()->asked,
            'max_questions' => DiagnosticEngine::MAX_QUESTIONS,
            'question' => $question === null ? null : new QuestionResource($question),
            'finished' => $question === null,
        ]);
    }

    public function answer(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'question_id' => ['required', 'integer', 'exists:questions,id'],
            'option_id' => ['nullable', 'integer', 'exists:question_options,id'],
        ]);

        $student = $this->student();
        $test = $this->activeTest($student);

        $question = Question::query()->with('options')->findOrFail($validated['question_id']);
        $option = isset($validated['option_id'])
            ? QuestionOption::query()->find($validated['option_id'])
            : null;

        if ($option !== null && $option->question_id !== $question->id) {
            throw ValidationException::withMessages([
                'option_id' => 'هذا الخيار لا ينتمي لهذا السؤال.',
            ]);
        }

        $this->diagnostic->recordAnswer($test, $question, $option);

        $test = $test->fresh();
        $next = $this->diagnostic->nextQuestion($test);

        // The walk is over: close it in the same response rather than making an exhausted student
        // wait through another round trip to learn where they stand.
        if ($next === null) {
            $result = $this->diagnostic->complete($test->fresh());

            return response()->json([
                'is_correct' => (bool) $option?->is_correct,
                'finished' => true,
                'question' => null,
                'result' => [
                    'estimated_level' => $result->estimatedLevel,
                    'mastered' => $result->mastered,
                    'weak' => $result->weak,
                    'missing' => $result->missing,
                ],
            ]);
        }

        return response()->json([
            'is_correct' => (bool) $option?->is_correct,
            'finished' => false,
            'asked' => $test->fresh()->asked,
            'question' => new QuestionResource($next),
        ]);
    }

    /** Resumes a sitting that a dead battery or a closed tab interrupted. */
    public function current(Request $request): JsonResponse
    {
        $student = $this->student();

        $test = DiagnosticTest::query()
            ->where('student_id', $student->id)
            ->where('status', DiagnosticTest::STATUS_IN_PROGRESS)
            ->first();

        if ($test === null) {
            return response()->json(['test_id' => null, 'question' => null, 'finished' => true]);
        }

        $question = $this->diagnostic->nextQuestion($test);

        return response()->json([
            'test_id' => $test->id,
            'asked' => $test->fresh()->asked,
            'question' => $question === null ? null : new QuestionResource($question),
            'finished' => $question === null,
        ]);
    }

    private function activeTest(Student $student): DiagnosticTest
    {
        $test = DiagnosticTest::query()
            ->where('student_id', $student->id)
            ->where('status', DiagnosticTest::STATUS_IN_PROGRESS)
            ->first();

        if ($test === null) {
            throw ValidationException::withMessages([
                'test' => 'لا يوجد اختبار تشخيصي جارٍ.',
            ]);
        }

        return $test;
    }
}

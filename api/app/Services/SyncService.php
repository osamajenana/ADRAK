<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Device;
use App\Models\ExerciseAttempt;
use App\Models\Question;
use App\Models\Skill;
use App\Models\Student;
use App\Models\SyncEvent;
use Illuminate\Support\Facades\DB;

/**
 * Ingests a batch of events recorded on a device.
 *
 * The property everything else depends on: this is IDEMPOTENT. The same event legitimately arrives
 * more than once — a student's phone finds a signal, and separately their teacher scans the class
 * QR codes and uploads the whole batch — and the second arrival must change nothing. `sync_events.id`
 * is a client-minted UUIDv7 and the primary key, so the duplicate is dropped by the database rather
 * than by logic that could be got wrong.
 *
 * Order of arrival is irrelevant. Mastery is recomputed from the full attempt log sorted by the
 * per-device sequence, so a week that arrives backwards produces exactly the same result as a week
 * that arrives in order.
 */
final class SyncService
{
    public function __construct(
        private readonly MasteryService $mastery,
        private readonly RecoveryPathService $recovery,
    ) {}

    /**
     * @param  list<array{
     *     id: string,
     *     client_seq: int,
     *     type: string,
     *     payload: array<string, mixed>,
     *     client_created_at?: int|null,
     * }>  $events
     * @return array{accepted: int, duplicates: int, rejected: int, last_client_seq: int}
     */
    public function ingest(
        Student $student,
        string $deviceId,
        array $events,
        string $channel = SyncEvent::CHANNEL_CLOUD,
    ): array {
        if ($events === []) {
            return [
                'accepted' => 0,
                'duplicates' => 0,
                'rejected' => 0,
                'last_client_seq' => $this->lastSeqFor($deviceId),
            ];
        }

        return DB::transaction(function () use ($student, $deviceId, $events, $channel): array {
            $ids = array_column($events, 'id');

            // One query rather than one per event: a device that has been offline for a week
            // arrives with hundreds, over a connection that will not survive hundreds of queries.
            $known = SyncEvent::query()->whereIn('id', $ids)->pluck('id')->flip();

            $accepted = 0;
            $duplicates = 0;
            $rejected = 0;
            $touchedSkills = [];
            $maxSeq = 0;

            foreach ($events as $event) {
                $maxSeq = max($maxSeq, (int) $event['client_seq']);

                if ($known->has($event['id'])) {
                    $duplicates++;

                    continue;
                }

                $skillId = $this->apply($student, $deviceId, $event);

                if ($skillId === null) {
                    $rejected++;

                    continue;
                }

                SyncEvent::create([
                    'id' => $event['id'],
                    'device_id' => $deviceId,
                    'student_id' => $student->id,
                    'client_seq' => $event['client_seq'],
                    'type' => $event['type'],
                    'payload' => $event['payload'],
                    'client_created_at' => $event['client_created_at'] ?? null,
                    'server_received_at' => now(),
                    'channel' => $channel,
                ]);

                $touchedSkills[$skillId] = true;
                $accepted++;
            }

            // Recomputed once per skill, not once per event. A hundred answers on one skill is one
            // recomputation, and unlocking runs after the whole batch rather than mid-way through
            // a history the server has not finished reading.
            foreach (array_keys($touchedSkills) as $skillId) {
                $skill = Skill::query()->find($skillId);

                if ($skill !== null) {
                    $this->mastery->recompute($student, $skill);
                }
            }

            if ($touchedSkills !== []) {
                $this->recovery->refresh($student);
            }

            $this->rememberDevice($student, $deviceId, $maxSeq);

            return [
                'accepted' => $accepted,
                'duplicates' => $duplicates,
                'rejected' => $rejected,
                'last_client_seq' => $this->lastSeqFor($deviceId),
            ];
        });
    }

    /**
     * Writes one event's effect. Returns the skill it touched, or null if the event is unusable.
     *
     * An event referring to a question that no longer exists is DROPPED, not failed. Content is
     * regenerated between releases, and a student must never be told their week of work was
     * rejected because a question id moved underneath them.
     *
     * @param  array{type: string, payload: array<string, mixed>, client_seq: int, client_created_at?: int|null}  $event
     */
    private function apply(Student $student, string $deviceId, array $event): ?int
    {
        if ($event['type'] !== 'exercise_attempt') {
            // Unknown types are stored but have no side effect, so a newer client can send events
            // an older server does not act on yet without losing them.
            return 0;
        }

        $payload = $event['payload'];
        $question = Question::query()->find($payload['question_id'] ?? null);

        if ($question === null) {
            return null;
        }

        $option = $question->options->firstWhere('id', $payload['option_id'] ?? null);

        ExerciseAttempt::create([
            'student_id' => $student->id,
            'question_id' => $question->id,
            'skill_id' => $question->skill_id,
            'selected_option_id' => $option?->id,
            'is_correct' => (bool) $option?->is_correct,
            'difficulty_at_attempt' => $question->difficulty,
            'misconception_id' => $option?->misconception_id,
            'device_id' => $deviceId,
            'client_seq' => $event['client_seq'],
            'client_created_at' => $event['client_created_at'] ?? null,
        ]);

        return $question->skill_id;
    }

    /**
     * Records how far this device has been accepted, so the client resumes from there.
     *
     * A sync cut off by a dropped signal picks up where it stopped instead of replaying a month of
     * work over a connection that could not carry it the first time.
     */
    private function rememberDevice(Student $student, string $deviceId, int $maxSeq): void
    {
        $device = Device::query()->find($deviceId) ?? new Device(['id' => $deviceId]);

        $device->fill([
            'student_id' => $student->id,
            'last_client_seq' => max((int) $device->last_client_seq, $maxSeq),
            'last_seen_at' => now(),
        ])->save();
    }

    private function lastSeqFor(string $deviceId): int
    {
        $device = Device::query()->find($deviceId);

        return $device === null ? 0 : (int) $device->last_client_seq;
    }
}

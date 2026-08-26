<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Two ways in, because a child in a tent school has neither an email nor a password worth
 * remembering:
 *
 *   1. `login_token` — scanned from a QR card the teacher printed. Holding up a card beats typing
 *      a name a ten-year-old may not spell the same way twice.
 *   2. `join_code` + `student_id` + `pin` — the shared-phone path: pick your class, pick your name
 *      off the roster, tap four digits.
 */
final class StudentLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /** @return array<string, mixed> */
    public function rules(): array
    {
        return [
            'login_token' => ['nullable', 'string', 'size:48'],
            'join_code' => ['nullable', 'string', 'size:6'],
            'student_id' => ['nullable', 'integer'],
            'pin' => ['nullable', 'string', 'digits:4'],
            'device_id' => ['nullable', 'uuid'],
            'device_label' => ['nullable', 'string', 'max:120'],
        ];
    }

    protected function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $validator): void {
            if ($this->usesQrCard() || $this->usesRoster()) {
                return;
            }

            $validator->errors()->add(
                'login_token',
                'قدّم رمز البطاقة، أو رمز الصف مع الاسم ورقم التعريف.',
            );
        });
    }

    public function usesQrCard(): bool
    {
        return filled($this->input('login_token'));
    }

    public function usesRoster(): bool
    {
        return filled($this->input('join_code'))
            && filled($this->input('student_id'))
            && filled($this->input('pin'));
    }
}

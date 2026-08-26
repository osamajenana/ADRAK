<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Skill;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** @mixin Skill */
final class SkillResource extends JsonResource
{
    /** @return array<string, mixed> */
    public function toArray(Request $request): array
    {
        return [
            'code' => $this->code,
            'name_ar' => $this->name_ar,
            'description_ar' => $this->description_ar,
            'strand' => $this->strand,
            'grade_level' => $this->grade_level,
            'order_index' => $this->order_index,
            // The Skill Map lays skills out in columns by depth; sending it saves the client
            // recomputing longest paths over the whole graph on a low-end phone.
            'depth' => $this->depth,
            'is_spine' => $this->is_spine,
            'prerequisites' => $this->whenLoaded(
                'prerequisites',
                fn () => $this->prerequisites->pluck('code')->all(),
            ),
        ];
    }
}

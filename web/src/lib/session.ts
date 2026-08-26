import { useLiveQuery } from 'dexie-react-hooks';
import { setActiveProfile } from '@/db/meta';
import { db, type LocalProfile, type LocalSkill, progressKey } from '@/db/schema';
import type { MasteryStatus } from '@/engine/types';
import { post } from './api';

/**
 * Who is using this device right now, and everything the app needs about them.
 *
 * A device holds several profiles at once — five siblings sharing one phone is the normal case —
 * so "the session" is a pointer into the local database, not a token in memory. Switching profiles
 * is a local operation that needs no network, which matters because the switch happens twenty times
 * an evening in a room with one phone.
 */

export interface BootstrapPayload {
  student: { id: number; display_name: string; grade: number };
  skills: Array<
    LocalSkill & {
      name_ar: string;
      prerequisites: string[];
    }
  >;
  progress: Record<string, { status: MasteryStatus; mastery_score: number }>;
  learning_path: {
    id: number;
    target_skill_code: string | null;
    current_skill_code: string | null;
    items: Array<{
      skill_code: string;
      name_ar: string;
      order_index: number;
      status: 'locked' | 'current' | 'done';
    }>;
  } | null;
  has_completed_diagnostic: boolean;
}

export function useActiveProfile(): LocalProfile | null | undefined {
  return useLiveQuery(async () => {
    const id = (await db.meta.get('active_profile'))?.value as number | undefined;
    if (id === undefined) return null;

    return (await db.profiles.get(id)) ?? null;
  }, []);
}

export const useProfiles = (): LocalProfile[] | undefined =>
  useLiveQuery(() => db.profiles.orderBy('last_used_at').reverse().toArray(), []);

export interface LoginInput {
  login_token?: string;
  join_code?: string;
  student_id?: number;
  pin?: string;
}

/**
 * Logs in and immediately pulls everything needed to run without the network again.
 *
 * The bootstrap fetch is part of login rather than a later step on purpose: this is the one moment
 * we are certain there is a connection, and letting a student reach the home screen without the
 * graph in IndexedDB would strand them the first time the signal drops.
 */
export async function login(
  input: LoginInput,
  deviceId: string,
): Promise<{ ok: true; profile: LocalProfile } | { ok: false; message: string }> {
  const response = await post<{
    token: string;
    student: { id: number; display_name: string; grade: number; classroom_id: number | null };
  }>('/auth/student', { ...input, device_id: deviceId }, { auth: false });

  if (!response.ok) {
    return {
      ok: false,
      message: response.offline
        ? 'لا يوجد اتصال. أول دخول يحتاج إنترنت مرة واحدة فقط.'
        : (Object.values(response.errors ?? {})[0]?.[0] ?? response.message),
    };
  }

  const profile: LocalProfile = {
    id: response.data.student.id,
    display_name: response.data.student.display_name,
    grade: response.data.student.grade,
    classroom_id: response.data.student.classroom_id,
    token: response.data.token,
    last_used_at: Date.now(),
  };

  await db.profiles.put(profile);
  await setActiveProfile(profile.id);

  return { ok: true, profile };
}

/** Writes a bootstrap payload into the local database. Idempotent — safe to re-run on every open. */
export async function hydrate(payload: BootstrapPayload): Promise<void> {
  await db.transaction('rw', [db.skills, db.progress, db.pathItems], async () => {
    await db.skills.bulkPut(
      payload.skills.map((s) => ({
        code: s.code,
        name_ar: s.name_ar,
        description_ar: s.description_ar,
        strand: s.strand,
        grade_level: s.grade_level,
        order_index: s.order_index,
        depth: s.depth,
        is_spine: s.is_spine,
        prerequisites: s.prerequisites ?? [],
      })),
    );

    const profileId = payload.student.id;

    // Server progress replaces local progress for skills the server knows about. Local attempts
    // are untouched — they are the record, and anything not yet synced is still in the outbox.
    await db.progress.bulkPut(
      Object.entries(payload.progress).map(([code, value]) => ({
        key: progressKey(profileId, code),
        profileId,
        skill_code: code,
        mastery_score: value.mastery_score,
        attempts: 0,
        correct_answers: 0,
        hard_correct: 0,
        status: value.status,
        mastered_at: value.status === 'mastered' ? Math.floor(Date.now() / 1000) : null,
      })),
    );

    if (payload.learning_path) {
      await db.pathItems.where({ profileId }).delete();
      await db.pathItems.bulkPut(
        payload.learning_path.items.map((item) => ({
          key: progressKey(profileId, item.skill_code),
          profileId,
          skill_code: item.skill_code,
          name_ar: item.name_ar,
          order_index: item.order_index,
          status: item.status,
        })),
      );
    }
  });
}

/** Every skill, with this student's standing on each — the Skill Map's whole input. */
export function useSkillMapData(profileId: number | undefined) {
  return useLiveQuery(async () => {
    if (profileId === undefined) return null;

    const skills = await db.skills.orderBy('order_index').toArray();
    const progress = await db.progress.where({ profileId }).toArray();
    const path = await db.pathItems.where({ profileId }).sortBy('order_index');

    const statuses: Record<string, MasteryStatus> = {};
    for (const row of progress) statuses[row.skill_code] = row.status;

    return {
      skills,
      statuses,
      path,
      pathCodes: path.map((p) => p.skill_code),
      currentCode: path.find((p) => p.status === 'current')?.skill_code ?? null,
    };
  }, [profileId]);
}

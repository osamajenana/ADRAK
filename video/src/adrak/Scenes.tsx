import React from 'react';
import { Easing, interpolate, useCurrentFrame } from 'remotion';
import { C, T } from './theme';
import { Head, Level, Reveal, Scene, Sub } from './ui';
import { Mark } from './Mark';

const EASE = Easing.bezier(0.16, 1, 0.3, 1);

/* ── 1 · الفجوة ──────────────────────────────────────────────────────────────────────────────
   The whole product in one frame: the grade a child sits in, and the level they are actually at.
   The lower line drops away rather than fading in — the gap has to be felt opening. */
export const S1Gap: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene gap={80}>
      <Reveal at={0}>
        <Head size={T.headline}>طالبٌ في الصف التاسع.</Head>
      </Reveal>

      {/* Both rows are anchored to the edges of a reserved box, so neither can ever run into the
          other however the text wraps. The lower one drops into its slot; it does not fade in. */}
      <div style={{ position: 'relative', width: 1180, height: 430 }}>
        <div style={{ position: 'absolute', top: 0, insetInline: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <Level
            width={1180}
            color={C.slate}
            dashed
            grow={interpolate(frame, [30, 62], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })}
          />
          <div style={{ fontSize: T.label, color: C.subtle }}>الصف الذي يجلس فيه</div>
        </div>

        <div
          style={{
            position: 'absolute',
            bottom: 0,
            insetInline: 0,
            display: 'flex',
            flexDirection: 'column',
            gap: 16,
            opacity: interpolate(frame, [72, 96], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            translate: `0px ${interpolate(frame, [72, 118], [-230, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })}px`,
          }}
        >
          <Level width={1180} color={C.brand} thickness={10} />
          <div style={{ fontSize: T.label, color: C.brand, fontWeight: 600 }}>
            مستواه الحقيقي في الرياضيات — الصف الرابع
          </div>
        </div>

        {/* The measure between them. This is the product's subject, so it gets the only warm colour. */}
        <div
          style={{
            position: 'absolute',
            top: 96,
            bottom: 112,
            insetInlineStart: '50%',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 18,
            opacity: interpolate(frame, [132, 158], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        >
          <div style={{ flex: 1, width: 3, background: C.amber, opacity: 0.55 }} />
          <div style={{ fontSize: 76, fontWeight: 700, color: C.amber, whiteSpace: 'nowrap' }}>خمس سنوات</div>
          <div style={{ flex: 1, width: 3, background: C.amber, opacity: 0.55 }} />
        </div>
      </div>
    </Scene>
  );
};

/* ── 2 · لماذا يفشل التدريس العادي ─────────────────────────────────────────────────────────── */
export const S2Why: React.FC = () => (
  <Scene gap={54}>
    <Reveal at={0}>
      <Head size={T.headline}>تدريسه منهاج التاسع لا يفيده إطلاقاً.</Head>
    </Reveal>
    <Reveal at={45}>
      <Sub size={T.sub}>لأنه يفتقد كلّ ما تحته.</Sub>
    </Reveal>
    <Reveal at={100}>
      <Sub size={T.label} color={C.subtle}>
        وكل حصة إضافية على منهاج صفّه تُوسّع الفجوة، لا تُغلقها.
      </Sub>
    </Reveal>
  </Scene>
);

/* ── 3 · التشخيص ─────────────────────────────────────────────────────────────────────────────
   Binary search, shown as it works: the candidate range collapses from both ends onto one skill. */
export const S3Diagnose: React.FC = () => {
  const frame = useCurrentFrame();
  const N = 21;
  const target = 6;
  const lo = Math.round(interpolate(frame, [55, 175], [0, target], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }));
  const hi = Math.round(interpolate(frame, [55, 175], [N - 1, target], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE }));

  return (
    <Scene gap={72}>
      <Reveal at={0}>
        <Head size={T.headline}>أدرك يجد مستواه الحقيقي</Head>
      </Reveal>

      <div style={{ display: 'flex', gap: 20, direction: 'ltr' }}>
        {Array.from({ length: N }, (_, i) => {
          const live = i >= lo && i <= hi;
          const found = frame > 175 && i === target;
          return (
            <div
              key={i}
              style={{
                width: found ? 46 : 30,
                height: found ? 46 : 30,
                borderRadius: 999,
                background: found ? C.brandBright : live ? C.brandDeep : C.line,
                opacity: interpolate(frame, [20 + i * 2, 40 + i * 2], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
                alignSelf: 'center',
              }}
            />
          );
        })}
      </div>

      <Reveal at={185}>
        <Sub size={T.sub} color={C.ink}>
          في <span style={{ color: C.brand, fontWeight: 700 }}>١٢ سؤالاً</span>، لا في اختبارٍ من مئة.
        </Sub>
      </Reveal>
    </Scene>
  );
};

/* ── 4 · مسار التعافي ────────────────────────────────────────────────────────────────────────
   The mark draws itself: the climb is the product, so it is shown being made, not presented. */
export const S4Path: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene gap={56}>
      <Reveal at={0}>
        <Head size={T.headline}>ثم يبني مساراً</Head>
      </Reveal>
      <div style={{ opacity: interpolate(frame, [25, 45], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <Mark
          width={520}
          appear={interpolate(frame, [40, 90], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })}
        />
      </div>
      <Reveal at={155}>
        <Sub size={T.sub}>يبدأ من أوّل فجوة حقيقية — لا من أول صفحة.</Sub>
      </Reveal>
    </Scene>
  );
};

/* ── 5 · بدون إنترنت ─────────────────────────────────────────────────────────────────────────
   The claim every submission makes. Here the signal is cut on screen and the sentence continues. */
export const S5Offline: React.FC = () => {
  const frame = useCurrentFrame();
  const cut = frame > 95;

  return (
    <Scene gap={64}>
      <Reveal at={0}>
        <Head size={T.headline}>ويعمل بدون إنترنت.</Head>
      </Reveal>

      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-end', height: 130, direction: 'ltr' }}>
        {[38, 62, 90, 118].map((h, i) => (
          <div
            key={h}
            style={{
              width: 34,
              height: h,
              borderRadius: 8,
              background: cut ? C.line : C.brand,
              opacity: interpolate(frame, [30 + i * 8, 50 + i * 8], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            }}
          />
        ))}
      </div>

      <Reveal at={110}>
        <Head size={T.headline} color={C.brand}>بالكامل.</Head>
      </Reveal>

      <Reveal at={175}>
        <Sub size={T.label} color={C.subtle}>
          التشخيص · التمارين · الإتقان · فتح المهارات — كلّها على الجهاز. الشبكة للمزامنة فقط.
        </Sub>
      </Reveal>
    </Scene>
  );
};

/* ── 6 · المزامنة الضوئية ────────────────────────────────────────────────────────────────────
   No router, no hotspot, no pairing: a camera pointed at a screen is the whole channel. */
export const S6Qr: React.FC = () => {
  const frame = useCurrentFrame();

  // A real QR reads as one instantly because of the three finder squares. Scattered dots do not.
  const N = 21;
  const CELL = 15;
  const inFinder = (r: number, c: number) =>
    (r < 7 && c < 7) || (r < 7 && c >= N - 7) || (r >= N - 7 && c < 7);
  const finderOn = (r: number, c: number) => {
    const lr = r < 7 ? r : r - (N - 7);
    const lc = c < 7 ? c : c - (N - 7);
    const ring = lr === 0 || lr === 6 || lc === 0 || lc === 6;
    const core = lr >= 2 && lr <= 4 && lc >= 2 && lc <= 4;
    return ring || core;
  };
  // A parity expression is not a hash: (r*odd + c*odd + (r^c)) is even for every r and c, which
  // filled the whole board. This is an integer scramble, ~48% on, no visible banding.
  const dataOn = (r: number, c: number) => {
    let h = (r * 73856093) ^ (c * 19349663);
    h = (h ^ (h >>> 13)) >>> 0;
    return h % 100 < 48;
  };

  const board = N * CELL;

  return (
    <Scene gap={60}>
      <Reveal at={0}>
        <Head size={T.headline}>ولا حتى شبكة محلية.</Head>
      </Reveal>

      <div
        style={{
          position: 'relative',
          width: board,
          height: board,
          opacity: interpolate(frame, [25, 50], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
        }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: `repeat(${N}, ${CELL}px)`, direction: 'ltr' }}>
          {Array.from({ length: N * N }, (_, i) => {
            const r = (i / N) | 0;
            const c = i % N;
            const on = inFinder(r, c) ? finderOn(r, c) : dataOn(r, c);
            return <div key={i} style={{ width: CELL, height: CELL, background: on ? C.brandBright : 'transparent' }} />;
          })}
        </div>

        <div
          style={{
            position: 'absolute',
            insetInline: -28,
            height: 5,
            background: C.amber,
            borderRadius: 5,
            top: interpolate(frame, [62, 152], [0, board - 5], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
            opacity: interpolate(frame, [62, 78, 142, 158], [0, 1, 1, 0], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }),
          }}
        />
      </div>

      <Reveal at={162}>
        <Sub size={T.sub}>الطالب يرفع شاشته. المعلّم يمسحها.</Sub>
      </Reveal>
      <Reveal at={205}>
        <Sub size={T.label} color={C.subtle}>صفر راوتر · صفر إقران · صفر تطبيق ثانٍ</Sub>
      </Reveal>
    </Scene>
  );
};

/* ── 7 · الخطأ يتحوّل تشخيصاً ────────────────────────────────────────────────────────────────── */
export const S7Misconception: React.FC = () => (
  <Scene gap={52}>
    <Reveal at={0}>
      <Sub size={T.label} color={C.subtle}>لا نقول للمعلّم</Sub>
    </Reveal>
    <Reveal at={20}>
      <Head size={92} color={C.subtle}>
        <span style={{ textDecoration: 'line-through', textDecorationColor: C.amberDeep }}>
          «١٢ طالباً رسبوا»
        </span>
      </Head>
    </Reveal>
    <Reveal at={95} style={{ marginTop: 40 }}>
      <Sub size={T.label} color={C.subtle}>نقول</Sub>
    </Reveal>
    <Reveal at={115}>
      <Head size={T.headline} color={C.brand}>«١٢ طالباً يجمعون البسط مع المقام»</Head>
    </Reveal>
    <Reveal at={195}>
      <Sub size={T.label} color={C.subtle}>الخطأ يتحوّل تشخيصاً — ١٠٢ مفهوماً خاطئاً موصوفاً.</Sub>
    </Reveal>
  </Scene>
);

/* ── 8 · الميدان ─────────────────────────────────────────────────────────────────────────────
   Not a claim about the future. The conditions it already ran in. */
export const S8Field: React.FC = () => {
  const stats: [string, string][] = [
    ['١٥', 'طالباً'],
    ['٧', 'أيام'],
    ['٣', 'جلسات يومياً'],
  ];

  return (
    <Scene gap={64}>
      <Reveal at={0}>
        <Sub size={T.label} color={C.subtle}>شُغِّل فعلاً — في مركز إيواء بمدرسة العائلة المقدسة</Sub>
      </Reveal>

      <div style={{ display: 'flex', gap: 130, direction: 'rtl' }}>
        {stats.map(([n, l], i) => (
          <Reveal key={l} at={25 + i * 22} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 150, fontWeight: 700, color: C.brand, lineHeight: 1.1 }}>{n}</div>
            <div style={{ fontSize: T.label, color: C.muted }}>{l}</div>
          </Reveal>
        ))}
      </div>

      <Reveal at={130}>
        <Head size={80}>على هواتف الطلاب وأهاليهم.</Head>
      </Reveal>
      <Reveal at={185}>
        <Sub size={T.label} color={C.subtle}>بلا جهازٍ واحد وزّعناه، وبلا شبكةٍ جهّزناها.</Sub>
      </Reveal>
    </Scene>
  );
};

/* ── 9 · الختام ──────────────────────────────────────────────────────────────────────────────── */
export const S9End: React.FC = () => {
  const frame = useCurrentFrame();

  return (
    <Scene gap={44}>
      <div style={{ opacity: interpolate(frame, [0, 20], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }) }}>
        <Mark
          width={440}
          appear={interpolate(frame, [10, 70], [0, 1], { extrapolateLeft: 'clamp', extrapolateRight: 'clamp', easing: EASE })}
        />
      </div>

      <Reveal at={100}>
        <div style={{ fontSize: 168, fontWeight: 700, color: C.ink, letterSpacing: '-0.02em' }}>أدرك</div>
      </Reveal>

      <Reveal at={135}>
        <Sub size={T.sub}>تعلّم من حيث أنت، لا من حيث يُفترض بك أن تكون.</Sub>
      </Reveal>

      <Reveal at={195} style={{ marginTop: 50 }}>
        <Sub size={T.label} color={C.subtle}>بُني في غزة</Sub>
      </Reveal>
    </Scene>
  );
};

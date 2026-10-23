# Combat feel: research notes and plan

Written 2026-10-23 for the combat playtest (`?playtest`). The goal is combat that feels snappy and fluid, where the player always feels in control, closer to Dark Souls than it was. Each section is research → what we have → what to do next.

## 1. Commitment versus control

**Research.**
- Souls games commit you to an attack on purpose; that risk is the genre. But a committed swing still lets you dodge out once the blow has landed. One solo Souls-like developer says that change alone made their game feel much better ([sadogre devlog](https://sadogrestudios.itch.io/psyche/devlog/650253/how-to-make-the-controller-feel-more-responsive)).
- The "Amalur problem" essay splits a one-second slash at 60 fps into about 7 frames of anticipation, a 10-frame swing with 5 active frames, then a long follow-through ([Aztez](https://aztez.com/blog/2012/05/24/the-amalur-problem/)). Its fix:
  - a frame flag about halfway through, after which movement input cancels the rest;
  - with no input, the follow-through plays in full;
  - a high-commitment move (a heavy blow) must pay the player back with damage, poise or unblockability.

**Ours, after this pass.**
- **Committed:** a swing plants the player until 0.2 s after its blow lands (`RECOVER_FREE`).
- **Cancels:** moving then cancels the recovery; a roll can cancel from 0.12 s after the blow; the next attack chains from 0.12 s after the blow.
- **Steering:** a blow can be steered only in its first 0.12 s.

**Next.**
- Read each clip's own cancel and chain frames from the manifest (see the art brief) instead of fixed offsets.
- Give the heavy blow its pay-off. It already has double poise and guard damage; add hyper-armour during its swing.

## 2. Input buffering

**Research.**
- Buffer generously and cancel gracefully ([combat-design notes](https://playbooks.com/skills/omer-metin/skills-for-antigravity/combat-design), [input buffer](https://dgmiwiki.wpi.edu/mechanic/input_buffer)).
- A buffer of about 0.2 s already helps a lot ([Wayline](https://www.wayline.io/blog/impactful-melee-combat-indie-games)). Players report Dark Souls 3's as short, around 0.3 s ([Steam thread](https://steamcommunity.com/app/374320/discussions/0/357284131782825962)).

**Ours, after this pass.**
- **Attack:** a press during a swing now waits until that swing's chain point, however early it came. One press is held at a time, as in Souls; a third press during the same swing doesn't stack.
- **Outside a swing:** presses last 0.35 s.
- **Roll and jump:** 0.3 s and 0.15 s.

**Next.**
- Consider a two-deep attack queue if a full combo should come from rapid tapping.
- Buffer a roll pressed during the last part of a swing.

## 3. Hit-stop and impact

**Research.**
- An experiment on 3D action games found the best hit-stop is about 0.1–0.2 s and the best slow-motion about 0.2–0.4 s ([IEICE](https://ken.ieice.org/ken/paper/20230315OCSt/eng/)).
- Hit-stop is high value for low cost, but too long breaks the flow ([Bugnet](https://bugnet.io/blog/how-to-use-hit-pause-to-make-impacts-feel-powerful)).
- Treat hit feedback (freeze, flash, shake, sound) as information that a hit landed ([Unity primer](https://uhiyama-lab.com/en/notes/unity/unity-game-feel-hit-feedback/)).

**Ours.** `fx.ts` has hit-stop, flashes, shake and sounds.

**Next.** Scale hit-stop by blow: light ~0.06 s, heavy ~0.14 s, finishing blow ~0.2 s plus slow motion.

## 4. Movement and turning

**Research.**
- In-place animation with code-driven movement and rotation keeps the player responsive and easy to tune ([Unity: root motion vs none](https://discussions.unity.com/t/root-motion-vs-no-root-motion/522288), [Polycount](https://polycount.com/discussion/comment/2780057), [Mocap Online](https://mocaponline.com/blogs/mocap-news/root-motion-vs-in-place-animation)).
- Root motion is good for authored moves (lunges, rolls), and many games mix the two.

**Ours.** Movement is in-place and code-driven, and attacks and rolls move the body in code.
- **Speeds:** walk 3.4 m/s, sprint 6.9 m/s.
- **Acceleration:** full pace in about 0.1 s.
- **Stick:** speed follows the push smoothly, from 0.8 m/s.
- **Lunges:** light 0.9 m, heavy 1.3 m, running 2.6 m, rolling 1.6 m.

**Next.** The art brief's attack clips should carry their forward travel as metadata (metres and timing), so the code lunge matches the feet.

## 5. Lean and secondary motion

**Research.**
- Lean is a procedural layer: a spine rotation from velocity and acceleration (`atan(accel / g)`), applied after the base animation ([Vulkan tutorial](https://docs.vulkan.org/tutorial/latest/Advanced_glTF/Procedural_Animation_IK/06_physics_driven_lean.html)).
- Engines layer lean-into-turn as additive clips ([Unity manual](https://docs.unity3d.com/cn/2018.3/Manual/AnimationScripting.html)).

**Ours.** The body leans forward into a run: 0.08 rad at a jog, 0.17 rad sprinting, eased.

**Next.**
- Lean into the acceleration and into turns (a side tilt) rather than only into speed.
- An authored Sprint clip would beat a leaned Run.

## 6. Ranged

**Decision (user).** The bow shoots like a gun:
- arrows fly straight at 60 m/s to the crosshair;
- no arc;
- the crosshair turns red on a foe;
- no lock-on and no snap while aiming (controller aim assist only slows the stick over a foe).

**Fixed.** A twitch while aiming: clips exported from frame 1 left bones unwritten for their first 0.042 s, and the aim tilt piled up. Every track now gets a key at t = 0 (`anchorAtZero` in `animator.ts`), and the tilt can no longer stack.

## 7. Art brief (sent to the Blender session)

Clips that would make this feel authored instead of patched in code. Each should carry its timings in the manifest: `hit_time`, `chain_time` (the earliest next attack), `cancel_time` (the earliest move or roll out) and `travel` (the forward metres the feet cover). All are short anticipation, a clear active frame and a follow-through that can be cut.

1. **Light combo of three:**
   - `Attack` (right-to-left);
   - `Attack2` (left-to-right);
   - `Attack3`, a finisher (overhead chop or thrust) with a little more travel.
2. **`RunAttack`:** a leaping slash out of a sprint (about 2.5 m of travel).
3. **`RollAttack`:** a rising slash out of a roll.
4. **Charged heavy:**
   - `HeavyCharge`, a held wind-up loop, so holding the button shows the blow gathering;
   - `HeavyRelease`, the strike, which can fire from any point of the charge.
5. **Lock-on strafes:** `WalkLeft`, `WalkRight` and `WalkBack` (and run versions), in place of the reversed Walk.
6. **`Sprint`:** faster than Run, leaning in.
7. **Light hit flinches by direction:** `HitFront` and `HitBack` overlays, short of a stagger.
8. **`BowShoot`:** a quick draw-and-loose (≤ 0.35 s) for gun-like shooting, plus a walking-while-aiming pose that holds the bow steady.
9. **`Land`:** a short landing crouch.
10. **Export:** key every clip from t = 0 (or slide to zero) so no track starts late.

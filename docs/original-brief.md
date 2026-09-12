# AI Animated YouTube Shorts Studio — MVP Build Brief

> Original build brief provided by the requester at project start (authored via ChatGPT). Saved here verbatim so later phases have a real, citable path instead of "the original brief, provided in chat." Treat as the primary spec — verified against current facts during brainstorming and Phase 1 execution rather than re-derived from scratch; see PROJECT.md Context and Key Decisions for what was confirmed, corrected, or superseded.

Your role
You are the lead engineer for this project.
I want you to build a working MVP, not merely give me an architecture proposal or a tutorial.
You have access to the latest information/tools available to you, so before implementing any external API integration, verify the current official documentation, model names, API endpoints, pricing, limitations, and commercial-use terms. AI APIs change quickly, so do not blindly rely on information in this brief when implementing provider-specific details.
The goal is to have a working end-to-end MVP within approximately 24 hours.
Do not over-engineer this project.

## 1. What are we building?

My wife wants to experiment with a YouTube Shorts channel based on AI-generated animated stories.
She is non-technical.
The application should allow her to enter a very simple high-level idea, such as:
"একটা ছোট মেয়ে তার হারিয়ে যাওয়া বিড়ালকে খুঁজতে গিয়ে একটা জাদুর বাগান খুঁজে পায়"
or Banglish such as:
"Ekta choto meye tar hariye jawa biral ke khujte giye ekta jadur bagan khuje pay."
She should NOT have to write prompts.
The application should transform that into:

1. Original story
2. Character Bible
3. Style Bible
4. 5–7 scene breakdown
5. Scene images
6. Image-to-video animation for each approved scene
7. Individual MP4 clips
8. A final folder containing all assets

She will then use CapCut manually to:

* arrange clips
* record/add voice
* add music
* add sound effects
* add captions
* export the final YouTube Short

We do NOT need automated audio generation or YouTube publishing in V1.

## 2. Important business goal

The ultimate goal is to make money from YouTube.
AI-generated animation itself is not the problem; YouTube allows monetizable AI-assisted/generated content when it is original and authentic.
However, YouTube's policies are a major design consideration.
We must deliberately avoid producing:

* repetitive stories
* mass-produced template content
* superficial variations of the same story
* generic AI slideshow content
* copied characters/IP
* content that looks like automated "AI slop"

The system therefore needs a meaningful story uniqueness/history system.
The channel should be capable of having recurring characters or a recognizable visual identity, but each episode should have a genuinely different narrative.
Do not design this as a content-spam machine.

## 3. Critical experiment constraint

This is a Month 1 experiment.
The absolute maximum new spend is:
$15 USD TOTAL
This is a hard stop.
Do NOT design anything that can accidentally exceed $15.
Our target is actually closer to $8–10, leaving several dollars for retries.
Existing subscriptions:

* ChatGPT Go — already paid
* Claude Pro — already paid

Do NOT assume either subscription provides API credits.
New API/service spending must be explicitly tracked.
The application should maintain a running estimated/actual generation cost and refuse new paid generation if the request would exceed the configured monthly budget.
The budget must be configurable, with:

```
MONTHLY_BUDGET_USD=15
```

or equivalent.
Before every paid generation:

```
current_month_spend
+
estimated_request_cost
<= monthly_budget
```

If not, refuse the request.

## 4. Technology decision — IMPORTANT

We considered:

* n8n
* React + TypeScript + ASP.NET Core
* Next.js

The final decision is:
Next.js + TypeScript
This should be a single local application.
Do NOT build a separate React frontend and ASP.NET backend.
Do NOT make n8n the application.
Do NOT introduce microservices.
Do NOT introduce cloud hosting.
Do NOT introduce authentication.
Do NOT introduce Redis.
Do NOT introduce PostgreSQL.
Do NOT introduce Kubernetes.
Do NOT build a SaaS.
The application should run locally on my Windows laptop, approximately:

```
http://localhost:3000
```

The architecture should remain clean enough that a proper backend could be extracted later if the project becomes successful, but that is NOT a V1 requirement.

## 5. Why Next.js?

The application is currently:

* single user
* local
* small
* experimental
* API-heavy but not backend-heavy
* primarily an orchestration/UI tool

Next.js gives us:

* React UI
* TypeScript
* server-side functionality
* API/server actions
* one codebase
* simple local deployment
* easy future expansion

The code should be structured so business logic is not tightly coupled to React components.

## 6. Recommended project structure

Use your judgment, but something conceptually similar to:

```
src/
  app/
    page.tsx
    stories/
    stories/[id]/

  components/
    story/
    scenes/
    generation/
    ui/

  core/
    story/
    scenes/
    uniqueness/
    generation/
    budget/

  providers/
    llm/
    image/
    video/

  db/
  storage/
  lib/
```

The exact structure can differ if you have a better simple design.
The important architectural principle is:
UI should not contain provider-specific AI logic.
For example, don't scatter Veo API calls throughout React components.

## 7. Database

Use SQLite.
No external database server.
ORM choice is up to you; Prisma, Drizzle, or another lightweight solution is fine.
The database needs to track at minimum:

Stories

```
id
title
premise
full_story
theme
ending
character_bible
style_bible
fingerprint
status
created_at
```

Scenes

```
id
story_id
scene_number
duration_seconds
purpose
location
characters
action
emotion
camera
lighting
image_prompt
motion_prompt
image_path
video_path
status
created_at
```

Generations

```
id
story_id
scene_id
provider
model
generation_type
status
external_job_id
estimated_cost
actual_cost
started_at
completed_at
error
```

You may adjust the schema if you find a cleaner design.

## 8. Local file storage

Do NOT require Google Drive for V1.
Use local filesystem storage.
Something like:

```
storage/
  stories/
    <story-id>/
      story.json
      character-reference.png
      scenes/
        01/
          image.png
          video.mp4
        02/
          image.png
          video.mp4
        ...
```

The UI should provide an easy way to access the output folder.
Google Drive can be added later.

## 9. Wife's workflow

The primary UI should be extremely simple.
Something approximately like:

```
Create New Story

Story idea
[........................................]

Character description
[........................................]

Animation style
[ Soft hand-painted 2D ▼ ]

Mood
[ Emotional ▼ ]

Number of scenes
[ 6 ▼ ]

[ CREATE STORY ]
```

Potential styles:

* Soft hand-painted 2D
* Watercolor storybook
* Early 90s hand-drawn animation
* Cinematic 2D
* Cute children's animation
* Dreamy fantasy animation
* Custom

Do not hard-code exact imitation of a particular living artist/studio.
For example, the UI may offer "soft hand-painted Japanese animation" as an original visual direction, but the internal style bible must describe an original visual style rather than attempting to reproduce a proprietary studio's exact signature.

## 10. Story Director

The LLM should function as a "Story Director."
It receives the wife's simple input and creates structured output.
The output should contain:

Story

```
title
premise
story
theme
emotional_arc
ending
```

Character Bible

```
name
age
appearance
hair
clothing
body proportions
personality
distinguishing features
```

Style Bible

```
medium
line style
color palette
lighting
texture
character rendering
background rendering
animation characteristics
camera language
```

Scene plan
5–7 scenes by default.
Each scene should contain:

```
scene_number
duration
story_purpose
location
characters
action
emotion
camera
lighting
environment
image_prompt
motion_prompt
continuity_requirements
```

The prompts should be generated automatically.
The wife should never need to understand them.

## 11. Story uniqueness system

This is a first-class feature.
Before accepting a new story, extract a structural fingerprint.
For example:

```
protagonist
relationship
setting
central_conflict
goal
obstacle
story_mechanism
emotional_arc
ending_type
theme
key_object
visual_concept
```

Compare the new story with previous stories.
The comparison must consider structural similarity, not merely matching words.
For example, these should probably be considered too similar:
Story A: Lonely boy finds an injured bird in a rainy village, cares for it, and eventually releases it.
Story B: Lonely girl finds an injured kitten in a rainy village, cares for it, and eventually reunites it with its owner.
Although the nouns changed, the underlying structure is nearly identical.
The system should reject Story B and ask the LLM to produce a substantially different concept.
Use the simplest reliable mechanism.
Do NOT introduce an expensive vector database unless there is a compelling reason.
An LLM-based comparison against compact previous-story fingerprints is acceptable for V1.
If you can implement a cheap deterministic pre-filter before the LLM comparison, even better.

## 12. Image-first workflow

This is a key requirement.
Do NOT generate videos immediately.
The pipeline is:

```
Story
 ↓
Scene plan
 ↓
Scene images
 ↓
Human approval
 ↓
Image-to-video
```

The purpose is to reduce wasted video-generation cost.
If Scene 4's image is bad: regenerate Scene 4 image. We should NOT regenerate the entire episode.

## 13. Video generation provider — Veo 3.1 Lite

This is currently our first-choice video provider.
The reason is NOT speed or maximum quality.
For Month 1: COST IS THE PRIMARY OPTIMIZATION TARGET.
We want to produce enough cheap videos to determine whether the concept is worth pursuing.
Current Google Gemini API documentation/pricing indicates that Veo 3.1 Lite is the low-cost Veo option and is priced around:

```
$0.05 / second at 720p
$0.08 / second at 1080p
```

It supports: image-to-video, 9:16, 720p, 4/6/8 second clips.
The current documentation also indicates that Lite does not support the reference-image feature available in the higher Veo 3.1 variants and does not support video extension.
That is acceptable for V1.
Our workflow is explicitly:

```
Generate scene image
       ↓
Give scene image to Veo 3.1 Lite
       ↓
Animate the image
```

We do not depend on Veo's separate reference-image capability.
We also do not need video extension.
IMPORTANT: before implementing, verify the current official Google documentation yourself. Do not blindly trust the pricing/model information above.
Verify: current model ID, current API endpoint, image-to-video support, 9:16 support, 720p support, 4/6/8 second duration support, current price, commercial-use rights, any regional restrictions, rate limits, current preview/stability status, whether generated audio is mandatory, whether we can simply mute/discard generated audio.
If another provider is significantly cheaper while meeting our requirements and having acceptable commercial rights, tell me before switching.
But do not optimize for quality or speed in Month 1.
The priority order is: 1. Low cost, 2. Commercial usability, 3. Image-to-video capability, 4. Reliability, 5. Character/scene consistency, 6. Quality, 7. Speed.

## 14. Video duration strategy

We want approximately: 5–7 scenes, ~4–8 seconds each.
Do not automatically generate maximum-length clips.
For example:

```
Scene 1 — 6 sec
Scene 2 — 6 sec
Scene 3 — 4 sec
Scene 4 — 6 sec
Scene 5 — 6 sec
Scene 6 — 6 sec
```

This gives approximately 34 seconds.
The final Short can be extended/structured in CapCut if necessary.
Do not waste API money generating unnecessary seconds.

## 15. Important: Veo audio

Veo may generate audio as part of the video.
We do NOT need AI-generated audio for V1.
The wife will add narration, music, sound effects in CapCut.
If Veo generates audio automatically, simply treat it as incidental or mute/remove it in the final editing workflow.
Do not add a separate audio-generation API.

## 16. Image generation

Choose the image-generation provider based on: 1. Low cost, 2. API availability, 3. Commercial rights, 4. 9:16 support, 5. Character consistency, 6. Quality sufficient for animation, 7. Reliability.
Current Google Gemini image models may be attractive because of low-cost image generation and portrait support, but verify current official pricing and commercial terms before implementation.
Do not assume a free tier means commercial use is allowed.
The same commercial-rights requirement applies to all providers.

## 17. Character consistency

Character consistency is very important.
Because Veo Lite does not provide the same separate reference-image capability as higher Veo models, we should rely heavily on the generated scene image itself as the starting frame.
The image-generation stage should therefore receive: Character Bible, Style Bible, previous relevant scene context, current scene requirements.
For each scene, the image should be generated to match the established character.
If the chosen image model supports character/reference images cheaply, use them where beneficial.
But do not let character-consistency features push us over the $15 budget.

## 18. Human approval checkpoint

After story + scene images are generated, show the wife a review screen.
Something like:

```
Story Title

[Story summary]

Scene 1 [image]
Scene 2 [image]
Scene 3 [image]
Scene 4 [image]
Scene 5 [image]
Scene 6 [image]

[ Regenerate Scene 3 ]

[ Approve Images & Generate Videos ]
```

This checkpoint is important because video generation costs money.
The wife should be able to regenerate individual images before spending money on video.

## 19. Video generation UI

After approval:

```
Generating Episode...

Scene 1    ✓ Complete
Scene 2    ✓ Complete
Scene 3    ⏳ Generating
Scene 4    Waiting
Scene 5    Waiting
Scene 6    Waiting

Estimated cost: $1.80
Monthly spend: $4.20 / $15.00
```

Each scene should have a status.
If a scene fails:

```
Scene 3 — Failed

[ Retry Scene 3 ]
```

Do NOT restart all scenes.

## 20. Asynchronous generation

Video generation is a long-running operation.
Do not keep one HTTP request open until Veo finishes.
Implement:

```
Create generation job
        ↓
Save external job ID
        ↓
Return to UI
        ↓
Poll/check status
        ↓
When complete:
    download video
    save locally
    update DB
```

The architecture should allow multiple scenes to be processed without unnecessarily blocking the application.
However, do not over-engineer concurrency.
We have a single-user laptop and a strict budget.

## 21. Cost tracking

Every generation must record: provider, model, generation_type, duration, estimated_cost, actual_cost if available.
The application should have a simple budget display.
Example:

```
Month-to-date generation spend

Video:  $4.20
Images: $1.15
LLM:    $0.35
----------------
Total:  $5.70
Limit:  $15.00
```

If exact actual costs are unavailable, clearly label them as estimates.

## 22. Hard budget safety

This is non-negotiable.
Never allow "retry forever" or "automatically regenerate until quality is good" without a budget check.
For example: max image retries per scene = 2, max video retries per scene = 2 can be a sensible default.
But the actual retry policy should be configurable.
Every retry must pass through the budget guard.

## 23. Output

At the end, create:

```
storage/
  stories/
    story-001/
      story.json
      story.txt
      character-reference.png

      scenes/
        01/
          image.png
          video.mp4
        02/
          image.png
          video.mp4
        03/
          image.png
          video.mp4
        ...

      output/
        01_scene.mp4
        02_scene.mp4
        03_scene.mp4
        ...
```

The final output should be easy to import into CapCut in the correct order.

## 24. Story library

Build a simple Story Library.
It should show:

```
Stories

[Story 001]
Title
Created date
Status
Number of scenes

[Story 002]
Title
Created date
Status
Number of scenes
```

Clicking a story should open its details.
This is useful both for the wife and for our uniqueness system.

## 25. Regeneration

The UI should support:
Regenerate story — generate a new story while preserving the original user idea.
Regenerate scene image — only regenerate one scene image.
Regenerate scene video — only regenerate one scene's video.
Do not regenerate unrelated assets.

## 26. Animation styles

Create a clean configuration-driven style system.
For example:

```
styles/
  soft-hand-painted-2d
  watercolor-storybook
  early-90s-hand-drawn
  cinematic-2d
  children's-animation
  dreamy-fantasy
```

Each style should map to a Style Bible.
Do not hard-code dozens of prompts inside React components.

## 27. Provider abstraction

This is important for future expansion.
Do not couple the whole application directly to Veo.
Create an abstraction such as:

```typescript
interface VideoProvider {
  generateVideo(request): Promise<GenerationJob>;
  getStatus(jobId): Promise<GenerationStatus>;
  download(jobId): Promise<Buffer | Stream>;
}
```

Similarly:

```typescript
interface LLMProvider {
  generateStory(...);
  compareStories(...);
}

interface ImageProvider {
  generateImage(...);
}
```

Then implement the first providers.
For example:

```
providers/
  video/
    veo.ts
  image/
    <chosen-provider>.ts
  llm/
    <chosen-provider>.ts
```

This allows us to test Kling, Runway, another Veo variant, etc. later without rewriting the application.

## 28. Do NOT build these features

Explicitly exclude: authentication, user accounts, SaaS billing, cloud deployment, multi-user support, mobile application, automatic YouTube publishing, automated voice generation, automated music generation, automatic captions, analytics dashboard, social-media publishing, n8n, Redis, PostgreSQL, Kubernetes, microservices, complicated job queues, complicated cloud infrastructure.
If you believe any of these are genuinely necessary for the MVP, explain why before introducing them.

## 29. n8n

We considered using n8n as the entire application.
We decided against it.
However, n8n has many useful existing AI/video workflow templates.
You may inspect current n8n workflows/templates for ideas around: Veo, image-to-video, polling long-running video jobs, character consistency, Google Drive/file handling.
Use them as reference implementations, not as a dependency.
Do not introduce n8n into the V1 architecture merely because a template exists.
If you find an n8n workflow that solves a particularly difficult provider-integration problem, you may use its logic as inspiration and implement the equivalent directly in TypeScript.

## 30. Deadline

This is a rapid MVP.
Target deadline: approximately 24 hours.
The goal is NOT "perfect application."
The goal is: One complete, reliable end-to-end story can be generated locally.
At the end of the first implementation cycle, I want to be able to:

1. Start the Next.js application.
2. Open localhost.
3. Enter a Banglish story idea.
4. Select a style.
5. Generate an original story.
6. See the scenes.
7. Generate scene images.
8. Approve them.
9. Generate Veo Lite videos.
10. See generation progress.
11. Get 5–7 MP4 files locally.
12. Import them into CapCut.

That is success.

## 31. Development strategy

Do NOT spend the first several hours building the entire UI.
Use this priority:

Phase 1 — Provider smoke tests. First verify: LLM API, image API, Veo Lite API, image-to-video, 9:16, local file download, actual costs. Get ONE image → ONE video working. This should happen first.

Phase 2 — Core pipeline. Implement: input → story → scenes → image → video → files.

Phase 3 — SQLite/history. Implement story persistence and uniqueness.

Phase 4 — UI. Build the minimum usable interface.

Phase 5 — Budget/retry safeguards. Make the $15 protection robust.

Phase 6 — Polish. Only after the end-to-end workflow works.

## 32. Clarification policy

Before coding, review the specification and identify anything that is genuinely ambiguous or technically blocking.
Ask me clarification questions ONLY when: a decision materially affects architecture, a required API/account/key is unavailable, there is a legal/commercial-rights issue that cannot safely be assumed, or there are two materially different implementation choices that I must decide.
Do NOT ask me unnecessary questions such as: which button color I prefer, exact UI spacing, minor naming preferences, things you can reasonably choose yourself.
For non-critical decisions, choose sensible defaults and continue.
If there are important unresolved choices, present them as:

```
Decision needed:
A) ...
B) ...

Recommendation: B
Reason: ...
```

and wait for my answer only if proceeding would create significant rework.

## 33. Important current provider instruction

Before writing provider-specific code, use the latest official documentation.
Especially verify Veo 3.1 Lite.
Our current preference is: Veo 3.1 Lite at 720p, because cheap experimentation is more important than speed or maximum quality right now.
We do NOT care if generation takes longer.
We do NOT need 1080p. We do NOT need 4K. We do NOT need the highest-quality Veo model.
We do NOT need reference-image features if our image-first approach works.
We do NOT need video extension. We do NOT need generated audio.
We need: cheap + image-to-video + 9:16 + 720p + commercially usable + reliable enough.
If Veo 3.1 Lite meets those requirements, use it.
If it does not, identify the cheapest viable alternative and explain the tradeoff before changing the decision.

## 34. Commercial rights

This is a YouTube monetization experiment.
Therefore, before locking a provider into production, verify its current terms for: commercial use, ownership/license of generated assets, YouTube monetization, restrictions on generated content, free-tier restrictions if applicable, API-tier restrictions.
Do not assume "API exists" = "commercial use is allowed."
Do not assume "free tier" = "commercial use is allowed."
If a provider's terms are unclear, flag it.

## 35. YouTube policy

The application should be designed around original content.
The system should encourage: unique stories, unique conflicts, meaningful emotional arcs, original characters, original visual combinations, different settings, different endings, creative human involvement.
The system should discourage: repetitive templates, minimal variations, generic stories, copied characters, mass production.
The application should not make claims such as "This video is guaranteed to be monetizable."
We can only build a workflow designed to comply with the relevant policies.

## 36. Success criteria

The MVP is successful when:

**Technical**
Runs locally on Windows. One command starts the app. No cloud hosting required. SQLite works. Files are stored locally. API keys are stored securely in `.env.local`. No secrets are committed to Git.

**Functional**
User can create a story. Story is meaningfully different from previous stories. Story generates 5–7 scenes. Images are generated. User can approve/regenerate images. Videos are generated from images. Individual scene retry works. Output MP4s are saved locally. Cost is tracked. $15 hard budget cannot be exceeded by the application.

**UX**
A non-technical user should be able to understand: Create Story → Review → Approve → Generate Videos → Open Output, without needing developer knowledge.

## 37. What I want from you first

Before writing lots of code:

1. Verify the current provider options.
2. Verify Veo 3.1 Lite specifically.
3. Verify current pricing.
4. Verify commercial-use considerations.
5. Choose the cheapest practical image-generation provider.
6. Choose the cheapest practical LLM/API strategy.
7. Give me a concise implementation plan.
8. Identify only genuinely blocking questions.
9. Then begin implementation.

Do not spend hours debating architecture—we have already chosen the architecture.

## 38. Final architectural decision

Unless new evidence reveals a genuine blocker:

```
Next.js
TypeScript
SQLite
Local filesystem
Direct AI provider APIs
Veo 3.1 Lite for video
Image-first → image-to-video
CapCut for final editing
Local Windows deployment
$15 hard monthly generation budget
```

No n8n in V1. No ASP.NET Core in V1. No separate backend in V1.

## 39. The philosophy

Keep reminding yourself of this: we are not building an AI video SaaS.
We are building a small private creative tool for one person to run an experiment.
The experiment is: Can we cheaply create original animated Shorts that viewers actually want to watch?
If yes: improve quality, improve consistency, add better providers, add automation, potentially add cloud infrastructure, potentially introduce ASP.NET Core/backend workers, potentially add YouTube automation, potentially turn it into a product.
If no: stop, pivot, and we have only spent a small amount of money.
So optimize V1 for: simplicity + cost + reliability + learning speed. Not theoretical scalability.

## 40. Concrete Acceptance-Test Checklist

> Full checklist (AT-01 through AT-34) preserved in `.planning/REQUIREMENTS.md` and `.planning/ROADMAP.md`, mapped to specific phases rather than duplicated here verbatim. Original categories: application startup, story creation, Banglish input, story uniqueness, story persistence, story library, scene generation, image generation, human approval checkpoint, Veo image-to-video, full video generation, async behavior, individual video retry, budget protection, retry safety, provider errors, secrets, local filesystem, output integrity, CapCut handoff, UI usability, restart/recovery, no accidental n8n dependency, no unnecessary infrastructure, commercial-use verification, and the full end-to-end Golden Path Test.

## 41. Final Definition of Done

Must-pass acceptance tests: AT-01, AT-03, AT-04, AT-05, AT-06, AT-08, AT-10, AT-12, AT-13, AT-14, AT-15, AT-16, AT-18, AT-20, AT-21, AT-23, AT-25, AT-26, AT-27, AT-29, AT-31, AT-33, AT-34.
Nice-to-have (deferrable if the 24-hour deadline is at risk): AT-09, AT-17, AT-30.
If a nice-to-have is not implemented, document it rather than expanding scope.

## 42. Final test report

At the end of implementation, provide a concise report covering: pass/fail counts, critical failures, known limitations, provider/model/verified price, commercial-use status, test generation stats (scenes, seconds, cost), application details (Next.js version, Node version, database, storage location), how to run the app, and how to generate the first episode.
If any critical acceptance test fails, do not simply declare success — explain exactly what failed, why, and whether it can realistically be fixed within the 24-hour MVP target.
Prioritize a working Golden Path over optional features.
